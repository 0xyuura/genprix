import { describe, it, expect, beforeEach } from "vitest";
import {
  sortEntries,
  LocalAdapter,
  currentHourBucket,
  msUntilNextHour,
  HOUR_MS,
  type Entry,
} from "../data/leaderboard";

const e = (u: string, score: number, totalMs: number, bucket = currentHourBucket()): Entry => ({
  username: u,
  avatarSeed: u,
  score,
  correct: 5,
  totalMs,
  hourBucket: bucket,
  createdAt: 0,
});

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

describe("hour bucket helpers", () => {
  it("currentHourBucket is a stable integer for the current hour", () => {
    expect(currentHourBucket()).toBe(Math.floor(Date.now() / HOUR_MS));
  });
  it("msUntilNextHour is within (0, HOUR_MS]", () => {
    const ms = msUntilNextHour();
    expect(ms).toBeGreaterThan(0);
    expect(ms).toBeLessThanOrEqual(HOUR_MS);
  });
});

describe("LocalAdapter", () => {
  it("submits and returns top entries for the current hour, sorted", async () => {
    const a = new LocalAdapter();
    await a.submit(e("slow", 200, 9000));
    await a.submit(e("fast", 200, 4000));
    await a.submit(e("low", 100, 1000));
    const top = await a.top(10);
    expect(top.map((x) => x.username)).toEqual(["fast", "slow", "low"]);
  });
  it("hides entries from a previous hour (auto-reset)", async () => {
    const a = new LocalAdapter();
    await a.submit(e("thisHour", 500, 1000));
    await a.submit(e("lastHour", 999, 1000, currentHourBucket() - 1));
    const top = await a.top(10);
    expect(top.map((x) => x.username)).toEqual(["thisHour"]);
  });
  it("respects the limit", async () => {
    const a = new LocalAdapter();
    for (let i = 0; i < 5; i++) await a.submit(e("u" + i, i * 10, 1000));
    expect(await a.top(3)).toHaveLength(3);
  });
});
