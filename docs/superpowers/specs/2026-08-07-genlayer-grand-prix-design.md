# GenLayer Grand Prix — Design Spec

**Date:** 2026-08-07
**Status:** Approved — building
**Location:** `C:\Users\User\genlayer-grand-prix` · dev port `:5200`

## 1. Summary

A GenLayer-branded quiz-racer. The player types answers to 10 GenLayer trivia
questions; each **correct** answer advances the mochi mascot's kart one checkpoint
down a side-scrolling "Smash Karts"-style track toward the finish flag. Faster and
streak answers score higher. A **shared weekly leaderboard** ranks the community.
An **admin** can replace the 10 questions and reset the board each week.

No wallet, no accounts — identity is a typed **username** only (with an auto
mochi-color avatar). The game runs in the browser; a shared **Supabase** backend
holds questions + scores.

**Two modes:**
- **Secure mode (Supabase configured):** the production mode. Scoring is
  **server-authoritative** — correct answers never reach the browser, timing is
  server-measured, and only the DB writes final scores. Leaderboard is global and
  cheat-resistant. Admin is passcode-gated with bcrypt + rate-limit lockout.
- **Local/demo mode (Supabase not configured):** bundled questions, client-side
  scoring, per-device `localStorage` board. Explicitly **not** secure — for
  local demo/screenshots only. There is no shared board to cheat in this mode.

## 2. Stack & conventions

