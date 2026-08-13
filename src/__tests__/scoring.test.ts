import { describe, it, expect } from "vitest";
import {
  runScore,
  formatClock,
  MAX_SCORE,
  SESSION_MS,
  QUESTION_COUNT,
  POINTS_PER_CORRECT,
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
  it("MAX_SCORE is a perfect instant run", () => {
    expect(MAX_SCORE).toBe(runScore(QUESTION_COUNT, SESSION_MS));
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
