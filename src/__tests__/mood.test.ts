import { describe, it, expect } from "vitest";
import { drawScene, type Mood, type SceneState } from "../race/race";

// Minimal recording stub for CanvasRenderingContext2D: we only care about which
// drawing calls drawScene makes for each mood, not about pixel output.
function recordingCtx() {
  const calls: string[] = [];
  const texts: string[] = [];
  const fills: string[] = [];
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(target, prop: string) {
      if (prop === "__calls") return calls;
      if (prop === "__texts") return texts;
      if (prop === "__fills") return fills;
      if (prop === "canvas") return { width: 800, height: 350 };
      // Gradient objects need addColorStop
      if (prop === "createLinearGradient" || prop === "createRadialGradient") {
        return (...__args: unknown[]) => {
          calls.push(prop);
          return { addColorStop: () => {} };
        };
      }
      if (prop === "measureText") return () => ({ width: 10 });
      if (prop in target) return target[prop];
      return (...args: unknown[]) => {
        calls.push(prop);
        if (prop === "fillText") texts.push(String(args[0]));
      };
    },
    set(_target, prop: string, value: unknown) {
      // Colours are the assertion for the marshal's flag, so they have to be kept.
      if (prop === "fillStyle" && typeof value === "string") fills.push(value.toUpperCase());
      return true;
    },
  };
  return new Proxy({} as Record<string, unknown>, handler) as unknown as CanvasRenderingContext2D & {
    __calls: string[];
    __texts: string[];
    __fills: string[];
  };
}

const scene = (mood: Mood, progress = 0.3): SceneState => ({
  w: 800,
  h: 350,
  progress,
  fx: "idle",
  mood,
  shake: 0,
  mascot: null,
  t: 0.5,
});

// The reaction is a marshal's flag drawn with quadraticCurveTo (the wave in the
// cloth) and filled green or amber. It used to be an emoji drawn with fillText,
// which rendered as a different picture on every platform.
const GREEN = "#00FF66";
const AMBER = "#F5C542";
const flagStrokes = (calls: string[]) => calls.filter((c) => c === "quadraticCurveTo").length;
// Progress 0, so no checkpoint marker has turned green yet: with an empty board
// the only thing that can paint green or amber is the flag itself.
const atStart = (mood: Mood) => scene(mood, 0);

describe("drawScene mood expressions", () => {
  it("flies no flag when idle", () => {
    const ctx = recordingCtx();
    drawScene(ctx, atStart("idle"));
    expect(flagStrokes(ctx.__calls)).toBe(0);
    expect(ctx.__fills).not.toContain(GREEN);
    expect(ctx.__fills).not.toContain(AMBER);
  });

  it("flies a green flag on a correct answer", () => {
    const ctx = recordingCtx();
    drawScene(ctx, atStart("happy"));
    expect(flagStrokes(ctx.__calls)).toBeGreaterThan(0);
    expect(ctx.__fills).toContain(GREEN);
    expect(ctx.__fills).not.toContain(AMBER);
  });

  it("flies an amber flag on a wrong answer", () => {
    const ctx = recordingCtx();
    drawScene(ctx, atStart("angry"));
    expect(flagStrokes(ctx.__calls)).toBeGreaterThan(0);
    expect(ctx.__fills).toContain(AMBER);
    expect(ctx.__fills).not.toContain(GREEN);
  });

  // No emoji anywhere in the scene, whatever the mood.
  it("never draws an emoji", () => {
    for (const mood of ["idle", "happy", "angry"] as Mood[]) {
      const ctx = recordingCtx();
      drawScene(ctx, scene(mood));
      const emoji = ctx.__texts.filter((t) => /\p{Extended_Pictographic}/u.test(t));
      expect(emoji).toEqual([]);
    }
  });

  it("adds a mood aura (radial gradient) only when a mood is active", () => {
    const idle = recordingCtx();
    drawScene(idle, scene("idle"));
    const happy = recordingCtx();
    drawScene(happy, scene("happy"));
    const count = (c: string[]) => c.filter((x) => x === "createRadialGradient").length;
    expect(count(happy.__calls)).toBeGreaterThan(count(idle.__calls));
  });
});
