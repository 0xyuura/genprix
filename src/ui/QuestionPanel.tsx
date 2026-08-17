import { memo, useEffect, useRef, useState } from "react";
import type { BoardQuestion, LastResult } from "../game/useGame";
import TypingPassage from "./TypingPassage";
import { Backspace, Board, Check } from "./Glyph";
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
    <section className="panel-kerb">
      <div className="flex items-center justify-between border-b border-line px-4 pt-4 pb-3">
        <h2 className="font-display font-bold uppercase tracking-[0.12em] text-ceramic">
          <span className="num text-white/35 mr-2">{String(index + 1).padStart(2, "0")}</span>
          Question
        </h2>
        <button className="stencil hover:text-teal transition-colors" onClick={onBack}>
          ← All questions
        </button>
      </div>

      {/* Stage 1 — retype the question, typeracer style. */}
      <div className="px-4 pt-4">
        <div className="flex items-center justify-between mb-2">
          <span className={`stencil ${stage === "prompt" ? "!text-teal" : "!text-good"}`}>
            {stage === "prompt" ? "Stage 1 · retype the question" : "Stage 1 · cleared"}
          </span>
          <span className="num text-[11px] text-white/45">
            {liveWpm} wpm · {liveAcc}%
          </span>
        </div>

        <div
          className={`border p-3 bg-black/40 ${
            erroring ? "border-bad/60" : stage === "answer" ? "border-good/30" : "border-line"
          }`}
        >
          <TypingPassage target={typing.target} typed={typing.typed} />
        </div>

        <div className="mt-2 h-[3px] bg-white/10" aria-hidden>
          <div
            className="h-full bg-teal transition-[width] duration-100"
            style={{ width: `${typedPct}%` }}
          />
        </div>

        {stage === "prompt" && !solved && (
          <>
            <input
              ref={typeRef}
              className={`input-arcade mt-3 !font-num !text-base ${
                erroring ? "!border-bad !text-bad" : ""
              }`}
              placeholder="Retype the line above"
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
              <p className="mt-2 flex items-center gap-2 text-xs text-bad">
                <Backspace size={13} />
                Wrong character. Backspace it out; the kart won't pass a typo.
              </p>
            )}
          </>
        )}
      </div>

      {/* Stage 2 — answer it. Locked until the passage is typed out in full. */}
      <div className={`px-4 pt-4 pb-4 ${stage === "prompt" ? "opacity-35 pointer-events-none" : ""}`}>
        <div className="stencil mb-2">
          {stage === "prompt" ? "Stage 2 · locked" : "Stage 2 · answer it"}
        </div>

        {!solved && stage === "answer" && (
          <div className="mb-2">
            {bq.hintMask ? (
              <p className="num text-sm text-teal/90 tracking-[0.2em] flex items-center gap-2">
                <Board size={13} />
                {bq.hintMask}
              </p>
            ) : hintsLeft > 0 ? (
              <button
                className="text-sm text-teal/80 hover:text-teal flex items-center gap-2"
                onClick={() => onUseHint(index)}
              >
                <Board size={13} />
                Show the first and last letter ({hintsLeft} left)
              </button>
            ) : (
              <span className="text-sm text-white/30">Both hints spent</span>
            )}
          </div>
        )}

        {solved ? (
          <div className="border border-good/40 bg-good/10 px-4 py-3 animate-sweep">
            <p className="font-display font-bold uppercase tracking-[0.1em] text-good flex items-center gap-2">
              <Check size={15} />
              Correct
              <span className="num ml-auto">+1,000</span>
            </p>
          </div>
        ) : (
          <>
            <div className="flex gap-3">
              <input
                ref={answerRef}
                className="input-arcade"
                placeholder="Your answer"
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
                Send
              </button>
            </div>
            {lastResult && !lastResult.correct && (
              <p className="mt-3 font-display font-bold text-bad animate-shake">
                Not it. Mochi's furious. Go again.
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}

export default memo(QuestionPanel);
