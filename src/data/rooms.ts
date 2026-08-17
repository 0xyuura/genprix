// Room service. Secure mode routes to Supabase RPCs; local/demo mode uses localStorage
// (single-device, for testing before Supabase is configured). Either way a game requires
// an active room created by the admin.
//
// A room code is a session, not a ticket: it opens for 15 minutes and seats up to
// ROOM_CAPACITY players, one run each. It ends when the clock runs out or the seats
// run out — never because somebody finished, since the point of a code is that a
// crowd can race the same questions at once. A name that already raced in the room
// cannot join it again, which is what stops anyone from re-running the questions to
// farm the leaderboard. Hosts create a fresh code for the next round.
import { isSecureMode } from "./supabase";
import { getActiveRoom, joinRoom, createRoom, type AdminQuestion } from "./backend";
import { DEFAULT_QUESTIONS, type Question } from "../game/quiz";
import {
  changedFromDefaults,
  codeIssuedAt,
  encodeRoomKey,
  inviteLink,
  isDefaultSet,
  newRoomCode,
  roomKeyFromInput,
  roomKeyFromLocation,
  type RoomKeyData,
} from "./roomkey";

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

// v2 adds the player roster; v1 rooms are intentionally dropped.
const LS_ROOM = "ggp_room_v2";

export interface LocalRoom {
  code: string;
  questions: Question[];
  players: string[]; // names that have already raced here
  createdAt: number;
  /**
   * The host published the bundled questions untouched. Recorded because the
   * wording of those questions changes between builds: without this, reopening
   * the admin panel would reload the OLD copy, every reworded question would
   * count as an edit, and the invite link would balloon for a host who never
   * edited anything.
   */
  fromDefaults?: boolean;
}

/** A code is only good for 15 minutes after the host created it. */
export const ROOM_TTL_MS = 15 * 60 * 1000;

/** How many players one code seats. */
export const ROOM_CAPACITY = 1000;

export const ROOM_EXPIRED_MSG =
  "This quiz has ended — a code runs for 15 minutes. Ask the host to create a new code.";
export const ROOM_FULL_MSG =
  `This room is full — a code seats ${ROOM_CAPACITY} players. Ask the host to create a new code.`;
export const ROOM_REPLAY_MSG =
  "You already raced with this code. Ask the host for a new one.";
export const NO_ROOM_MSG = "No active room. Ask the host to open one.";
export const BAD_CODE_MSG =
  "No game open under that code. Check it with the host, or use their invite link.";

export const normalizeCode = (c: string): string => (c || "").trim().toUpperCase();

/**
 * The join gate, kept pure so it is unit-testable without a DOM/localStorage.
 * Returns an error message, or null when the join is allowed.
 */
export function roomJoinError(
  room: LocalRoom | null,
  code: string,
  username: string,
  now = Date.now(),
): string | null {
  if (!room) return NO_ROOM_MSG;
  if (room.code !== normalizeCode(code)) return BAD_CODE_MSG;
  // Expiry first: a full room that is also over should read as over, since a new
  // code is the answer either way and the clock is the rule hosts know about.
  if (expiresAt(room) <= now) return ROOM_EXPIRED_MSG;
  const name = username.trim().toLowerCase();
  if (room.players.some((p) => p.trim().toLowerCase() === name)) return ROOM_REPLAY_MSG;
  if (room.players.length >= ROOM_CAPACITY) return ROOM_FULL_MSG;
  return null;
}

/** Is this room still taking players? */
export const isRoomLive = (room: LocalRoom, now = Date.now()): boolean =>
  timeLeftOn(room, now) > 0 && room.players.length < ROOM_CAPACITY;

/** Seats left on a room, for the host's own count. */
export const seatsLeft = (room: LocalRoom): number =>
  Math.max(0, ROOM_CAPACITY - room.players.length);

/**
 * When a room stops working. Read from the code itself, because every device
 * has to agree on the deadline and only the code crossed the gap between them.
 * Codes from before the clock was baked in fall back to when this device first
 * saw the room.
 */
export function expiresAt(room: LocalRoom): number {
  return (codeIssuedAt(room.code) ?? room.createdAt) + ROOM_TTL_MS;
}

/** Milliseconds left on a room, floored at zero. */
export const timeLeftOn = (room: LocalRoom, now = Date.now()): number =>
  Math.max(0, expiresAt(room) - now);

/** Record a joining player. Pure — returns the next room record. */
export function withPlayer(room: LocalRoom, username: string): LocalRoom {
  return { ...room, players: [...room.players, username] };
}

