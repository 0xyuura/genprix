import { describe, it, expect, beforeEach } from "vitest";
import {
  BAD_CODE_MSG,
  NO_ROOM_MSG,
  ROOM_REPLAY_MSG,
  ROOM_USED_MSG,
  adoptRoom,
  adoptRoomFromUrl,
  closeRoomLocal,
  closedRoom,
  inviteLinkLocal,
  joinRoomLocal,
  normalizeCode,
  roomJoinError,
  withPlayer,
  type LocalRoom,
} from "../data/rooms";
import { ROOM_PATH, encodeRoomKey } from "../data/roomkey";
import { DEFAULT_QUESTIONS } from "../game/quiz";

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

  const hostKey = () => encodeRoomKey({ code: "ABC123", questions: DEFAULT_QUESTIONS });
  const hostPath = () => `${ROOM_PATH}${hostKey()}`;

  beforeEach(() => {
    // A brand-new device: empty storage, no room, nothing about the host.
    (globalThis as unknown as { localStorage: MemStorage }).localStorage = new MemStorage();
  });

  it("has no room at all before the link is opened", () => {
    expect(() => joinRoomLocal("ABC123", "guest")).toThrow(NO_ROOM_MSG);
  });

  it("adopts the room from the link and then joins on a username alone", () => {
    const adopted = adoptRoomFromUrl("", hostPath());
    expect(adopted?.code).toBe("ABC123");
    expect(adopted?.status).toBe("open");
    expect(joinRoomLocal("ABC123", "guest")).toHaveLength(DEFAULT_QUESTIONS.length);
  });

  it("also accepts the link pasted straight into the code box", () => {
    const link = `https://genprix.vercel.app${hostPath()}`;
    expect(joinRoomLocal(link, "guest")).toHaveLength(DEFAULT_QUESTIONS.length);
  });

  it("burns the code for a guest who joined by link, not just by code", () => {
    const link = `https://genprix.vercel.app${hostPath()}`;
    joinRoomLocal(link, "guest");
    closeRoomLocal(link); // the run ends; useGame passes back whatever was joined with
    expect(() => joinRoomLocal(link, "someone-else")).toThrow(ROOM_USED_MSG);
  });

  it("re-opening the link does not resurrect a code this device already played", () => {
    const path = hostPath();
    adoptRoomFromUrl("", path);
    joinRoomLocal("ABC123", "guest");
    closeRoomLocal("ABC123");
    expect(adoptRoomFromUrl("", path)?.status).toBe("done");
    expect(() => joinRoomLocal("ABC123", "guest")).toThrow(ROOM_USED_MSG);
  });

  it("ignores a URL with no room key, leaving the normal path alone", () => {
    expect(adoptRoomFromUrl("?utm_source=x", "/")).toBeNull();
    expect(adoptRoom(null)).toBeNull();
  });

  it("hands the host a link that carries the room back out again", () => {
    adoptRoomFromUrl("", hostPath());
    const link = inviteLinkLocal("https://genprix.vercel.app", "ABC123");
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
