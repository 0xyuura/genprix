import { useEffect, useRef, useState } from "react";
import type { PublicQuestion } from "../game/quiz";
import type { LastResult } from "../game/useGame";
import { TIME_LIMIT_MS } from "../game/scoring";

interface Props {
  question: PublicQuestion;
  index: number; // 0-based, used to reset per question
  reveal: boolean;
  lastResult: LastResult | null;
  submitting: boolean;
  onSubmit: (answer: string) => void;
}

export default function QuestionPanel({
  question,
  index,
  reveal,
  lastResult,
  submitting,
  onSubmit,
}: Props) {
  const [value, setValue] = useState("");
  const [showHint, setShowHint] = useState(false);
  const [timeLeft, setTimeLeft] = useState(TIME_LIMIT_MS);
  const inputRef = useRef<HTMLInputElement>(null);
  const deadlineRef = useRef(0);
  const firedRef = useRef(false);

  // Reset per question.
  useEffect(() => {
    setValue("");
    setShowHint(false);
    setTimeLeft(TIME_LIMIT_MS);
    firedRef.current = false;
    deadlineRef.current = performance.now() + TIME_LIMIT_MS;
    inputRef.current?.focus();
  }, [index]);

  // Countdown timer (display) + auto-submit empty on timeout.
  useEffect(() => {
    if (reveal) return;
    let raf = 0;
    const tick = () => {
      const left = Math.max(0, deadlineRef.current - performance.now());
      setTimeLeft(left);
      if (left <= 0 && !firedRef.current) {
        firedRef.current = true;
        onSubmit(""); // timeout -> wrong
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [index, reveal, onSubmit]);

  const submit = () => {
    if (submitting || reveal || firedRef.current) return;
    if (!value.trim()) return;
    firedRef.current = true;
    onSubmit(value);
  };

  const pct = (timeLeft / TIME_LIMIT_MS) * 100;
  const danger = timeLeft < 5000;

  return (
    <div className="panel p-5 sm:p-6">
      {/* timer */}
      <div className="h-2 rounded-full bg-white/10 overflow-hidden mb-4">
        <div
          className={`h-full ${danger ? "bg-bad" : "bg-amber"}`}
          style={{ width: `${pct}%`, transition: "width 80ms linear" }}
        />
      </div>

      <p className="font-display text-xl sm:text-2xl font-semibold text-ceramic leading-snug">
        {question.prompt}
      </p>

      {question.hint && !reveal && (
        <button
          className="mt-2 text-sm text-teal/80 hover:text-teal underline underline-offset-2"
          onClick={() => setShowHint((h) => !h)}
        >
          {showHint ? "Hide hint" : "Show hint"}
        </button>
      )}
      {showHint && question.hint && !reveal && (
        <p className="mt-1 text-sm text-white/60 italic">💡 {question.hint}</p>
      )}

      {!reveal ? (
        <div className="mt-4 flex gap-3">
          <input
            ref={inputRef}
            className="input-arcade"
            placeholder="Type your answer…"
            value={value}
            maxLength={100}
            disabled={submitting}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />
          <button className="btn-arcade" onClick={submit} disabled={submitting || !value.trim()}>
            {submitting ? "…" : "Go"}
          </button>
        </div>
      ) : (
        lastResult && (
          <div
            className={`mt-4 rounded-2xl p-4 animate-pop ${
              lastResult.correct ? "bg-good/15 border border-good/40" : "bg-bad/15 border border-bad/40"
            }`}
          >
            <p className="font-display font-bold text-lg">
              {lastResult.correct ? (
                <span className="text-good">✅ Correct! +{lastResult.points} pts</span>
              ) : (
                <span className="text-bad">❌ Not quite</span>
              )}
            </p>
            {!lastResult.correct && (
              <p className="mt-1 text-ceramic">
                Answer: <span className="font-semibold text-teal">{lastResult.correctAnswer}</span>
              </p>
            )}
            <p className="mt-1 text-sm text-white/70">{lastResult.explanation}</p>
          </div>
        )
      )}
    </div>
  );
}
