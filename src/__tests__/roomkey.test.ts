import { describe, it, expect } from "vitest";
import {
  ROOM_KEY_PARAM,
  decodeRoomKey,
  encodeRoomKey,
  inviteLink,
  roomKeyFromInput,
} from "../data/roomkey";
import { DEFAULT_QUESTIONS, type Question } from "../game/quiz";

const custom: Question[] = [
  { id: "q1", prompt: "Who runs the court of the internet?", accepted: ["genlayer"], hint: "Gen…" },
  { id: "q2", prompt: "Answer with an accent: café?", accepted: ["café", "cafe"] },
];

describe("encode/decode round trip", () => {
  it("carries a custom question set intact", () => {
    const back = decodeRoomKey(encodeRoomKey({ code: "ABC123", questions: custom }));
    expect(back?.code).toBe("ABC123");
    expect(back?.questions).toHaveLength(2);
    expect(back?.questions[0].prompt).toBe(custom[0].prompt);
    expect(back?.questions[0].accepted).toEqual(["genlayer"]);
    expect(back?.questions[0].hint).toBe("Gen…");
  });
  it("survives non-ASCII text", () => {
    const back = decodeRoomKey(encodeRoomKey({ code: "ABC123", questions: custom }));
    expect(back?.questions[1].prompt).toContain("café");
    expect(back?.questions[1].accepted).toContain("café");
  });
  it("drops an empty hint rather than shipping an empty string", () => {
    const back = decodeRoomKey(encodeRoomKey({ code: "ABC123", questions: custom }));
    expect(back?.questions[1].hint).toBeUndefined();
  });
  it("uppercases the code so a lowercased link still matches", () => {
    expect(decodeRoomKey(encodeRoomKey({ code: "abc123", questions: custom }))?.code).toBe(
      "ABC123",
    );
  });

  it("packs the default question set as a flag, not a payload", () => {
    const short = encodeRoomKey({ code: "ABC123", questions: DEFAULT_QUESTIONS });
    const long = encodeRoomKey({ code: "ABC123", questions: custom });
    expect(short.length).toBeLessThan(long.length);
    expect(short.length).toBeLessThan(60); // fits in any chat message
    expect(decodeRoomKey(short)?.questions).toEqual(DEFAULT_QUESTIONS);
  });

  it("produces a URL-safe key", () => {
    const key = encodeRoomKey({ code: "ABC123", questions: custom });
    expect(key).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(encodeURIComponent(key)).toBe(key);
  });
});

describe("decodeRoomKey rejects junk", () => {
  it("returns null for empty, malformed or truncated input", () => {
    expect(decodeRoomKey("")).toBeNull();
    expect(decodeRoomKey("   ")).toBeNull();
    expect(decodeRoomKey("ABC123")).toBeNull(); // a bare short code is not a key
    expect(decodeRoomKey("!!!not base64!!!")).toBeNull();
    const key = encodeRoomKey({ code: "ABC123", questions: custom });
    expect(decodeRoomKey(key.slice(0, key.length - 8))).toBeNull();
  });
  it("returns null for a key from a different version", () => {
    const wrongVersion = btoa(JSON.stringify({ v: 99, c: "ABC123", d: 1 }))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(decodeRoomKey(wrongVersion)).toBeNull();
  });
  it("returns null when a question is missing its answers", () => {
    const broken = btoa(JSON.stringify({ v: 1, c: "ABC123", q: [["prompt only", [], ""]] }))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(decodeRoomKey(broken)).toBeNull();
  });
});

describe("inviteLink / roomKeyFromInput", () => {
  const data = { code: "ABC123", questions: custom };

  it("builds a link the app can read back", () => {
    const link = inviteLink("https://genprix.vercel.app", data);
    expect(link.startsWith(`https://genprix.vercel.app/?${ROOM_KEY_PARAM}=`)).toBe(true);
    expect(roomKeyFromInput(link)?.code).toBe("ABC123");
  });
  it("accepts a pasted bare key as well as a full link", () => {
    expect(roomKeyFromInput(encodeRoomKey(data))?.code).toBe("ABC123");
  });
  it("ignores anything trailing the key in a pasted URL", () => {
    const link = inviteLink("https://genprix.vercel.app", data) + "&utm=x#top";
    expect(roomKeyFromInput(link)?.questions).toHaveLength(2);
  });
  it("returns null for a short code or noise, so the normal path still runs", () => {
    expect(roomKeyFromInput("ABC123")).toBeNull();
    expect(roomKeyFromInput("")).toBeNull();
  });
});
