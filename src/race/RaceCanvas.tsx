import { memo, useEffect, useRef } from "react";
import { loadMascot, type MascotImage } from "../mascot";
import { drawScene, easeProgress, type Fx, type Mood } from "./race";

export interface FxEvent {
  id: number;
  type: "boost" | "skid";
}

interface Props {
  correctCount: number; // 0..10 -> drives progress
  fxEvent?: FxEvent | null;
  mood?: Mood; // mochi face: idle / happy / angry
  className?: string;
}

// Canvas host: owns the rAF loop, eases progress toward correctCount/10, and fires
// a transient boost/skid effect whenever fxEvent changes.
function RaceCanvas({ correctCount, fxEvent, mood = "idle", className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mascotRef = useRef<MascotImage | null>(null);
  const progressRef = useRef(0);
  const targetRef = useRef(0);
  const fxRef = useRef<Fx>("idle");
  const fxUntilRef = useRef(0);
  const shakeRef = useRef(0);
  const lastFxId = useRef<number>(-1);
  const moodRef = useRef<Mood>(mood);
  moodRef.current = mood;

  useEffect(() => {
    let alive = true;
    loadMascot().then((m) => {
      if (alive) mascotRef.current = m;
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    targetRef.current = Math.max(0, Math.min(1, correctCount / 10));
  }, [correctCount]);

  useEffect(() => {
    if (!fxEvent || fxEvent.id === lastFxId.current) return;
    lastFxId.current = fxEvent.id;
    fxRef.current = fxEvent.type;
    fxUntilRef.current = performance.now() + 750;
    shakeRef.current = fxEvent.type === "boost" ? 8 : 6;
  }, [fxEvent]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    let raf = 0;
    let last = performance.now();
    const start = last;

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      progressRef.current = easeProgress(progressRef.current, targetRef.current, dt);
      if (now > fxUntilRef.current) fxRef.current = "idle";
      shakeRef.current *= 0.85;
      if (shakeRef.current < 0.3) shakeRef.current = 0;

      const rect = canvas.getBoundingClientRect();
      drawScene(ctx, {
        w: rect.width,
        h: rect.height,
        progress: progressRef.current,
        fx: fxRef.current,
        mood: moodRef.current,
        shake: shakeRef.current,
        mascot: mascotRef.current,
        t: (now - start) / 1000,
      });
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={canvasRef} className={className} />;
}

export default memo(RaceCanvas);
