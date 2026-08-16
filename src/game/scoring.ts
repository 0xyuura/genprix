// Scoring model (v4 — typing race): the whole quiz is one 10-minute session.
// Every question is a typeracer passage: you retype the prompt verbatim, then type
// the answer. Final score rewards how many you solved, how much of the 10 minutes
// you had left, and how fast + cleanly you typed. Both bonuses are scaled by the
// fraction solved so quitting early with few correct answers can't out-score a
// fast, complete run.
export const QUESTION_COUNT = 10;
export const SESSION_MS = 10 * 60 * 1000; // 10 minutes for the entire quiz
export const HINTS_PER_SESSION = 2; // 2 hints total per session (reveal first+last char)
export const POINTS_PER_CORRECT = 100;
export const TIME_BONUS_PER_SEC = 5; // remaining-time bonus per second, scaled by fraction solved
export const WPM_BONUS_PER_WPM = 2; // typing bonus per WPM, scaled by accuracy + fraction solved
export const WPM_CAP = 200; // clamp: nobody sustains 200 WPM, so nothing above it can be earned

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** Typing bonus = cappedWPM × accuracy × fractionSolved × perWpm. */
export function typingBonus(avgWpm: number, acc: number, correctCount: number): number {
  const frac = QUESTION_COUNT > 0 ? clamp01(correctCount / QUESTION_COUNT) : 0;
  const w = Math.min(WPM_CAP, Math.max(0, avgWpm || 0));
  return Math.round(w * clamp01(acc) * frac * WPM_BONUS_PER_WPM);
}

/** Final score = solved×base + (secondsLeft × perSec × fractionSolved) + typing bonus. */
export function runScore(
  correctCount: number,
  remainingMs: number,
  avgWpm = 0,
  acc = 1,
): number {
  const base = correctCount * POINTS_PER_CORRECT;
  const secsLeft = Math.max(0, Math.floor(remainingMs / 1000));
  const frac = QUESTION_COUNT > 0 ? correctCount / QUESTION_COUNT : 0;
  const bonus = Math.round(secsLeft * TIME_BONUS_PER_SEC * frac);
  return base + bonus + typingBonus(avgWpm, acc, correctCount);
}

/** Theoretical max: a perfect run finished instantly at the WPM cap. Anti-cheat clamp. */
export const MAX_SCORE = runScore(QUESTION_COUNT, SESSION_MS, WPM_CAP, 1);

/** mm:ss for a millisecond duration (clamped at 0). */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
