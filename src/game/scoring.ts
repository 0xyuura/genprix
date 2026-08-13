// Scoring model (v3): the whole quiz is one 10-minute session. Players pick any
// question in any order and retry until correct. Final score rewards how many they
// solved plus how much of the 10 minutes they had left when they finished — the
// time bonus is scaled by the fraction solved so quitting early with few correct
// answers can't out-score a fast, complete run.
export const QUESTION_COUNT = 10;
export const SESSION_MS = 10 * 60 * 1000; // 10 minutes for the entire quiz
export const HINTS_PER_SESSION = 2; // 2 hints total per session (reveal first+last char)
export const POINTS_PER_CORRECT = 100;
export const TIME_BONUS_PER_SEC = 5; // remaining-time bonus per second, scaled by fraction solved

/** Final score = solved×base + (secondsLeft × perSec × fractionSolved). */
export function runScore(correctCount: number, remainingMs: number): number {
  const base = correctCount * POINTS_PER_CORRECT;
  const secsLeft = Math.max(0, Math.floor(remainingMs / 1000));
  const frac = QUESTION_COUNT > 0 ? correctCount / QUESTION_COUNT : 0;
  const bonus = Math.round(secsLeft * TIME_BONUS_PER_SEC * frac);
  return base + bonus;
}

/** Theoretical max: a perfect run finished instantly. Used as the anti-cheat clamp. */
export const MAX_SCORE = runScore(QUESTION_COUNT, SESSION_MS);

/** mm:ss for a millisecond duration (clamped at 0). */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
