// Typing engine (typeracer-style). Pure and side-effect free so it can be unit
// tested under vitest's `node` environment.
//
// Rules, mirroring play.typeracer.com:
//  - You retype the passage verbatim, character by character.
//  - A wrong character IS accepted into the buffer and shown in red, but the car
//    does not move past it — you must backspace and fix it. Progress is always the
//    length of the correct prefix.
//  - Pasting is not typing: any input that jumps more than one character is
//    rejected outright.
//  - WPM uses the standard 5-characters-per-word convention.

/** How far past the end of the passage the buffer may run before input is ignored. */
export const MAX_OVERRUN = 8;

/** A passage is normalized to a single spaced line so stray newlines can't be untypeable. */
export function normalizeTarget(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

export interface TypingState {
  target: string;
  typed: string;
  keystrokes: number; // characters entered; backspaces are not counted
  errors: number; // characters that were wrong at the position they were entered
  startedAt: number | null; // ms timestamp of the first keystroke, null until then
  finishedAt: number | null; // ms timestamp the passage was completed
}

export function newTyping(target: string): TypingState {
  return {
    target: normalizeTarget(target),
    typed: "",
    keystrokes: 0,
    errors: 0,
    startedAt: null,
    finishedAt: null,
  };
}

/** Number of leading characters that match the target — this is what drives the kart. */
export function correctPrefixLen(target: string, typed: string): number {
  const n = Math.min(target.length, typed.length);
  let i = 0;
  while (i < n && target[i] === typed[i]) i++;
  return i;
}

export type CharState = "correct" | "wrong" | "current" | "pending";

/** Per-character render state for the passage. */
export function charStates(target: string, typed: string): CharState[] {
  const good = correctPrefixLen(target, typed);
  const out: CharState[] = [];
  for (let i = 0; i < target.length; i++) {
    if (i < good) out.push("correct");
    else if (i < typed.length) out.push("wrong");
    else if (i === typed.length) out.push("current");
    else out.push("pending");
  }
  return out;
}

/** 0..1 share of the passage typed correctly so far. */
export function progressOf(s: TypingState): number {
  if (!s.target.length) return 1;
  return correctPrefixLen(s.target, s.typed) / s.target.length;
}

export function isComplete(s: TypingState): boolean {
  return s.typed === s.target && s.target.length > 0;
}

/** True while the buffer holds a character that has to be backspaced away. */
export function hasError(s: TypingState): boolean {
  return correctPrefixLen(s.target, s.typed) < s.typed.length;
}

/** Milliseconds spent on this passage (0 before the first keystroke). */
export function elapsedOf(s: TypingState, now: number): number {
  if (s.startedAt == null) return 0;
  return Math.max(0, (s.finishedAt ?? now) - s.startedAt);
}

/** Standard WPM: 5 characters = 1 word. */
export function wpm(correctChars: number, elapsedMs: number): number {
  if (elapsedMs <= 0 || correctChars <= 0) return 0;
  return correctChars / 5 / (elapsedMs / 60000);
}

/** Share of keystrokes that landed on the right character; 1 before any typing. */
export function accuracy(keystrokes: number, errors: number): number {
  if (keystrokes <= 0) return 1;
  return Math.max(0, (keystrokes - errors) / keystrokes);
}

/**
 * Fold a new input-field value into the typing state.
 * Returns the SAME object when the input is rejected, so callers can skip re-render.
 */
export function applyInput(s: TypingState, next: string, now: number): TypingState {
  if (s.finishedAt != null) return s; // passage already done — locked
  if (next === s.typed) return s;

  const added = next.length - s.typed.length;
  if (added > 1) return s; // paste / autofill — not typing
  if (next.length > s.target.length + MAX_OVERRUN) return s;

  // Deletion: no keystroke accounting, the player is fixing a mistake.
  if (added <= 0) return { ...s, typed: next };

  const idx = next.length - 1;
  const wrong = next[idx] !== s.target[idx];
  const out: TypingState = {
    ...s,
    typed: next,
    keystrokes: s.keystrokes + 1,
    errors: s.errors + (wrong ? 1 : 0),
    startedAt: s.startedAt ?? now,
  };
  if (isComplete(out)) out.finishedAt = now;
  return out;
}

/** Running typing totals for a whole session, accumulated per completed passage. */
export interface TypingTotals {
  chars: number;
  keystrokes: number;
  errors: number;
  ms: number;
}

export const emptyTotals: TypingTotals = { chars: 0, keystrokes: 0, errors: 0, ms: 0 };

/** Add one finished passage to the session totals. */
export function addPassage(t: TypingTotals, s: TypingState, now: number): TypingTotals {
  return {
    chars: t.chars + s.target.length,
    keystrokes: t.keystrokes + s.keystrokes,
    errors: t.errors + s.errors,
    ms: t.ms + elapsedOf(s, now),
  };
}

export const totalsWpm = (t: TypingTotals): number => wpm(t.chars, t.ms);
export const totalsAccuracy = (t: TypingTotals): number => accuracy(t.keystrokes, t.errors);
