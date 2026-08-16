import { memo, useEffect, useRef, useState } from "react";
import type { BoardQuestion, LastResult } from "../game/useGame";
import TypingPassage from "./TypingPassage";
import { accuracy, elapsedOf, hasError, progressOf, wpm, correctPrefixLen } from "../game/typing";

interface Props {
  bq: BoardQuestion;
  index: number; // 0-based, for the label + input reset
  hintsLeft: number;
  lastResult: LastResult | null;
  onType: (next: string) => void;
  onUseHint: (i: number) => boolean;
  onSubmit: (answer: string) => void;
  onBack: () => void;
}

function QuestionPanel({
  bq,
  index,
  hintsLeft,
  lastResult,
  onType,
  onUseHint,
  onSubmit,
  onBack,
}: Props) {
  const [value, setValue] = useState("");
  const answerRef = useRef<HTMLInputElement>(null);
  const typeRef = useRef<HTMLInputElement>(null);

  const typing = bq.typing;
  const stage = bq.stage;

  useEffect(() => {
    setValue("");
  }, [index]);

  // Focus follows the stage: the passage field first, the answer field once unlocked.
  useEffect(() => {
    if (bq.solved) return;
    if (stage === "prompt") typeRef.current?.focus();
    else answerRef.current?.focus();
  }, [stage, index, bq.solved]);

  // Clear the field after a wrong attempt so they can retry cleanly.
  useEffect(() => {
    if (lastResult && !lastResult.correct) {
      setValue("");
      answerRef.current?.focus();
    }
  }, [lastResult]);

  const submit = () => {
    if (bq.solved || !value.trim()) return;
    onSubmit(value);
  };

  const solved = bq.solved;
  const typedPct = Math.round(progressOf(typing) * 100);
  const liveWpm = Math.round(
    wpm(correctPrefixLen(typing.target, typing.typed), elapsedOf(typing, performance.now())),
  );
  const liveAcc = Math.round(accuracy(typing.keystrokes, typing.errors) * 100);
  const erroring = hasError(typing);

  return (
    <div className="panel p-5 sm:p-6">
      <div className="flex items-center justify-between mb-3">
        <span className="font-display font-bold text-sm text-white/50">Question {index + 1}</span>
        <button className="text-sm text-teal hover:underline" onClick={onBack}>
          ← All questions
        </button>
      </div>

      {/* Stage 1 — retype the question, typeracer style. */}
      <div className="rounded-2xl bg-black/30 p-4">
        <div className="flex items-center justify-between mb-2 text-xs">
          <span className="font-display font-bold text-white/50 uppercase tracking-wide">
            {stage === "prompt" ? "① Retype the question" : "① Question typed ✓"}
          </span>
          <span className="font-mono text-white/50 tabular-nums">
            {liveWpm} wpm · {liveAcc}%
          </span>
        </div>

        <TypingPassage target={typing.target} typed={typing.typed} />

        <div className="mt-3 h-1.5 rounded-full bg-white/10 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-teal to-good transition-all duration-150"
            style={{ width: `${typedPct}%` }}
          />
        </div>

        {stage === "prompt" && !solved && (
          <>
            <input
              ref={typeRef}
              className={`input-arcade mt-3 font-mono !text-base ${
                erroring ? "!border-bad !text-bad" : ""
              }`}
              placeholder="Type the question above…"
              value={typing.typed}
              onChange={(e) => onType(e.target.value)}
              onPaste={(e) => e.preventDefault()}
              onDrop={(e) => e.preventDefault()}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
            />
            {erroring && (
              <p className="mt-2 text-xs text-bad font-display">
                ⌫ Wrong character. Backspace to fix it; the kart won't move past a typo.
              </p>
            )}
          </>
        )}
      </div>

      {/* Stage 2 — answer it. Locked until the passage is typed out in full. */}
      <div className={`mt-4 ${stage === "prompt" ? "opacity-40 pointer-events-none" : ""}`}>
        <div className="font-display font-bold text-xs text-white/50 uppercase tracking-wide mb-2">
          {stage === "prompt"
            ? "② Answer (locked until the question is typed)"
            : "② Type the answer"}
        </div>

        {!solved && stage === "answer" && (
          <div className="mb-2">
            {bq.hintMask ? (
              <p className="text-sm text-teal/90 font-mono tracking-wider">
                💡 <span className="text-white/50">answer:</span> {bq.hintMask}
              </p>
            ) : hintsLeft > 0 ? (
              <button
                className="text-sm text-teal/80 hover:text-teal underline underline-offset-2"
                onClick={() => onUseHint(index)}
              >
                Show hint: first and last letter ({hintsLeft} left)
              </button>
            ) : (
              <span className="text-sm text-white/30">No hints left this session</span>
            )}
          </div>
        )}

        {solved ? (
          <div className="rounded-2xl p-4 bg-good/15 border border-good/40 animate-pop">
            <p className="font-display font-bold text-lg text-good">✅ Correct! +1,000 pts</p>
          </div>
        ) : (
          <>
            <div className="flex gap-3">
              <input
                ref={answerRef}
                className="input-arcade"
                placeholder="Type your answer…"
                value={value}
                maxLength={100}
                disabled={stage === "prompt"}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
              />
              <button
                className="btn-arcade"
                onClick={submit}
                disabled={stage === "prompt" || !value.trim()}
              >
                Go
              </button>
            </div>
            {lastResult && !lastResult.correct && (
              <p className="mt-3 text-bad font-display font-bold animate-pop">
                😡 Wrong answer. Mochi's mad. Try again!
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default memo(QuestionPanel);
