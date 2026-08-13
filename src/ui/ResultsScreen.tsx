import { useState } from "react";
import type { GameState } from "../game/useGame";
import { downloadShareCard } from "./ShareCard";
import Avatar from "./Avatar";

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
      });
    } finally {
      setSharing(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl px-4 py-8 text-center">
      <Avatar seed={state.avatarSeed} name={state.username} size={72} />
      <h2 className="mt-3 font-display font-bold text-3xl text-ceramic">
        {perfect ? "🏁 Perfect run!" : "Race complete!"}
      </h2>
      <p className="text-white/60">
        {perfect
          ? "You crossed the finish line — a true GenLayer maxi."
          : `Your mochi reached checkpoint ${state.solvedCount}/10.`}
      </p>

      <div className="mt-6 panel p-6">
        <div className="font-display font-bold text-6xl text-magenta tabular-nums">
          {state.score.toLocaleString()}
        </div>
        <div className="text-white/50">points</div>

        <div className="mt-5 grid grid-cols-3 gap-3 text-center">
          <Stat label="Correct" value={`${state.solvedCount}/10`} />
          <Stat label="Time" value={`${(state.totalMs / 1000).toFixed(1)}s`} />
          <Stat label="Rank" value={state.rank ? `#${state.rank}` : "—"} />
        </div>
      </div>

      {state.notice && <p className="mt-3 text-amber text-sm">{state.notice}</p>}

      <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
        <button className="btn-arcade" onClick={onPlayAgain}>
          Play again
        </button>
        <button
          className="btn-arcade !bg-magenta !text-white"
          onClick={share}
          disabled={sharing}
        >
          {sharing ? "Rendering…" : "Share card 📸"}
        </button>
        <button className="btn-arcade !bg-white/10 !text-ceramic" onClick={onShowLeaderboard}>
          Leaderboard 🏆
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-black/30 py-3">
      <div className="font-display font-bold text-2xl text-teal">{value}</div>
      <div className="text-xs text-white/50 uppercase tracking-wide">{label}</div>
    </div>
  );
}
