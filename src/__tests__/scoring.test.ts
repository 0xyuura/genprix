import { describe, it, expect } from "vitest";
import {
  ACCURACY_BONUS_MAX,
  BONUS_MAX,
  MAX_SCORE,
  POINTS_PER_CORRECT,
  QUESTION_COUNT,
  SESSION_MS,
  SPEED_BONUS_MAX,
  TIME_BONUS_MAX,
  WPM_CAP,
  formatClock,
  runScore,
  timeBonus,
  typingBonus,
} from "../game/scoring";

describe("runScore", () => {
  it("is just the base when the clock ran out and nothing was typed cleanly", () => {
    expect(runScore(4, 0, 0, 0)).toBe(4 * POINTS_PER_CORRECT);
  });
  it("zero solved scores only the bonuses, never a place above a solver", () => {
    expect(runScore(0, SESSION_MS, WPM_CAP, 1)).toBe(BONUS_MAX);
    expect(runScore(0, SESSION_MS, WPM_CAP, 1)).toBeLessThan(POINTS_PER_CORRECT);
  });
  it("MAX_SCORE is a perfect instant run typed at the WPM cap", () => {
    expect(MAX_SCORE).toBe(QUESTION_COUNT * POINTS_PER_CORRECT + BONUS_MAX);
  });

  // The ranking rule the host asked for: finish the game, fast, typed exactly.
  it("ranks the fast, perfectly typed full run first", () => {
    const best = runScore(10, SESSION_MS * 0.6, 90, 1); // 10/10, 6 min left, no typos
    const slower = runScore(10, SESSION_MS * 0.2, 90, 1);
    const sloppier = runScore(10, SESSION_MS * 0.6, 90, 0.8);
    expect(best).toBeGreaterThan(slower);
    expect(best).toBeGreaterThan(sloppier);
  });
  it("never lets a fast partial run outrank a slower complete one", () => {
    // The worst possible 10/10: buzzer-beating, sloppy, slow typing.
    const worstComplete = runScore(10, 0, 0, 0);
    // The best possible 9/10: instant, flawless, at the speed cap.
    const bestPartial = runScore(9, SESSION_MS, WPM_CAP, 1);
    expect(worstComplete).toBeGreaterThan(bestPartial);
  });
  it("breaks a tie on solved count by speed first", () => {
    const faster = runScore(7, SESSION_MS * 0.5, 60, 0.9);
    const slower = runScore(7, SESSION_MS * 0.4, 60, 0.9);
    expect(faster).toBeGreaterThan(slower);
  });
  it("counts every extra correct answer as more than any bonus", () => {
    expect(POINTS_PER_CORRECT).toBeGreaterThan(BONUS_MAX);
  });
  it("defaults to no typing bonus so a run without typing stats still scores", () => {
    expect(runScore(5, 0)).toBe(5 * POINTS_PER_CORRECT);
  });
  it("clamps a solved count outside the question set", () => {
    expect(runScore(99, 0, 0, 0)).toBe(QUESTION_COUNT * POINTS_PER_CORRECT);
    expect(runScore(-3, 0, 0, 0)).toBe(0);
  });
});

describe("timeBonus", () => {
  it("pays nothing at the buzzer and everything instantly", () => {
    expect(timeBonus(0)).toBe(0);
    expect(timeBonus(SESSION_MS)).toBe(TIME_BONUS_MAX);
  });
  it("is linear in the time left", () => {
    expect(timeBonus(SESSION_MS / 2)).toBe(TIME_BONUS_MAX / 2);
  });
  it("clamps overruns and negatives", () => {
    expect(timeBonus(-1)).toBe(0);
    expect(timeBonus(SESSION_MS * 10)).toBe(TIME_BONUS_MAX);
  });
});

describe("typingBonus", () => {
  it("pays accuracy and speed separately", () => {
    expect(typingBonus(WPM_CAP, 1)).toBe(ACCURACY_BONUS_MAX + SPEED_BONUS_MAX);
    expect(typingBonus(0, 1)).toBe(ACCURACY_BONUS_MAX);
    expect(typingBonus(WPM_CAP, 0)).toBe(SPEED_BONUS_MAX);
  });
  it("weights typing exactly above raw speed", () => {
    expect(ACCURACY_BONUS_MAX).toBeGreaterThan(SPEED_BONUS_MAX);
  });
  it("scales with accuracy", () => {
    expect(typingBonus(100, 0.5)).toBeLessThan(typingBonus(100, 1));
  });
  it("caps absurd WPM claims", () => {
    expect(typingBonus(10_000, 1)).toBe(typingBonus(WPM_CAP, 1));
  });
  it("clamps negative or out-of-range inputs", () => {
    expect(typingBonus(-50, 0)).toBe(0);
    expect(typingBonus(60, 5)).toBe(typingBonus(60, 1));
  });
});

describe("formatClock", () => {
  it("formats mm:ss", () => {
    expect(formatClock(600_000)).toBe("10:00");
    expect(formatClock(65_000)).toBe("1:05");
    expect(formatClock(9_000)).toBe("0:09");
  });
  it("clamps negatives to 0:00", () => {
    expect(formatClock(-500)).toBe("0:00");
  });
});
