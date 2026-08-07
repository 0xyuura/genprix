interface Props {
  index: number; // 0-based
  total: number;
  score: number;
  streak: number;
  correctCount: number;
}

export default function Hud({ index, total, score, streak, correctCount }: Props) {
  return (
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <div className="flex items-center gap-3">
        <span className="font-display font-bold text-lg text-ceramic">
          Q{Math.min(index + 1, total)}
          <span className="text-white/40">/{total}</span>
        </span>
        {streak >= 2 && (
          <span className="font-display text-sm font-bold text-amber animate-pop">
            🔥 {streak}x streak
          </span>
        )}
      </div>

      <div className="flex-1 min-w-[140px] max-w-xs">
        <div className="h-2 rounded-full bg-white/10 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-teal to-good transition-all duration-500"
            style={{ width: `${(correctCount / total) * 100}%` }}
          />
        </div>
      </div>

      <span className="font-display font-bold text-xl text-teal tabular-nums">
        {score.toLocaleString()} <span className="text-white/40 text-sm">pts</span>
      </span>
    </div>
  );
}
