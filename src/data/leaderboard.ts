// Leaderboard adapters. The board is GLOBAL and clears itself on a fixed
// schedule: every score is tagged with a window (floor(epoch_ms / RESET_MS)) and
// the board only shows the current one, so it wipes on its own without a cron job
// or an admin remembering to press anything.
//
// A window is two hours. It used to be one, which was too short for a community
// session: hosts open a code, wait for people to turn up, run the quiz — and the
// board rolled over while the last players were still typing, splitting one event
// across two boards.
//
// Every player who JOINS gets a row, not only those who finish. Secure mode
// writes that row in join_room and updates it as answers land and again at
// finish; LocalAdapter (demo) keeps the same shape in localStorage, matching rows
// by runId so a joiner's placeholder is replaced rather than duplicated.
import { supabase, isSecureMode } from "./supabase";

/** How long one leaderboard window lasts. */
export const RESET_MS = 2 * 3_600_000;

export function currentBucket(): number {
  return Math.floor(Date.now() / RESET_MS);
}
export function msUntilNextReset(): number {
  return RESET_MS - (Date.now() % RESET_MS);
}

export interface Entry {
  username: string;
  avatarSeed: string;
  score: number;
  correct: number;
  totalMs: number;
  bucket: number;
  createdAt: number;
  /** Typing stats for the run. Optional: rows written before the typing race shipped lack them. */
  wpm?: number;
  accuracy?: number; // 0..1
  /**
   * False while the player is still racing. Undefined on rows written before
   * joining put you on the board, which were finished runs by definition.
   */
  finished?: boolean;
  /** Identifies the run so its row can be updated in place instead of duplicated. */
  runId?: string;
}

export interface LobbyLike {
  username: string;
  avatarSeed: string;
}

export interface LeaderboardAdapter {
  top(n: number): Promise<Entry[]>;
  /** Local-only: secure mode writes via the run RPCs and ignores this. */
  submit(entry: Entry): Promise<void>;
  /**
   * Placement of a finished run inside the current window. Kept off `top()` on
   * purpose: ranking used to pull the whole board down to the client, which is
   * fine for one player and 1000x wasteful when a whole community finishes in
   * the same window.
   */
  rankFor(score: number, totalMs: number): Promise<number>;
  /**
   * Empty the current window. Local-only, like `submit`: in secure mode the
   * board lives on the server and only the passcode can clear it, so that path
   * goes through `admin_clear_leaderboard` rather than through an adapter the
   * anonymous client holds. Returns how many rows went.
   */
  clear(): Promise<number>;
}

// Ranking rule: whoever completed the most of the game, fastest, with the
// cleanest typing sits on top. All three already live inside `score` — a correct
// answer outweighs every bonus combined, so more solved always ranks higher, and
// within the same solved count the score falls away with the clock and with
// typos. Time is kept as the tiebreak for two identical scores.

/** A run beats another if it scored higher, or matched the score and got there faster. */
export function beats(score: number, totalMs: number, e: Entry): boolean {
  // A run still in progress has no finishing time yet, so it cannot win a tie on
  // one: its total_ms is zero, and without this guard every racer sitting in the
  // room would outrank the player who actually crossed the line.
  return e.score > score || (e.score === score && e.finished !== false && e.totalMs < totalMs);
}

export function sortEntries(entries: Entry[]): Entry[] {
  return [...entries].sort(
    (a, b) =>
      b.score - a.score ||
      b.correct - a.correct ||
      Number(a.finished === false) - Number(b.finished === false) ||
      a.totalMs - b.totalMs,
  );
}

// v4: entries carry a run id and a finished flag, and the window is two hours,
// so the old key's rows would land in a bucket that no longer means anything.
const LS_KEY = "ggp_scores_v4";

export class LocalAdapter implements LeaderboardAdapter {
  private read(): Entry[] {
    try {
      return JSON.parse(localStorage.getItem(LS_KEY) || "[]") as Entry[];
    } catch {
      return [];
    }
  }
  async submit(entry: Entry): Promise<void> {
    const all = this.read();
    // One row per run. A player appears the moment they join and that same row
    // is rewritten when they finish, so nobody is listed twice.
    const at = entry.runId ? all.findIndex((e) => e.runId === entry.runId) : -1;
    if (at >= 0) all[at] = entry;
    else all.push(entry);
    // prune anything older than the current window so storage stays small
    const bucket = currentBucket();
    localStorage.setItem(LS_KEY, JSON.stringify(all.filter((e) => e.bucket >= bucket - 1)));
  }
  async top(n: number): Promise<Entry[]> {
    const bucket = currentBucket();
    return sortEntries(this.read().filter((e) => e.bucket === bucket)).slice(0, n);
  }
  async rankFor(score: number, totalMs: number): Promise<number> {
    const bucket = currentBucket();
    let ahead = 0;
    for (const e of this.read()) {
      if (e.bucket === bucket && beats(score, totalMs, e)) ahead++;
    }
    return ahead + 1;
  }
  async clear(): Promise<number> {
    const bucket = currentBucket();
    const all = this.read();
    const kept = all.filter((e) => e.bucket !== bucket);
    localStorage.setItem(LS_KEY, JSON.stringify(kept));
    return all.length - kept.length;
  }
}

export class SupabaseAdapter implements LeaderboardAdapter {
  async top(n: number): Promise<Entry[]> {
    const bucket = currentBucket();
    const { data, error } = await supabase!
      .from("leaderboard_public")
      .select(
        "run_id, username, avatar_seed, score, correct, total_ms, finished, hour_bucket, created_at",
      )
      .eq("hour_bucket", bucket)
      .order("score", { ascending: false })
      .order("correct", { ascending: false })
      .order("finished", { ascending: false })
      .order("total_ms", { ascending: true })
      .limit(n);
    if (error) throw new Error(error.message);
    return (data as Array<Record<string, unknown>>).map((r) => ({
      runId: r.run_id as string,
      username: r.username as string,
      avatarSeed: r.avatar_seed as string,
      score: r.score as number,
      correct: r.correct as number,
      totalMs: r.total_ms as number,
      finished: r.finished as boolean,
      bucket: r.hour_bucket as number,
      createdAt: new Date(r.created_at as string).getTime(),
    }));
  }
  async submit(): Promise<void> {
    // no-op: secure-mode rows are written server-side by join_room / finish_run.
  }
  async clear(): Promise<number> {
    // Same reason: the anonymous client cannot delete community rows. The host
    // clears through admin_clear_leaderboard, which wants the passcode.
    throw new Error("The shared board is cleared from the host panel.");
  }
  async rankFor(score: number, totalMs: number): Promise<number> {
    // head+count: Postgres answers with a number, not the board. One finisher
    // costs one counted index scan instead of a full-window download.
    const bucket = currentBucket();
    const { count, error } = await supabase!
      .from("leaderboard_public")
      .select("score", { count: "exact", head: true })
      .eq("hour_bucket", bucket)
      .or(`score.gt.${score},and(score.eq.${score},finished.is.true,total_ms.lt.${totalMs})`);
    if (error) throw new Error(error.message);
    return (count ?? 0) + 1;
  }
}

export function selectAdapter(): LeaderboardAdapter {
  return isSecureMode() ? new SupabaseAdapter() : new LocalAdapter();
}
