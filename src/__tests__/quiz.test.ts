import { describe, it, expect } from "vitest";
import { normalize, checkAnswer, maskAnswer, DEFAULT_QUESTIONS } from "../game/quiz";

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

describe("maskAnswer", () => {
  const revealed = (s: string) => maskAnswer(s).replace(/[_ ]/g, "");
  it("reveals only the first and last letter", () => {
    expect(maskAnswer("python")).toBe("p _ _ _ _ n");
    expect(revealed("python")).toBe("pn");
  });
  it("keeps very short answers mostly intact", () => {
    expect(maskAnswer("gen")).toBe("g _ n");
  });
  it("masks interior letters of multi-word answers, keeping word breaks", () => {
    const m = maskAnswer("optimistic democracy");
    expect(m.startsWith("o ")).toBe(true);
    expect(m.endsWith(" y")).toBe(true);
    expect(revealed("optimistic democracy")).toBe("oy"); // only global first/last shown
    expect(m).toMatch(/\S {3}\S/); // a 3-space gap marks the word boundary
  });

  // The black-screen regression. In secure mode the server never sends
  // `accepted`, so accepted[0] is undefined; this used to throw inside a React
  // state updater, which unmounted the whole app mid-race. There is nothing to
  // reveal in that case — the caller asks the server — but it must not throw.
  it("returns an empty mask instead of throwing when there is no answer", () => {
    expect(maskAnswer(undefined)).toBe("");
    expect(maskAnswer(null)).toBe("");
    expect(maskAnswer("")).toBe("");
    expect(maskAnswer("   ")).toBe("");
    expect(([] as string[])[0]).toBeUndefined(); // exactly what secure mode passes
    expect(maskAnswer(([] as string[])[0])).toBe("");
  });
});

describe("DEFAULT_QUESTIONS", () => {
  it("has exactly 10 questions", () => {
    expect(DEFAULT_QUESTIONS).toHaveLength(10);
  });
  it("every question has a prompt and a non-empty accepted list", () => {
    for (const q of DEFAULT_QUESTIONS) {
      expect(q.prompt.length).toBeGreaterThan(0);
      expect(q.accepted.length).toBeGreaterThan(0);
    }
  });
  it("ids are unique", () => {
    const ids = new Set(DEFAULT_QUESTIONS.map((q) => q.id));
    expect(ids.size).toBe(DEFAULT_QUESTIONS.length);
  });
});
