# GenLayer Grand Prix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A GenLayer-branded quiz-racer where the mochi kart advances one checkpoint per correct answer, with a cheat-resistant global weekly leaderboard and a passcode-protected admin question editor.

**Architecture:** Vite + React + TS + Tailwind SPA with a Canvas 2D side-scroll race. Two modes: **secure mode** (Supabase configured) uses server-authoritative scoring — correct answers never reach the browser, timing is server-measured, and only DB RPCs write scores; **local/demo mode** (no Supabase) uses bundled questions + client scoring + localStorage board (not secure, demo only). Admin is passcode-gated via a bcrypt hash + rate-limit lockout inside `SECURITY DEFINER` RPCs.

**Tech Stack:** Vite, React 18, TypeScript, TailwindCSS, Canvas 2D, `@supabase/supabase-js`, Vitest. Supabase Postgres + `pgcrypto`.

---

## File Structure

```
genlayer-grand-prix/
  index.html
  package.json, tsconfig.json, vite.config.ts, tailwind.config.js, postcss.config.js
  .env.example
  supabase.sql              # schema + RLS + RPCs + bcrypt passcode + lockout
  SETUP.md                  # Supabase setup + set passcode <ADMIN_PASSCODE>
  public/brand/             # mascot-sheet.png, mark.png, mark-white.png, wordmark-white.png, favicon.svg
  src/
    main.tsx, App.tsx, index.css
    brand.ts                # BRAND palette, hexA, loadImage, grain (adapted from banner studio)
    mascot.ts               # front-pose crop + bg knockout (adapted)
    game/
      quiz.ts               # normalize, checkAnswer, DEFAULT_QUESTIONS, types
      scoring.ts            # scoreAnswer, MAX_SCORE_PER_ROUND, constants
      useGame.ts            # state machine hook (local + secure)
      username.ts           # sanitizeUsername, avatarSeed
    race/
      race.ts               # pure draw fns: track, kart, parallax, FX, easing
      RaceCanvas.tsx        # canvas host + rAF loop, consumes progress + fx events
    data/
      supabase.ts           # env-guarded client (null if unconfigured) + isSecureMode()
      backend.ts            # secure RPC wrappers: startRun, answerQuestion, finishRun, admin*
      leaderboard.ts        # adapter interface + LocalAdapter + SupabaseAdapter + selectAdapter
    ui/
      StartScreen.tsx, Hud.tsx, QuestionPanel.tsx, ResultsScreen.tsx,
      Leaderboard.tsx, AdminPanel.tsx, ShareCard.ts
    __tests__/
      quiz.test.ts, scoring.test.ts, leaderboard.test.ts, username.test.ts
```

---

## Phase 0 — Scaffold

