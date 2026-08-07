// Leaderboard adapters. In SECURE mode scores are written ONLY by the finish_run RPC;
// SupabaseAdapter is therefore read-only (no submit). In LOCAL/demo mode LocalAdapter
// stores per-device scores in localStorage.
import { supabase, isSecureMode } from "./supabase";

export interface Entry {
  username: string;
  avatarSeed: string;
  score: number;
  correct: number;
  totalMs: number;
  round: number;
  createdAt: number;
}

export interface LeaderboardAdapter {
  currentRound(): Promise<number>;
  top(round: number, n: number): Promise<Entry[]>;
  /** Local-only: secure mode writes via finish_run and ignores this. */
  submit(entry: Entry): Promise<void>;
}

export function sortEntries(entries: Entry[]): Entry[] {
  return [...entries].sort((a, b) => (b.score - a.score) || (a.totalMs - b.totalMs));
}

const LS_KEY = "ggp_scores_v1";

export class LocalAdapter implements LeaderboardAdapter {
  async currentRound(): Promise<number> {
    return 1;
  }
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
    localStorage.setItem(LS_KEY, JSON.stringify(all));
  }
  async top(round: number, n: number): Promise<Entry[]> {
    return sortEntries(this.read().filter((e) => e.round === round)).slice(0, n);
  }
}

export class SupabaseAdapter implements LeaderboardAdapter {
  async currentRound(): Promise<number> {
    const { data, error } = await supabase!.from("config").select("active_round").eq("id", 1).single();
    if (error) throw new Error(error.message);
    return (data as { active_round: number }).active_round;
  }
  async top(round: number, n: number): Promise<Entry[]> {
    const { data, error } = await supabase!
      .from("scores_public")
      .select("username, avatar_seed, score, correct, total_ms, round, created_at")
      .eq("round", round)
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
      round: r.round as number,
      createdAt: new Date(r.created_at as string).getTime(),
    }));
  }
  async submit(): Promise<void> {
    // no-op: secure-mode scores are written server-side by finish_run.
  }
}

export function selectAdapter(): LeaderboardAdapter {
  return isSecureMode() ? new SupabaseAdapter() : new LocalAdapter();
}
