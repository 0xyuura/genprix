import { describe, it, expect } from "vitest";
import { normalize, checkAnswer, DEFAULT_QUESTIONS } from "../game/quiz";

describe("normalize", () => {
  it("lowercases, trims, strips punctuation, collapses spaces", () => {
    expect(normalize("  Intelligent, Contracts!  ")).toBe("intelligent contracts");
  });
  it("strips diacritics", () => {
    expect(normalize("Condorcét")).toBe("condorcet");
  });
});

describe("checkAnswer", () => {
  const accepted = ["intelligent contracts", "intelligent contract"];
  it("accepts exact normalized match", () => {
    expect(checkAnswer("Intelligent Contracts", accepted)).toBe(true);
  });
  it("accepts a synonym", () => {
    expect(checkAnswer("intelligent contract", accepted)).toBe(true);
  });
  it("tolerates a single-char typo (Levenshtein <=1)", () => {
    expect(checkAnswer("inteligent contracts", accepted)).toBe(true);
  });
  it("rejects clearly wrong answers", () => {
    expect(checkAnswer("smart contracts", accepted)).toBe(false);
  });
  it("rejects empty input", () => {
    expect(checkAnswer("   ", accepted)).toBe(false);
  });
  it("does not fuzzy-match very short answers", () => {
    // 'gen' vs 'den' would be Levenshtein 1 but must NOT match (len < 4 guard)
    expect(checkAnswer("den", ["gen"])).toBe(false);
    expect(checkAnswer("gen", ["gen"])).toBe(true);
  });
});

describe("DEFAULT_QUESTIONS", () => {
  it("has exactly 10 questions", () => {
    expect(DEFAULT_QUESTIONS).toHaveLength(10);
  });
  it("every question has a prompt, explanation, and non-empty accepted list", () => {
    for (const q of DEFAULT_QUESTIONS) {
      expect(q.prompt.length).toBeGreaterThan(0);
      expect(q.explanation.length).toBeGreaterThan(0);
      expect(q.accepted.length).toBeGreaterThan(0);
    }
  });
  it("ids are unique", () => {
    const ids = new Set(DEFAULT_QUESTIONS.map((q) => q.id));
    expect(ids.size).toBe(DEFAULT_QUESTIONS.length);
  });
});
