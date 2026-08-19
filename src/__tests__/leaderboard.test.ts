import { describe, it, expect, beforeEach } from "vitest";
import {
  sortEntries,
  beats,
  LocalAdapter,
  currentBucket,
  msUntilNextReset,
  RESET_MS,
  type Entry,
} from "../data/leaderboard";
import { runScore, SESSION_MS } from "../game/scoring";

const e = (u: string, score: number, totalMs: number, bucket = currentBucket()): Entry => ({
  username: u,
  avatarSeed: u,
  score,
  correct: 5,
  totalMs,
  bucket,
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
    bucket: currentBucket(),
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

describe("window helpers", () => {
  it("currentBucket is a stable integer for the current window", () => {
    expect(currentBucket()).toBe(Math.floor(Date.now() / RESET_MS));
  });
  it("msUntilNextReset is within (0, RESET_MS]", () => {
    const ms = msUntilNextReset();
    expect(ms).toBeGreaterThan(0);
    expect(ms).toBeLessThanOrEqual(RESET_MS);
  });
});

describe("LocalAdapter", () => {
  it("submits and returns top entries for the current window, sorted", async () => {
    const a = new LocalAdapter();
    await a.submit(e("slow", 200, 9000));
    await a.submit(e("fast", 200, 4000));
    await a.submit(e("low", 100, 1000));
    const top = await a.top(10);
    expect(top.map((x) => x.username)).toEqual(["fast", "slow", "low"]);
  });
  it("hides entries from a previous window (auto-reset)", async () => {
    const a = new LocalAdapter();
    await a.submit(e("thisHour", 500, 1000));
    await a.submit(e("lastHour", 999, 1000, currentBucket() - 1));
    const top = await a.top(10);
    expect(top.map((x) => x.username)).toEqual(["thisHour"]);
  });
  it("respects the limit", async () => {
    const a = new LocalAdapter();
    for (let i = 0; i < 5; i++) await a.submit(e("u" + i, i * 10, 1000));
    expect(await a.top(3)).toHaveLength(3);
  });

  // The host's reset button, for running two rounds back to back rather than
  // waiting out the two-hour window.
  it("clear() empties the current window and says how many rows went", async () => {
    const a = new LocalAdapter();
    await a.submit(e("one", 300, 1000));
    await a.submit(e("two", 200, 1000));
    expect(await a.clear()).toBe(2);
    expect(await a.top(10)).toEqual([]);
  });
  it("clear() leaves other windows alone", async () => {
    const a = new LocalAdapter();
    await a.submit(e("now", 300, 1000));
    await a.submit(e("earlier", 999, 1000, currentBucket() - 1));
    expect(await a.clear()).toBe(1);
    expect(await a.top(10)).toEqual([]);
    // The earlier row is not on the board either way, but clearing what is on
    // screen must not quietly delete history that was never shown.
    await a.submit(e("after", 100, 1000));
    expect((await a.top(10)).map((x) => x.username)).toEqual(["after"]);
  });
  it("clearing an empty board reports zero rather than failing", async () => {
    const a = new LocalAdapter();
    expect(await a.clear()).toBe(0);
  });
});

// Joining is what puts you on the board, so the board carries people who are
// still racing. They must be visible without being treated as results.
describe("racers who have joined but not finished", () => {
  it("keeps a player still on track behind a finisher on the same score", () => {
    const racing = { ...e("racing", 200, 0), finished: false };
    const done = { ...e("done", 200, 9000), finished: true };
    expect(sortEntries([racing, done]).map((x) => x.username)).toEqual(["done", "racing"]);
  });

  it("does not let a zero finishing time steal a rank", () => {
    expect(beats(200, 5000, { ...e("racing", 200, 0), finished: false })).toBe(false);
    expect(beats(200, 5000, { ...e("faster", 200, 1000), finished: true })).toBe(true);
  });

  it("replaces a joiner's row when they finish instead of listing them twice", async () => {
    const a = new LocalAdapter();
    const runId = "run-1";
    await a.submit({ ...e("yuura", 0, 0), runId, correct: 0, finished: false });
    await a.submit({ ...e("yuura", 7400, 240000), runId, correct: 7, finished: true });
    const board = await a.top(10);
    expect(board).toHaveLength(1);
    expect(board[0].score).toBe(7400);
    expect(board[0].finished).toBe(true);
  });

  it("shows everyone who joined, whether or not they have a result", async () => {
    const a = new LocalAdapter();
    await a.submit({ ...e("waiting", 0, 0), runId: "r1", correct: 0, finished: false });
    await a.submit({ ...e("halfway", 3000, 0), runId: "r2", correct: 3, finished: false });
    await a.submit({ ...e("finisher", 9000, 120000), runId: "r3", correct: 9, finished: true });
    const board = await a.top(10);
    expect(board.map((x) => x.username)).toEqual(["finisher", "halfway", "waiting"]);
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
  it("ignores runs from a previous window", async () => {
    const a = new LocalAdapter();
    await a.submit(e("lastHour", 9999, 1000, currentBucket() - 1));
    expect(await a.rankFor(100, 5000)).toBe(1);
  });
});
