// Typed wrappers over the server-authoritative Supabase RPCs. Every write path
// (run lifecycle + admin) goes through these; the client never computes/submits a
// score in secure mode. Each wrapper throws on error so callers can fall back.
import { supabase } from "./supabase";
import type { PublicQuestion } from "../game/quiz";

export interface StartRunResult {
  run_id: string;
  token: string;
  index: number;
  question: PublicQuestion;
}

export interface AnswerResult {
  correct: boolean;
  points_awarded: number;
  correct_answer: string;
  new_score: number;
  correct_count: number;
  index: number;
  next_question: PublicQuestion | null;
}

export interface FinishResult {
  score: number;
  correct: number;
  total_ms: number;
  rank: number;
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
