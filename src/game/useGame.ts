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
import {
  activeRoomLocal,
  isTypableCode,
  joinRoomLocal,
  lobbyOf,
  lobbyOfRoom,
  normalizeCode,
  shareCodeLocal,
  type Lobby,
} from "../data/rooms";
import { joinRoom, answerQuestion, finishRun } from "../data/backend";
import { selectAdapter, currentBucket, type Entry } from "../data/leaderboard";
import type { FxEvent } from "../race/RaceCanvas";
import type { Mood } from "../race/race";

export type Phase = "idle" | "lobby" | "playing" | "results";

/** How often a waiting player asks the room whether the host has started it. */
const LOBBY_POLL_MS = 2000;

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
  /** The room code this player joined with, so the waiting room can show it. */
  roomCode: string;
  /** Who else is waiting, refreshed while the phase is "lobby". */
  lobby: Lobby | null;
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
  roomCode: "",
  lobby: null,
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
  // Local mode only: the id that ties the row written when this player joined to
  // the one rewritten when they finish, so they appear once and not twice.
  const localRunId = useRef<string>("");
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
        // Same id as the row written on join, so finishing updates that row
        // instead of listing this player a second time.
        runId: localRunId.current || undefined,
        username: s.username,
        avatarSeed: s.avatarSeed,
        score,
        correct: s.solvedCount,
        totalMs,
        bucket: currentBucket(),
        createdAt: Date.now(),
        wpm: Math.round(avgWpm),
        accuracy: acc,
        finished: true,
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

  /**
   * Drop the lights. Called either straight from join (a room already under way)
   * or by the lobby poll the moment the host starts it. The remaining time comes
   * from whoever owns the clock — the server in secure mode — so every player's
   * countdown reads the same, however long they sat in the waiting room.
   */
  const beginRun = useCallback((remainingMs: number) => {
    endsAt.current = performance.now() + remainingMs;
    setState((s) => (s.phase === "lobby" ? { ...s, phase: "playing", remainingMs } : s));
  }, []);

  // Join the room by code. Joining puts you in the waiting room and on the
  // leaderboard; the race itself starts when the host starts it. A name that
  // already raced in this room is refused.
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
    let lobby: Lobby;
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
        // One round-trip for the roster, so the waiting room is populated on the
        // first paint instead of blank until the first poll.
        lobby = await lobbyOf(code).catch(() => ({
          started: started.started,
          remainingMs: started.remaining_ms,
          players: [username],
          count: 1,
          expiresInMs: 0,
        }));
      } else {
        runId.current = null;
        runToken.current = null;
        qs = joinRoomLocal(code, username); // throws if no room / wrong code / already used
        const room = activeRoomLocal();
        lobby = room
          ? lobbyOfRoom(room)
          : { started: true, remainingMs: SESSION_MS, players: [username], count: 1, expiresInMs: 0 };
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
    // A guest may have pasted a link or a room key rather than the code itself;
    // the room on file is the one the lobby has to be asked about.
    roomCode.current = secure ? code : (activeRoomLocal()?.code ?? code);
    // What the waiting room shows is not always what it looks the room up by.
    // Locally the key is a stored 9-character record while the host reads out a
    // 10-character share code, and a player who typed one and is shown the other
    // has every reason to think they are in the wrong room.
    const shownCode = secure
      ? normalizeCode(code)
      : (() => {
          const share = shareCodeLocal(roomCode.current);
          return share && isTypableCode(share) ? share : roomCode.current;
        })();
    endsAt.current = performance.now() + lobby.remainingMs;

    // Joining is what puts a name on the board, so the room roster and the
    // leaderboard agree from the first second. Secure mode writes that row
    // inside join_room; local mode has to write its own.
    if (!secure) {
      localRunId.current = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      void selectAdapter()
        .submit({
          runId: localRunId.current,
          username,
          avatarSeed: seed,
          score: 0,
          correct: 0,
          totalMs: 0,
          bucket: currentBucket(),
          createdAt: Date.now(),
          finished: false,
        })
        .catch(() => {
          /* a full localStorage must not block the race */
        });
    }

    setState({
      ...initial,
      phase: lobby.started ? "playing" : "lobby",
      username,
      avatarSeed: seed,
      secure,
      roomCode: shownCode,
      lobby,
      remainingMs: lobby.remainingMs,
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
      notice: "One run per name per code. Ask the host for a new one to race again.",
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

  // The waiting room. Everyone holding the code asks the same question — "has the
  // host started?" — until the answer is yes, and then every one of them starts
  // on the server's clock rather than on whenever their own poll happened to land.
  useEffect(() => {
    if (state.phase !== "lobby") return;
    let alive = true;
    const ask = async () => {
      let lobby: Lobby;
      try {
        lobby = await lobbyOf(roomCode.current);
      } catch {
        return; // a dropped poll is not worth showing anyone; the next one retries
      }
      if (!alive) return;
      setState((s) => (s.phase === "lobby" ? { ...s, lobby } : s));
      if (lobby.started) beginRun(lobby.remainingMs);
    };
    const id = setInterval(ask, LOBBY_POLL_MS);
    void ask();
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [state.phase, beginRun]);

  useEffect(() => clearTimers, []);

  return { state, join, select, backToBoard, typeInput, submit, useHint, playAgain };
}
