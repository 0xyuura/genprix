import { useEffect, useState } from "react";
import { playSfx } from "../audio/sfx";

interface Props {
  /** Fires once, after the lights go out. */
  onDone: () => void;
}

/** 3 · 2 · 1 · lights out. One second a step, then a beat on green. */
const STEP_MS = 1000;
const GREEN_MS = 900;
export const COUNTDOWN_MS = STEP_MS * 3 + GREEN_MS;

// Real starting lights come on in pairs and then all go out at once. Five lamps
// across four steps: two, four, five, none.
const LAMPS: Record<number, number> = { 3: 2, 2: 4, 1: 5, 0: 0 };

/**
 * The moment the host presses Start, every browser in the room lands on this at
 * the same time. It is not decoration: without it the first thing a player sees
 * is a board of ten questions and no idea the clock is already running.
 *
 * The session clock starts when the server says it started, not when this
 * finishes — everyone in the room loses the same four seconds, and nobody gains
 * an advantage by having a slower machine.
 */
export default function Countdown({ onDone }: Props) {
  const [step, setStep] = useState(3); // 3, 2, 1, then 0 = green

  useEffect(() => {
    playSfx("count");
    const timers = [
      setTimeout(() => {
        setStep(2);
        playSfx("count");
      }, STEP_MS),
      setTimeout(() => {
        setStep(1);
        playSfx("count");
      }, STEP_MS * 2),
      setTimeout(() => {
        setStep(0);
        playSfx("go");
      }, STEP_MS * 3),
      setTimeout(onDone, COUNTDOWN_MS),
    ];
    return () => timers.forEach(clearTimeout);
  }, [onDone]);

  const green = step === 0;

  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-pit/95 backdrop-blur-[2px]"
      role="status"
      aria-live="assertive"
      aria-label={green ? "Go" : `Starting in ${step}`}
    >
      <div className="flex flex-col items-center gap-6 px-6">
        <div className="flex items-center gap-3" aria-hidden>
          {[1, 2, 3, 4, 5].map((n) => (
            <span
              key={n}
              className={`w-7 h-7 rounded-full border border-black/60 transition-[background-color,box-shadow] duration-150 ${
                n <= LAMPS[step] ? "light-on" : "bg-ceramic/10"
              }`}
            />
          ))}
        </div>

        <div
          key={step} // remount per step so the pop animation replays
          className={`num font-bold tabular-nums animate-pop leading-none ${
            green ? "text-good text-[76px]" : "text-ceramic text-[112px]"
          }`}
        >
          {green ? "GO" : step}
        </div>

        <p
          className={`stencil !text-[13px] ${green ? "!text-good" : "!text-kerb"}`}
        >
          {green ? "Lights out · ten minutes on the clock" : "Hold · lights coming on"}
        </p>
      </div>
    </div>
  );
}
