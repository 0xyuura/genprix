import { formatClock } from "../game/scoring";

interface Props {
  remainingMs: number;
  score: number;
  solvedCount: number;
  total: number;
  hintsLeft: number;
  wpm: number; // session average, updated as each question passage is completed
  accuracy: number; // 0..1
}

/**
 * The pit wall: session clock, the ten checkpoints as a sector strip, and the
 * telemetry a player can act on. Under a minute the whole bar goes to caution
 * stripes rather than pulsing red text, because a flashing number is hard to
 * read at exactly the moment reading it matters most.
 */
export default function Hud({
  remainingMs,
  score,
  solvedCount,
  total,
  hintsLeft,
  wpm,
  accuracy,
}: Props) {
  const danger = remainingMs <= 60_000;
  const [mins, secs] = formatClock(remainingMs).split(":");

  return (
    <div
      className={`panel flex items-stretch divide-x divide-line overflow-hidden ${
        danger ? "caution-stripe border-flag/50" : ""
      }`}
    >
      <div className="px-3 py-2">
        <div className="stencil !text-[10px]">Time left</div>
        <div
          className={`num font-bold text-2xl leading-none mt-0.5 ${
            danger ? "text-flag" : "text-ceramic"
          }`}
        >
          {mins}
          <span className="tick">:</span>
          {secs}
        </div>
      </div>

      <div className="px-3 py-2 flex-1 min-w-[132px]">
        <div className="flex items-baseline justify-between">
          <span className="stencil !text-[10px]">Checkpoints</span>
          <span className="num text-xs text-ceramic/60">
            {solvedCount}/{total}
          </span>
        </div>
        {/* One cell per question: filled means claimed. A segmented strip tells
            you which lap you are on; a smooth gradient bar does not. */}
        <div className="mt-1.5 flex gap-[3px]" aria-hidden>
          {Array.from({ length: total }, (_, i) => (
            <span
              key={i}
              className={`h-2.5 flex-1 ${i < solvedCount ? "bg-good" : "bg-ceramic/10"}`}
            />
          ))}
        </div>
      </div>

      <div className="px-3 py-2 hidden sm:block">
        <div className="stencil !text-[10px]">Typing</div>
        <div className="num text-sm text-ceramic/70 mt-1">
          {Math.round(wpm)} wpm · {Math.round(accuracy * 100)}%
        </div>
      </div>

      <div className="px-3 py-2 hidden sm:block">
        <div className="stencil !text-[10px]">Hints</div>
        <div className="num text-sm text-ceramic/70 mt-1">{hintsLeft} left</div>
      </div>

      <div className="px-3 py-2 text-right">
        <div className="stencil !text-[10px]">Points</div>
        <div className="num font-bold text-xl text-teal leading-none mt-1">
          {score.toLocaleString()}
        </div>
      </div>
    </div>
  );
}
