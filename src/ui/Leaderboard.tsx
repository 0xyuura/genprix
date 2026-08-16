import { useEffect, useState } from "react";
import { selectAdapter, msUntilNextHour, type Entry } from "../data/leaderboard";
import { isSecureMode } from "../data/supabase";
import Avatar from "./Avatar";

interface Props {
  onBack: () => void;
  highlightUser?: string;
}

function fmt(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

export default function Leaderboard({ onBack, highlightUser }: Props) {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resetIn, setResetIn] = useState(msUntilNextHour());

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const top = await selectAdapter().top(25);
        if (alive) setEntries(top);
      } catch {
        if (alive) setError("Couldn't load the leaderboard.");
      }
    })();
    const t = setInterval(() => setResetIn(msUntilNextHour()), 1000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-display font-bold text-3xl text-ceramic">Leaderboard</h2>
        <button className="text-teal hover:underline" onClick={onBack}>
          ← Back
        </button>
      </div>

      <div className="flex items-center justify-between mb-2 text-xs">
        <span className="text-white/40">
          {isSecureMode() ? "Global · server-verified" : "Local demo · this device only"}
        </span>
        <span className="font-display text-amber">♻ resets in {fmt(resetIn)}</span>
      </div>
      <p className="text-xs text-white/40 mb-4">
        Ranked by questions solved first, then by how much of the 10 minutes you had left, then by
        how exactly you typed. Finish the whole game fast with no typos and you take first.
      </p>

      {error && <p className="text-bad">{error}</p>}
      {!entries && !error && <p className="text-white/50">Loading…</p>}
      {entries && entries.length === 0 && (
        <p className="text-white/50">No racers this hour yet. Be the first.</p>
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
              <span
                className={`text-sm hidden sm:inline ${
                  e.correct === 10 ? "text-good" : "text-white/50"
                }`}
              >
                {e.correct}/10
              </span>
              <span className="text-white/50 text-sm hidden sm:inline tabular-nums">
                {(e.totalMs / 1000).toFixed(1)}s
              </span>
              {e.accuracy != null && (
                <span className="text-white/50 text-sm hidden md:inline font-mono tabular-nums">
                  {Math.round(e.accuracy * 100)}%
                </span>
              )}
              {e.wpm != null && (
                <span className="text-white/50 text-sm hidden lg:inline font-mono tabular-nums">
                  {e.wpm} wpm
                </span>
              )}
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
