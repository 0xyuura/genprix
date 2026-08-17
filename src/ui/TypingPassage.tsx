import { memo } from "react";
import { charStates, type CharState } from "../game/typing";

interface Props {
  target: string;
  typed: string;
}

// Brightness runs the other way from most typing UIs on purpose: the text you
// still owe is the most legible, and the part already typed fades like track
// behind the kart. Colouring every typed character green looks busy and makes
// the characters that matter compete with the ones that no longer do.
const cls: Record<CharState, string> = {
  correct: "text-white/30",
  // Sitting in the buffer and blocking progress until it is backspaced away.
  wrong: "text-void bg-bad",
  // The character owed next: a solid block cursor, no blinking.
  current: "text-void bg-teal",
  pending: "text-ceramic",
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
      className="font-num text-base sm:text-lg leading-[1.7] whitespace-pre-wrap break-words select-none"
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
