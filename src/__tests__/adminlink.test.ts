import { describe, it, expect, beforeEach } from "vitest";
import {
  LOCAL_ADMIN_PASSCODE,
  ROOM_EXPIRED_MSG,
  ROOM_TTL_MS,
  activeRoomLocal,
  adoptRoom,
  createRoomLocal,
  editedQuestionCount,
  inviteLinkLocal,
  isTypableCode,
  joinRoomLocal,
  localAdminUnlock,
  roomJoinError,
  shareCodeLocal,
  timeLeftOn,
} from "../data/rooms";
import { DEFAULT_QUESTIONS } from "../game/quiz";
import { codeIssuedAt, newRoomCode } from "../data/roomkey";
import type { AdminQuestion } from "../data/backend";

// Exactly what AdminPanel seeds its editor with.
const seeded = (): AdminQuestion[] =>
  DEFAULT_QUESTIONS.map((q) => ({
    id: q.id,
    prompt: q.prompt,
    accepted: q.accepted,
    hint: q.hint ?? "",
  }));

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

// Whatever this build was configured with; never hardcode a real passcode.
const PASS = LOCAL_ADMIN_PASSCODE;

beforeEach(() => {
  (globalThis as unknown as { localStorage: MemStorage }).localStorage = new MemStorage();
});

describe("the link a host actually gets from the admin panel", () => {
  it("is short when the questions were left alone", () => {
    const { code } = createRoomLocal(PASS, seeded());
    const link = inviteLinkLocal("https://genprix.vercel.app", code)!;
    expect(link.length).toBeLessThan(40);
  });

  // The reported bug: hosting a second round handed back a long link even
  // though nothing had been edited. The editor reloads the questions stored by
  // the previous room, and any room written by an older build carries that
  // build's wording — different text, so every question looked edited.
  it("stays short across rounds, and after a room written by an older build", () => {
    const first = createRoomLocal(PASS, seeded());
    expect(inviteLinkLocal("https://genprix.vercel.app", first.code)!.length).toBeLessThan(40);

    // Round two: the editor reloads what the previous room stored.
    const reloaded = localAdminUnlock(PASS);
    const second = createRoomLocal(PASS, reloaded);
    expect(inviteLinkLocal("https://genprix.vercel.app", second.code)!.length).toBeLessThan(40);
  });

  it("only pays for the questions the host really changed", () => {
    const edited = seeded();
    edited[2] = { ...edited[2], prompt: "A question of my own?", accepted: ["mine"] };
    const { code } = createRoomLocal(PASS, edited);
    const link = inviteLinkLocal("https://genprix.vercel.app", code)!;
    expect(link.length).toBeGreaterThan(40); // it has to travel
    expect(link.length).toBeLessThan(200); // but only that one question
  });
});

// Reproducing the report: the host presses "create room & get code" and still
// gets a long link. The editor reloads whatever the last room stored, and a room
// written by an older build carries that build's wording. Nothing looks edited
// to the host, but every reworded question is an edit as far as the link knows.
describe("a room left behind by an older build", () => {
  it("reads as an edit, and the host is told exactly how much it costs", () => {
    const stale = seeded();
    // The wording this project actually shipped before the copy pass.
    stale[0] = { ...stale[0], hint: 'Not "smart" — something cleverer.' };
    createRoomLocal(PASS, stale);

    const reloaded = localAdminUnlock(PASS);
    const { code } = createRoomLocal(PASS, reloaded);
    const link = inviteLinkLocal("https://genprix.vercel.app", code)!;

    // Nothing can tell an older build's wording apart from a deliberate edit, so
    // the text is kept and the link pays for it. What the host gets instead is a
    // count of what differs and one click back to the built-in set.
    expect(link.length).toBeGreaterThan(40);
    expect(editedQuestionCount(reloaded)).toBe(1);
    expect(editedQuestionCount(seeded())).toBe(0);
  });

  it("still keeps real edits when the questions were genuinely changed", () => {
    const mine = seeded();
    mine[1] = { ...mine[1], prompt: "My own question?", accepted: ["mine"] };
    createRoomLocal(PASS, mine);

    const reloaded = localAdminUnlock(PASS);
    expect(reloaded[1].prompt).toBe("My own question?");
    expect(reloaded[1].accepted).toEqual(["mine"]);
    expect(editedQuestionCount(reloaded)).toBe(1);
  });

  it("counts what a link would have to carry", () => {
    expect(editedQuestionCount(seeded())).toBe(0);
    const two = seeded();
    two[0] = { ...two[0], prompt: "changed one" };
    two[7] = { ...two[7], hint: "changed hint" };
    expect(editedQuestionCount(two)).toBe(2);
  });
});

