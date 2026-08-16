# Security Audit — GenLayer Grand Prix

Scope: **secure mode** (Supabase configured). Local/demo mode is explicitly out of scope
(no shared board exists to attack). Threat model: a knowledgeable player using the browser
devtools and the public anon key, trying to (a) unlock admin, or (b) get an unearned
high score onto the leaderboard.

**Status legend:** ✅ enforced in code (this repo) · 🔬 verify against your live Supabase
project after running `supabase.sql`.

---

## A. Admin passcode cannot be cracked

| # | Control | Status | How it's enforced / how to verify |
|---|---------|--------|-----------------------------------|
| A1 | Passcode never shipped to client | ✅ | Grep the built bundle — the passcode/hash never appear. It lives only in `admin_config.passcode_hash`, set via `set_admin_passcode`. |
| A2 | Stored as bcrypt, not plaintext | ✅ | `set_admin_passcode` uses `crypt(p_new, gen_salt('bf'))`. Verify: `select passcode_hash from admin_config;` returns a `$2a$…` bcrypt string. |
| A3 | `admin_config` unreadable by anon | ✅ 🔬 | RLS enabled, no anon policy. Verify with anon key: `select * from admin_config` → 0 rows / denied. |
| A4 | Brute-force lockout | ✅ 🔬 | `admin_verify` calls `admin_check_lockout` (≥5 failures in 15 min → reject). Verify: call `admin_get_questions('000000')` 5×, then the correct `<ADMIN_PASSCODE>` is also rejected until the window passes. |
| A5 | Validation is server-side only | ✅ | The client only ever calls the RPC; it never compares the passcode locally in secure mode (`AdminPanel` gates on `isSecureMode()`; local mode disables admin entirely). |

Brute-force math: 6-digit space = 1,000,000. With a 5-attempts/15-min global cap that's
~5 attempts/900s ⇒ worst case ~1M/5 × 15 min ≈ **5.7 years** to exhaust, and bcrypt makes
each attempt server-expensive. Not feasible via the API.

## B. Nobody can fake a leaderboard win

| # | Control | Status | How it's enforced / how to verify |
|---|---------|--------|-----------------------------------|
| B1 | Correct answers never sent to the browser | ✅ 🔬 | Anon cannot read `questions` (no policy). Only `questions_public` (id, prompt, hint — **no `accepted`**) is granted. Verify: `select * from questions` (anon) → denied; `select * from questions_public` → no answer columns. |
| B2 | No client "submit score" path exists | ✅ | There is no `submit_score` RPC and no anon INSERT on `scores`. `SupabaseAdapter.submit()` is a no-op. Grep confirms the client never writes a score. |
| B3 | Scores written only by `finish_run` | ✅ 🔬 | `scores` has no anon INSERT policy. Verify: `insert into scores(...)` with anon key → denied. Rows appear only after `finish_run`. |
| B4 | Score computed server-side from server state | ✅ | `answer_question` computes points in SQL from the run's stored streak + server-measured elapsed; the client cannot supply points. |
| B5 | Timing can't be faked | ✅ | Speed bonus uses `now() - question_served_at` (server clock), not any client-reported time. |
| B6 | Score clamped to the max possible | ✅ | `finish_run` clamps to `MAX_SCORE = 10900` (matches the unit-tested client constant). |
| B7 | No re-answering / skipping / replay | ✅ 🔬 | `answer_question` requires the current `order_idx` question id, advances `current_index`, and locks the row `FOR UPDATE`. Verify: replaying the same `question_id` or sending a later one → `question out of order`. |
| B8 | Run requires a secret token | ✅ 🔬 | Every `answer_question`/`finish_run` needs the run `token` (uuid). `runs` has no anon read, so the token can't be discovered. Verify: wrong token → `invalid run or token`. |
| B9 | Per-question server timeout | ✅ | Answers arriving >25s after `question_served_at` are scored wrong regardless of content. |
| B10 | `finish_run` idempotent | ✅ 🔬 | Second call returns stored totals and does not insert a duplicate score. Verify: call twice → one `scores` row. |

## C. Hardening hygiene

| # | Control | Status | Notes |
|---|---------|--------|-------|
| C1 | RLS default-deny on every table | ✅ 🔬 | All 6 tables `enable row level security`; only `config` + the two `_public` views are anon-readable. |
| C2 | `SECURITY DEFINER` fns pin `search_path` | ✅ | Every RPC sets `search_path = public, pg_temp` (blocks search_path injection). |
| C3 | Least privilege on functions | ✅ | Internal fns (`normalize_text`, `answer_matches`, `admin_verify`, `admin_check_lockout`) are `revoke`d from public; only the 6 intended RPCs are granted to `anon`. |
| C4 | Input validation | ✅ | Username length 2–20 (client + `start_run`); answer capped at 100 chars (client); `admin_publish_questions` validates the jsonb shape (array, prompt present, ≥1 accepted). |

## D. Residual / accepted risks

- **Learning answers across runs.** An attacker could start many runs and probe answers
  over time, then play a legit perfect run. Mitigations in place: answers are hidden, and
  the admin can rotate all 10 questions weekly (**Start new week**). Optional future
  hardening: a Turnstile/hCaptcha gate on `start_run` (needs a site key), or per-IP run
  throttling (Supabase pooler obscures client IP, so this needs an edge function).
- **Local/demo mode** trusts the client entirely — intended, since it has no shared board.

---

## Client-side automated tests (this repo)

`npm test` covers the logic these guarantees mirror:
- `quiz.test.ts` — normalization + fuzzy matching (incl. short-answer guard).
- `scoring.test.ts` — score math and `MAX_SCORE === 10900` (the server clamp).
- `leaderboard.test.ts` — rank ordering (score desc, time asc) + adapter selection.
- `username.test.ts` — sanitization (HTML/control stripping, length).

## How to run the 🔬 live checks

With `.env.local` pointing at a project seeded by `supabase.sql`, open the Supabase SQL
editor **using the anon role** (or a script with the anon key) and run each 🔬 item above.
Every "denied / 0 rows / rejected" expectation must hold. Record results below.

> Live audit run: _not yet executed_ (requires the operator's Supabase project).
