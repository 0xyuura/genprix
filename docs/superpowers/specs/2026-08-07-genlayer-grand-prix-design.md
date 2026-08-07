# GenLayer Grand Prix — Design Spec

**Date:** 2026-08-07
**Status:** Approved pending user review
**Location:** `C:\Users\User\genlayer-grand-prix` · dev port `:5200`

## 1. Summary

A GenLayer-branded quiz-racer. The player types answers to 10 GenLayer trivia
questions; each **correct** answer advances the mochi mascot's kart one checkpoint
down a side-scrolling "Smash Karts"-style track toward the finish flag. Faster and
streak answers score higher. A **shared weekly leaderboard** ranks the community.
An **admin** can replace the 10 questions and reset the board each week.

No wallet, no accounts — identity is a typed **username** only (with an auto
mochi-color avatar). The game runs in the browser; a shared **Supabase** backend
holds questions + scores. It ships with bundled default questions so it works
before Supabase is configured (local fallback for both leaderboard and admin edits).

## 2. Stack & conventions

- **Vite + React + TypeScript + Tailwind** (matches the user's other projects).
- **Canvas 2D** for the race render (parallax side-scroller).
- **`@supabase/supabase-js`** for the shared questions + leaderboard (optional; auto-detected via env).
- Reuse existing GenLayer brand assets from `genlayer-banner-studio`: `mascot-sheet.png`,
  `mark.png`, `wordmark-white.png`, and the `BRAND` palette.
- **Vitest** for unit tests.
- Dev server on `:5200`.

### Brand palette (from existing brand kit)
`cobalt #110FFF · void #070707 · magenta #E63BD3 · purple #7A2BF5 · teal #2FE1D6 ·
green #00FF66 (correct) · red #FF3B4E (wrong) · amber #F5C542 (timer)`. Dark-mode-first,
chunky arcade aesthetic: bold rounded shapes, thick outlines, speed lines, GenLayer
billboards along the track.

## 3. Screens & flow

```
Start screen → (enter username) → Race (10 questions) → Results → Leaderboard
                                                                     ↑
                                              /admin (passcode) → edit Qs / new week
```

- **Start screen:** title, mochi-kart hero art, username input (required, 2–20 chars,
  sanitized), "Start Race" button, short rules blurb, link to leaderboard.
- **Race screen:** Canvas track (top ~60%) + question panel (bottom ~40%) + HUD.
- **Results screen:** final score, correct/10, total time, "you beat X% of racers",
  submit-to-board (auto), share card (Canvas PNG for X), "Play again".
- **Leaderboard screen:** current-round global top N (username, avatar, score, correct, time).
- **Admin screen (`/admin`):** passcode gate → question editor (10 rows) + "Start new week".

## 4. Core loop / state (`useGame`)

State machine: `idle → playing → results`.
Tracks: `questionIndex (0–9)`, `score`, `correctCount` (= kart checkpoint), `streak`,
`timeLeft`, per-question `elapsedMs`, `totalMs`, `answers[]` (for the results recap).

Per question:
1. Render prompt + input; start a **20s** countdown (tunable constant).
2. On submit (Enter) or timeout → `checkAnswer()`.
3. Update `score`, `streak`, `correctCount`; push into `answers[]`.
4. Trigger race animation (boost on correct / skid on wrong).
5. After a ~1.5s reveal, advance `questionIndex`. After Q10 → `results`.

## 5. Quiz engine (`quiz.ts`)

- **Question shape:** `{ id, prompt, accepted: string[], hint?, explanation }`.
- **Source order:** if Supabase configured → load active round's questions from DB;
  else → bundled `DEFAULT_QUESTIONS` (10 items, difficulty easy→hard).
- **`normalize(s)`**: lowercase, trim, strip diacritics, remove punctuation, collapse
  internal whitespace.
- **`checkAnswer(input, accepted)`**: true if normalized input equals any normalized
  accepted answer, OR is within **Levenshtein distance ≤ 1** of one (typo tolerance).
- **Fact-checking gate:** every default question is verified against live GenLayer
  sources before finalizing (Intelligent Contracts, LLM validators, Optimistic
  Democracy consensus, GenVM/Python, on-chain web access, GEN token, testnet, founders,
  non-determinism handling, use cases). Each carries a one-line `explanation`.

## 6. Race renderer (`RaceCanvas.tsx` + `race.ts`)

Side-scroll Canvas driven by `requestAnimationFrame`.

- **Parallax layers:** sky gradient → distant GenLayer billboard hills → mid props →
  track/asphalt with lane dashes.
- **Kart:** mochi mascot sprite (front pose, knocked-out bg — reuse `mascot.ts` flood-fill)
  composited onto a drawn chunky cartoon kart (canvas vector: body, wheels, spoiler,
  exhaust). Fallback to a fully-drawn vector mochi if the sprite fails to load.
- **Progress:** `targetX = (correctCount / 10) * trackLength`; camera/kart lerps toward
  target with easing so each correct answer produces a visible forward surge.
- **FX:** correct → boost (speed lines, exhaust burst, brief screen-shake, green tint
  flash); wrong → skid/stall wobble + red tint. Checkpoint posts 1–10 + finish flag.
- **Perf:** cached grain tile + prebuilt gradients; no per-frame allocations in the loop.

## 7. Quiz UI + HUD

- **QuestionPanel:** prompt, single-line text input (autofocus, submit on Enter),
  timer bar (amber, drains over 20s), optional "hint" toggle.
- **Feedback:** correct → green flash + "＋N pts" + boost; wrong/timeout → red shake,
  reveal the correct answer + `explanation` (educational). Auto-advance ~1.5s.
- **HUD:** `Q 5/10`, live score, streak flame, mini progress bar mirroring the track.

## 8. Scoring

- Correct: **100 base + up to 100 speed bonus** (`round(100 * timeLeft/limit)`) **+ 25×streak**.
- Wrong/timeout: **0**, streak resets.
- Kart distance = `correctCount`; **finish flag = perfect 10** (replay incentive).
- Leaderboard rank: **score desc, tiebreak totalMs asc**.
- `MAX_SCORE_PER_ROUND` computed from the formula for anti-cheat clamping.

## 9. Identity

- **Username only** — required, 2–20 chars, trimmed, profanity/HTML sanitized, stored
  in `localStorage` for convenience across runs.
- **Auto avatar:** mochi silhouette tinted by a color hashed from the username (no
  external calls). Purely cosmetic.

## 10. Leaderboard (`leaderboard.ts` adapter)

Interface: `{ submit(entry): Promise<void>; top(round, n): Promise<Entry[]>; currentRound(): Promise<number> }`.
`Entry = { username, avatarSeed, score, correct, totalMs, round, createdAt }`.

- **`LocalAdapter`** (default): `localStorage`, per-device board.
- **`SupabaseAdapter`**: auto-selected when `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`
  are present. Global board.
- Submit path uses the `submit_score` RPC (clamps impossible scores). Network/config
  failure → silent fallback to `LocalAdapter` + a small "local scores only" note.
- Board is filtered to the **active round** → weekly reset is automatic when the round bumps.

## 11. Admin (`/admin`) — passcode-gated

- **Gate:** passcode input. The passcode is **never** bundled in client env — it is
  validated inside a Supabase `SECURITY DEFINER` RPC against a **hash stored in the DB**.
- **Capabilities:**
  - **Edit questions:** 10 rows (`prompt`, `accepted[]`, `hint`, `explanation`), reorder
    by difficulty. Live-preview normalization of accepted answers.
  - **Start new week:** `admin_publish_questions(passcode, questions_json, bump_round=true)`
    replaces the active question set, increments `round`, archives prior round's
    questions + scores. Community immediately gets the new set + a fresh board.
- **Local fallback:** if Supabase is not configured, admin passcode is checked
  client-side and edits persist to `localStorage` (that browser only) — enough to
  demo, with a visible "not shared" warning.

## 12. Supabase schema (one copy-paste SQL script)

Tables:
- `config` (singleton): `id=1`, `active_round int`.
- `admin_config` (private, **no anon policies**): `passcode_hash text`.
- `questions`: `id, round int, order_idx int, prompt text, accepted text[], hint text, explanation text`.
- `scores`: `id, round int, username text, avatar_seed text, score int, correct int, total_ms int, created_at timestamptz`.

Policies:
- anon **SELECT** on `config`, `questions`, `scores`.
- anon **no direct write** on `questions`/`config`/`admin_config`.
- writes go through `SECURITY DEFINER` RPCs owned by a privileged role:
  - `submit_score(username, avatar_seed, score, correct, total_ms)` — validates round,
    clamps `score ≤ MAX_SCORE_PER_ROUND`, inserts.
  - `admin_publish_questions(passcode, questions_json, bump_round bool)` — verifies
    `crypt(passcode, passcode_hash)`, replaces active questions, optionally bumps round.
  - `set_admin_passcode(current_passcode, new_passcode)` — rotate the passcode (first
    set allowed when hash is null / via SQL).
- Uses `pgcrypto` (`crypt`/`gen_salt`) for the passcode hash.

A `SETUP.md` documents: create Supabase project → run `supabase.sql` → set passcode →
copy URL + anon key into `.env.local`.

## 13. Error handling

- **No username:** Start button disabled; inline hint.
- **Empty answer submit:** ignored (no penalty, timer keeps running).
- **Supabase down / unconfigured:** fall back to bundled questions + local board;
  non-blocking notice. Never lose a run.
- **Mascot sprite load fail:** fall back to drawn vector mochi.
- **Admin RPC rejects passcode:** inline "wrong passcode", no lockout.
- **Refresh mid-race:** in-memory state resets (documented; acceptable for a quiz run).

## 14. Testing

**Vitest units:**
- `normalize` / `checkAnswer`: case, spacing, punctuation, diacritics, synonyms,
  Levenshtein-1 typos, clear wrong answers.
- Scoring: base + speed + streak math; timeout = 0 + streak reset; `MAX_SCORE_PER_ROUND`.
- Leaderboard: sort (score desc, time asc), adapter selection (env present/absent),
  local fallback on error.
- Username sanitization; avatar-seed determinism.

**Manual E2E:** full 10-question playthrough — verify kart advances only on correct,
boost/skid FX, results + auto-submit, leaderboard render, admin passcode edit +
"Start new week" reset (against a real Supabase project), Supabase-off fallback path.

## 15. Non-goals (YAGNI)

- No real-time / multiplayer live racing.
- No on-chain contract, no wallet, no user accounts/auth.
- No per-user login for the leaderboard (username-only; light anti-cheat only).
- Arcade sound blips (WebAudio): optional stretch, off by default.

## 16. Proposed file layout

```
genlayer-grand-prix/
  public/brand/            # copied from genlayer-banner-studio
  src/
    main.tsx, App.tsx, index.css
    brand.ts               # palette + asset loaders (adapted)
    mascot.ts              # sprite crop + bg knockout (adapted)
    game/
      useGame.ts           # state machine
      quiz.ts              # normalize, checkAnswer, DEFAULT_QUESTIONS
      scoring.ts           # score math + MAX_SCORE_PER_ROUND
    race/
      RaceCanvas.tsx       # canvas host + rAF loop
      race.ts              # draw track, kart, parallax, FX
    ui/
      StartScreen.tsx, QuestionPanel.tsx, Hud.tsx,
      ResultsScreen.tsx, Leaderboard.tsx, AdminPanel.tsx, ShareCard.ts
    data/
      leaderboard.ts       # adapter interface + Local/Supabase impls
      supabase.ts          # client init (env-guarded)
    __tests__/             # vitest
  supabase.sql             # schema + RLS + RPCs
  SETUP.md                 # Supabase 5-min guide
  .env.example
```
