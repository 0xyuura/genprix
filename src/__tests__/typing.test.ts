import { describe, it, expect } from "vitest";
import {
  MAX_OVERRUN,
  accuracy,
  addPassage,
  applyInput,
  charStates,
  correctPrefixLen,
  elapsedOf,
  emptyTotals,
  hasError,
  isComplete,
  newTyping,
  normalizeTarget,
  progressOf,
  totalsAccuracy,
  totalsWpm,
  wpm,
  type TypingState,
} from "../game/typing";

/** Type a whole string one character at a time, 10ms per key. */
function typeAll(s: TypingState, text: string, startNow = 1000): TypingState {
  let st = s;
  for (let i = 0; i < text.length; i++) {
    st = applyInput(st, st.typed + text[i], startNow + i * 10);
  }
  return st;
}

describe("normalizeTarget", () => {
  it("collapses whitespace and trims", () => {
    expect(normalizeTarget("  a \n b\tc  ")).toBe("a b c");
  });
});

describe("correctPrefixLen", () => {
  it("counts only the leading match", () => {
    expect(correctPrefixLen("hello", "hel")).toBe(3);
    expect(correctPrefixLen("hello", "hexlo")).toBe(2);
    expect(correctPrefixLen("hello", "")).toBe(0);
    expect(correctPrefixLen("hello", "hello")).toBe(5);
  });
  it("does not run past the shorter string", () => {
    expect(correctPrefixLen("hi", "hi there")).toBe(2);
  });
});

describe("charStates", () => {
  it("marks correct, current and pending", () => {
    expect(charStates("abc", "a")).toEqual(["correct", "current", "pending"]);
  });
  it("marks a wrong character red and keeps the cursor after it", () => {
    expect(charStates("abc", "ax")).toEqual(["correct", "wrong", "current"]);
  });
  it("is all-correct on completion", () => {
    expect(charStates("ab", "ab")).toEqual(["correct", "correct"]);
  });
});

describe("applyInput", () => {
  it("counts a correct keystroke and starts the clock", () => {
    const s = applyInput(newTyping("abc"), "a", 500);
    expect(s.typed).toBe("a");
    expect(s.keystrokes).toBe(1);
    expect(s.errors).toBe(0);
    expect(s.startedAt).toBe(500);
  });
  it("accepts a wrong character but counts it as an error and freezes progress", () => {
    let s = applyInput(newTyping("abc"), "a", 0);
    s = applyInput(s, "ax", 10);
    expect(s.errors).toBe(1);
    expect(hasError(s)).toBe(true);
    expect(progressOf(s)).toBeCloseTo(1 / 3);
  });
  it("lets a backspace clear the error without charging a keystroke", () => {
    let s = typeAll(newTyping("abc"), "ax");
    const before = s.keystrokes;
    s = applyInput(s, "a", 999);
    expect(hasError(s)).toBe(false);
    expect(s.keystrokes).toBe(before);
  });
  it("rejects pasted input", () => {
    const s = newTyping("hello world");
    expect(applyInput(s, "hello world", 0)).toBe(s);
  });
  it("rejects runaway overrun past the passage end", () => {
    let s = typeAll(newTyping("ab"), "ab");
    // completed passages are locked outright
    expect(applyInput(s, "abc", 500)).toBe(s);
    s = typeAll(newTyping("ab"), "x".repeat(MAX_OVERRUN + 2));
    expect(s.typed.length).toBeLessThanOrEqual("ab".length + MAX_OVERRUN);
  });
  it("marks the passage complete and stamps finishedAt", () => {
    const s = typeAll(newTyping("abc"), "abc", 100);
    expect(isComplete(s)).toBe(true);
    expect(s.finishedAt).toBe(120);
    expect(progressOf(s)).toBe(1);
  });
  it("ignores further input once complete", () => {
    const s = typeAll(newTyping("ab"), "ab");
    expect(applyInput(s, "a", 900)).toBe(s);
  });
  it("returns the same object when nothing changed, so React can skip the render", () => {
    const s = newTyping("abc");
    expect(applyInput(s, "", 0)).toBe(s);
  });
});

describe("wpm / accuracy", () => {
  it("uses the 5-characters-per-word convention", () => {
    // 50 correct chars in 60s = 10 words per minute
    expect(wpm(50, 60_000)).toBeCloseTo(10);
  });
  it("is zero before any typing", () => {
    expect(wpm(0, 1000)).toBe(0);
    expect(wpm(10, 0)).toBe(0);
  });
  it("reports full accuracy before the first keystroke", () => {
    expect(accuracy(0, 0)).toBe(1);
  });
  it("charges errors against accuracy", () => {
    expect(accuracy(10, 2)).toBeCloseTo(0.8);
  });
});

describe("elapsedOf", () => {
  it("is zero before the first keystroke", () => {
    expect(elapsedOf(newTyping("abc"), 5000)).toBe(0);
  });
  it("freezes at finishedAt once complete", () => {
    const s = typeAll(newTyping("abc"), "abc", 100);
    expect(elapsedOf(s, 99_999)).toBe(20);
  });
});

describe("session totals", () => {
  it("accumulates chars, keystrokes, errors and time across passages", () => {
    const a = typeAll(newTyping("abc"), "abc", 0); // clean, 3 chars
    // "de" typed as a typo, backspaced, then completed correctly.
    let b = applyInput(newTyping("de"), "x", 0);
    b = applyInput(b, "", 10); // backspace, not charged
    b = applyInput(b, "d", 20);
    b = applyInput(b, "de", 30);
    expect(isComplete(b)).toBe(true);

    let t = addPassage(emptyTotals, a, 0);
    t = addPassage(t, b, 0);
    expect(t.chars).toBe(5); // "abc" + "de"
    expect(t.keystrokes).toBe(6); // 3 + (x, d, e)
    expect(t.errors).toBe(1);
    expect(totalsAccuracy(t)).toBeCloseTo(5 / 6);
    expect(totalsWpm(t)).toBeGreaterThan(0);
  });
  it("a clean run reports 100% accuracy", () => {
    const a = typeAll(newTyping("abc"), "abc", 0);
    expect(totalsAccuracy(addPassage(emptyTotals, a, 0))).toBe(1);
  });
});
