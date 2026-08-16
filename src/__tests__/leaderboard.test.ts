import { describe, it, expect, beforeEach } from "vitest";
import {
  sortEntries,
  beats,
  LocalAdapter,
  currentHourBucket,
  msUntilNextHour,
  HOUR_MS,
  type Entry,
} from "../data/leaderboard";
import { runScore, SESSION_MS } from "../game/scoring";

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
  it("puts the more complete run first when scores tie", () => {
    const partial = { ...e("partial", 200, 1000), correct: 6 };
    const complete = { ...e("complete", 200, 9000), correct: 10 };
    expect(sortEntries([partial, complete]).map((x) => x.username)).toEqual([
      "complete",
      "partial",
    ]);
  });
});

// The board the host described: finish the game fast, typed exactly, take #1.
describe("board order for real runs", () => {
  const run = (u: string, correct: number, msLeft: number, w: number, acc: number): Entry => ({
    username: u,
    avatarSeed: u,
    score: runScore(correct, msLeft, w, acc),
    correct,
    totalMs: SESSION_MS - msLeft,
    hourBucket: currentHourBucket(),
    createdAt: 0,
    wpm: w,
    accuracy: acc,
  });

  it("ranks fast-and-exact first, then slower, then sloppier, then incomplete", () => {
    const board = sortEntries([
      run("sloppy", 10, SESSION_MS * 0.6, 80, 0.7), // full but typo-ridden
      run("nearly", 9, SESSION_MS * 0.9, 120, 1), // faster, flawless, one short
      run("ace", 10, SESSION_MS * 0.6, 80, 1), // full, fast, exact
      run("plodder", 10, SESSION_MS * 0.1, 80, 1), // full and exact but slow
    ]);
    expect(board.map((x) => x.username)).toEqual(["ace", "sloppy", "plodder", "nearly"]);
  });

  it("never ranks an incomplete run above a complete one, however fast", () => {
    const board = sortEntries([
      run("speedrunner", 9, SESSION_MS, 200, 1),
      run("finisher", 10, 0, 10, 0),
    ]);
    expect(board[0].username).toBe("finisher");
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

describe("beats", () => {
  it("a higher score wins", () => {
    expect(beats(100, 5000, e("x", 200, 9000))).toBe(true);
    expect(beats(200, 5000, e("x", 100, 1000))).toBe(false);
  });
  it("on a tied score the faster run wins", () => {
    expect(beats(200, 9000, e("x", 200, 4000))).toBe(true);
    expect(beats(200, 4000, e("x", 200, 9000))).toBe(false);
  });
  it("an identical run does not beat itself (ties keep the earlier rank)", () => {
    expect(beats(200, 5000, e("x", 200, 5000))).toBe(false);
  });
});

describe("LocalAdapter.rankFor", () => {
  it("agrees with the position the sorted board would give", async () => {
    const a = new LocalAdapter();
    const rows: Array<[string, number, number]> = [
      ["slow", 200, 9000],
      ["fast", 200, 4000],
      ["low", 100, 1000],
      ["high", 900, 8000],
    ];
    for (const [u, s, t] of rows) await a.submit(e(u, s, t));

    const board = await a.top(100);
    for (const [u, s, t] of rows) {
      const expected = board.findIndex((x) => x.username === u) + 1;
      expect(await a.rankFor(s, t)).toBe(expected);
    }
  });
  it("ranks a new best run first and a new worst run last", async () => {
    const a = new LocalAdapter();
    await a.submit(e("mid", 500, 5000));
    await a.submit(e("other", 300, 5000));
    expect(await a.rankFor(9999, 1000)).toBe(1);
    expect(await a.rankFor(1, 60000)).toBe(3);
  });
  it("ignores runs from a previous hour", async () => {
    const a = new LocalAdapter();
    await a.submit(e("lastHour", 9999, 1000, currentHourBucket() - 1));
    expect(await a.rankFor(100, 5000)).toBe(1);
  });
});
