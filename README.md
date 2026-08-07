# 🏁 GenLayer Grand Prix

A GenLayer-branded quiz-racer. Answer 10 GenLayer trivia questions by typing — every
**correct** answer floors it and the mochi mascot's kart races one checkpoint closer to
the finish line. Faster answers and streaks score more. Compete on a weekly global
leaderboard. Built for the GenLayer community.

![start screen](docs/screenshot-start.png)

## Features

- **Type-to-answer quiz** — 10 fact-checked GenLayer questions, smart answer matching
  (case/punctuation-insensitive, accepts synonyms, tolerates a 1-char typo).
- **Smash-Karts-style race** — Canvas side-scroller with the mochi kart, parallax
  GenLayer scenery, boost on correct, skid on wrong, checkpoints + finish flag.
- **Speed + streak scoring** — 100 base + up to 100 speed bonus + 25×streak per question.
- **Username only** — no wallet, no sign-up. Just type a name (auto mochi-color avatar).
- **Weekly global leaderboard** — everyone competes on one board; each week is a season.
- **Admin question editor** — passcode-protected `/admin` to swap the 10 questions and
  reset the board every week.
- **Cheat-resistant** — in secure mode, answers never reach the browser and scores are
  computed and written server-side (see Security below).
- **Share card** — export a 1600×900 PNG of your result for X.

## Run it

```bash
npm install
npm run dev      # http://localhost:5200
npm test         # vitest unit tests
npm run build    # typecheck + production build
```

Out of the box it runs in **local/demo mode**: bundled questions, per-device leaderboard,
client-side scoring. Great for trying it or taking screenshots.

## Go live (global board + admin + anti-cheat)

Connect a free Supabase project (~5 min) — see **[SETUP.md](./SETUP.md)**. In short:

1. Create a Supabase project, run [`supabase.sql`](./supabase.sql) in the SQL editor.
2. `select set_admin_passcode(null, '713962');`
3. Put the project URL + anon key in `.env.local` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).
4. Open `/admin`, enter the passcode, publish the first week's questions.

A **"Global board"** badge on the start screen confirms secure mode is on.

### Weekly reset
`/admin` → edit the 10 questions → **Start new week**. This bumps the round: everyone
gets the new questions and the leaderboard resets to a fresh season.

## Security

Local/demo mode is not secured (there's no shared board to cheat). **Secure mode**
(Supabase configured) is hardened:

- **Answers are hidden** — the `questions` table has no anonymous read access; the browser
  only ever receives prompts + hints via a column-filtered view. Answer checking happens
  inside a Postgres function.
- **Server-authoritative scoring** — there is no client "submit score" path. A run is a
  server-side session (`start_run` → `answer_question` × N → `finish_run`); the DB checks
  each answer, measures timing on its own clock (so speed can't be faked), computes the
  score, clamps it to the maximum possible (3375), and writes the only leaderboard row.
- **Admin passcode** — stored as a **bcrypt hash** (never shipped to the client),
  validated only inside a `SECURITY DEFINER` RPC, with **rate-limit lockout** (5 failed
  attempts / 15 min) so a 6-digit code can't be brute-forced through the API.

See **[SECURITY-AUDIT.md](./SECURITY-AUDIT.md)** for the verification checklist.

## Tech

Vite · React · TypeScript · Tailwind · Canvas 2D · Supabase (Postgres + `pgcrypto` +
`fuzzystrmatch`). Brand assets and mochi mascot reused from the GenLayer Banner Studio.

## Project layout

```
src/game/     quiz engine, scoring, username, state machine
src/race/     canvas scene + kart renderer + rAF host
src/ui/       screens (start, question, results, leaderboard, admin), avatar, share card
src/data/     supabase client, RPC wrappers, leaderboard adapters
supabase.sql  schema + RLS + server-authoritative RPCs
```
