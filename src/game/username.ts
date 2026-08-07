// Username handling: sanitize untrusted input and derive a deterministic avatar seed.
// Server-side (start_run) re-validates length; this is the client mirror + cosmetics.

// Built via RegExp so the source stays pure ASCII (no literal control bytes).
const CONTROL_CHARS = new RegExp("[\\x00-\\x1F\\x7F]", "g");

export function sanitizeUsername(raw: string): string {
  return raw
    .replace(/<[^>]*>/g, "") // strip HTML tags
    .replace(CONTROL_CHARS, "") // strip control chars
    .replace(/[<>]/g, "") // strip stray angle brackets
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 20);
}

export function isValidUsername(raw: string): boolean {
  const s = sanitizeUsername(raw);
  return s.length >= 2 && s.length <= 20;
}

// Stable non-crypto hash (djb2) -> used to tint the mochi avatar per username.
export function avatarSeed(username: string): string {
  let h = 5381;
  for (let i = 0; i < username.length; i++) {
    h = ((h << 5) + h + username.charCodeAt(i)) >>> 0;
  }
  return String(h);
}
