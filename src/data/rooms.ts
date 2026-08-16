// Room service. Secure mode routes to Supabase RPCs; local/demo mode uses localStorage
// (single-device, for testing before Supabase is configured). Either way a game requires
// an active room created by the admin.
//
// A room code is SINGLE USE: one code buys exactly one game. Once a run finishes the
// room is marked `done` and the code stops working, and a name that already raced in
// the room cannot join it a second time. Hosts hand out a fresh code per round, which
// is what stops anyone from re-running the same questions to farm the leaderboard.
import { isSecureMode } from "./supabase";
import { getActiveRoom, joinRoom, createRoom, type AdminQuestion } from "./backend";
import { type Question } from "../game/quiz";

// Local/demo admin passcode. Set VITE_ADMIN_PASSCODE to override the demo default.
//
// This is obscurity only, and deliberately not committed: Vite inlines VITE_* vars into
// the client bundle, so in local/demo mode ANY passcode here is readable by anyone who
// opens devtools on the deployed site. Keeping it in an env var only keeps it out of the
// public repo and git history. The real protection is secure mode, where the passcode
// lives as a bcrypt hash in Postgres and is validated inside a SECURITY DEFINER RPC with
// a 5-attempt/15-minute lockout — the browser never receives it at all.
export const LOCAL_ADMIN_PASSCODE =
  (import.meta.env.VITE_ADMIN_PASSCODE as string | undefined) || "000000";

// v2 adds single-use bookkeeping (status + players); v1 rooms are intentionally dropped.
const LS_ROOM = "ggp_room_v2";

export type RoomStatus = "open" | "done";

export interface LocalRoom {
  code: string;
  questions: Question[];
  status: RoomStatus;
  players: string[]; // names that have already raced here
  createdAt: number;
}

export const ROOM_USED_MSG =
  "This code has already been played. Ask the host for a new one.";
export const ROOM_REPLAY_MSG =
  "You already raced with this code. Ask the host for a new one.";
export const NO_ROOM_MSG = "No active room. Ask the host to open one.";
export const BAD_CODE_MSG = "Room not found or closed.";

function genCode(): string {
  const s = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no ambiguous 0/O/1/I/L
  let c = "";
  for (let i = 0; i < 6; i++) c += s[Math.floor(Math.random() * s.length)];
  return c;
}

export const normalizeCode = (c: string): string => (c || "").trim().toUpperCase();

/**
 * The single-use gate, kept pure so it is unit-testable without a DOM/localStorage.
 * Returns an error message, or null when the join is allowed.
 */
export function roomJoinError(
  room: LocalRoom | null,
  code: string,
  username: string,
): string | null {
  if (!room) return NO_ROOM_MSG;
  if (room.code !== normalizeCode(code)) return BAD_CODE_MSG;
  if (room.status === "done") return ROOM_USED_MSG;
  const name = username.trim().toLowerCase();
  if (room.players.some((p) => p.trim().toLowerCase() === name)) return ROOM_REPLAY_MSG;
  return null;
}

/** Record a joining player. Pure — returns the next room record. */
export function withPlayer(room: LocalRoom, username: string): LocalRoom {
  return { ...room, players: [...room.players, username] };
}

/** Retire a room so its code can never start a second game. Pure. */
export function closedRoom(room: LocalRoom): LocalRoom {
  return { ...room, status: "done" };
}

function readLocalRoom(): LocalRoom | null {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_ROOM) || "null") as LocalRoom | null;
    if (!raw || !raw.code) return null;
    // Tolerate records written by an older build of this same version.
    return {
      code: raw.code,
      questions: raw.questions ?? [],
      status: raw.status === "done" ? "done" : "open",
      players: Array.isArray(raw.players) ? raw.players : [],
      createdAt: raw.createdAt ?? 0,
    };
  } catch {
    return null;
  }
}

function writeLocalRoom(room: LocalRoom): void {
  try {
    localStorage.setItem(LS_ROOM, JSON.stringify(room));
  } catch {
    /* storage full / disabled — the in-memory run continues */
  }
}

const toQuestions = (qs: AdminQuestion[]): Question[] =>
  qs.map((q, i) => ({
    id: q.id || "q" + (i + 1),
    prompt: q.prompt,
    accepted: q.accepted,
    hint: q.hint || undefined,
  }));

const toAdmin = (qs: Question[]): AdminQuestion[] =>
  qs.map((q) => ({
    id: q.id,
    prompt: q.prompt,
    accepted: q.accepted,
    hint: q.hint ?? "",
  }));

/** Is there an unplayed room to join right now? */
export async function isRoomOpen(): Promise<boolean> {
  if (isSecureMode()) {
    try {
      return (await getActiveRoom()).open;
    } catch {
      return false;
    }
  }
  return readLocalRoom()?.status === "open";
}

/** Join a room by code. Secure: returns run handle. Local: returns the room's questions. */
export async function joinRoomSecure(code: string, username: string, seed: string) {
  return joinRoom(code, username, seed);
}

export function joinRoomLocal(code: string, username: string): Question[] {
  const room = readLocalRoom();
  const err = roomJoinError(room, code, username);
  if (err) throw new Error(err);
  const joined = withPlayer(room as LocalRoom, username);
  writeLocalRoom(joined);
  return joined.questions;
}

/** Called when a run ends: burns the code so the same room can't host a second game. */
export function closeRoomLocal(code: string): void {
  const room = readLocalRoom();
  if (!room || room.code !== normalizeCode(code)) return;
  writeLocalRoom(closedRoom(room));
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
  writeLocalRoom({
    code,
    questions: toQuestions(questions),
    status: "open",
    players: [],
    createdAt: Date.now(),
  });
  return { code };
}

export async function createRoomAny(
  passcode: string,
  questions: AdminQuestion[],
): Promise<{ code: string }> {
  if (isSecureMode()) {
    const r = await createRoom(passcode, questions);
    return { code: r.code };
  }
  return createRoomLocal(passcode, questions);
}
