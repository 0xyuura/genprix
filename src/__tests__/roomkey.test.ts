import { describe, it, expect } from "vitest";
import {
  ROOM_KEY_PARAM,
  ROOM_PATH,
  decodeRoomKey,
  encodeRoomKey,
  inviteLink,
  roomKeyFromInput,
  roomKeyFromLocation,
} from "../data/roomkey";
import { DEFAULT_QUESTIONS, type Question } from "../game/quiz";
import { newRoomCode } from "../data/roomkey";

const ORIGIN = "https://genprix.vercel.app";
// Default-set keys carry a real issued code; custom keys may use any label.
const ISSUED = newRoomCode();

/** The bundled set with question `i` swapped for the host's own. */
const edited = (i: number, q: Partial<Question> = {}): Question[] =>
  DEFAULT_QUESTIONS.map((d, idx) =>
    idx === i
      ? {
          id: d.id,
          prompt: "Who runs the court of the internet?",
          accepted: ["genlayer", "gen layer"],
          hint: "Gen…",
          ...q,
        }
      : d,
  );

describe("link length", () => {
  it("keeps an unedited quiz down to a code-sized link", () => {
    const link = inviteLink(ORIGIN, { code: ISSUED, questions: DEFAULT_QUESTIONS });
    // "0" + a code that carries its own creation minute and check characters.
    expect(link).toBe(`${ORIGIN}${ROOM_PATH}0${ISSUED}`);
    expect(link.length).toBeLessThan(42);
  });

  it("charges an edited quiz for the edits only, not the whole set", () => {
    const one = inviteLink(ORIGIN, { code: "AB4K7Q", questions: edited(3) });
    const all = inviteLink(ORIGIN, {
      code: "AB4K7Q",
      questions: DEFAULT_QUESTIONS.map((d, i) => ({ ...d, prompt: `rewritten question ${i}` })),
    });
    expect(one.length).toBeLessThan(200);
    expect(one.length).toBeLessThan(all.length / 2);
  });
});

describe("encode/decode round trip", () => {
  it("rebuilds the bundled set from the short key", () => {
    const back = decodeRoomKey(encodeRoomKey({ code: ISSUED, questions: DEFAULT_QUESTIONS }));
    expect(back?.code).toBe(ISSUED);
    expect(back?.questions).toEqual(DEFAULT_QUESTIONS);
  });

  it("carries an edited question and leaves the rest bundled", () => {
    const questions = edited(3);
    const back = decodeRoomKey(encodeRoomKey({ code: "AB4K7Q", questions }));
    expect(back?.questions).toHaveLength(DEFAULT_QUESTIONS.length);
    expect(back?.questions[3].prompt).toBe("Who runs the court of the internet?");
    expect(back?.questions[3].accepted).toEqual(["genlayer", "gen layer"]);
    expect(back?.questions[3].hint).toBe("Gen…");
    expect(back?.questions[0].prompt).toBe(DEFAULT_QUESTIONS[0].prompt);
    expect(back?.questions[9].prompt).toBe(DEFAULT_QUESTIONS[9].prompt);
  });

  it("survives non-ASCII and punctuation in a custom question", () => {
    const questions = edited(0, { prompt: "Café or thé? — pick one", accepted: ["café", "thé"] });
    const back = decodeRoomKey(encodeRoomKey({ code: "AB4K7Q", questions }));
    expect(back?.questions[0].prompt).toBe("Café or thé? — pick one");
    expect(back?.questions[0].accepted).toEqual(["café", "thé"]);
  });

  it("drops an empty hint rather than shipping an empty string", () => {
    const back = decodeRoomKey(encodeRoomKey({ code: "AB4K7Q", questions: edited(1, { hint: "" }) }));
    expect(back?.questions[1].hint).toBeUndefined();
  });

  it("uppercases the code so a lowercased link still matches", () => {
    expect(
      decodeRoomKey(encodeRoomKey({ code: ISSUED.toLowerCase(), questions: DEFAULT_QUESTIONS }))
        ?.code,
    ).toBe(ISSUED);
  });

  it("produces a URL-safe key", () => {
    const key = encodeRoomKey({ code: "AB4K7Q", questions: edited(2) });
    expect(key).toMatch(/^[A-Za-z0-9._-]+$/);
    expect(encodeURIComponent(key)).toBe(key);
  });
});

