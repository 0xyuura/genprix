// Scoring model. Mirrored server-side in supabase.sql so secure-mode scores match.
export const QUESTION_COUNT = 10;
export const TIME_LIMIT_MS = 10_000;
export const HINTS_PER_SESSION = 3;
export const BASE_POINTS = 100;
export const MAX_SPEED_BONUS = 100;
export const STREAK_BONUS = 25;

export interface ScoreInput {
  correct: boolean;
  elapsedMs: number;
  streak: number; // streak BEFORE this answer
}
export interface ScoreResult {
  points: number;
  newStreak: number;
}

export function scoreAnswer({ correct, elapsedMs, streak }: ScoreInput): ScoreResult {
  if (!correct) return { points: 0, newStreak: 0 };
  const clamped = Math.min(Math.max(0, elapsedMs), TIME_LIMIT_MS);
  const remaining = TIME_LIMIT_MS - clamped;
  const speed = Math.round(MAX_SPEED_BONUS * (remaining / TIME_LIMIT_MS));
  const newStreak = streak + 1;
  return { points: BASE_POINTS + speed + STREAK_BONUS * newStreak, newStreak };
}

// Theoretical max: a perfect, instant run. Used as the server anti-cheat clamp.
export const MAX_SCORE_PER_ROUND = (() => {
  let total = 0;
  let streak = 0;
  for (let i = 0; i < QUESTION_COUNT; i++) {
    const r = scoreAnswer({ correct: true, elapsedMs: 0, streak });
    total += r.points;
    streak = r.newStreak;
  }
  return total;
})();
