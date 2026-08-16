// Scoring model (v5 — ranked by "finish it, fast, typed clean").
//
// The board answers one question: who completed the game fastest with the
// cleanest typing? So the score is built in that order of priority:
//
//   1. Every correct answer is worth 1000. Nothing else comes close, so a run
//      that solves more questions ALWAYS outranks one that solves fewer. A fast
//      9/10 can never jump ahead of a slow 10/10.
//   2. Whatever is left of the 10 minutes is worth up to 500.
//   3. Typing exactly is worth up to 300 (accuracy) + 100 (raw speed).
//
// The bonuses total at most 900, which is deliberately less than one correct
// answer. Speed outweighs accuracy on purpose: typos already cost time, because
// the kart will not move past a wrong character until you backspace it.
export const QUESTION_COUNT = 10;
export const SESSION_MS = 10 * 60 * 1000; // 10 minutes for the entire quiz
export const HINTS_PER_SESSION = 2; // 2 hints total per session (reveal first+last char)
export const POINTS_PER_CORRECT = 1000;
export const TIME_BONUS_MAX = 500; // × fraction of the session still on the clock
export const ACCURACY_BONUS_MAX = 300; // × typing accuracy over the whole run
export const SPEED_BONUS_MAX = 100; // × min(wpm, cap) / cap
export const WPM_CAP = 200; // nobody sustains 200 WPM, so nothing above it can be earned
export const BONUS_MAX = TIME_BONUS_MAX + ACCURACY_BONUS_MAX + SPEED_BONUS_MAX;

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** Points for having time left on the clock. 0 at the buzzer, 500 instantly. */
export function timeBonus(remainingMs: number): number {
  return Math.round(clamp01(remainingMs / SESSION_MS) * TIME_BONUS_MAX);
}

/** Points for typing cleanly and quickly: accuracy is worth 3× raw speed. */
export function typingBonus(avgWpm: number, acc: number): number {
  const speed = Math.min(WPM_CAP, Math.max(0, avgWpm || 0)) / WPM_CAP;
  return Math.round(clamp01(acc) * ACCURACY_BONUS_MAX + speed * SPEED_BONUS_MAX);
}

/** Final score = 1000 per correct answer + up to 900 for speed and clean typing. */
export function runScore(
  correctCount: number,
  remainingMs: number,
  avgWpm = 0,
  acc = 0,
): number {
  const solved = Math.max(0, Math.min(QUESTION_COUNT, correctCount));
  return solved * POINTS_PER_CORRECT + timeBonus(remainingMs) + typingBonus(avgWpm, acc);
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
