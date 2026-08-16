import { describe, it, expect } from "vitest";
import {
  BAD_CODE_MSG,
  NO_ROOM_MSG,
  ROOM_REPLAY_MSG,
  ROOM_USED_MSG,
  closedRoom,
  normalizeCode,
  roomJoinError,
  withPlayer,
  type LocalRoom,
} from "../data/rooms";

const room = (over: Partial<LocalRoom> = {}): LocalRoom => ({
  code: "ABC123",
  questions: [],
  status: "open",
  players: [],
  createdAt: 0,
  ...over,
});

describe("normalizeCode", () => {
  it("uppercases and trims", () => {
    expect(normalizeCode("  abc123 ")).toBe("ABC123");
  });
  it("survives empty input", () => {
    expect(normalizeCode("")).toBe("");
  });
});

describe("roomJoinError", () => {
  it("allows the first join of an open room", () => {
    expect(roomJoinError(room(), "ABC123", "yuura")).toBeNull();
  });
  it("accepts a lowercase / padded code", () => {
    expect(roomJoinError(room(), " abc123 ", "yuura")).toBeNull();
  });
  it("refuses when no room exists", () => {
    expect(roomJoinError(null, "ABC123", "yuura")).toBe(NO_ROOM_MSG);
  });
  it("refuses a wrong code", () => {
    expect(roomJoinError(room(), "ZZZ999", "yuura")).toBe(BAD_CODE_MSG);
  });

  // The rule the host asked for: one code hosts exactly one game.
  it("refuses a code whose game already finished", () => {
    expect(roomJoinError(room({ status: "done" }), "ABC123", "yuura")).toBe(ROOM_USED_MSG);
  });
  it("refuses a second run by the same player, even while the room is open", () => {
    expect(roomJoinError(room({ players: ["yuura"] }), "ABC123", "yuura")).toBe(ROOM_REPLAY_MSG);
  });
  it("matches returning players case- and whitespace-insensitively", () => {
    expect(roomJoinError(room({ players: ["Yuura"] }), "ABC123", "  yUUra ")).toBe(
      ROOM_REPLAY_MSG,
    );
  });
});

describe("room lifecycle", () => {
  it("records a joining player without mutating the original", () => {
    const before = room();
    const after = withPlayer(before, "yuura");
    expect(before.players).toEqual([]);
    expect(after.players).toEqual(["yuura"]);
  });
  it("a finished run burns the code for everyone", () => {
    const played = closedRoom(withPlayer(room(), "yuura"));
    expect(played.status).toBe("done");
    expect(roomJoinError(played, "ABC123", "someone-else")).toBe(ROOM_USED_MSG);
  });
  it("a full round trip cannot produce a second game", () => {
    let r = room();
    expect(roomJoinError(r, "ABC123", "yuura")).toBeNull(); // round 1 starts
    r = withPlayer(r, "yuura");
    r = closedRoom(r); // run ends
    expect(roomJoinError(r, "ABC123", "yuura")).toBe(ROOM_USED_MSG); // round 2 blocked
  });
});
