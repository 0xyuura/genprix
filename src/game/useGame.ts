import { useCallback, useEffect, useRef, useState } from "react";
import { checkAnswer, maskAnswer, type Question } from "./quiz";
import { runScore, SESSION_MS, HINTS_PER_SESSION, QUESTION_COUNT } from "./scoring";
import {
  addPassage,
  applyInput,
  emptyTotals,
  isComplete,
  newTyping,
  progressOf,
  totalsAccuracy,
  totalsWpm,
  type TypingState,
  type TypingTotals,
} from "./typing";
import { sanitizeUsername, avatarSeed } from "./username";
import { isSecureMode } from "../data/supabase";
import { joinRoomLocal, closeRoomLocal } from "../data/rooms";
import { selectAdapter, currentHourBucket, type Entry } from "../data/leaderboard";
import type { FxEvent } from "../race/RaceCanvas";
import type { Mood } from "../race/race";

export type Phase = "idle" | "playing" | "results";

/** Each question is played in two typed stages: retype the prompt, then type the answer. */
export type Stage = "prompt" | "answer";

export interface BoardQuestion {
  id: string;
  prompt: string;
  solved: boolean;
  attempts: number;
  hintMask: string | null; // revealed first/last-letter mask, once a hint is spent here
  typing: TypingState; // typeracer buffer for the prompt, kept per question
  stage: Stage; // "answer" once the prompt has been retyped in full
}

export interface LastResult {
  correct: boolean;
  correctAnswer: string;
  explanation: string;
}

export interface GameState {
  phase: Phase;
  username: string;
  avatarSeed: string;
  board: BoardQuestion[];
  selected: number | null; // open question index; null = the question board
  solvedCount: number;
  score: number; // running base score (solved × 100); final run adds the bonuses
  hintsLeft: number;
  mood: Mood;
  lastResult: LastResult | null; // feedback for the currently open question
  fxEvent: FxEvent | null;
  remainingMs: number;
  notice: string | null;
  rank: number | null;
  totalMs: number;
  secure: boolean;
  typeTotals: TypingTotals; // session typing accumulator (completed passages only)
  wpm: number; // session average, refreshed as each passage completes
  accuracy: number; // 0..1
}

const MOOD_MS = 1500; // how long the happy/angry face lingers
const SOLVED_RETURN_MS = 1100; // pause on the solved card before returning to the board

/** Share of a question's kart distance earned by retyping the prompt; the rest lands on a correct answer. */
export const PROMPT_SHARE = 0.7;

const initial: GameState = {
  phase: "idle",
  username: "",
  avatarSeed: "",
  board: [],
  selected: null,
  solvedCount: 0,
  score: 0,
  hintsLeft: HINTS_PER_SESSION,
  mood: "idle",
  lastResult: null,
  fxEvent: null,
  remainingMs: SESSION_MS,
  notice: null,
  rank: null,
  totalMs: 0,
  secure: false,
  typeTotals: emptyTotals,
  wpm: 0,
  accuracy: 1,
};

/** 0..1 kart position: solved questions, plus partial credit for the open one. */
export function kartProgress(s: GameState): number {
  const open = s.selected != null ? s.board[s.selected] : null;
  const partial = open && !open.solved ? PROMPT_SHARE * progressOf(open.typing) : 0;
  return Math.min(1, (s.solvedCount + partial) / QUESTION_COUNT);
}

