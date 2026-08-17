import { useEffect, useState } from "react";
import { selectAdapter, msUntilNextHour, type Entry } from "../data/leaderboard";
import { isSecureMode } from "../data/supabase";
import Avatar from "./Avatar";
import { Chequer } from "./Glyph";

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
        if (alive) setError("Couldn't load the scores.");
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
      <div className="flex items-center justify-between mb-4">
        <h1 className="font-display font-bold uppercase tracking-[0.1em] text-2xl text-ceramic flex items-center gap-2.5">
          <Chequer size={18} className="text-ceramic" />
          Leaderboard
        </h1>
        <button className="stencil hover:text-teal transition-colors" onClick={onBack}>
          ← Back
        </button>
      </div>

      {/* A community quiz stands on everyone reading the same board, so when the
          board is not actually shared, say it outright instead of hiding it in a
          three-word label. The host is the one who can fix it, and this tells them
          exactly what to do. */}
      {!isSecureMode() && (
        <div className="panel caution-stripe border-flag/40 px-3 py-2.5 mb-3">
          <p className="stencil !text-flag">Scores are not shared yet</p>
          <p className="text-xs text-white/70 mt-1">
            This board is stored in your own browser, so every player currently sees only their
            own run. Connect a database and the same board opens for everybody, on every device.
          </p>
        </div>
      )}

      <div className="panel">
        <div className="flex items-center justify-between border-b border-line px-3 py-2">
          <span className={`stencil ${isSecureMode() ? "!text-good" : ""}`}>
            {isSecureMode() ? "Shared board · everyone sees this" : "This browser only"}
          </span>
          <span className="stencil !text-amber">Resets in {fmt(resetIn)}</span>
        </div>

        <p className="px-3 py-2.5 text-xs text-white/45 border-b border-line">
          Ranked by correct answers first, then the time you had left, then how cleanly you typed.
        </p>

        {/* Column headers, so the numbers in each row are readable as data. */}
        <div className="hidden sm:flex items-center gap-3 px-3 py-1.5 border-b border-line bg-pitlight">
          <span className="stencil !text-[9px] w-7 text-center">Rank</span>
          <span className="stencil !text-[9px] w-9" />
          <span className="stencil !text-[9px] flex-1">Player</span>
          <span className="stencil !text-[9px] w-10 text-right">Correct</span>
          <span className="stencil !text-[9px] w-14 text-right">Time</span>
          <span className="stencil !text-[9px] w-10 text-right hidden md:inline">Acc</span>
          <span className="stencil !text-[9px] w-14 text-right hidden lg:inline">Speed</span>
          <span className="stencil !text-[9px] w-16 text-right">Points</span>
        </div>

        {error && <p className="px-3 py-4 text-bad text-sm">{error}</p>}
        {!entries && !error && <p className="px-3 py-4 text-white/45 text-sm">Loading scores…</p>}
        {entries && entries.length === 0 && (
          <p className="px-3 py-4 text-white/45 text-sm">No scores this hour yet.</p>
        )}

        <ol>
          {entries?.map((e, i) => {
            const me = highlightUser && e.username === highlightUser;
            const lead = i === 0;
            return (
              <li
                key={`${e.username}-${i}`}
                className={`board-row ${me ? "bg-teal/[0.08]" : ""} ${
                  lead ? "bg-purple/[0.12]" : ""
                }`}
              >
                <span
                  className={`num font-bold w-7 text-center ${
                    lead ? "text-purple" : "text-white/40"
                  }`}
                >
                  {i + 1}
                </span>
                <Avatar seed={e.avatarSeed} name={e.username} size={30} />
                <span className="font-semibold text-ceramic truncate flex-1">
                  {e.username}
                  {me && <span className="stencil !text-[9px] !text-teal ml-2">you</span>}
                </span>
                <span
                  className={`num text-sm w-10 text-right ${
                    e.correct === 10 ? "text-good" : "text-white/45"
                  }`}
                >
                  {e.correct}/10
                </span>
                <span className="num text-sm text-white/60 w-14 text-right">
                  {(e.totalMs / 1000).toFixed(1)}s
                </span>
                <span className="num text-sm text-white/45 w-10 text-right hidden md:inline">
                  {e.accuracy != null ? `${Math.round(e.accuracy * 100)}%` : "—"}
                </span>
                <span className="num text-sm text-white/45 w-14 text-right hidden lg:inline">
                  {e.wpm != null ? `${e.wpm}wpm` : "—"}
                </span>
                <span
                  className={`num font-bold w-16 text-right ${lead ? "text-purple" : "text-teal"}`}
                >
                  {e.score.toLocaleString()}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