// What the host asked for: a participant opens the site on their own phone and
// joins with nothing but a username and the code they were read out.
describe("joining on a fresh device with just a username and the code", () => {
  it("works when the host published the built-in questions", () => {
    const { code } = createRoomLocal(PASS, seeded());
    const shared = shareCodeLocal(code)!;
    expect(isTypableCode(shared)).toBe(true);
    expect(shared.length).toBeLessThanOrEqual(10); // readable down a phone line

    // A different device entirely: nothing in storage, never met the host.
    (globalThis as unknown as { localStorage: MemStorage }).localStorage = new MemStorage();
    expect(joinRoomLocal(shared, "guest")).toHaveLength(DEFAULT_QUESTIONS.length);
  });

  it("is case- and whitespace-forgiving, the way a typed code has to be", () => {
    const { code } = createRoomLocal(PASS, seeded());
    const shared = shareCodeLocal(code)!;
    (globalThis as unknown as { localStorage: MemStorage }).localStorage = new MemStorage();
    expect(joinRoomLocal(`  ${shared.toLowerCase()} `, "guest")).toHaveLength(
      DEFAULT_QUESTIONS.length,
    );
  });

  it("refuses a code nobody issued instead of starting a phantom game", () => {
    (globalThis as unknown as { localStorage: MemStorage }).localStorage = new MemStorage();
    expect(() => joinRoomLocal("0ZZZZZZ9ZZ", "guest")).toThrow();
    expect(() => joinRoomLocal("NOTACODE", "guest")).toThrow();
  });

  it("still needs the link once the host edits the questions", () => {
    const mine = seeded();
    mine[4] = { ...mine[4], prompt: "Something only my group knows?", accepted: ["yes"] };
    const { code } = createRoomLocal(PASS, mine);
    expect(isTypableCode(shareCodeLocal(code)!)).toBe(false);
  });
});

// Codes die 15 minutes after they are created, on every device, which is only
// possible because the code carries its own birth minute.
describe("a code expires 15 minutes after it was created", () => {
  it("carries its creation time, so a guest's device agrees on the deadline", () => {
    const now = Date.UTC(2026, 7, 17, 12, 0, 0);
    const code = newRoomCode(now);
    // Same minute, to the minute — that is the resolution codes are stored at.
    expect(codeIssuedAt(code)).toBe(now);
  });

  it("lets a player in before the deadline and refuses them after", () => {
    const { code } = createRoomLocal(PASS, seeded());
    const born = codeIssuedAt(code)!;
    const room = activeRoomLocal()!;

    expect(roomJoinError(room, code, "guest", born + 60_000)).toBeNull();
    expect(roomJoinError(room, code, "guest", born + ROOM_TTL_MS - 1000)).toBeNull();
    expect(roomJoinError(room, code, "guest", born + ROOM_TTL_MS)).toBe(ROOM_EXPIRED_MSG);
    expect(roomJoinError(room, code, "guest", born + 60 * 60_000)).toBe(ROOM_EXPIRED_MSG);
  });

  it("expires on a guest's device too, however late they first opened it", () => {
    const { code } = createRoomLocal(PASS, seeded());
    const born = codeIssuedAt(code)!;

    // A phone that has never seen this room, joining 20 minutes late.
    (globalThis as unknown as { localStorage: MemStorage }).localStorage = new MemStorage();
    const adopted = adoptRoom({ code, questions: DEFAULT_QUESTIONS })!;
    expect(timeLeftOn(adopted, born + 20 * 60_000)).toBe(0);
    expect(roomJoinError(adopted, code, "guest", born + 20 * 60_000)).toBe(ROOM_EXPIRED_MSG);
    // ...and still inside the window it would have been fine.
    expect(roomJoinError(adopted, code, "guest", born + 60_000)).toBeNull();
  });

  it("counts down from the full fifteen minutes at creation", () => {
    const { code } = createRoomLocal(PASS, seeded());
    const room = activeRoomLocal()!;
    const left = timeLeftOn(room, codeIssuedAt(code)!);
    expect(left).toBe(ROOM_TTL_MS);
  });
});
