import { formatClock } from "../game/scoring";

interface Props {
  remainingMs: number;
  score: number;
  solvedCount: number;
  total: number;
  hintsLeft: number;
}

export default function Hud({ remainingMs, score, solvedCount, total, hintsLeft }: Props) {
  const danger = remainingMs <= 60_000;
  return (
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <div className="flex items-center gap-2">
        <span
          className={`font-display font-bold text-2xl tabular-nums ${
            danger ? "text-bad animate-pulse" : "text-ceramic"
          }`}
        >
          ⏱ {formatClock(remainingMs)}
        </span>
        <span className="text-xs text-white/40">left</span>
      </div>

      <div className="flex-1 min-w-[140px] max-w-xs">
        <div className="flex justify-between text-xs text-white/50 mb-1">
          <span>
            Solved {solvedCount}/{total}
          </span>
          <span>💡 {hintsLeft} hints</span>
        </div>
        <div className="h-2 rounded-full bg-white/10 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-teal to-good transition-all duration-500"
            style={{ width: `${(solvedCount / total) * 100}%` }}
          />
        </div>
      </div>

      <span className="font-display font-bold text-xl text-teal tabular-nums">
        {score.toLocaleString()} <span className="text-white/40 text-sm">pts</span>
      </span>
    </div>
  );
}