export function useGame() {
  const [state, setState] = useState<GameState>(initial);

  // Effect-synced mirror so async/user-triggered callbacks read committed state.
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  });

  const localQs = useRef<Question[]>([]);
  const roomCode = useRef<string>("");
  const endsAt = useRef(0);
  const fxId = useRef(0);
  const moodTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const returnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finished = useRef(false);

  const clearTimers = () => {
    if (moodTimer.current) clearTimeout(moodTimer.current);
    if (returnTimer.current) clearTimeout(returnTimer.current);
    moodTimer.current = null;
    returnTimer.current = null;
  };

  const setMood = (mood: Mood) => {
    if (moodTimer.current) clearTimeout(moodTimer.current);
    setState((s) => ({ ...s, mood }));
    if (mood !== "idle") {
      moodTimer.current = setTimeout(() => setState((s) => ({ ...s, mood: "idle" })), MOOD_MS);
    }
  };

  const remaining = () => Math.max(0, endsAt.current - performance.now());

  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    clearTimers();

    // The code is spent the moment a run ends — one code hosts exactly one game.
    try {
      closeRoomLocal(roomCode.current);
    } catch {
      /* ignore */
    }

    const s = stateRef.current;
    const remMs = remaining();
    const avgWpm = totalsWpm(s.typeTotals);
    const acc = totalsAccuracy(s.typeTotals);
    const score = runScore(s.solvedCount, remMs, avgWpm, acc);
    const totalMs = SESSION_MS - remMs;

    let rank: number | null = null;
    try {
      const adapter = selectAdapter();
      const entry: Entry = {
        username: s.username,
        avatarSeed: s.avatarSeed,
        score,
        correct: s.solvedCount,
        totalMs,
        hourBucket: currentHourBucket(),
        createdAt: Date.now(),
        wpm: Math.round(avgWpm),
        accuracy: acc,
      };
      void adapter.submit(entry).then(async () => {
        try {
          rank = await adapter.rankFor(score, totalMs);
        } catch {
          /* ignore */
        }
        setState((st) => ({ ...st, rank }));
      });
    } catch {
      /* ignore */
    }

    setState((st) => ({
      ...st,
      phase: "results",
      mood: "idle",
      score,
      totalMs,
      remainingMs: remMs,
      rank,
      wpm: avgWpm,
      accuracy: acc,
    }));
  }, []);

  // Join the room by code and open a fresh 10-minute session. The code is burned on
  // finish, and a name that already raced here is refused.
  const join = useCallback((rawName: string, code: string) => {
    const username = sanitizeUsername(rawName);
    const seed = avatarSeed(username);
    clearTimers();
    finished.current = false;
    const secure = isSecureMode();

    let qs: Question[];
    try {
      qs = joinRoomLocal(code, username); // throws if no room / wrong code / already used
    } catch (e) {
      setState((st) => ({
        ...st,
        phase: "idle",
        notice: (e as Error).message || "Could not join room.",
      }));
      return;
    }
    localQs.current = qs;
    roomCode.current = code;
    endsAt.current = performance.now() + SESSION_MS;

    setState({
      ...initial,
      phase: "playing",
      username,
      avatarSeed: seed,
      secure,
      remainingMs: SESSION_MS,
      board: qs.map((q) => ({
        id: q.id,
        prompt: q.prompt,
        solved: false,
        attempts: 0,
        hintMask: null,
        typing: newTyping(q.prompt),
        stage: "prompt" as Stage,
      })),
    });
  }, []);

  const select = useCallback((i: number) => {
    setState((s) => {
      if (s.phase !== "playing" || i < 0 || i >= s.board.length) return s;
      return { ...s, selected: i, lastResult: null, mood: "idle" };
    });
  }, []);

  const backToBoard = useCallback(() => {
    if (returnTimer.current) clearTimeout(returnTimer.current);
    setState((s) => ({ ...s, selected: null, lastResult: null }));
  }, []);

  // Typeracer stage: fold each keystroke into the open question's buffer. Completing
  // the passage banks its typing stats and unlocks the answer field.
  const typeInput = useCallback((next: string) => {
    setState((s) => {
      if (s.phase !== "playing" || s.selected == null) return s;
      const idx = s.selected;
      const bq = s.board[idx];
      if (!bq || bq.solved || bq.stage !== "prompt") return s;

      const now = performance.now();
      const t = applyInput(bq.typing, next, now);
      if (t === bq.typing) return s; // rejected (paste / overrun) — no re-render

      const done = isComplete(t);
      const board = s.board.map((b, i) =>
        i === idx ? { ...b, typing: t, stage: done ? ("answer" as Stage) : b.stage } : b,
      );
      if (!done) return { ...s, board };

      const typeTotals = addPassage(s.typeTotals, t, now);
      return {
        ...s,
        board,
        typeTotals,
        wpm: totalsWpm(typeTotals),
        accuracy: totalsAccuracy(typeTotals),
      };
    });
  }, []);

  const submit = useCallback(
    (answer: string) => {
      const s = stateRef.current;
      if (s.phase !== "playing" || s.selected == null) return;
      const idx = s.selected;
      const bq = s.board[idx];
      if (!bq || bq.solved) return;
      if (bq.stage !== "answer") return; // prompt must be retyped first
      if (!answer.trim()) return;

      const q = localQs.current[idx];
      const correct = checkAnswer(answer, q.accepted);

      fxId.current += 1;
      const fxEvent: FxEvent = { id: fxId.current, type: correct ? "boost" : "skid" };

      if (correct) {
        const newSolved = s.solvedCount + 1;
        const board = s.board.map((b, i) => (i === idx ? { ...b, solved: true } : b));
        setState((st) => ({
          ...st,
          board,
          solvedCount: newSolved,
          score: newSolved * 100,
          fxEvent,
          lastResult: { correct: true, correctAnswer: q.accepted[0], explanation: q.explanation },
        }));
        setMood("happy");

        if (returnTimer.current) clearTimeout(returnTimer.current);
        if (newSolved >= QUESTION_COUNT) {
          returnTimer.current = setTimeout(finish, SOLVED_RETURN_MS);
        } else {
          returnTimer.current = setTimeout(
            () => setState((st) => ({ ...st, selected: null, lastResult: null })),
            SOLVED_RETURN_MS,
          );
        }
      } else {
        const board = s.board.map((b, i) => (i === idx ? { ...b, attempts: b.attempts + 1 } : b));
        setState((st) => ({
          ...st,
          board,
          fxEvent,
          lastResult: { correct: false, correctAnswer: "", explanation: "" },
        }));
        setMood("angry");
      }
    },
    [finish],
  );

  // Spend one of the 2 session hints to reveal the first/last-letter mask for a question.
  const useHint = useCallback((i: number): boolean => {
    let granted = false;
    setState((s) => {
      if (s.phase !== "playing") return s;
      const bq = s.board[i];
      if (!bq || bq.solved) return s;
      if (bq.hintMask) return s; // already revealed here, no charge
      if (s.hintsLeft <= 0) return s;
      granted = true;
      const mask = maskAnswer(localQs.current[i].accepted[0]);
      const board = s.board.map((b, idx) => (idx === i ? { ...b, hintMask: mask } : b));
      return { ...s, board, hintsLeft: s.hintsLeft - 1 };
    });
    return granted;
  }, []);

  // Back to the start screen. The finished code is dead, so a new one is required.
  const playAgain = useCallback(() => {
    clearTimers();
    finished.current = false;
    const name = stateRef.current.username;
    roomCode.current = "";
    setState({
      ...initial,
      username: name,
      notice: "That room code is spent — ask the host for a fresh code to race again.",
    });
  }, []);

  // Session countdown. Polls 4x a second so the run ends promptly, but only pushes
  // state when the *displayed* second changes — the clock reads mm:ss, so the other
  // three ticks would re-render the whole tree to paint identical pixels.
  useEffect(() => {
    if (state.phase !== "playing") return;
    const id = setInterval(() => {
      const remMs = remaining();
      setState((s) => {
        if (s.phase !== "playing") return s;
        if (Math.ceil(remMs / 1000) === Math.ceil(s.remainingMs / 1000)) return s;
        return { ...s, remainingMs: remMs };
      });
      if (remMs <= 0) finish();
    }, 250);
    return () => clearInterval(id);
  }, [state.phase, finish]);

  useEffect(() => clearTimers, []);

  return { state, join, select, backToBoard, typeInput, submit, useHint, playAgain };
}
