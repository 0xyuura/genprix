// Typed wrappers over the server-authoritative Supabase RPCs. Every write path
// (run lifecycle + admin) goes through these; the client never computes/submits a
// score in secure mode. Each wrapper throws on error so callers can fall back.
import { supabase } from "./supabase";
import type { PublicQuestion } from "../game/quiz";

export interface StartRunResult {
  run_id: string;
  token: string;
  // The whole board. The client shows all ten and lets the player take them in
  // any order, so the server hands over the set rather than a cursor.
  questions: PublicQuestion[];
  // Joining no longer means racing. Players wait in the room until the host
  // starts it, so the server says whether that has happened and how much of the
  // session is left — measured on its clock, not on whenever this tab loaded.
  started: boolean;
  remaining_ms: number;
}

export interface LobbyPlayer {
  username: string;
  avatar_seed: string;
}

export interface LobbyResult {
  started: boolean;
  remaining_ms: number;
  /** Everyone holding this code, in the order they arrived. */
  players: LobbyPlayer[];
  count: number;
  /** Milliseconds before the code itself expires and the room can no longer be started. */
  expires_in_ms: number;
}

export interface AnswerResult {
  correct: boolean;
  points_awarded: number;
  correct_answer: string | null;
  new_score: number;
  correct_count: number;
  answered: string[];
}

export interface FinishResult {
  score: number;
  correct: number;
  total_ms: number;
  rank: number;
}

export interface HintResult {
  /** First and last character of the answer; everything else "_". */
  mask: string;
  hints_left: number;
}

export interface AdminQuestion {
  id: string;
  prompt: string;
  accepted: string[];
  hint: string;
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error("secure mode unavailable");
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export const getActiveRoom = () => rpc<{ open: boolean }>("get_active_room", {});

export const joinRoom = (code: string, username: string, avatar_seed: string) =>
  rpc<StartRunResult>("join_room", {
    p_code: code,
    p_username: username,
    p_avatar_seed: avatar_seed,
  });

export const answerQuestion = (
  run_id: string,
  token: string,
  question_id: string,
  answer: string,
) =>
  rpc<AnswerResult>("answer_question", {
    p_run_id: run_id,
    p_token: token,
    p_question_id: question_id,
    p_answer: answer,
  });

export const finishRun = (run_id: string, token: string) =>
  rpc<FinishResult>("finish_run", { p_run_id: run_id, p_token: token });

/**
 * Spend a hint. The mask has to be built on the server: in secure mode the
 * client is never sent `accepted`, so it has nothing to mask and used to throw
 * trying. The server also counts the two hints, so a reload cannot refill them.
 */
export const revealHint = (run_id: string, token: string, question_id: string) =>
  rpc<HintResult>("reveal_hint", {
    p_run_id: run_id,
    p_token: token,
    p_question_id: question_id,
  });

/** Who is in the room and whether the host has started it. Safe for anyone holding the code. */
export const roomLobby = (code: string) => rpc<LobbyResult>("room_lobby", { p_code: code });

/** Host only: drop the lights and start everyone's clock at the same instant. */
export const startGame = (passcode: string, code: string) =>
  rpc<{ ok: boolean; started_at: string; players: number }>("start_game", {
    p_passcode: passcode,
    p_code: code,
  });

// --- Admin ---
export const adminGetQuestions = (passcode: string) =>
  rpc<AdminQuestion[]>("admin_get_questions", { p_passcode: passcode });

export const adminPublish = (passcode: string, questions: AdminQuestion[], bumpRound: boolean) =>
  rpc<{ ok: boolean; round: number }>("admin_publish_questions", {
    p_passcode: passcode,
    p_questions: questions,
    p_bump: bumpRound,
  });

export const createRoom = (passcode: string, questions: AdminQuestion[]) =>
  rpc<{ code: string; round: number }>("create_room", {
    p_passcode: passcode,
    p_questions: questions,
  });
