import { useCallback, useEffect, useRef, useState } from "react";
import { checkAnswer, toPublic, type PublicQuestion, type Question } from "./quiz";
import { scoreAnswer, HINTS_PER_SESSION } from "./scoring";
import { sanitizeUsername, avatarSeed } from "./username";
import { isSecureMode } from "../data/supabase";
import { answerQuestion, finishRun } from "../data/backend";
import { joinRoomSecure, joinRoomLocal } from "../data/rooms";
import { selectAdapter, sortEntries, currentHourBucket, type Entry } from "../data/leaderboard";
import type { FxEvent } from "../race/RaceCanvas";

export type Phase = "idle" | "playing" | "results";

export interface LastResult {
  correct: boolean;
  correctAnswer: string;
  explanation: string;
  points: number;
}

export interface GameState {
  phase: Phase;
  username: string;
  avatarSeed: string;
  index: number; // 0-based current question
  score: number;
  correctCount: number;
  streak: number;
  current: PublicQuestion | null;
  reveal: boolean;
  lastResult: LastResult | null;
  fxEvent: FxEvent | null;
  notice: string | null;
  rank: number | null;
  totalMs: number;
  secure: boolean;
  submitting: boolean;
  hintsLeft: number;
}

const REVEAL_MS = 1700;

const initial: GameState = {
  phase: "idle",
  username: "",
  avatarSeed: "",
  index: 0,
  score: 0,
  correctCount: 0,
  streak: 0,
  current: null,
  reveal: false,
  lastResult: null,
  fxEvent: null,
  notice: null,
  rank: null,
  totalMs: 0,
  secure: false,
  submitting: false,
  hintsLeft: HINTS_PER_SESSION,
};

