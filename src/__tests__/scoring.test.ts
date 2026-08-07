import { describe, it, expect } from "vitest";
import {
  scoreAnswer,
  MAX_SCORE_PER_ROUND,
  TIME_LIMIT_MS,
  QUESTION_COUNT,
} from "../game/scoring";

describe("scoreAnswer", () => {
  it("wrong answer scores 0 and resets streak", () => {
    expect(scoreAnswer({ correct: false, elapsedMs: 1000, streak: 3 })).toEqual({
      points: 0,
      newStreak: 0,
    });
  });
  it("correct with full time gives base + full speed + streak bonus", () => {
    expect(scoreAnswer({ correct: true, elapsedMs: 0, streak: 0 })).toEqual({
      points: 100 + 100 + 25,
      newStreak: 1,
    });
  });
  it("correct at timeout gives base + 0 speed + streak", () => {
    expect(scoreAnswer({ correct: true, elapsedMs: TIME_LIMIT_MS, streak: 1 })).toEqual({
      points: 100 + 0 + 50,
      newStreak: 2,
    });
  });
  it("MAX_SCORE_PER_ROUND matches a perfect fast run and equals 3375", () => {
    let total = 0;
    let streak = 0;
    for (let i = 0; i < QUESTION_COUNT; i++) {
      const r = scoreAnswer({ correct: true, elapsedMs: 0, streak });
      total += r.points;
      streak = r.newStreak;
    }
    expect(total).toBe(MAX_SCORE_PER_ROUND);
    expect(MAX_SCORE_PER_ROUND).toBe(3375);
  });
});
