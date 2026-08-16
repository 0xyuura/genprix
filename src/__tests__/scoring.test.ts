import { describe, it, expect } from "vitest";
import {
  runScore,
  formatClock,
  MAX_SCORE,
  SESSION_MS,
  QUESTION_COUNT,
  POINTS_PER_CORRECT,
  typingBonus,
  WPM_CAP,
} from "../game/scoring";

describe("runScore", () => {
  it("is just the base when no time is left", () => {
    expect(runScore(4, 0)).toBe(4 * POINTS_PER_CORRECT);
  });
  it("zero solved scores zero regardless of time left", () => {
    expect(runScore(0, SESSION_MS)).toBe(0);
  });
  it("adds a time bonus scaled by the fraction solved", () => {
    // 10 solved, full time left → base + secsLeft*5*1.0
    const secs = Math.floor(SESSION_MS / 1000);
    expect(runScore(QUESTION_COUNT, SESSION_MS)).toBe(
      QUESTION_COUNT * POINTS_PER_CORRECT + secs * 5,
    );
  });
  it("a fast full run beats an early quit with fewer correct", () => {
    const fullFast = runScore(10, SESSION_MS * 0.5); // 10/10 with 5 min left
    const earlyQuit = runScore(3, SESSION_MS * 0.9); // 3/10 with 9 min left
    expect(fullFast).toBeGreaterThan(earlyQuit);
  });
  it("MAX_SCORE is a perfect instant run typed at the WPM cap", () => {
    expect(MAX_SCORE).toBe(runScore(QUESTION_COUNT, SESSION_MS, WPM_CAP, 1));
  });
  it("rewards faster typing on an otherwise identical run", () => {
    const fast = runScore(10, SESSION_MS * 0.5, 90, 1);
    const slow = runScore(10, SESSION_MS * 0.5, 30, 1);
    expect(fast).toBeGreaterThan(slow);
  });
  it("defaults to no typing bonus so a run without typing stats still scores", () => {
    expect(runScore(5, 0)).toBe(5 * POINTS_PER_CORRECT);
  });
});

describe("typingBonus", () => {
  it("is zero with nothing solved", () => {
    expect(typingBonus(120, 1, 0)).toBe(0);
  });
  it("scales with accuracy", () => {
    expect(typingBonus(100, 0.5, 10)).toBeLessThan(typingBonus(100, 1, 10));
  });
  it("caps absurd WPM claims", () => {
    expect(typingBonus(10_000, 1, 10)).toBe(typingBonus(WPM_CAP, 1, 10));
  });
  it("clamps negative or out-of-range inputs", () => {
    expect(typingBonus(-50, 1, 10)).toBe(0);
    expect(typingBonus(60, 5, 10)).toBe(typingBonus(60, 1, 10));
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
