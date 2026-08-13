import { describe, it, expect } from "vitest";
import { drawScene, type Mood, type SceneState } from "../race/race";

// Minimal recording stub for CanvasRenderingContext2D: we only care about which
// drawing calls drawScene makes for each mood, not about pixel output.
function recordingCtx() {
  const calls: string[] = [];
  const texts: string[] = [];
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(target, prop: string) {
      if (prop === "__calls") return calls;
      if (prop === "__texts") return texts;
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
    set() {
      return true;
    },
  };
  return new Proxy({} as Record<string, unknown>, handler) as unknown as CanvasRenderingContext2D & {
    __calls: string[];
    __texts: string[];
  };
}

const scene = (mood: Mood): SceneState => ({
  w: 800,
  h: 350,
  progress: 0.3,
  fx: "idle",
  mood,
  shake: 0,
  mascot: null,
  t: 0.5,
});

describe("drawScene mood expressions", () => {
  it("draws no reaction emoji when idle", () => {
    const ctx = recordingCtx();
    drawScene(ctx, scene("idle"));
    expect(ctx.__texts).not.toContain("😄");
    expect(ctx.__texts).not.toContain("😡");
  });

  it("draws the happy face on a correct answer", () => {
    const ctx = recordingCtx();
    drawScene(ctx, scene("happy"));
    expect(ctx.__texts).toContain("😄");
    expect(ctx.__texts).not.toContain("😡");
  });

  it("draws the angry face on a wrong answer", () => {
    const ctx = recordingCtx();
    drawScene(ctx, scene("angry"));
    expect(ctx.__texts).toContain("😡");
    expect(ctx.__texts).not.toContain("😄");
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
