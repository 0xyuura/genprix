import { memo } from "react";
import type { BoardQuestion } from "../game/useGame";
import { progressOf } from "../game/typing";

interface Props {
  board: BoardQuestion[];
  onSelect: (i: number) => void;
}

// The pick-any-order grid. Players choose which question to tackle; solved ones
// are locked with a check, the rest are open to attempt in any order.
// Memoised: the session clock re-renders App every second, and rebuilding ten
// cards for a timer the board does not display is pure waste on low-end phones.
function QuestionBoard({ board, onSelect }: Props) {
  return (
    <div className="panel p-4 sm:p-5">
      <p className="font-display font-bold text-lg text-ceramic mb-1">Pick a question</p>
      <p className="text-xs text-white/50 mb-4">
        Take them in any order. Retype the question to move your mochi, then answer it to bank the
        checkpoint. Half-typed questions keep their progress — beat the clock.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {board.map((q, i) => (
          <button
            key={q.id}
            onClick={() => onSelect(i)}
            disabled={q.solved}
            className={`text-left rounded-2xl p-4 border transition-transform active:scale-[0.98] ${
              q.solved
                ? "bg-good/10 border-good/40 cursor-default"
                : "bg-white/5 border-white/10 hover:border-teal/60 hover:bg-white/10"
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="font-display font-bold text-sm text-white/50">Q{i + 1}</span>
              {q.solved ? (
                <span className="text-good font-bold text-sm">✅ Solved</span>
              ) : q.attempts > 0 ? (
                <span className="text-bad text-xs">✗ {q.attempts} tr{q.attempts === 1 ? "y" : "ies"}</span>
              ) : q.stage === "answer" ? (
                <span className="text-amber text-xs">⌨ typed — answer it →</span>
              ) : q.typing.typed.length > 0 ? (
                <span className="text-amber text-xs">⌨ {Math.round(progressOf(q.typing) * 100)}% typed</span>
              ) : (
                <span className="text-teal text-xs">Play →</span>
              )}
            </div>
            <p
              className={`text-sm leading-snug ${
                q.solved ? "text-white/40 line-through" : "text-ceramic"
              }`}
            >
              {q.prompt}
            </p>
            {!q.solved && q.typing.typed.length > 0 && (
              <div className="mt-2 h-1 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full bg-teal/70"
                  style={{ width: `${progressOf(q.typing) * 100}%` }}
                />
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

export default memo(QuestionBoard);
