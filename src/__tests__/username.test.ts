import { describe, it, expect } from "vitest";
import { sanitizeUsername, avatarSeed, isValidUsername } from "../game/username";

describe("sanitizeUsername", () => {
  it("strips HTML tags but keeps inner text, trims + collapses spaces", () => {
    expect(sanitizeUsername("  <b>Racer</b>  ")).toBe("Racer");
  });
  it("removes script tags entirely", () => {
    expect(sanitizeUsername("<script>x</script>Mochi")).toBe("xMochi");
  });
  it("caps at 20 characters", () => {
    expect(sanitizeUsername("x".repeat(30))).toHaveLength(20);
  });
});

describe("isValidUsername", () => {
  it("rejects too short", () => {
    expect(isValidUsername("a")).toBe(false);
  });
  it("accepts a normal name", () => {
    expect(isValidUsername("ok")).toBe(true);
  });
  it("accepts exactly 20 chars", () => {
    expect(isValidUsername("x".repeat(20))).toBe(true);
  });
});

describe("avatarSeed", () => {
  it("is deterministic", () => {
    expect(avatarSeed("mochi")).toBe(avatarSeed("mochi"));
  });
  it("differs for different names", () => {
    expect(avatarSeed("mochi")).not.toBe(avatarSeed("racer"));
  });
});
