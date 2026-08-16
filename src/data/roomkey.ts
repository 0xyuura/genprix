// Room keys: a whole room packed into the invite link.
//
// In local/demo mode there is no shared backend, so a room created on the host's
// machine lives in that browser's localStorage and nowhere else. Handing a friend
// the 6-character code therefore could not work — their device had never heard of
// the room, and the start screen honestly reported "no game running".
//
// So the invite link carries the room itself: ?r=<key>. Anyone who opens it can
// play immediately, no server and no sign-up. The key is not a secret and is not
// signed — in demo mode nothing is (the admin passcode is already inlined in the
// bundle). It is a transport, not a permission.
//
// Two shapes keep the link short. An unedited question set travels as a single
// flag, because every device already has those ten questions in its bundle; only
// a host who actually edited the quiz pays for the full payload.
import { DEFAULT_QUESTIONS, type Question } from "../game/quiz";

export const ROOM_KEY_PARAM = "r";
const VERSION = 1;

/** [prompt, accepted[], hint] — array form, because JSON keys would be half the link. */
type PackedQuestion = [string, string[], string];

interface PackedRoom {
  v: number;
  c: string; // room code, kept for display and for the single-use bookkeeping
  d?: 1; // 1 => the bundled default question set, so no questions travel
  q?: PackedQuestion[];
}

export interface RoomKeyData {
  code: string;
  questions: Question[];
}

const sameQuestions = (a: Question[], b: Question[]): boolean =>
  a.length === b.length &&
  a.every((q, i) => {
    const o = b[i];
    return (
      q.prompt === o.prompt &&
      (q.hint ?? "") === (o.hint ?? "") &&
      q.accepted.length === o.accepted.length &&
      q.accepted.every((s, j) => s === o.accepted[j])
    );
  });

// base64url so the key survives a URL, a chat client, and a copy-paste.
function toBase64Url(s: string): string {
  const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(s)));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): string {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

/** Pack a room into a URL-safe key. */
export function encodeRoomKey(data: RoomKeyData): string {
  const packed: PackedRoom = { v: VERSION, c: data.code };
  if (sameQuestions(data.questions, DEFAULT_QUESTIONS)) {
    packed.d = 1;
  } else {
    packed.q = data.questions.map((q) => [q.prompt, q.accepted, q.hint ?? ""]);
  }
  return toBase64Url(JSON.stringify(packed));
}

/** Unpack a key. Returns null for anything malformed, truncated, or from a newer version. */
export function decodeRoomKey(key: string): RoomKeyData | null {
  const trimmed = (key || "").trim();
  if (!trimmed) return null;
  try {
    const packed = JSON.parse(fromBase64Url(trimmed)) as PackedRoom;
    if (!packed || packed.v !== VERSION || typeof packed.c !== "string" || !packed.c) return null;

    if (packed.d === 1) return { code: packed.c.toUpperCase(), questions: DEFAULT_QUESTIONS };

    if (!Array.isArray(packed.q) || packed.q.length === 0) return null;
    const questions: Question[] = [];
    for (let i = 0; i < packed.q.length; i++) {
      const row = packed.q[i];
      if (!Array.isArray(row)) return null;
      const [prompt, accepted, hint] = row;
      if (typeof prompt !== "string" || !prompt) return null;
      if (!Array.isArray(accepted) || accepted.length === 0) return null;
      if (!accepted.every((a) => typeof a === "string" && a.length > 0)) return null;
      questions.push({
        id: "q" + (i + 1),
        prompt,
        accepted,
        hint: typeof hint === "string" && hint ? hint : undefined,
      });
    }
    return { code: packed.c.toUpperCase(), questions };
  } catch {
    return null;
  }
}

/** The link the host shares. Everything the guest needs is inside it. */
export function inviteLink(origin: string, data: RoomKeyData): string {
  return `${origin}/?${ROOM_KEY_PARAM}=${encodeRoomKey(data)}`;
}

/** Pull a room key out of a full URL, a query string, or a pasted bare key. */
export function roomKeyFromInput(input: string): RoomKeyData | null {
  const raw = (input || "").trim();
  if (!raw) return null;
  const at = raw.indexOf(`${ROOM_KEY_PARAM}=`);
  const candidate = at >= 0 ? raw.slice(at + 2).split(/[&#\s]/)[0] : raw;
  return decodeRoomKey(candidate);
}
