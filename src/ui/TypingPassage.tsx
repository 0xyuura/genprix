import { memo } from "react";
import { charStates, type CharState } from "../game/typing";

interface Props {
  target: string;
  typed: string;
}

const cls: Record<CharState, string> = {
  // Already typed correctly — dimmed, like the part of the track behind you.
  correct: "text-good/90",
  // Wrong character sitting in the buffer; it must be backspaced away to move on.
  wrong: "text-bad bg-bad/25 rounded-[2px]",
  // The character you owe next.
  current: "text-ceramic bg-teal/40 rounded-[2px] animate-pulse",
  pending: "text-white/40",
};

/**
 * The passage to retype, coloured per character. `whitespace-pre-wrap` keeps the
 * spaces visible (so a mistyped space still highlights) while letting long prompts
 * wrap instead of overflowing on phones.
 */
function TypingPassage({ target, typed }: Props) {
  const states = charStates(target, typed);
  return (
    <p
      className="font-mono text-base sm:text-lg leading-relaxed whitespace-pre-wrap break-words select-none"
      aria-label={target}
    >
      {[...target].map((ch, i) => (
        <span key={i} className={cls[states[i]]}>
          {ch}
        </span>
      ))}
    </p>
  );
}

export default memo(TypingPassage);
