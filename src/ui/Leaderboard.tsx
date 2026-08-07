import { useEffect, useState } from "react";
import { selectAdapter, type Entry } from "../data/leaderboard";
import { isSecureMode } from "../data/supabase";
import Avatar from "./Avatar";

interface Props {
  onBack: () => void;
  highlightUser?: string;
}

export default function Leaderboard({ onBack, highlightUser }: Props) {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [round, setRound] = useState<number>(1);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const adapter = selectAdapter();
        const r = await adapter.currentRound();
        const top = await adapter.top(r, 25);
        if (!alive) return;
        setRound(r);
        setEntries(top);
      } catch {
        if (alive) setError("Couldn't load the leaderboard.");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display font-bold text-3xl text-ceramic">
          🏆 Leaderboard <span className="text-white/40 text-lg">· Week {round}</span>
        </h2>
        <button className="text-teal hover:underline" onClick={onBack}>
          ← Back
        </button>
      </div>

      <p className="text-xs text-white/40 mb-3">
        {isSecureMode() ? "Global · server-verified scores" : "Local demo · this device only"}
      </p>

      {error && <p className="text-bad">{error}</p>}
      {!entries && !error && <p className="text-white/50">Loading…</p>}
      {entries && entries.length === 0 && (
        <p className="text-white/50">No racers yet — be the first!</p>
      )}

      <ol className="space-y-2">
        {entries?.map((e, i) => {
          const me = highlightUser && e.username === highlightUser;
          return (
            <li
              key={`${e.username}-${i}`}
              className={`panel flex items-center gap-3 p-3 ${me ? "ring-2 ring-teal" : ""}`}
            >
              <span
                className={`font-display font-bold w-8 text-center ${
                  i === 0 ? "text-amber text-xl" : "text-white/50"
                }`}
              >
                {i + 1}
              </span>
              <Avatar seed={e.avatarSeed} name={e.username} size={36} />
              <span className="font-semibold text-ceramic truncate flex-1">{e.username}</span>
              <span className="text-white/50 text-sm hidden sm:inline">{e.correct}/10</span>
              <span className="text-white/50 text-sm hidden sm:inline">
                {(e.totalMs / 1000).toFixed(1)}s
              </span>
              <span className="font-display font-bold text-teal tabular-nums">
                {e.score.toLocaleString()}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