- **Vite + React + TypeScript + Tailwind** (matches the user's other projects).
- **Canvas 2D** for the race render (parallax side-scroller).
- **`@supabase/supabase-js`** for shared questions + scoring + leaderboard (auto-detected via env).
- Reuse GenLayer brand assets from `genlayer-banner-studio`: `mascot-sheet.png`,
  `mark.png`, `wordmark-white.png`, and the `BRAND` palette.
- **Vitest** for unit tests. Dev server on `:5200`.

### Brand palette
`cobalt #110FFF · void #070707 · magenta #E63BD3 · purple #7A2BF5 · teal #2FE1D6 ·
green #00FF66 (correct) · red #FF3B4E (wrong) · amber #F5C542 (timer)`. Dark-mode-first,
chunky arcade aesthetic: bold rounded shapes, thick outlines, speed lines, GenLayer
billboards along the track.

## 3. Screens & flow

```
Start → (username) → Race (10 Qs, server-scored) → Results → Leaderboard
                                                                 ↑
                                        /admin (passcode) → edit Qs / new week
```

- **Start:** title, mochi-kart hero, username input (required, 2–20 chars, sanitized),
  "Start Race", rules blurb, leaderboard link.
- **Race:** Canvas track (~60%) + question panel (~40%) + HUD.
- **Results:** final score, correct/10, total time, "you beat X% of racers", share
  card (Canvas PNG for X), "Play again". (Score already recorded server-side.)
- **Leaderboard:** current-round global top N.
- **Admin (`/admin`):** passcode gate → question editor + "Start new week".

## 4. Core loop / state (`useGame`)

State machine: `idle → playing → results`.
Tracks: `questionIndex (0–9)`, `score` (mirrored from server responses), `correctCount`
(= kart checkpoint), `streak`, `timeLeft`, `totalMs`, `answers[]` (recap).

Per question (secure mode):
1. Render prompt (+ optional hint); start a **20s** countdown (client display only).
2. On submit (Enter) or timeout → call `answer_question` RPC.
3. RPC returns `{ correct, pointsAwarded, correctAnswer, explanation, newScore }`.
4. Update local mirror; trigger race FX (boost/skid).
5. ~1.5s reveal → advance. After Q10 → `finish_run` RPC → results.

## 5. Quiz engine (`quiz.ts`)

- **Question (client-visible):** `{ id, prompt, hint? }` only. **`accepted[]` and
  `explanation` are NOT sent to the browser** in secure mode.
- **Validation is server-side** (`answer_question` RPC): normalize + Levenshtein ≤ 1
  typo tolerance against hidden `accepted[]`. `correctAnswer` + `explanation` are
  returned **only after** the player answers (for the educational reveal).
- **`normalize(s)`** (shared logic, also used server-side in SQL): lowercase, trim,
  strip diacritics, remove punctuation, collapse whitespace.
- **Local/demo mode only:** bundled `DEFAULT_QUESTIONS` include `accepted[]` +
  `explanation` and are validated client-side (insecure — demo only).
- **Fact-checking gate:** every default question verified against live GenLayer
  sources before finalizing (Intelligent Contracts, LLM validators, Optimistic
  Democracy consensus, GenVM/Python, on-chain web access, GEN token, testnet,
  founders, non-determinism, use cases). Each carries a one-line `explanation`.

## 6. Race renderer (`RaceCanvas.tsx` + `race.ts`)

Side-scroll Canvas driven by `requestAnimationFrame`.

- **Parallax:** sky → GenLayer billboard hills → mid props → track with lane dashes.
- **Kart:** mochi mascot sprite (front pose, bg knocked out via `mascot.ts` flood-fill)
  seated on a drawn chunky cartoon kart. Fallback to a drawn vector mochi if the
  sprite fails to load.
- **Progress:** `targetX = (correctCount/10)*trackLength`; kart/camera lerps with
  easing so each correct answer surges forward.
- **FX:** correct → boost (speed lines, exhaust, screen-shake, green flash);
  wrong → skid/stall wobble + red flash. Checkpoints 1–10 + finish flag.
- **Perf:** cached grain + prebuilt gradients; no per-frame allocations.

## 7. Quiz UI + HUD

- **QuestionPanel:** prompt, autofocus text input (submit on Enter, max 100 chars),
  timer bar (drains over 20s), optional hint toggle. Input disabled while the
  answer RPC is in flight (prevents double-submit).
- **Feedback:** correct → green flash + "＋N pts" + boost; wrong/timeout → red shake,
  reveal `correctAnswer` + `explanation`. Auto-advance ~1.5s.
- **HUD:** `Q 5/10`, score, streak flame, mini progress bar mirroring the track.

## 8. Scoring (server-authoritative in secure mode)

- Correct: **100 base + up to 100 speed bonus + 25×streak**.
- **Speed bonus uses SERVER-measured elapsed time** between when the server served
  the question and when the answer arrives (`round(100 * max(0, (limit−elapsed)/limit))`).
  The client's timer is display-only and cannot influence the bonus.
- Wrong/timeout: 0, streak resets.
- Kart distance = correctCount; **finish flag = perfect 10**.
- Rank: **score desc, tiebreak totalMs asc**.
- `MAX_SCORE_PER_ROUND` derived from the formula (used for a sanity clamp).

## 9. Identity

- **Username only** — required, 2–20 chars, trimmed, HTML/profanity sanitized,
  cached in `localStorage`. Uniqueness not enforced (best score per name shown).
- **Auto avatar:** mochi silhouette tinted by a color hashed from the username
  (no external calls). Cosmetic only.

## 10. Leaderboard (`leaderboard.ts` adapter)

Interface: `{ top(round, n): Promise<Entry[]>; currentRound(): Promise<number> }`.
`Entry = { username, avatarSeed, score, correct, totalMs, round, createdAt }`.

- **Secure mode:** scores are written **only** by the `finish_run` RPC from the
  server-computed run total. **There is no client "submit score" path.** Reads via
  a public view filtered to the active round.
- **Local/demo mode:** `LocalAdapter` (`localStorage`), client-computed, per-device.
- Weekly reset is automatic: the board filters to the active `round`; bumping the
  round yields a fresh board.

## 11. Admin (`/admin`) — passcode `<ADMIN_PASSCODE>`, hardened

- **Gate:** passcode validated **only** inside a Supabase `SECURITY DEFINER` RPC
  against a **bcrypt hash** (`pgcrypto crypt`/`gen_salt('bf')`). The passcode is
  never in the client bundle or env.
- **Brute-force protection:** a `admin_attempts` table records failures; the admin
  RPCs enforce **global lockout** — after 5 failed attempts within 15 min, all admin
  RPCs reject for a cooldown window (exponential backoff). With bcrypt cost + lockout,
  a 6-digit code is not feasibly brute-forceable via the API.
- **Capabilities:**
  - **Edit questions:** 10 rows (`prompt`, `accepted[]`, `hint`, `explanation`),
    reorder by difficulty; live normalization preview of accepted answers.
  - **Start new week:** `admin_publish_questions(passcode, questions_json, bump_round=true)`
    replaces active questions, increments `round`, archives prior round's questions +
    scores. Community immediately gets the new set + fresh board.
  - **Rotate passcode:** `set_admin_passcode(current, new)`.
- **Local/demo fallback:** if Supabase is unconfigured, `/admin` is disabled with a
  notice ("admin requires the shared backend") — no insecure client-side passcode check.

## 12. Supabase schema (`supabase.sql`, one copy-paste script)

Extensions: `pgcrypto`.

Tables (all RLS-enabled):
- `config` (singleton `id=1`): `active_round int`. anon **SELECT**.
- `admin_config` (private): `passcode_hash text`. **no anon policy** (RPC-only).
- `admin_attempts`: `id, created_at`. **no anon policy** (RPC-only) — brute-force log.
- `questions`: `id, round, order_idx, prompt, accepted text[], hint, explanation`.
  **anon has NO direct SELECT** (would leak answers).
- `questions_public` **view**: exposes `id, round, order_idx, prompt, hint` ONLY.
  anon **SELECT** on the view.
- `runs`: `id uuid, token uuid, round, username, avatar_seed, server_started_at,
  current_index, score, correct, finished bool, question_served_at, created_at`.
  **no anon SELECT/INSERT** (RPC-only).
- `scores`: `id, round, username, avatar_seed, score, correct, total_ms, created_at`.
  anon **SELECT** (via a round-filtered public view), **no anon INSERT** (RPC-only).

RPCs — all `SECURITY DEFINER`, `SET search_path = public, pg_temp`, `EXECUTE`
granted to `anon` only where noted:
- `start_run(username, avatar_seed) → { run_id, token, first_question }` — validates
  username, creates a run for the active round, stamps `server_started_at` +
  `question_served_at`, returns run_id + token + the first prompt (no answer).
- `answer_question(run_id, token, question_id, answer) →
   { correct, points_awarded, correct_answer, explanation, new_score, next_question|null }`
  — verifies token + order + not-finished + not-timed-out; computes server elapsed;
  checks answer against hidden `accepted[]` (normalize + Levenshtein ≤1); updates run
  score/streak; serves next question (stamps new `question_served_at`).
- `finish_run(run_id, token) → { score, correct, total_ms, rank }` — verifies token,
  marks finished (idempotent), writes ONE row to `scores` from server totals, returns rank.
- `admin_publish_questions(passcode, questions_json jsonb, bump_round bool)` — bcrypt
  verify + lockout; replace active questions; optionally bump round + archive.
- `set_admin_passcode(current_passcode, new_passcode)` — bcrypt verify + rotate
  (first-set allowed via SQL when hash is null).

**Bootstrap:** `SETUP.md` shows how to run the SQL and set the initial passcode hash
to `<ADMIN_PASSCODE>` via `set_admin_passcode` (or a one-line seed INSERT using `crypt('<ADMIN_PASSCODE>', gen_salt('bf'))`).

## 13. Security model & audit checklist

Threats addressed:
- **Answer leakage → auto-cheat:** answers/explanations never sent pre-answer; anon
  cannot SELECT `questions` (only `questions_public` without `accepted`).
- **Fake high scores via direct API:** no client score-submit exists; scores computed
  and written only by `finish_run` from server-tracked run state. Score sanity-clamped.
- **Faked fast times:** speed bonus uses server timestamps, not client-reported time.
- **Question re-answering / skipping / replay:** `runs` enforces order, one attempt per
  question, one finalize, per-question server timeout.
- **Passcode brute force:** bcrypt hash + global attempt lockout; passcode never shipped.
- **SQL/search_path injection in SECURITY DEFINER:** fixed `search_path`, parameterized.
- **Privilege creep:** RLS default-deny; `EXECUTE` granted only on intended RPCs to
  `anon`; no direct table writes for anon; `admin_config`/`admin_attempts`/`runs`/
  `questions` have no anon policies.
- **Input abuse:** username + answer length caps; whitespace/HTML sanitization; jsonb
  shape validated in `admin_publish_questions`.
- **Residual (accepted) risks:** a determined attacker could start many runs to *learn*
  answers over time, then play a legit perfect run. Mitigations: hidden answers, weekly
  question rotation, and **run-creation rate limiting** per the `admin_attempts`-style
  throttle. Optional stretch: Cloudflare Turnstile on `start_run` (needs a site key).
- **Local/demo mode is explicitly out of scope for these guarantees** (no shared board).

**Security audit gate (run before "done"):** verify each RLS policy with the anon key
(attempt to read `questions.accepted`, write `scores`, read `admin_config` — all must
fail); verify lockout triggers after 5 bad passcodes; verify `answer_question` rejects
bad token, wrong order, replayed question, and post-timeout answers; verify `finish_run`
is idempotent and only writes server totals; attempt a spoofed high-score submit and
confirm it's impossible.

## 14. Error handling

- No username → Start disabled + hint. Empty answer submit → ignored, timer runs.
- Answer RPC in flight → input locked (no double-submit).
- Supabase down/unconfigured → local/demo mode with a visible "not the shared board"
  notice; never lose a run.
- Mascot sprite load fail → drawn vector mochi.
- Admin RPC rejects / locked out → inline message with cooldown note.
- Refresh mid-race → in-memory client state resets; the server run is abandoned
  (unfinished runs never write to the board). Acceptable.

## 15. Testing

**Vitest units:** `normalize`/`checkAnswer` client mirror (case, spacing, punctuation,
diacritics, synonyms, Levenshtein-1, wrong); scoring math + `MAX_SCORE_PER_ROUND`;
leaderboard sort + adapter selection + local fallback; username sanitization; avatar
seed determinism.

**SQL/integration (against a real Supabase project):** the full security audit gate in
§13 — RLS denials with the anon key, admin lockout, run token/order/timeout/replay
enforcement, `finish_run` idempotency, spoofed-score impossibility.

**Manual E2E:** full 10-question playthrough — kart advances only on correct, boost/skid
FX, results, leaderboard render, admin passcode edit + "Start new week" reset, Supabase-off
demo fallback.

## 16. Non-goals (YAGNI)

- No real-time/multiplayer live racing. No on-chain contract, no wallet, no user accounts.
- No per-user login (username-only; server-authoritative scoring is the anti-cheat).
- Arcade sound blips (WebAudio): optional stretch, off by default.
- Turnstile/captcha on `start_run`: optional stretch (needs a site key).

## 17. Proposed file layout

```
genlayer-grand-prix/
  public/brand/            # copied from genlayer-banner-studio
  src/
    main.tsx, App.tsx, index.css
    brand.ts               # palette + asset loaders (adapted)
    mascot.ts              # sprite crop + bg knockout (adapted)
    game/
      useGame.ts           # state machine (drives server RPCs in secure mode)
      quiz.ts              # normalize, checkAnswer (client mirror), DEFAULT_QUESTIONS
      scoring.ts           # score math + MAX_SCORE_PER_ROUND
    race/
      RaceCanvas.tsx       # canvas host + rAF loop
      race.ts              # draw track, kart, parallax, FX
    ui/
      StartScreen.tsx, QuestionPanel.tsx, Hud.tsx,
      ResultsScreen.tsx, Leaderboard.tsx, AdminPanel.tsx, ShareCard.ts
    data/
      supabase.ts          # client init (env-guarded)
      backend.ts           # secure-mode RPC wrappers (start/answer/finish/admin)
      leaderboard.ts       # adapter interface + Local/Supabase impls
  supabase.sql             # schema + RLS + RPCs + bcrypt passcode + lockout
  SETUP.md                 # Supabase 5-min guide + set passcode to <ADMIN_PASSCODE>
  .env.example
```
