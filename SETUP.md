# GenLayer Grand Prix — Backend Setup (Secure Mode)

> ⚠️ **Out of date as of the v3 game overhaul (2026-08-13).** The game now uses a
> pick-any-order question board, one 10-minute session timer, 2 first/last-letter hints,
> and time-bonus scoring — all currently computed **client-side (local mode only)**.
> The RPCs in `supabase.sql` still implement the older per-question v2 model, so
> **do not enable secure mode yet**: `join_room` / `answer_question` / `finish_run` need
> to be ported to the v3 rules first. Until then the app runs in local/demo mode.

The game works out of the box in **local/demo mode** (bundled questions, per-device
leaderboard). To turn on the **global leaderboard**, **cheat-resistant scoring**, and the
**weekly admin editor**, connect a free Supabase project — about 5 minutes.

## 1. Create a Supabase project
1. Go to <https://supabase.com> → **New project** (free tier is fine).
2. Wait for it to finish provisioning.

## 2. Run the schema
1. In the project, open **SQL Editor** → **New query**.
2. Paste the entire contents of [`supabase.sql`](./supabase.sql) and click **Run**.
   This creates the tables, row-level-security policies, public views, and the
   server-authoritative RPCs (run lifecycle + admin).

## 3. Set the admin passcode
Run this once in the SQL editor (rotates later via the same function):

```sql
select set_admin_passcode(null, '<ADMIN_PASSCODE>');
```

> The passcode is stored **only** as a bcrypt hash in the private `admin_config`
> table — it is never shipped to the browser. Admin RPCs lock out after 5 failed
> attempts per 15 minutes, so the 6-digit code is not brute-forceable via the API.

## 4. Wire up the frontend
1. In Supabase: **Project Settings → API**. Copy the **Project URL** and the
   **anon public** key.
2. In the project root, create `.env.local`:

```
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR-ANON-PUBLIC-KEY
```

3. Restart `npm run dev`. A **"Global board"** badge on the start screen confirms
   secure mode is active.

## 5. Host the first game
1. Click the **🔒** button in the bottom-right corner (or open `/admin`).
2. Enter the passcode `<ADMIN_PASSCODE>`. The editor pre-fills with the 10 default GenLayer
   questions.
3. Edit if you like, then click **Create room & get code**.
4. Share the code (or the invite link) with your community. They enter a username +
   the code on the start screen to join.

## Running games (your routine)
- Each time you want to run a session: 🔒 → passcode → edit questions → **Create room &
  get code** → share the code.
- The global leaderboard **resets automatically at the top of every hour** — no manual
  reset needed. A live "resets in mm:ss" countdown is shown on the leaderboard.
- Players can only start when an active room exists, so you control exactly when the
  quiz is open.

## Security notes
- Correct answers and explanations are **never** sent to the browser in secure mode —
  they live in the `questions` table (no anon read) and are checked inside the
  `answer_question` RPC.
- Scores are computed and written **only** server-side by `finish_run`; the client
  cannot submit a score. Answer timing is measured by the server, so speed bonuses
  can't be faked. Scores are clamped to the maximum possible (3375).
- See `SECURITY-AUDIT.md` (generated after the audit) for the verification checklist.
