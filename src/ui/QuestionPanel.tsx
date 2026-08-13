import { useEffect, useRef, useState } from "react";
import type { BoardQuestion, LastResult } from "../game/useGame";

interface Props {
  bq: BoardQuestion;
  index: number; // 0-based, for the label + input reset
  hintsLeft: number;
  lastResult: LastResult | null;
  onUseHint: (i: number) => boolean;
  onSubmit: (answer: string) => void;
  onBack: () => void;
}

export default function QuestionPanel({
  bq,
  index,
  hintsLeft,
  lastResult,
  onUseHint,
  onSubmit,
  onBack,
}: Props) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setValue("");
    inputRef.current?.focus();
  }, [index]);

  // Clear the field after a wrong attempt so they can retry cleanly.
  useEffect(() => {
    if (lastResult && !lastResult.correct) {
      setValue("");
      inputRef.current?.focus();
    }
  }, [lastResult]);

  const submit = () => {
    if (bq.solved || !value.trim()) return;
    onSubmit(value);
  };

  const solved = bq.solved;

  return (
    <div className="panel p-5 sm:p-6">
      <div className="flex items-center justify-between mb-3">
        <span className="font-display font-bold text-sm text-white/50">Question {index + 1}</span>
        <button className="text-sm text-teal hover:underline" onClick={onBack}>
          ← All questions
        </button>
      </div>

      <p className="font-display text-xl sm:text-2xl font-semibold text-ceramic leading-snug">
        {bq.prompt}
      </p>

      {!solved && (
        <div className="mt-3">
          {bq.hintMask ? (
            <p className="text-sm text-teal/90 font-mono tracking-wider">
              💡 <span className="text-white/50">answer:</span> {bq.hintMask}
            </p>
          ) : hintsLeft > 0 ? (
            <button
              className="text-sm text-teal/80 hover:text-teal underline underline-offset-2"
              onClick={() => onUseHint(index)}
            >
              Show hint — reveal first &amp; last letter ({hintsLeft} left)
            </button>
          ) : (
            <span className="text-sm text-white/30">No hints left this session</span>
          )}
        </div>
      )}

      {solved ? (
        <div className="mt-4 rounded-2xl p-4 bg-good/15 border border-good/40 animate-pop">
          <p className="font-display font-bold text-lg text-good">✅ Correct! +100 pts</p>
          {lastResult?.explanation && (
            <p className="mt-1 text-sm text-white/70">{lastResult.explanation}</p>
          )}
        </div>
      ) : (
        <>
          <div className="mt-4 flex gap-3">
            <input
              ref={inputRef}
              className="input-arcade"
              placeholder="Type your answer…"
              value={value}
              maxLength={100}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
            />
            <button className="btn-arcade" onClick={submit} disabled={!value.trim()}>
              Go
            </button>
          </div>
          {lastResult && !lastResult.correct && (
            <p className="mt-3 text-bad font-display font-bold animate-pop">
              😡 Not quite — mochi's mad. Try again!
            </p>
          )}
        </>
      )}
    </div>
  );
}
