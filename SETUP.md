# GenLayer Grand Prix — Backend Setup (Secure Mode)

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
select set_admin_passcode(null, '713962');
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

## 5. Publish the first week's questions
1. Open **`/admin`** in the app (e.g. <http://localhost:5200/admin>).
2. Enter the passcode `713962`. The editor pre-fills with the 10 default GenLayer
   questions.
3. Edit if you like, then click **Save questions**.

## Weekly reset (your routine)
1. Go to **`/admin`**, enter the passcode.
2. Edit the 10 questions for the new week.
3. Click **Start new week** → this bumps the round: everyone immediately gets the
   new questions and the leaderboard resets to a fresh season (old scores are kept,
   archived under the previous round number).

## Security notes
- Correct answers and explanations are **never** sent to the browser in secure mode —
  they live in the `questions` table (no anon read) and are checked inside the
  `answer_question` RPC.
- Scores are computed and written **only** server-side by `finish_run`; the client
  cannot submit a score. Answer timing is measured by the server, so speed bonuses
  can't be faked. Scores are clamped to the maximum possible (3375).
- See `SECURITY-AUDIT.md` (generated after the audit) for the verification checklist.
