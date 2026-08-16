// Room keys: a whole room packed into the invite link.
//
// In local/demo mode there is no shared backend, so a room created on the host's
// machine lives in that browser's localStorage and nowhere else. Handing a friend
// the six-character code therefore could not work — their device had never heard
// of the room. The link carries the room instead, which means the room has to fit
// in a URL people are willing to paste into a chat.
//
// Three tricks keep it short:
//
//   1. The unedited quiz travels as one character. Every device already ships
//      those ten questions, so "0" plus the code is the entire key: /r/0AB4K7Q.
//      The prefix is a digit that room codes never contain (the code alphabet
//      drops 0/1/I/L/O as ambiguous), so a typed code can never be mistaken for
//      a key, whatever its case.
//   2. An edited quiz sends only the questions that actually changed, indexed
//      against the bundled set. Editing two questions costs two questions, not
//      ten.
//   3. No JSON. Field names cost more than the data at this size, so records use
//      ASCII separators that no keyboard produces.
//
// The key is not a secret and is not signed — in demo mode nothing is (the admin
// passcode is already inlined in the bundle). It is a transport, not a permission.
import { DEFAULT_QUESTIONS, type Question } from "../game/quiz";

export const ROOM_KEY_PARAM = "r";
export const ROOM_PATH = "/r/";

// ASCII separators: one byte each, and unreachable from a text input.
const FIELD = "\u001f"; // between the fields of one question
const RECORD = "\u001e"; // between questions
const LIST = "\u001d"; // between accepted answers

// Key kinds. Digits, because room codes never contain 0 or 1 — that keeps a
// hand-typed code from ever parsing as a key.
const KIND_DEFAULT = "0";
const KIND_CUSTOM = "1";

const CODE_RE = /^[A-Z0-9]{4,12}$/;

export interface RoomKeyData {
  code: string;
  questions: Question[];
}

const oneLine = (s: string): string =>
  s.replace(/[\u001d-\u001f]/g, " ").replace(/\s+/g, " ").trim();

const sameQuestion = (a: Question, b: Question | undefined): boolean =>
  !!b &&
  oneLine(a.prompt) === oneLine(b.prompt) &&
  oneLine(a.hint ?? "") === oneLine(b.hint ?? "") &&
  a.accepted.length === b.accepted.length &&
  a.accepted.every((s, i) => oneLine(s) === oneLine(b.accepted[i]));

/**
 * Four base36 characters of FNV-1a over the payload. Chat clients and link
 * previews truncate URLs, and a half-delivered quiz would otherwise decode
 * quietly into questions with clipped answers. Cheaper to refuse it.
 */
function checksum(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36).slice(-4).padStart(4, "0");
}