export function useGame() {
  const [state, setState] = useState<GameState>(initial);

  // Effect-synced mirror so user-triggered async callbacks read committed state.
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  });

  const runRef = useRef<{ runId: string; token: string } | null>(null);
  const localQs = useRef<Question[]>([]);
  const qStart = useRef(0);
  const runStart = useRef(0);
  const busy = useRef(false);
  const fxId = useRef(0);
  const revealTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearRevealTimer = () => {
    if (revealTimer.current) clearTimeout(revealTimer.current);
    revealTimer.current = null;
  };

  // Join the active room by code and start a run. Requires an active room (secure or local).
  const join = useCallback(async (rawName: string, code: string) => {
    const username = sanitizeUsername(rawName);
    const seed = avatarSeed(username);
    clearRevealTimer();
    busy.current = false;
    const secure = isSecureMode();
    let current: PublicQuestion;

    try {
      if (secure) {
        const r = await joinRoomSecure(code, username, seed);
        runRef.current = { runId: r.run_id, token: r.token };
        current = r.question;
      } else {
        const qs = joinRoomLocal(code); // throws if no room / wrong code
        localQs.current = qs;
        runRef.current = null;
        current = toPublic(qs[0]);
      }
    } catch (e) {
      setState((st) => ({ ...st, phase: "idle", notice: (e as Error).message || "Could not join room." }));
      return;
    }

    runStart.current = performance.now();
    qStart.current = performance.now();
    setState({
      ...initial,
      phase: "playing",
      username,
      avatarSeed: seed,
      current,
      secure,
    });
  }, []);

  const finish = useCallback(
    async (finalScore: number, finalCorrect: number, username: string, seed: string) => {
      const totalMs = Math.round(performance.now() - runStart.current);
      let rank: number | null = null;
      let resolvedScore = finalScore;
      let resolvedCorrect = finalCorrect;
      let resolvedTotal = totalMs;

      if (runRef.current && isSecureMode()) {
        try {
          const f = await finishRun(runRef.current.runId, runRef.current.token);
          resolvedScore = f.score;
          resolvedCorrect = f.correct;
          resolvedTotal = f.total_ms;
          rank = f.rank;
        } catch {
          /* keep client values; rank stays null */
        }
      } else {
        try {
          const adapter = selectAdapter();
          const entry: Entry = {
            username,
            avatarSeed: seed,
            score: finalScore,
            correct: finalCorrect,
            totalMs,
            hourBucket: currentHourBucket(),
            createdAt: Date.now(),
          };
          await adapter.submit(entry);
          const board = sortEntries(await adapter.top(9999));
          rank =
            board.filter(
              (e) => e.score > finalScore || (e.score === finalScore && e.totalMs < totalMs),
            ).length + 1;
        } catch {
          /* ignore */
        }
      }

      setState((s) => ({
        ...s,
        phase: "results",
        score: resolvedScore,
        correctCount: resolvedCorrect,
        totalMs: resolvedTotal,
        rank,
      }));
    },
    [],
  );

  const submit = useCallback(
    async (answer: string) => {
      if (busy.current) return;
      const s = stateRef.current;
      if (s.phase !== "playing" || s.reveal || !s.current) return;
      busy.current = true;
      const elapsedMs = Math.round(performance.now() - qStart.current);
      setState((st) => ({ ...st, submitting: true }));

      let correct: boolean;
      let points: number;
      let correctAnswer: string;
      let explanation: string;
      let newScore: number;
      let newCorrect: number;
      let newStreak: number;
      let next: PublicQuestion | null;
      let lastQuestion: boolean;

      if (s.secure && runRef.current) {
        try {
          const res = await answerQuestion(
            runRef.current.runId,
            runRef.current.token,
            s.current.id,
            answer,
          );
          correct = res.correct;
          points = res.points_awarded;
          correctAnswer = res.correct_answer;
          explanation = res.explanation;
          newScore = res.new_score;
          newCorrect = res.correct_count;
          newStreak = correct ? s.streak + 1 : 0;
          next = res.next_question;
          lastQuestion = res.next_question === null;
        } catch {
          busy.current = false;
          setState((st) => ({ ...st, submitting: false, notice: "Network hiccup — try again." }));
          return;
        }
      } else {
        const q = localQs.current[s.index];
        correct = checkAnswer(answer, q.accepted);
        const sc = scoreAnswer({ correct, elapsedMs, streak: s.streak });
        points = sc.points;
        newStreak = sc.newStreak;
        correctAnswer = q.accepted[0];
        explanation = q.explanation;
        newScore = s.score + points;
        newCorrect = s.correctCount + (correct ? 1 : 0);
        const nextIdx = s.index + 1;
        lastQuestion = nextIdx >= localQs.current.length;
        next = lastQuestion ? null : toPublic(localQs.current[nextIdx]);
      }

      fxId.current += 1;
      const fxEvent: FxEvent = { id: fxId.current, type: correct ? "boost" : "skid" };

      setState((st) => ({
        ...st,
        submitting: false,
        reveal: true,
        lastResult: { correct, correctAnswer, explanation, points },
        score: newScore,
        correctCount: newCorrect,
        streak: newStreak,
        fxEvent,
      }));

      clearRevealTimer();
      revealTimer.current = setTimeout(() => {
        busy.current = false;
        if (lastQuestion) {
          finish(newScore, newCorrect, s.username, s.avatarSeed);
        } else {
          qStart.current = performance.now();
          setState((st) => ({
            ...st,
            index: st.index + 1,
            current: next,
            reveal: false,
            lastResult: null,
          }));
        }
      }, REVEAL_MS);
    },
    [finish],
  );

  // Session-wide hint budget (3 per game). Returns true if a hint was granted.
  const useHint = useCallback((): boolean => {
    if (stateRef.current.hintsLeft <= 0) return false;
    setState((st) => (st.hintsLeft > 0 ? { ...st, hintsLeft: st.hintsLeft - 1 } : st));
    return true;
  }, []);

  const playAgain = useCallback(() => {
    clearRevealTimer();
    runRef.current = null;
    busy.current = false;
    setState(initial);
  }, []);

  useEffect(() => clearRevealTimer, []);

  return { state, join, submit, playAgain, useHint };
}