describe("decodeRoomKey rejects junk", () => {
  it("returns null for empty, malformed or truncated input", () => {
    expect(decodeRoomKey("")).toBeNull();
    expect(decodeRoomKey("   ")).toBeNull();
    expect(decodeRoomKey("!!!not base64!!!")).toBeNull();
  });

  // A chat client that clips the URL must not hand over a half-decoded quiz.
  it("refuses a truncated or tampered custom key instead of decoding it wrong", () => {
    const key = encodeRoomKey({ code: "AB4K7Q", questions: edited(4) });
    expect(decodeRoomKey(key)).not.toBeNull();
    for (const cut of [1, 5, 8, 20]) {
      expect(decodeRoomKey(key.slice(0, key.length - cut))).toBeNull();
    }
    const [head, body, crc] = key.split(".");
    expect(decodeRoomKey(`${head}.${body.slice(0, -4)}XXXX.${crc}`)).toBeNull();
  });

  // A room code and a room key must never be confused: codes never contain 0 or 1.
  it("never reads a hand-typed room code as a key", () => {
    for (const code of ["AB4K7Q", "DEF456", "CAT999", "ZZZZZZ"]) {
      expect(decodeRoomKey(code)).toBeNull();
    }
  });

  it("returns null for a key whose code is not code-shaped", () => {
    expect(decodeRoomKey("0AB")).toBeNull(); // too short
    expect(decodeRoomKey("0AB-K7Q")).toBeNull(); // not alphanumeric
  });

  // Otherwise any string starting with "0" would open a game the host never ran.
  it("refuses an invented code that carries the wrong check characters", () => {
    const real = encodeRoomKey({ code: ISSUED, questions: DEFAULT_QUESTIONS });
    expect(decodeRoomKey(real)).not.toBeNull();
    expect(decodeRoomKey(real.slice(0, -2) + "ZZ")).toBeNull();
    expect(decodeRoomKey("0ZZZZZZ9ZZ")).toBeNull();
    expect(decodeRoomKey("0AB4K7Q")).toBeNull(); // not a code this app issued
  });
});

describe("v1 keys still open", () => {
  const v1 = (payload: object): string =>
    btoa(JSON.stringify(payload)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  it("opens a default-set link handed out before the short format", () => {
    const back = decodeRoomKey(v1({ v: 1, c: "TEST99", d: 1 }));
    expect(back?.code).toBe("TEST99");
    expect(back?.questions).toEqual(DEFAULT_QUESTIONS);
  });
  it("opens a custom link handed out before the short format", () => {
    const back = decodeRoomKey(v1({ v: 1, c: "TEST99", q: [["old prompt", ["yes"], ""]] }));
    expect(back?.questions[0].prompt).toBe("old prompt");
  });
  it("still refuses a v1 key from an unknown version", () => {
    expect(decodeRoomKey(v1({ v: 99, c: "TEST99", d: 1 }))).toBeNull();
  });
});

describe("reading a key back out of a link", () => {
  const data = { code: "AB4K7Q", questions: edited(5) };

  it("reads the path form the app now shares", () => {
    expect(roomKeyFromInput(inviteLink(ORIGIN, data))?.code).toBe("AB4K7Q");
    expect(roomKeyFromLocation(`${ROOM_PATH}${encodeRoomKey(data)}`, "")?.code).toBe("AB4K7Q");
  });

  it("still reads the older ?r= query form", () => {
    const legacy = `${ORIGIN}/?${ROOM_KEY_PARAM}=${encodeRoomKey(data)}`;
    expect(roomKeyFromInput(legacy)?.code).toBe("AB4K7Q");
    expect(roomKeyFromLocation("/", `?${ROOM_KEY_PARAM}=${encodeRoomKey(data)}`)?.code).toBe(
      "AB4K7Q",
    );
  });

  it("accepts a pasted bare key, and ignores anything trailing it", () => {
    expect(roomKeyFromInput(encodeRoomKey(data))?.code).toBe("AB4K7Q");
    expect(roomKeyFromInput(inviteLink(ORIGIN, data) + "?utm=x#top")?.questions).toHaveLength(10);
  });

  it("returns null for a short code or noise, so the normal path still runs", () => {
    expect(roomKeyFromInput("AB4K7Q")).toBeNull();
    expect(roomKeyFromInput("")).toBeNull();
    expect(roomKeyFromLocation("/", "")).toBeNull();
  });
});
