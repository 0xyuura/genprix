import { useState } from "react";
import type { GameState } from "../game/useGame";
import { downloadShareCard } from "./ShareCard";
import Avatar from "./Avatar";
import { Camera, Chequer } from "./Glyph";

interface Props {
  state: GameState;
  onPlayAgain: () => void;
  onShowLeaderboard: () => void;
}

export default function ResultsScreen({ state, onPlayAgain, onShowLeaderboard }: Props) {
  const [sharing, setSharing] = useState(false);
  const perfect = state.solvedCount === 10;

  const share = async () => {
    setSharing(true);
    try {
      await downloadShareCard({
        username: state.username,
        score: state.score,
        correct: state.solvedCount,
        totalMs: state.totalMs,
        rank: state.rank,
        wpm: state.wpm,
        accuracy: state.accuracy,
      });
    } finally {
      setSharing(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      {/* The chequered banner across the top: the one place the flag belongs. */}
      <div className="h-3 chequer-band" aria-hidden />

      <div className="panel border-t-0">
        <div className="flex items-center gap-3 px-4 py-4 border-b border-line">
          <Avatar seed={state.avatarSeed} name={state.username} size={52} />
          <div className="min-w-0">
            <h1 className="font-display font-bold uppercase tracking-[0.1em] text-2xl text-ceramic leading-none">
              {perfect ? "Clean sweep" : "Chequered flag"}
            </h1>
            <p className="text-sm text-white/55 mt-1 truncate">
              {perfect
                ? "All ten checkpoints, no misses. A true GenLayer maxi."
                : `Your kart stopped at checkpoint ${state.solvedCount} of 10.`}
            </p>
          </div>
        </div>

        <div className="px-4 py-5 text-center border-b border-line">
          <div className="stencil">Final score</div>
          <div className="num font-bold text-5xl sm:text-6xl text-magenta leading-none mt-1">
            {state.score.toLocaleString()}
          </div>
        </div>

        {/* Classification sheet: label above, figure below, ruled like a results
            board rather than floated in rounded tiles. */}
        <dl className="grid grid-cols-3 divide-x divide-line border-b border-line">
          <Stat label="Checkpoints" value={`${state.solvedCount}/10`} />
          <Stat label="Elapsed" value={`${(state.totalMs / 1000).toFixed(1)}s`} />
          <Stat label="Position" value={state.rank ? `P${state.rank}` : "—"} />
        </dl>
        <dl className="grid grid-cols-3 divide-x divide-line">
          <Stat label="Speed" value={`${Math.round(state.wpm)} wpm`} />
          <Stat label="Accuracy" value={`${Math.round(state.accuracy * 100)}%`} />
          <Stat label="Hints unused" value={`${state.hintsLeft}`} />
        </dl>
      </div>

      {state.notice && (
        <p className="mt-3 panel caution-stripe border-flag/40 px-3 py-2 text-sm text-flag">
          {state.notice}
        </p>
      )}

      <p className="mt-3 text-white/45 text-sm">
        That was your run on this code. The room may still be open for the others, so ask the host
        for a new code when you want another go.
      </p>

      <div className="mt-5 flex flex-wrap gap-3">
        <button className="btn-arcade whitespace-nowrap" onClick={onPlayAgain}>
          Enter a new code
        </button>
        <button
          className="btn-ghost flex items-center gap-2 whitespace-nowrap"
          onClick={share}
          disabled={sharing}
        >
          <Camera size={14} />
          {sharing ? "Rendering…" : "Share card"}
        </button>
        <button
          className="btn-ghost flex items-center gap-2 whitespace-nowrap"
          onClick={onShowLeaderboard}
        >
          <Chequer size={14} />
          Timing tower
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-3 py-3 text-center">
      <dt className="stencil !text-[10px]">{label}</dt>
      <dd className="num font-bold text-xl text-teal mt-1">{value}</dd>
    </div>
  );
}
