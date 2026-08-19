import { memo } from "react";
import type { BoardQuestion } from "../game/useGame";
import { progressOf } from "../game/typing";
import { Check, Cross } from "./Glyph";

interface Props {
  board: BoardQuestion[];
  onSelect: (i: number) => void;
}

/** The one-line state of a slot, in the words a pit board would use. */
function state(q: BoardQuestion): { label: string; tone: string; mark?: "check" | "cross" } {
  if (q.solved) return { label: "Claimed", tone: "text-good", mark: "check" };
  if (q.attempts > 0)
    return {
      label: `${q.attempts} wrong ${q.attempts === 1 ? "answer" : "answers"}`,
      tone: "text-bad",
      mark: "cross",
    };
  if (q.stage === "answer") return { label: "Typed · answer it", tone: "text-amber" };
  if (q.typing.typed.length > 0)
    return { label: `${Math.round(progressOf(q.typing) * 100)}% typed`, tone: "text-amber" };
  return { label: "Open", tone: "text-teal" };
}

// The pick-any-order grid. Players choose which question to tackle; solved ones
// are locked with a check, the rest are open to attempt in any order.
// Memoised: the session clock re-renders App every second, and rebuilding ten
// cards for a timer the board does not display is pure waste on low-end phones.
function QuestionBoard({ board, onSelect }: Props) {
  const left = board.filter((q) => !q.solved).length;

  return (
    <section className="panel">
      <div className="flex items-baseline justify-between border-b border-line px-4 py-3">
        <h2 className="font-display font-bold uppercase tracking-[0.12em] text-ceramic">
          Questions
        </h2>
        <span className="stencil">
          {left} {left === 1 ? "checkpoint" : "checkpoints"} to go
        </span>
      </div>

      <p className="px-4 pt-3 text-xs text-ceramic/45">
        Any order you like. A half-typed question keeps its progress, so you can leave one and come
        back to it.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-line/60 m-4 mt-3 border border-line">
        {board.map((q, i) => {
          const s = state(q);
          return (
            <button
              key={q.id}
              onClick={() => onSelect(i)}
              disabled={q.solved}
              className={`group relative text-left p-3 pl-11 transition-colors ${
                q.solved
                  ? "bg-good/[0.07] cursor-default"
                  : "bg-pit hover:bg-pitlight focus-visible:bg-pitlight"
              }`}
            >
              {/* Grid slot number, set in the margin like a starting box. */}
              <span
                className={`num absolute left-0 top-0 bottom-0 w-8 grid place-items-center text-sm
                  border-r ${
                    q.solved
                      ? "border-good/30 text-good/70 bg-good/[0.06]"
                      : "border-line text-ceramic/35 group-hover:text-teal"
                  }`}
              >
                {String(i + 1).padStart(2, "0")}
              </span>

              <div className={`flex items-center gap-1.5 stencil !text-[10px] ${s.tone}`}>
                {s.mark === "check" && <Check size={11} />}
                {s.mark === "cross" && <Cross size={10} />}
                {s.label}
              </div>
              <p
                className={`mt-1 text-sm leading-snug ${
                  q.solved ? "text-ceramic/35" : "text-ceramic"
                }`}
              >
                {q.prompt}
              </p>

              {!q.solved && q.typing.typed.length > 0 && (
                <div className="mt-2 h-[3px] bg-ceramic/10" aria-hidden>
                  <div className="h-full bg-teal" style={{ width: `${progressOf(q.typing) * 100}%` }} />
                </div>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}

export default memo(QuestionBoard);
