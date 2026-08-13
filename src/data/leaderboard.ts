// Leaderboard adapters. The board is GLOBAL and auto-resets every clock hour:
// each score is tagged with an hour bucket (floor(epoch_ms / 3_600_000)) and the
// board only shows the current bucket, so it wipes on its own at the top of each hour.
// Secure mode writes scores only via the finish_run RPC; LocalAdapter (demo) uses
// localStorage.
import { supabase, isSecureMode } from "./supabase";

export const HOUR_MS = 3_600_000;
export function currentHourBucket(): number {
  return Math.floor(Date.now() / HOUR_MS);
}
export function msUntilNextHour(): number {
  return HOUR_MS - (Date.now() % HOUR_MS);
}

export interface Entry {
  username: string;
  avatarSeed: string;
  score: number;
  correct: number;
  totalMs: number;
  hourBucket: number;
  createdAt: number;
}

export interface LeaderboardAdapter {
  top(n: number): Promise<Entry[]>;
  /** Local-only: secure mode writes via finish_run and ignores this. */
  submit(entry: Entry): Promise<void>;
  /**
   * Placement of a finished run inside the current hour. Kept off `top()` on
   * purpose: ranking used to pull the whole board down to the client, which is
   * fine for one player and 1000x wasteful when a whole community finishes in
   * the same hour.
   */
  rankFor(score: number, totalMs: number): Promise<number>;
}

/** A run beats another if it scored higher, or matched the score and got there faster. */
export function beats(score: number, totalMs: number, e: Entry): boolean {
  return e.score > score || (e.score === score && e.totalMs < totalMs);
}

export function sortEntries(entries: Entry[]): Entry[] {
  return [...entries].sort((a, b) => b.score - a.score || a.totalMs - b.totalMs);
}

const LS_KEY = "ggp_scores_v2";

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
    all.push(entry);
    // prune anything older than the current hour so storage stays small
    const bucket = currentHourBucket();
    const kept = all.filter((e) => e.hourBucket >= bucket - 1);
    localStorage.setItem(LS_KEY, JSON.stringify(kept));
  }
  async top(n: number): Promise<Entry[]> {
    const bucket = currentHourBucket();
    return sortEntries(this.read().filter((e) => e.hourBucket === bucket)).slice(0, n);
  }
  async rankFor(score: number, totalMs: number): Promise<number> {
    const bucket = currentHourBucket();
    let ahead = 0;
    for (const e of this.read()) {
      if (e.hourBucket === bucket && beats(score, totalMs, e)) ahead++;
    }
    return ahead + 1;
  }
}

export class SupabaseAdapter implements LeaderboardAdapter {
  async top(n: number): Promise<Entry[]> {
    const bucket = currentHourBucket();
    const { data, error } = await supabase!
      .from("scores_public")
      .select("username, avatar_seed, score, correct, total_ms, hour_bucket, created_at")
      .eq("hour_bucket", bucket)
      .order("score", { ascending: false })
      .order("total_ms", { ascending: true })
      .limit(n);
    if (error) throw new Error(error.message);
    return (data as Array<Record<string, unknown>>).map((r) => ({
      username: r.username as string,
      avatarSeed: r.avatar_seed as string,
      score: r.score as number,
      correct: r.correct as number,
      totalMs: r.total_ms as number,
      hourBucket: r.hour_bucket as number,
      createdAt: new Date(r.created_at as string).getTime(),
    }));
  }
  async submit(): Promise<void> {
    // no-op: secure-mode scores are written server-side by finish_run.
  }
  async rankFor(score: number, totalMs: number): Promise<number> {
    // head+count: Postgres answers with a number, not the board. One finisher
    // costs one counted index scan instead of a full-bucket download.
    const bucket = currentHourBucket();
    const { count, error } = await supabase!
      .from("scores_public")
      .select("score", { count: "exact", head: true })
      .eq("hour_bucket", bucket)
      .or(`score.gt.${score},and(score.eq.${score},total_ms.lt.${totalMs})`);
    if (error) throw new Error(error.message);
    return (count ?? 0) + 1;
  }
}

export function selectAdapter(): LeaderboardAdapter {
  return isSecureMode() ? new SupabaseAdapter() : new LocalAdapter();
}
