import { useCallback, useEffect, useRef, useState } from "react";
import { checkAnswer, maskAnswer, type Question } from "./quiz";
import { runScore, SESSION_MS, HINTS_PER_SESSION, QUESTION_COUNT } from "./scoring";
import { sanitizeUsername, avatarSeed } from "./username";
import { isSecureMode } from "../data/supabase";
import { joinRoomLocal } from "../data/rooms";
import { selectAdapter, currentHourBucket, type Entry } from "../data/leaderboard";
import type { FxEvent } from "../race/RaceCanvas";
import type { Mood } from "../race/race";

export type Phase = "idle" | "playing" | "results";

export interface BoardQuestion {
  id: string;
  prompt: string;
  solved: boolean;
  attempts: number;
  hintMask: string | null; // revealed first/last-letter mask, once a hint is spent here
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
  score: number; // running base score (solved × 100); final run adds the time bonus
  hintsLeft: number;
  mood: Mood;
  lastResult: LastResult | null; // feedback for the currently open question
  fxEvent: FxEvent | null;
  remainingMs: number;
  notice: string | null;
  rank: number | null;
  totalMs: number;
  secure: boolean;
}

const MOOD_MS = 1500; // how long the happy/angry face lingers
const SOLVED_RETURN_MS = 1100; // pause on the solved card before returning to the board

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
};

export function useGame() {
  const [state, setState] = useState<GameState>(initial);

  // Effect-synced mirror so async/user-triggered callbacks read committed state.
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  });

  const localQs = useRef<Question[]>([]);
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

    const s = stateRef.current;
    const remMs = remaining();
    const score = runScore(s.solvedCount, remMs);
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
    }));
  }, []);

  // Join the active local room by code and open a fresh 10-minute session.
  const join = useCallback((rawName: string, code: string) => {
    const username = sanitizeUsername(rawName);
    const seed = avatarSeed(username);
    clearTimers();
    finished.current = false;
    const secure = isSecureMode();

    let qs: Question[];
    try {
      qs = joinRoomLocal(code); // throws if no room / wrong code
    } catch (e) {
      setState((st) => ({
        ...st,
        phase: "idle",
        notice: (e as Error).message || "Could not join room.",
      }));
      return;
    }
    localQs.current = qs;
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

  const submit = useCallback(
    (answer: string) => {
      const s = stateRef.current;
      if (s.phase !== "playing" || s.selected == null) return;
      const idx = s.selected;
      const bq = s.board[idx];
      if (!bq || bq.solved) return;
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

  const playAgain = useCallback(() => {
    clearTimers();
    finished.current = false;
    setState(initial);
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

  return { state, join, select, backToBoard, submit, useHint, playAgain };
}