function readLocalRoom(): LocalRoom | null {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_ROOM) || "null") as LocalRoom | null;
    if (!raw || !raw.code) return null;
    // Tolerate records written by an older build of this same version, including the
    // `status` field from when a finished run retired the code. Dropping it cannot
    // revive anything: those rooms are long past their 15 minutes.
    return {
      code: raw.code,
      questions: raw.questions ?? [],
      players: Array.isArray(raw.players) ? raw.players : [],
      createdAt: raw.createdAt ?? 0,
      fromDefaults: raw.fromDefaults === true,
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

/**
 * Adopt a room handed over in an invite link, so a guest's device knows about a
 * room its own admin never created. Idempotent, and it never wipes the roster of
 * a room this device already knows: if a room with the same code is already on
 * file, that record wins, so a player who reloads still cannot race twice.
 *
 * Returns the room now active, or null when the key was unusable.
 */
export function adoptRoom(data: RoomKeyData | null): LocalRoom | null {
  if (!data || !data.code) return null;
  const code = normalizeCode(data.code);
  const existing = readLocalRoom();
  if (existing && existing.code === code) return existing;
  const room: LocalRoom = {
    code,
    questions: data.questions,
    players: [],
    createdAt: Date.now(),
  };
  writeLocalRoom(room);
  return room;
}

/**
 * Read the invite link on start-up and adopt whatever room it carries. Runs once
 * before the start screen asks whether a game is open, which is what lets a guest
 * land on a username box instead of "no game running".
 */
export function adoptRoomFromUrl(search?: string, pathname?: string): LocalRoom | null {
  if (isSecureMode()) return null; // secure mode has a real server to ask
  const loc = typeof window === "undefined" ? null : window.location;
  return adoptRoom(roomKeyFromLocation(pathname ?? loc?.pathname ?? "", search ?? loc?.search ?? ""));
}

/** Is there a room taking players right now? */
export async function isRoomOpen(): Promise<boolean> {
  if (isSecureMode()) {
    try {
      return (await getActiveRoom()).open;
    } catch {
      return false;
    }
  }
  const room = readLocalRoom();
  return !!room && isRoomLive(room);
}

/** Join a room by code. Secure: returns run handle. Local: returns the room's questions. */
export async function joinRoomSecure(code: string, username: string, seed: string) {
  return joinRoom(code, username, seed);
}

export function joinRoomLocal(code: string, username: string): Question[] {
  // The code box also takes a full invite link or a pasted room key, so a guest
  // who was handed the link as text is not stuck either.
  const fromKey = roomKeyFromInput(code);
  const room = fromKey ? adoptRoom(fromKey) : readLocalRoom();
  const wanted = fromKey ? fromKey.code : code;

  const err = roomJoinError(room, wanted, username);
  if (err) throw new Error(err);
  const joined = withPlayer(room as LocalRoom, username);
  writeLocalRoom(joined);
  return joined.questions;
}

/** The room this device is currently holding, if any. */
export function activeRoomLocal(): LocalRoom | null {
  return readLocalRoom();
}

/**
 * The code a host hands out. It is the room key, not just a label: with the
 * built-in questions that is seven characters someone can type on any device,
 * which is the whole point — a plain label would mean nothing on a phone that
 * has never seen this room. Editing questions makes it long, because the
 * questions themselves have to travel.
 */
export function shareCodeLocal(code: string): string | null {
  const room = readLocalRoom();
  if (!room || room.code !== normalizeCode(code)) return null;
  return encodeRoomKey({ code: room.code, questions: room.questions });
}

/** Is this share code short enough to read out or type in? */
export const isTypableCode = (shareCode: string): boolean => shareCode.length <= 12;

/** The share link for a local room: the room travels inside it. */
export function inviteLinkLocal(origin: string, code: string): string | null {
  const room = readLocalRoom();
  if (!room || room.code !== normalizeCode(code)) return null;
  return inviteLink(origin, { code: room.code, questions: room.questions });
}

// --- Admin (local/demo) ---
export function localAdminUnlock(passcode: string): AdminQuestion[] {
  if (passcode !== LOCAL_ADMIN_PASSCODE) throw new Error("Wrong passcode.");
  const r = readLocalRoom();
  if (!r) return [];
  // A host who published the bundled set gets today's wording back, not the copy
  // frozen into their last room. Anything they actually edited is theirs to keep.
  return toAdmin(r.fromDefaults ? DEFAULT_QUESTIONS : r.questions);
}

export function createRoomLocal(passcode: string, questions: AdminQuestion[]): { code: string } {
  if (passcode !== LOCAL_ADMIN_PASSCODE) throw new Error("Wrong passcode.");
  const code = newRoomCode();
  const qs = toQuestions(questions);
  writeLocalRoom({
    code,
    questions: qs,
    players: [],
    createdAt: Date.now(),
    fromDefaults: isDefaultSet(qs),
  });
  return { code };
}

/** How many questions a link would have to carry. 0 means the shortest link. */
export function editedQuestionCount(questions: AdminQuestion[]): number {
  return changedFromDefaults(toQuestions(questions)).length;
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
