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
- **10-second timer** per question · **speed + streak scoring** (100 base + up to 100
  speed + 25×streak) · **3 hints per game** (session-wide budget).
- **Host a game with a room code** — the admin creates a room, gets a **share code**
  (+ invite link), and players join with it. No active room = no game (full host control).
- **Username only** — no wallet, no sign-up. Just a name + the room code (auto mochi avatar).
- **Hourly global leaderboard** — one global board that **auto-resets every clock hour**
  (a live "resets in mm:ss" countdown is shown).
- **Admin panel** — a discreet 🔒 button in the bottom-right corner opens the passcode-gated
  admin, where you input the questions/answers and create the room.
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

Out of the box it runs in **local/demo mode** (per-device, single machine). Because a game
needs an active room, do this once to play locally:

1. Click the **🔒** button (bottom-right) → enter passcode **713962**.
2. Edit the 10 questions if you want, then **Create room & get code**.
3. Go back, enter a username + the code, and race.

(In local/demo mode the room + scores live in this browser only. Cross-device rooms and the
global board need Supabase — see below.)

## Go live (global board + admin + anti-cheat)

Connect a free Supabase project (~5 min) — see **[SETUP.md](./SETUP.md)**. In short:

1. Create a Supabase project, run [`supabase.sql`](./supabase.sql) in the SQL editor.
2. `select set_admin_passcode(null, '713962');`
3. Put the project URL + anon key in `.env.local` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).
4. Open `/admin`, enter the passcode, publish the first week's questions.

A **"Global board"** badge on the start screen confirms secure mode is on.

### Hosting a game
🔒 (bottom-right) → passcode → edit the 10 questions → **Create room & get code**. Share the
code / invite link. Players join and play those questions. The global leaderboard resets
automatically at the top of every hour.

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