### Task 0: Project scaffold
**Files:** Create `package.json`, `vite.config.ts`, `tsconfig.json`, `tailwind.config.js`, `postcss.config.js`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/index.css`, `.env.example`, `.gitignore`.

- [ ] **Step 1:** Init Vite React-TS project (manual files to avoid interactive prompts). `package.json` deps: `react`, `react-dom`, `@supabase/supabase-js`. devDeps: `vite`, `@vitejs/plugin-react`, `typescript`, `tailwindcss`, `postcss`, `autoprefixer`, `vitest`, `@types/react`, `@types/react-dom`.
- [ ] **Step 2:** `vite.config.ts` sets `server.port = 5200`, `plugins: [react()]`, and `test` (vitest) config with `environment: 'node'` for logic tests. Add `server.watch.ignored: ['**/.gstack/**']` (browse↔Vite reload guard from prior projects).
- [ ] **Step 3:** Tailwind config with the BRAND colors mapped to theme tokens; `index.css` sets dark base (`--void`), imports Tailwind layers.
- [ ] **Step 4:** `.env.example` with `VITE_SUPABASE_URL=` and `VITE_SUPABASE_ANON_KEY=`. `.gitignore` excludes `node_modules`, `dist`, `.env.local`, `.gstack`.
- [ ] **Step 5:** `npm install`; run `npm run dev` once to confirm it boots on :5200. Commit `chore: scaffold vite+react+ts+tailwind`.

### Task 0b: Copy brand assets
**Files:** Copy `genlayer-banner-studio/public/brand/*` → `public/brand/`, `favicon.svg`.
- [ ] **Step 1:** Copy `mascot-sheet.png`, `mark.png`, `mark-white.png`, `wordmark-white.png`, `favicon.svg`.
- [ ] **Step 2:** Port `src/brand.ts` (BRAND, hexA, loadImage, grain) and `src/mascot.ts` (FRONT crop + `knockoutBackground` + `loadMascot`) from banner studio verbatim (they're standalone).
- [ ] **Step 3:** Commit `chore: import GenLayer brand assets + mascot loader`.

---

## Phase 1 — Quiz engine (TDD)

### Task 1: `normalize` + `checkAnswer`
**Files:** Create `src/game/quiz.ts`; Test `src/__tests__/quiz.test.ts`.

- [ ] **Step 1 (failing test):**
```ts
import { describe, it, expect } from 'vitest';
import { normalize, checkAnswer } from '../game/quiz';

describe('normalize', () => {
  it('lowercases, trims, strips punctuation, collapses spaces', () => {
    expect(normalize('  Intelligent, Contracts!  ')).toBe('intelligent contracts');
  });
  it('strips diacritics', () => {
    expect(normalize('Condorcét')).toBe('condorcet');
  });
});

describe('checkAnswer', () => {
  const accepted = ['intelligent contracts', 'intelligent contract'];
  it('accepts exact normalized match', () => {
    expect(checkAnswer('Intelligent Contracts', accepted)).toBe(true);
  });
  it('accepts a synonym', () => {
    expect(checkAnswer('intelligent contract', accepted)).toBe(true);
  });
  it('tolerates a single-char typo (Levenshtein <=1)', () => {
    expect(checkAnswer('inteligent contracts', accepted)).toBe(true); // one missing l
  });
  it('rejects clearly wrong answers', () => {
    expect(checkAnswer('smart contracts', accepted)).toBe(false);
  });
  it('rejects empty input', () => {
    expect(checkAnswer('   ', accepted)).toBe(false);
  });
});
```
- [ ] **Step 2:** Run `npx vitest run src/__tests__/quiz.test.ts` — expect FAIL (not defined).
- [ ] **Step 3 (implement):**
```ts
export function normalize(s: string): string {
  return s
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip diacritics
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')                     // strip punctuation
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
  return dp[m][n];
}

export function checkAnswer(input: string, accepted: string[]): boolean {
  const n = normalize(input);
  if (!n) return false;
  return accepted.some((a) => {
    const na = normalize(a);
    if (n === na) return true;
    // typo tolerance only for reasonably long answers (avoid matching 'gen' vs 'den')
    return na.length >= 4 && levenshtein(n, na) <= 1;
  });
}
```
- [ ] **Step 4:** Run tests — expect PASS.
- [ ] **Step 5:** Commit `feat: quiz answer normalization + fuzzy matching`.

### Task 2: Question types + DEFAULT_QUESTIONS (fact-checked)
**Files:** Modify `src/game/quiz.ts`.

- [ ] **Step 1:** Add types and the fact-checked default set:
```ts
export interface Question {
  id: string;
  prompt: string;
  accepted: string[];   // hidden server-side in secure mode
  hint?: string;
  explanation: string;  // revealed only after answering
}

// Fact-checked against docs.genlayer.com (2026-08-07).
export const DEFAULT_QUESTIONS: Question[] = [
  { id: 'q1', prompt: "GenLayer's AI-powered smart contracts are called ___ Contracts.",
    accepted: ['intelligent', 'intelligent contracts', 'intelligent contract'],
    hint: 'Not "smart" — something cleverer.',
    explanation: 'They are Intelligent Contracts — able to reason over real-world data.' },
  { id: 'q2', prompt: 'What programming language are Intelligent Contracts written in?',
    accepted: ['python'],
    hint: 'Named after a snake; uses the GenVM SDK.',
    explanation: 'Intelligent Contracts are written in Python using the GenVM SDK.' },
  { id: 'q3', prompt: 'Validators connect directly to these AI models to reason (3-letter abbr.).',
    accepted: ['llm', 'llms', 'large language model', 'large language models'],
    hint: 'GPT and LLaMA are examples.',
    explanation: 'Validators connect to Large Language Models (LLMs).' },
  { id: 'q4', prompt: "GenLayer's Python execution environment / virtual machine is called ___.",
    accepted: ['genvm', 'gen vm'],
    hint: 'Gen + two letters.',
    explanation: 'The GenVM runs Intelligent Contracts and talks to LLMs and the web.' },
  { id: 'q5', prompt: "Name GenLayer's consensus mechanism (two words).",
    accepted: ['optimistic democracy'],
    hint: 'Hopeful + a form of government.',
    explanation: 'Optimistic Democracy — an enhanced Delegated Proof of Stake model.' },
  { id: 'q6', prompt: "GenLayer's incentivized testnet is named after which sci-fi author?",
    accepted: ['asimov', 'isaac asimov', 'testnet asimov'],
    hint: 'Wrote "I, Robot".',
    explanation: 'Testnet Asimov — "the Court of the Internet" — launched June 19, 2025.' },
  { id: 'q7', prompt: "GenLayer's native token ticker (3 letters).",
    accepted: ['gen', '$gen'],
    hint: 'First three letters of the project.',
    explanation: 'The native token is GEN.' },
  { id: 'q8', prompt: 'Which principle lets validators agree on non-deterministic (LLM) results without identical outputs? (two words)',
    accepted: ['equivalence principle', 'equivalence', 'the equivalence principle'],
    hint: 'Results only need to be "equivalent".',
    explanation: 'The Equivalence Principle — consensus on equivalent, not byte-identical, results.' },
  { id: 'q9', prompt: 'In Optimistic Democracy, the validator that proposes the initial outcome is the ___.',
    accepted: ['leader', 'the leader', 'leader validator'],
    hint: 'Others recompute and approve/deny its proposal.',
    explanation: 'A randomly chosen Leader proposes; other validators recompute and vote.' },
  { id: 'q10', prompt: 'Optimistic Democracy is an enhanced version of which staking consensus? (abbr. or full)',
    accepted: ['dpos', 'delegated proof of stake', 'delegated proof-of-stake', 'proof of stake'],
    hint: 'Delegated Proof of ______.',
    explanation: 'It enhances Delegated Proof of Stake (dPoS), inspired by Condorcet\'s Jury Theorem.' },
];

export type PublicQuestion = Pick<Question, 'id' | 'prompt' | 'hint'>;
export const toPublic = (q: Question): PublicQuestion => ({ id: q.id, prompt: q.prompt, hint: q.hint });
```
- [ ] **Step 2:** Add a test asserting exactly 10 questions and every `accepted` non-empty; run; commit `feat: fact-checked default GenLayer questions`.

---

## Phase 2 — Scoring + username (TDD)

### Task 3: Scoring
**Files:** Create `src/game/scoring.ts`; Test `src/__tests__/scoring.test.ts`.

- [ ] **Step 1 (tests):**
```ts
import { describe, it, expect } from 'vitest';
import { scoreAnswer, MAX_SCORE_PER_ROUND, TIME_LIMIT_MS, QUESTION_COUNT } from '../game/scoring';

describe('scoreAnswer', () => {
  it('wrong answer scores 0 and resets streak', () => {
    expect(scoreAnswer({ correct: false, elapsedMs: 1000, streak: 3 }))
      .toEqual({ points: 0, newStreak: 0 });
  });
  it('correct with full time gives base + full speed + streak bonus', () => {
    // elapsed 0 => speed bonus 100; prior streak 0 => this is streak 1 => +25*1
    expect(scoreAnswer({ correct: true, elapsedMs: 0, streak: 0 }))
      .toEqual({ points: 100 + 100 + 25, newStreak: 1 });
  });
  it('correct at timeout gives base + 0 speed + streak', () => {
    expect(scoreAnswer({ correct: true, elapsedMs: TIME_LIMIT_MS, streak: 1 }))
      .toEqual({ points: 100 + 0 + 50, newStreak: 2 });
  });
  it('MAX_SCORE_PER_ROUND matches a perfect fast run', () => {
    let total = 0, streak = 0;
    for (let i = 0; i < QUESTION_COUNT; i++) {
      const r = scoreAnswer({ correct: true, elapsedMs: 0, streak });
      total += r.points; streak = r.newStreak;
    }
    expect(total).toBe(MAX_SCORE_PER_ROUND);
  });
});
```
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3 (implement):**
```ts
export const QUESTION_COUNT = 10;
export const TIME_LIMIT_MS = 20_000;
export const BASE_POINTS = 100;
export const MAX_SPEED_BONUS = 100;
export const STREAK_BONUS = 25;

export interface ScoreInput { correct: boolean; elapsedMs: number; streak: number; }
export interface ScoreResult { points: number; newStreak: number; }

export function scoreAnswer({ correct, elapsedMs, streak }: ScoreInput): ScoreResult {
  if (!correct) return { points: 0, newStreak: 0 };
  const remaining = Math.max(0, TIME_LIMIT_MS - Math.min(elapsedMs, TIME_LIMIT_MS));
  const speed = Math.round(MAX_SPEED_BONUS * (remaining / TIME_LIMIT_MS));
  const newStreak = streak + 1;
  return { points: BASE_POINTS + speed + STREAK_BONUS * newStreak, newStreak };
}

export const MAX_SCORE_PER_ROUND = (() => {
  let total = 0, streak = 0;
  for (let i = 0; i < QUESTION_COUNT; i++) { const r = scoreAnswer({ correct: true, elapsedMs: 0, streak }); total += r.points; streak = r.newStreak; }
  return total;
})();
```
- [ ] **Step 4:** Run — PASS. **Step 5:** Commit `feat: scoring model with speed + streak bonus`.

### Task 4: Username sanitize + avatar seed
**Files:** Create `src/game/username.ts`; Test `src/__tests__/username.test.ts`.

- [ ] **Step 1 (tests):**
```ts
import { describe, it, expect } from 'vitest';
import { sanitizeUsername, avatarSeed, isValidUsername } from '../game/username';

it('trims, strips HTML/control chars, collapses spaces, caps at 20', () => {
  expect(sanitizeUsername('  <b>Racer</b>  ')).toBe('bRacerb'.slice(0, 20)); // tags removed, text kept
});
it('rejects too short / too long', () => {
  expect(isValidUsername('a')).toBe(false);
  expect(isValidUsername('ok')).toBe(true);
  expect(isValidUsername('x'.repeat(21))).toBe(false);
});
it('avatarSeed is deterministic and stable', () => {
  expect(avatarSeed('mochi')).toBe(avatarSeed('mochi'));
});
```
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3 (implement):**
```ts
export function sanitizeUsername(raw: string): string {
  return raw.replace(/<[^>]*>/g, '')            // strip tags
    .replace(/[ -<>]/g, '')          // control chars + angle brackets
    .replace(/\s+/g, ' ').trim().slice(0, 20);
}
export function isValidUsername(raw: string): boolean {
  const s = sanitizeUsername(raw);
  return s.length >= 2 && s.length <= 20;
}
export function avatarSeed(username: string): string {
  let h = 5381;
  for (let i = 0; i < username.length; i++) h = ((h << 5) + h + username.charCodeAt(i)) >>> 0;
  return String(h);
}
```
> Note: adjust the sanitize test expectation to the actual implementation output during Step 2/3 (tags removed leaves inner text `Racer`; verify the exact string and lock the assertion).
- [ ] **Step 4:** Run — PASS. **Step 5:** Commit `feat: username sanitization + deterministic avatar seed`.

---

## Phase 3 — Data layer

### Task 5: Supabase client + secure-mode detection
**Files:** Create `src/data/supabase.ts`.
- [ ] **Step 1:** Read `import.meta.env.VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`; export `supabase` (a client or `null`) and `isSecureMode(): boolean`.
```ts
import { createClient, SupabaseClient } from '@supabase/supabase-js';
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
export const supabase: SupabaseClient | null = url && key ? createClient(url, key) : null;
export const isSecureMode = () => supabase !== null;
```
- [ ] **Step 2:** Commit `feat: env-guarded supabase client`.

### Task 6: Backend RPC wrappers
**Files:** Create `src/data/backend.ts`.
- [ ] **Step 1:** Typed wrappers around the RPCs (match §12 signatures). Each throws on error so callers can fall back.
```ts
import { supabase } from './supabase';
import type { PublicQuestion } from '../game/quiz';

export interface StartRunResult { runId: string; token: string; question: PublicQuestion; index: number; }
export interface AnswerResult {
  correct: boolean; pointsAwarded: number; correctAnswer: string; explanation: string;
  newScore: number; nextQuestion: PublicQuestion | null; index: number;
}
export interface FinishResult { score: number; correct: number; totalMs: number; rank: number; }

const rpc = async <T>(fn: string, args: object): Promise<T> => {
  if (!supabase) throw new Error('secure mode unavailable');
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw error;
  return data as T;
};

export const startRun = (username: string, avatarSeed: string) =>
  rpc<StartRunResult>('start_run', { p_username: username, p_avatar_seed: avatarSeed });
export const answerQuestion = (runId: string, token: string, questionId: string, answer: string) =>
  rpc<AnswerResult>('answer_question', { p_run_id: runId, p_token: token, p_question_id: questionId, p_answer: answer });
export const finishRun = (runId: string, token: string) =>
  rpc<FinishResult>('finish_run', { p_run_id: runId, p_token: token });

export const adminPublish = (passcode: string, questions: unknown, bumpRound: boolean) =>
  rpc<{ ok: true; round: number }>('admin_publish_questions', { p_passcode: passcode, p_questions: questions, p_bump: bumpRound });
export const adminGetQuestions = (passcode: string) =>
  rpc<unknown[]>('admin_get_questions', { p_passcode: passcode });
```
- [ ] **Step 2:** Commit `feat: supabase RPC wrappers for runs + admin`.

### Task 7: Leaderboard adapter (TDD for local + sort)
**Files:** Create `src/data/leaderboard.ts`; Test `src/__tests__/leaderboard.test.ts`.
- [ ] **Step 1 (tests):** test `sortEntries` (score desc, tie → totalMs asc) and `LocalAdapter.submit/top` against an in-memory `localStorage` mock.
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { sortEntries, LocalAdapter, type Entry } from '../data/leaderboard';

const e = (u: string, score: number, totalMs: number): Entry =>
  ({ username: u, avatarSeed: u, score, correct: 5, totalMs, round: 1, createdAt: 0 });

describe('sortEntries', () => {
  it('orders by score desc then totalMs asc', () => {
    const out = sortEntries([e('a', 100, 5000), e('b', 200, 9000), e('c', 200, 4000)]);
    expect(out.map(x => x.username)).toEqual(['c', 'b', 'a']);
  });
});
```
(Provide a minimal `localStorage` mock in the test via `globalThis.localStorage`.)
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3 (implement):** interface + `sortEntries` + `LocalAdapter` (localStorage JSON) + `SupabaseAdapter` (reads `scores_public` view filtered by round; `currentRound` from `config`) + `selectAdapter()` returning Supabase when `isSecureMode()` else Local.
- [ ] **Step 4:** Run — PASS. **Step 5:** Commit `feat: leaderboard adapters + sort`.

---

## Phase 4 — Supabase SQL (security-critical)

### Task 8: `supabase.sql`
**Files:** Create `supabase.sql`, `SETUP.md`, update `.env.example`.
- [ ] **Step 1:** Write the full script (see below). Enable `pgcrypto`; create tables with RLS default-deny; create `questions_public` and `scores_public` views (no answers); grant anon SELECT on views + `config`; create all `SECURITY DEFINER` RPCs with `SET search_path = public, pg_temp`; implement bcrypt passcode + lockout (`admin_attempts`, 5 fails / 15 min).
- [ ] **Step 2:** Key RPC logic to implement exactly:
  - `start_run`: validate username length; insert `runs` row (uuid id + uuid token) for `config.active_round`; set `server_started_at=now()`, `current_index=0`, `question_served_at=now()`; return run_id, token, and `questions_public` row at `order_idx=0`.
  - `answer_question`: `SELECT ... FOR UPDATE` the run by id+token; reject if `finished`, if `question_id` != expected `order_idx` question, or if `now() - question_served_at > interval '25 seconds'` (server timeout → treat as wrong). Compute `elapsed_ms`. Fetch hidden `accepted` for the question; normalize both sides in SQL (a `normalize_text(text)` SQL fn mirroring `normalize`) and accept exact OR (later) simple match; award points server-side (mirror `scoreAnswer`); update `score`, `correct`, streak, advance `current_index`, set new `question_served_at`; return `{correct, points_awarded, correct_answer, explanation, new_score, next_question, index}`.
  - `finish_run`: lock run; if already finished return stored totals (idempotent); else mark finished, clamp `score` to `MAX_SCORE_PER_ROUND` (= **3375** = 10×200 + 25×(1..10); verify against Task 3), insert into `scores`, compute rank = count(scores in round with higher score, or equal score and lower total_ms) + 1.
  - `admin_check_lockout()`: raise if ≥5 rows in `admin_attempts` within 15 min.
  - `admin_verify(passcode)`: on mismatch insert into `admin_attempts` + raise; on match return true.
  - `admin_publish_questions(passcode, questions jsonb, bump bool)`: lockout check → verify → validate jsonb is array of 10 objects with `prompt`, `accepted` (array), `hint`, `explanation` → replace questions for active round (or new round if bump) → optionally `active_round += 1`.
  - `admin_get_questions(passcode)`: lockout + verify → return active round questions **including** accepted (admin only).
  - `set_admin_passcode(current, new)`: allow if stored hash null; else verify current; store `crypt(new, gen_salt('bf'))`.
- [ ] **Step 3:** `MAX_SCORE_PER_ROUND` sanity: with base 100, speed 100, streak 25×n for n=1..10 → 10*200 + 25*(1+..+10) = 2000 + 1375 = **3375**. Update the constant in scoring + SQL clamp to 3375. (Recompute in Step; do not trust this comment blindly — assert via the Task 3 test.)
- [ ] **Step 4:** `SETUP.md`: create project → SQL editor → paste `supabase.sql` → run → `select set_admin_passcode(null, '<ADMIN_PASSCODE>');` → copy URL + anon key into `.env.local`. Note weekly flow: `/admin` → edit → Start new week.
- [ ] **Step 5:** Commit `feat: supabase schema, RLS, server-authoritative RPCs, bcrypt admin`.

---

## Phase 5 — Race renderer

### Task 9: `race.ts` pure draw functions
**Files:** Create `src/race/race.ts`.
- [ ] **Step 1:** Export `drawScene(ctx, state)` where `state = { w, h, progress (0..1), fx: 'boost'|'skid'|'idle', shake, mascot: HTMLCanvasElement|null, t }`. Implement: sky gradient (void→purple), parallax hills with GenLayer `mark` billboards, asphalt with scrolling lane dashes (offset by progress + t), 10 checkpoint posts + finish flag, and the kart.
- [ ] **Step 2:** `drawKart(ctx, x, y, scale, mascot, fx, t)`: chunky rounded kart body (magenta/cobalt), two wheels (spin by t), spoiler, seat the mascot canvas above the body; boost → exhaust triangles + speed lines; skid → wobble rotation + smoke puffs.
- [ ] **Step 3:** `easeProgress(current, target, dt)` lerp helper (exported, unit-testable). Add a tiny test asserting it moves toward target and clamps.
- [ ] **Step 4:** Commit `feat: canvas race scene + kart renderer`.

### Task 10: `RaceCanvas.tsx`
**Files:** Create `src/race/RaceCanvas.tsx`.
- [ ] **Step 1:** Props: `{ correctCount, fxEvent }` (fxEvent = incrementing `{type, id}` so effects fire once). Load mascot via `loadMascot()` on mount. rAF loop maintains eased `progress` toward `correctCount/10`, decays `shake`, and calls `drawScene`. Handle DPR scaling + resize.
- [ ] **Step 2:** On new `fxEvent`, set `fx` for ~700ms then back to idle; add shake on boost/skid.
- [ ] **Step 3:** Commit `feat: RaceCanvas host with rAF + fx events`.

---

## Phase 6 — Game state + UI

### Task 11: `useGame` hook
**Files:** Create `src/game/useGame.ts`.
- [ ] **Step 1:** State: `phase`, `username`, `index`, `score`, `correctCount`, `streak`, `current` (PublicQuestion), `lastResult` (correct/answer/explanation/points), `fxEvent`, `startedAt`, `totalMs`, plus secure-run fields `runId/token`.
- [ ] **Step 2:** `start(username)`: if secure → `startRun` (sets runId/token/current); else load `DEFAULT_QUESTIONS`, set current[0]. On secure error → fall back to local + set a `notice`.
- [ ] **Step 3:** `submit(answer, elapsedMs)`: secure → `answerQuestion` (server returns correctness/points/next); local → `checkAnswer` + `scoreAnswer` locally, compute next. Update score/streak/correctCount, set `lastResult`, bump `fxEvent`. After Q10 → secure `finishRun` (store rank) or local compute → `phase='results'`.
- [ ] **Step 4:** Commit `feat: useGame state machine (secure + local)`.

### Task 12: UI components
**Files:** Create `StartScreen.tsx`, `Hud.tsx`, `QuestionPanel.tsx`, `ResultsScreen.tsx`, `Leaderboard.tsx`, `ShareCard.ts`, `AdminPanel.tsx`; wire in `App.tsx`.
- [ ] **Step 1: StartScreen** — title lockup (wordmark), mochi-kart hero (RaceCanvas idle), username input (`isValidUsername` gate), Start button, rules, leaderboard link, mode badge ("Global board" vs "Local demo").
- [ ] **Step 2: Hud** — `Q i/10`, score, streak flame, mini progress bar.
- [ ] **Step 3: QuestionPanel** — prompt, autofocus input (Enter submits, max 100 chars, locked while RPC in flight + during reveal), timer bar animating over `TIME_LIMIT_MS`, hint toggle; on reveal show correct/explanation with green/red styling.
- [ ] **Step 4: ResultsScreen** — score, correct/10, totalMs, rank + "beat X%", Play again, Share (ShareCard.ts renders a 1600×900 PNG: mascot kart + score + wordmark, download).
- [ ] **Step 5: Leaderboard** — `selectAdapter().currentRound()` + `top(round, 20)`; render rows with avatar (mochi tinted by `avatarSeed`).
- [ ] **Step 6: AdminPanel** (`/admin` via `window.location.pathname` or hash route) — if `!isSecureMode()` show disabled notice; else passcode input → `adminGetQuestions` → editable 10-row form → Save (`adminPublish(passcode, qs, false)`) + "Start new week" (`adminPublish(passcode, qs, true)`), with lockout error surfacing.
- [ ] **Step 7:** `App.tsx` routes: `/admin` → AdminPanel; else the game (Start/Race/Results) + Leaderboard tab. Commit each component: `feat: <component>`.

---

## Phase 7 — Integration, security audit, polish

### Task 13: Local end-to-end
- [ ] **Step 1:** `npm run dev`; play a full local run: verify kart advances only on correct, boost/skid FX, timer, reveal, results, local leaderboard, share PNG.
- [ ] **Step 2:** Fix visual/logic issues. Commit fixes.

### Task 14: Security audit (secure mode, needs a real Supabase project)
> Run these with the anon key against a project seeded by `supabase.sql`. Document results in `SECURITY-AUDIT.md`.
- [ ] **Step 1:** Anon cannot `select * from questions` (answers hidden); can select `questions_public` (no `accepted`). Anon cannot `select` `admin_config`/`admin_attempts`/`runs`.
- [ ] **Step 2:** Anon cannot `insert into scores` directly (RLS denies); scores appear only via `finish_run`.
- [ ] **Step 3:** `answer_question` rejects: bad token, wrong-order question id, replayed question, answer after server timeout.
- [ ] **Step 4:** Spoof attempt: call `finish_run` / try to inflate score → impossible (server totals only; clamp to `MAX_SCORE_PER_ROUND`).
- [ ] **Step 5:** Admin brute force: 5 wrong passcodes → 6th (even correct) locked out for the window. `<ADMIN_PASSCODE>` works before lockout.
- [ ] **Step 6:** Commit `docs: security audit results`.

### Task 15: Docs + memory
- [ ] **Step 1:** `README.md`: what it is, run, modes, admin weekly flow, deploy note.
- [ ] **Step 2:** Update user memory with a project entry + MEMORY.md pointer.
- [ ] **Step 3:** Final commit.

---

## Self-review notes
- Spec coverage: identity(§9)→T4/T12.1; quiz(§5)→T1/T2; race(§6)→T9/T10; scoring(§8)→T3 + SQL mirror T8; leaderboard(§10)→T7/T12.5; admin(§11)→T8/T12.6; schema+security(§12/§13)→T8/T14; testing(§15)→T1–4,7,14; error handling(§14)→T11.2 fallback, T12.3 lock.
- `MAX_SCORE_PER_ROUND` = **3375** (10×base200 + 25×(1..10)=1375). The Task 3 test is the source of truth — align the SQL clamp to whatever the test computes.
- Type consistency: `PublicQuestion`, `Entry`, RPC arg names (`p_*`) are used identically across backend.ts, leaderboard.ts, useGame.ts, AdminPanel.
```
