import { describe, it, expect, beforeEach } from "vitest";
import {
  BAD_CODE_MSG,
  NO_ROOM_MSG,
  ROOM_CAPACITY,
  ROOM_FULL_MSG,
  ROOM_REPLAY_MSG,
  adoptRoom,
  adoptRoomFromUrl,
  inviteLinkLocal,
  isRoomLive,
  joinRoomLocal,
  normalizeCode,
  roomJoinError,
  seatsLeft,
  withPlayer,
  type LocalRoom,
} from "../data/rooms";
import { ROOM_PATH, encodeRoomKey, newRoomCode } from "../data/roomkey";
import { DEFAULT_QUESTIONS } from "../game/quiz";

// A room made just now. "ABC123" predates codes carrying their own clock, so
// this also covers the fallback to the device's own record of when it appeared.
const room = (over: Partial<LocalRoom> = {}): LocalRoom => ({
  code: "ABC123",
  questions: [],
  players: [],
  createdAt: Date.now(),
  ...over,
});

/** A roster of n distinct names. */
const crowd = (n: number): string[] => Array.from({ length: n }, (_, i) => `racer${i}`);

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

  // The rule the host asked for: one code carries a whole crowd, not one player.
  it("lets a crowd share one code", () => {
    const r = room({ players: crowd(ROOM_CAPACITY - 1) });
    expect(roomJoinError(r, "ABC123", "last-one-in")).toBeNull();
    expect(isRoomLive(r)).toBe(true);
    expect(seatsLeft(r)).toBe(1);
  });
  it("refuses the player past the seat limit", () => {
    const full = room({ players: crowd(ROOM_CAPACITY) });
    expect(roomJoinError(full, "ABC123", "too-late")).toBe(ROOM_FULL_MSG);
    expect(isRoomLive(full)).toBe(false);
    expect(seatsLeft(full)).toBe(0);
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

// The bug this fixes: the host shares a room, the guest's device has never heard
// of it, and the start screen says "no game running". The invite link now carries
// the room, so a guest device can join with nothing but a username.
describe("a guest joining from an invite link", () => {
  class MemStorage {
    private m = new Map<string, string>();
    getItem(k: string) {
      return this.m.has(k) ? this.m.get(k)! : null;
    }
    setItem(k: string, v: string) {
      this.m.set(k, v);
    }
    clear() {
      this.m.clear();
    }
  }

  const hostCode = newRoomCode();
  const hostKey = () => encodeRoomKey({ code: hostCode, questions: DEFAULT_QUESTIONS });
  const hostPath = () => `${ROOM_PATH}${hostKey()}`;

  beforeEach(() => {
    // A brand-new device: empty storage, no room, nothing about the host.
    (globalThis as unknown as { localStorage: MemStorage }).localStorage = new MemStorage();
  });

  it("has no room at all before the link is opened", () => {
    expect(() => joinRoomLocal(hostCode, "guest")).toThrow(NO_ROOM_MSG);
  });

  it("adopts the room from the link and then joins on a username alone", () => {
    const adopted = adoptRoomFromUrl("", hostPath());
    expect(adopted?.code).toBe(hostCode);
    expect(isRoomLive(adopted!)).toBe(true);
    expect(joinRoomLocal(hostCode, "guest")).toHaveLength(DEFAULT_QUESTIONS.length);
  });

  it("also accepts the link pasted straight into the code box", () => {
    const link = `https://genprix.vercel.app${hostPath()}`;
    expect(joinRoomLocal(link, "guest")).toHaveLength(DEFAULT_QUESTIONS.length);
  });

  // The whole point of a shared code: one guest finishing must not lock the door
  // behind them. This is what changed when a code stopped being single-use.
  it("keeps the code working for the next player after one guest is done", () => {
    const link = `https://genprix.vercel.app${hostPath()}`;
    joinRoomLocal(link, "guest");
    expect(joinRoomLocal(link, "someone-else")).toHaveLength(DEFAULT_QUESTIONS.length);
    expect(joinRoomLocal(hostCode, "a-third-one")).toHaveLength(DEFAULT_QUESTIONS.length);
  });

  it("re-opening the link does not let a player who already raced go again", () => {
    const path = hostPath();
    adoptRoomFromUrl("", path);
    joinRoomLocal(hostCode, "guest");
    expect(adoptRoomFromUrl("", path)?.players).toEqual(["guest"]);
    expect(() => joinRoomLocal(hostCode, "guest")).toThrow(ROOM_REPLAY_MSG);
  });

  it("ignores a URL with no room key, leaving the normal path alone", () => {
    expect(adoptRoomFromUrl("?utm_source=x", "/")).toBeNull();
    expect(adoptRoom(null)).toBeNull();
  });

  it("hands the host a link that carries the room back out again", () => {
    adoptRoomFromUrl("", hostPath());
    const link = inviteLinkLocal("https://genprix.vercel.app", hostCode);
    expect(link).toContain(ROOM_PATH);
    expect(link!.length).toBeLessThan(45); // short enough to paste anywhere
    expect(inviteLinkLocal("https://genprix.vercel.app", "NOPE99")).toBeNull();
  });
});

describe("room lifecycle", () => {
  it("records a joining player without mutating the original", () => {
    const before = room();
    const after = withPlayer(before, "yuura");
    expect(before.players).toEqual([]);
    expect(after.players).toEqual(["yuura"]);
  });
  it("a finished run leaves the code open to everyone else", () => {
    const played = withPlayer(room(), "yuura");
    expect(roomJoinError(played, "ABC123", "someone-else")).toBeNull();
    expect(roomJoinError(played, "ABC123", "yuura")).toBe(ROOM_REPLAY_MSG);
  });
  it("seats a thousand racers one after another and then stops", () => {
    let r = room();
    for (const name of crowd(ROOM_CAPACITY)) {
      expect(roomJoinError(r, "ABC123", name)).toBeNull();
      r = withPlayer(r, name);
    }
    expect(r.players).toHaveLength(ROOM_CAPACITY);
    expect(roomJoinError(r, "ABC123", "one-too-many")).toBe(ROOM_FULL_MSG);
  });
});
