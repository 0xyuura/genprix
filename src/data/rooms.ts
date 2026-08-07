// Room service. Secure mode routes to Supabase RPCs; local/demo mode uses localStorage
// (single-device, for testing before Supabase is configured). Either way a game requires
// an active room created by the admin.
import { isSecureMode } from "./supabase";
import { getActiveRoom, joinRoom, createRoom, type AdminQuestion } from "./backend";
import { type Question } from "../game/quiz";

// Local/demo admin passcode (obscurity-level only; secure mode validates a bcrypt hash
// server-side). Matches the passcode the user set.
export const LOCAL_ADMIN_PASSCODE = "713962";

const LS_ROOM = "ggp_room_v1";

interface LocalRoom {
  code: string;
  questions: Question[];
}

function genCode(): string {
  const s = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no ambiguous 0/O/1/I/L
  let c = "";
  for (let i = 0; i < 6; i++) c += s[Math.floor(Math.random() * s.length)];
  return c;
}

function readLocalRoom(): LocalRoom | null {
  try {
    return JSON.parse(localStorage.getItem(LS_ROOM) || "null") as LocalRoom | null;
  } catch {
    return null;
  }
}

const toQuestions = (qs: AdminQuestion[]): Question[] =>
  qs.map((q, i) => ({
    id: q.id || "q" + (i + 1),
    prompt: q.prompt,
    accepted: q.accepted,
    hint: q.hint || undefined,
    explanation: q.explanation,
  }));

const toAdmin = (qs: Question[]): AdminQuestion[] =>
  qs.map((q) => ({
    id: q.id,
    prompt: q.prompt,
    accepted: q.accepted,
    hint: q.hint ?? "",
    explanation: q.explanation,
  }));

/** Is there an active room to join right now? */
export async function isRoomOpen(): Promise<boolean> {
  if (isSecureMode()) {
    try {
      return (await getActiveRoom()).open;
    } catch {
      return false;
    }
  }
  return readLocalRoom() !== null;
}

/** Join a room by code. Secure: returns run handle. Local: returns the room's questions. */
export async function joinRoomSecure(code: string, username: string, seed: string) {
  return joinRoom(code, username, seed);
}

export function joinRoomLocal(code: string): Question[] {
  const r = readLocalRoom();
  if (!r) throw new Error("No active room — ask the admin to open one.");
  if (r.code !== code.trim().toUpperCase()) throw new Error("Room not found or closed.");
  return r.questions;
}

// --- Admin (local/demo) ---
export function localAdminUnlock(passcode: string): AdminQuestion[] {
  if (passcode !== LOCAL_ADMIN_PASSCODE) throw new Error("Wrong passcode.");
  const r = readLocalRoom();
  return r ? toAdmin(r.questions) : [];
}

export function createRoomLocal(passcode: string, questions: AdminQuestion[]): { code: string } {
  if (passcode !== LOCAL_ADMIN_PASSCODE) throw new Error("Wrong passcode.");
  const code = genCode();
  localStorage.setItem(LS_ROOM, JSON.stringify({ code, questions: toQuestions(questions) }));
  return { code };
}

export async function createRoomAny(passcode: string, questions: AdminQuestion[]): Promise<{ code: string }> {
  if (isSecureMode()) {
    const r = await createRoom(passcode, questions);
    return { code: r.code };
  }
  return createRoomLocal(passcode, questions);
}
