import { useCallback, useEffect, useRef, useState } from "react";
import { checkAnswer, maskAnswer, type Question } from "./quiz";
import {
  runScore,
  SESSION_MS,
  HINTS_PER_SESSION,
  QUESTION_COUNT,
  POINTS_PER_CORRECT,
} from "./scoring";
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
import { joinRoomLocal } from "../data/rooms";
import { joinRoom, answerQuestion, finishRun } from "../data/backend";
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
}

export interface GameState {
  phase: Phase;
  username: string;
  avatarSeed: string;
  board: BoardQuestion[];
  selected: number | null; // open question index; null = the question board
  solvedCount: number;
  // Running base score: solved × POINTS_PER_CORRECT. The bonuses land at the end,
  // so this has to use the same constant the final score does — showing a tenth of
  // the real number for the whole run is worse than showing nothing.
  score: number;
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
  // Secure mode only: the server's handle on this run. Every answer and the
  // finish are graded there, so these two are what make the score real.
  const runId = useRef<string | null>(null);
  const runToken = useRef<string | null>(null);
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

    // Finishing does not close the room. The code belongs to the session, not to
    // this player: everyone else it was handed to still has to be able to race.
    // It ends on its own 15-minute clock, or when the seats run out.
    const s = stateRef.current;
    const remMs = remaining();
    const avgWpm = totalsWpm(s.typeTotals);
    const acc = totalsAccuracy(s.typeTotals);
    const score = runScore(s.solvedCount, remMs, avgWpm, acc);
    const totalMs = SESSION_MS - remMs;

    // Secure mode: the server closes the run, writes the score from its own
    // tally and its own clock, and answers with the placing. Nothing the client
    // computed above is trusted, which is the entire point of a shared board.
    if (runId.current && runToken.current) {
      const id = runId.current;
      const tok = runToken.current;
      runId.current = null;
      runToken.current = null;
      void finishRun(id, tok)
        .then((r) =>
          setState((st) => ({
            ...st,
            phase: "results",
            mood: "idle",
            score: r.score,
            totalMs: r.total_ms,
            rank: r.rank,
            wpm: avgWpm,
            accuracy: acc,
          })),
        )
        .catch((e) =>
          setState((st) => ({
            ...st,
            phase: "results",
            mood: "idle",
            score,
            totalMs,
            wpm: avgWpm,
            accuracy: acc,
            notice: (e as Error).message || "Could not save the score.",
          })),
        );
      return;
    }

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
  const join = useCallback(async (rawName: string, code: string) => {
    const username = sanitizeUsername(rawName);
    const seed = avatarSeed(username);
    clearTimers();
    finished.current = false;
    const secure = isSecureMode();

    // Secure mode opens the run on the server and takes the board back from it,
    // so a player on a device that has never seen this room can still join by
    // code. Local mode keeps the self-contained code, where the room travels
    // inside the code itself.
    let qs: Question[];
    try {
      if (secure) {
        const started = await joinRoom(code, username, seed);
        runId.current = started.run_id;
        runToken.current = started.token;
        // The server never sends accepted answers. Grading happens there too, so
        // the client has nothing to check against and does not need them.
        qs = started.questions.map((q) => ({
          id: q.id,
          prompt: q.prompt,
          accepted: [],
          hint: q.hint ?? undefined,
        }));
      } else {
        runId.current = null;
        runToken.current = null;
        qs = joinRoomLocal(code, username); // throws if no room / wrong code / already used
      }
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
    // After the last checkpoint, that timer *is* the end of the run. Cancelling it
    // used to leave a finished player stuck on a completed grid while the clock ran
    // down and their time bonus drained away, which is the opposite of what the
    // standings reward. Leaving the panel early now just ends the run sooner.
    if (stateRef.current.solvedCount >= QUESTION_COUNT) {
      finish();
      return;
    }
    setState((s) => ({ ...s, selected: null, lastResult: null }));
  }, [finish]);

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
    async (answer: string) => {
      const s = stateRef.current;
      if (s.phase !== "playing" || s.selected == null) return;
      const idx = s.selected;
      const bq = s.board[idx];
      if (!bq || bq.solved) return;
      if (bq.stage !== "answer") return; // prompt must be retyped first
      if (!answer.trim()) return;

      const q = localQs.current[idx];
      // The server grades in secure mode and is the only thing that can award
      // points there, so ask it and use its verdict. Locally the answers are in
      // the bundle, so checkAnswer stands in for it.
      let correct: boolean;
      let revealed = q.accepted[0] ?? "";
      if (runId.current && runToken.current) {
        try {
          const res = await answerQuestion(runId.current, runToken.current, q.id, answer);
          correct = res.correct;
          revealed = res.correct_answer ?? revealed;
        } catch (e) {
          setState((st) => ({ ...st, notice: (e as Error).message || "Answer rejected." }));
          return;
        }
      } else {
        correct = checkAnswer(answer, q.accepted);
      }

      fxId.current += 1;
      const fxEvent: FxEvent = { id: fxId.current, type: correct ? "boost" : "skid" };

      if (correct) {
        const newSolved = s.solvedCount + 1;
        const board = s.board.map((b, i) => (i === idx ? { ...b, solved: true } : b));
        setState((st) => ({
          ...st,
          board,
          solvedCount: newSolved,
          score: newSolved * POINTS_PER_CORRECT,
          fxEvent,
          lastResult: { correct: true, correctAnswer: revealed },
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
          lastResult: { correct: false, correctAnswer: "" },
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
      notice: "That code is used up. Ask the host for a fresh one to race again.",
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
