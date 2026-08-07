import { describe, it, expect, beforeEach } from "vitest";
import { sortEntries, LocalAdapter, type Entry } from "../data/leaderboard";

const e = (u: string, score: number, totalMs: number, round = 1): Entry => ({
  username: u,
  avatarSeed: u,
  score,
  correct: 5,
  totalMs,
  round,
  createdAt: 0,
});

// Minimal in-memory localStorage for the node test environment.
class MemStorage {
  private m = new Map<string, string>();
  getItem(k: string) {
    return this.m.has(k) ? this.m.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  clear() {
    this.m.clear();
  }
}

beforeEach(() => {
  (globalThis as unknown as { localStorage: MemStorage }).localStorage = new MemStorage();
});

describe("sortEntries", () => {
  it("orders by score desc then totalMs asc", () => {
    const out = sortEntries([e("a", 100, 5000), e("b", 200, 9000), e("c", 200, 4000)]);
    expect(out.map((x) => x.username)).toEqual(["c", "b", "a"]);
  });
});

describe("LocalAdapter", () => {
  it("submits and returns top entries for the round, sorted", async () => {
    const a = new LocalAdapter();
    await a.submit(e("slow", 200, 9000));
    await a.submit(e("fast", 200, 4000));
    await a.submit(e("low", 100, 1000));
    const top = await a.top(1, 10);
    expect(top.map((x) => x.username)).toEqual(["fast", "slow", "low"]);
  });
  it("filters by round", async () => {
    const a = new LocalAdapter();
    await a.submit(e("r1", 500, 1000, 1));
    await a.submit(e("r2", 999, 1000, 2));
    const top = await a.top(1, 10);
    expect(top.map((x) => x.username)).toEqual(["r1"]);
  });
  it("respects the limit", async () => {
    const a = new LocalAdapter();
    for (let i = 0; i < 5; i++) await a.submit(e("u" + i, i * 10, 1000));
    expect(await a.top(1, 3)).toHaveLength(3);
  });
});