function toBase64Url(s: string): string {
  const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(s)));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): string {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

/** Pack a room into the shortest key that can rebuild it. */
export function encodeRoomKey(data: RoomKeyData): string {
  const code = (data.code || "").toUpperCase();
  const qs = data.questions;

  const changed: number[] = [];
  for (let i = 0; i < qs.length; i++) {
    if (!sameQuestion(qs[i], DEFAULT_QUESTIONS[i])) changed.push(i);
  }
  // Nothing edited and nothing added or removed: the bundled set will do.
  if (changed.length === 0 && qs.length === DEFAULT_QUESTIONS.length) return KIND_DEFAULT + code;

  const records = changed.map((i) => {
    const q = qs[i];
    return [
      String(i),
      oneLine(q.prompt),
      q.accepted.map(oneLine).filter(Boolean).join(LIST),
      oneLine(q.hint ?? ""),
    ].join(FIELD);
  });
  const payload = [String(qs.length), ...records].join(RECORD);
  return `${KIND_CUSTOM}${code}.${toBase64Url(payload)}.${checksum(payload)}`;
}

function decodeV2(key: string): RoomKeyData | null {
  const kind = key[0];

  if (kind === KIND_DEFAULT) {
    const code = key.slice(1).toUpperCase();
    return CODE_RE.test(code) ? { code, questions: DEFAULT_QUESTIONS } : null;
  }
  if (kind !== KIND_CUSTOM) return null;

  const [codePart, body, crc, ...rest] = key.split(".");
  if (!body || !crc || rest.length) return null;
  const code = codePart.slice(1).toUpperCase();
  if (!CODE_RE.test(code)) return null;

  const payload = fromBase64Url(body);
  if (checksum(payload) !== crc) return null; // truncated or tampered with

  const [head, ...records] = payload.split(RECORD);
  const count = Number(head);
  if (!Number.isInteger(count) || count < 1 || count > 50) return null;

  // Start from the bundled set and overlay only what the host changed.
  const questions: Question[] = [];
  for (let i = 0; i < count; i++) {
    const base = DEFAULT_QUESTIONS[i];
    questions.push(base ? { ...base, id: "q" + (i + 1) } : { id: "q" + (i + 1), prompt: "", accepted: [] });
  }
  for (const record of records) {
    const [idxRaw, prompt, accepted, hint] = record.split(FIELD);
    const i = Number(idxRaw);
    if (!Number.isInteger(i) || i < 0 || i >= count) return null;
    if (!prompt) return null;
    const list = (accepted ?? "").split(LIST).filter(Boolean);
    if (list.length === 0) return null;
    questions[i] = { id: "q" + (i + 1), prompt, accepted: list, hint: hint || undefined };
  }
  // A question the bundle never had, and the host never sent, cannot be played.
  if (questions.some((q) => !q.prompt || q.accepted.length === 0)) return null;
  return { code, questions };
}

/** v1 keys were base64url JSON. Links handed out before v2 keep working. */
function decodeV1(key: string): RoomKeyData | null {
  const packed = JSON.parse(fromBase64Url(key)) as {
    v?: number;
    c?: string;
    d?: number;
    q?: [string, string[], string][];
  };
  if (!packed || packed.v !== 1 || typeof packed.c !== "string" || !packed.c) return null;
  const code = packed.c.toUpperCase();
  if (packed.d === 1) return { code, questions: DEFAULT_QUESTIONS };
  if (!Array.isArray(packed.q) || packed.q.length === 0) return null;
  const questions: Question[] = [];
  for (let i = 0; i < packed.q.length; i++) {
    const row = packed.q[i];
    if (!Array.isArray(row)) return null;
    const [prompt, accepted, hint] = row;
    if (typeof prompt !== "string" || !prompt) return null;
    if (!Array.isArray(accepted) || accepted.length === 0) return null;
    if (!accepted.every((a) => typeof a === "string" && a.length > 0)) return null;
    questions.push({ id: "q" + (i + 1), prompt, accepted, hint: hint || undefined });
  }
  return { code, questions };
}

/** Unpack a key. Returns null for anything malformed, truncated or unknown. */
export function decodeRoomKey(key: string): RoomKeyData | null {
  const trimmed = (key || "").trim();
  if (trimmed.length < 2) return null;
  try {
    return decodeV2(trimmed) ?? decodeV1(trimmed);
  } catch {
    try {
      return decodeV1(trimmed);
    } catch {
      return null;
    }
  }
}

/** The link the host shares. Everything the guest needs is inside it. */
export function inviteLink(origin: string, data: RoomKeyData): string {
  return `${origin}${ROOM_PATH}${encodeRoomKey(data)}`;
}

/** Pull a room key out of a link (/r/KEY or ?r=KEY) or a pasted bare key. */
export function roomKeyFromInput(input: string): RoomKeyData | null {
  const raw = (input || "").trim();
  if (!raw) return null;

  const path = raw.indexOf(ROOM_PATH);
  if (path >= 0) {
    const direct = decodeRoomKey(raw.slice(path + ROOM_PATH.length).split(/[?&#\s]/)[0]);
    if (direct) return direct;
  }
  const query = raw.indexOf(`${ROOM_KEY_PARAM}=`);
  if (query >= 0) {
    const fromQuery = decodeRoomKey(raw.slice(query + 2).split(/[&#\s]/)[0]);
    if (fromQuery) return fromQuery;
  }
  return decodeRoomKey(raw);
}

/** Read a key out of the live location: /r/KEY wins, ?r=KEY still works. */
export function roomKeyFromLocation(pathname: string, search: string): RoomKeyData | null {
  if (pathname.startsWith(ROOM_PATH)) {
    const fromPath = decodeRoomKey(pathname.slice(ROOM_PATH.length).split("/")[0]);
    if (fromPath) return fromPath;
  }
  const param = new URLSearchParams(search).get(ROOM_KEY_PARAM);
  return param ? decodeRoomKey(param) : null;
}
