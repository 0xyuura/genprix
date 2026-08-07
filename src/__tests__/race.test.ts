import { describe, it, expect } from "vitest";
import { easeProgress } from "../race/race";

describe("easeProgress", () => {
  it("moves toward the target", () => {
    const next = easeProgress(0, 1, 0.016);
    expect(next).toBeGreaterThan(0);
    expect(next).toBeLessThan(1);
  });
  it("snaps to target when very close", () => {
    expect(easeProgress(0.9999, 1, 0.016)).toBe(1);
  });
  it("does not overshoot with a large dt", () => {
    expect(easeProgress(0, 1, 10)).toBe(1);
  });
  it("stays put when already at target", () => {
    expect(easeProgress(0.5, 0.5, 0.016)).toBe(0.5);
  });
});
