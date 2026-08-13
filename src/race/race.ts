// Pure canvas drawing for the side-scroll race. No React here so it stays testable
// and the rAF loop in RaceCanvas can just call drawScene() each frame.
import { BRAND, hexA } from "../brand";

export type Fx = "idle" | "boost" | "skid";
export type Mood = "idle" | "happy" | "angry";

export interface SceneState {
  w: number;
  h: number;
  progress: number; // 0..1 (eased kart position from start to finish)
  fx: Fx;
  mood: Mood; // mochi's face: neutral / happy (correct) / angry (wrong)
  shake: number; // px magnitude
  mascot: HTMLCanvasElement | null;
  t: number; // seconds elapsed (for animation)
}

// Move `current` toward `target` frame-rate independently. Exported for testing.
export function easeProgress(current: number, target: number, dt: number, rate = 3): number {
  const k = Math.min(1, Math.max(0, dt * rate));
  const next = current + (target - current) * k;
  // snap when close to avoid infinite crawl
  return Math.abs(target - next) < 0.0005 ? target : next;
}

const CHECKPOINTS = 10;
const KART_START = 0.1;
const KART_END = 0.82;

export function drawScene(ctx: CanvasRenderingContext2D, s: SceneState): void {
  const { w, h, t } = s;
  ctx.save();
  if (s.shake > 0) {
    ctx.translate((Math.random() - 0.5) * s.shake, (Math.random() - 0.5) * s.shake);
  }

  drawSky(ctx, w, h, t);
  const groundY = h * 0.66;
  drawHills(ctx, w, h, groundY, t);
  drawGround(ctx, w, h, groundY, s.progress, t);
  drawCheckpoints(ctx, w, groundY, s.progress);
  drawFinish(ctx, w, groundY, t);

  const kartX = w * (KART_START + (KART_END - KART_START) * s.progress);
  const kartY = groundY + h * 0.06;
  drawKart(ctx, kartX, kartY, h / 520, s.mascot, s.fx, s.mood, t);

  ctx.restore();
}

function drawSky(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#0a0620");
  g.addColorStop(0.45, "#1a0b3a");
  g.addColorStop(1, "#2a0f52");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // sun glow
  const sunX = w * 0.72;
  const sunY = h * 0.28;
  const sg = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, h * 0.4);
  sg.addColorStop(0, hexA(BRAND.magenta, 0.5));
  sg.addColorStop(1, hexA(BRAND.magenta, 0));
  ctx.fillStyle = sg;
  ctx.fillRect(0, 0, w, h);

  // stars
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  for (let i = 0; i < 40; i++) {
    const x = (i * 97.13) % w;
    const y = ((i * 53.7) % (h * 0.5));
    const tw = 0.4 + 0.6 * Math.abs(Math.sin(t * 2 + i));
    ctx.globalAlpha = tw * 0.8;
    ctx.fillRect(x, y, 2, 2);
  }
  ctx.globalAlpha = 1;
}

function drawHills(ctx: CanvasRenderingContext2D, w: number, h: number, groundY: number, t: number) {
  // two parallax layers of rolling hills
  const layers = [
    { color: "#3a1470", amp: h * 0.08, base: groundY - h * 0.02, speed: 14, wl: w * 0.5 },
    { color: "#5a1f9e", amp: h * 0.05, base: groundY + h * 0.005, speed: 26, wl: w * 0.32 },
  ];
  for (const L of layers) {
    ctx.fillStyle = L.color;
    ctx.beginPath();
    ctx.moveTo(0, h);
    const off = (t * L.speed) % L.wl;
    for (let x = -off; x <= w + L.wl; x += 6) {
      const y = L.base - Math.abs(Math.sin((x / L.wl) * Math.PI)) * L.amp;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();
  }
}

function drawGround(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  groundY: number,
  progress: number,
  t: number,
) {
  ctx.fillStyle = "#141018";
  ctx.fillRect(0, groundY, w, h - groundY);
  // asphalt band
  const trackTop = groundY + h * 0.02;
  const trackH = h * 0.16;
  ctx.fillStyle = "#26222c";
  ctx.fillRect(0, trackTop, w, trackH);
  ctx.fillStyle = hexA("#000000", 0.35);
  ctx.fillRect(0, trackTop, w, 4);

  // scrolling center lane dashes (faster feel via progress + time)
  const midY = trackTop + trackH * 0.5;
  ctx.fillStyle = hexA(BRAND.amber, 0.85);
  const dash = 46;
  const gap = 40;
  const shift = ((t * 220 + progress * 1600) % (dash + gap));
  for (let x = -shift; x < w; x += dash + gap) {
    ctx.fillRect(x, midY - 3, dash, 6);
  }
}

function drawCheckpoints(ctx: CanvasRenderingContext2D, w: number, groundY: number, progress: number) {
  const reached = Math.round(progress * CHECKPOINTS);
  for (let i = 1; i <= CHECKPOINTS; i++) {
    const x = w * (KART_START + (KART_END - KART_START) * (i / CHECKPOINTS));
    const done = i <= reached;
    ctx.fillStyle = done ? BRAND.teal : hexA("#ffffff", 0.25);
    ctx.fillRect(x - 3, groundY - 34, 6, 34);
    ctx.beginPath();
    ctx.arc(x, groundY - 40, 7, 0, Math.PI * 2);
    ctx.fillStyle = done ? BRAND.green : hexA("#ffffff", 0.3);
    ctx.fill();
    ctx.fillStyle = hexA("#000", 0.6);
    ctx.font = "bold 10px 'Space Grotesk', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(String(i), x, groundY - 37);
  }
  ctx.textAlign = "left";
}

function drawFinish(ctx: CanvasRenderingContext2D, w: number, groundY: number, _t: number) {
  const x = w * 0.88;
  const top = groundY - 70;
  ctx.fillStyle = "#ddd";
  ctx.fillRect(x, top, 4, 70);
  // checkered flag
  const cols = 4;
  const rows = 3;
  const cw = 9;
  const ch = 9;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      ctx.fillStyle = (r + c) % 2 === 0 ? "#fff" : "#111";
      ctx.fillRect(x + 4 + c * cw, top + r * ch, cw, ch);
    }
  }
}

function drawKart(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  mascot: HTMLCanvasElement | null,
  fx: Fx,
  mood: Mood,
  t: number,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  if (fx === "skid" || mood === "angry") ctx.rotate(Math.sin(t * 40) * 0.05);
  // happy: a little celebratory hop
  if (mood === "happy") ctx.translate(0, -Math.abs(Math.sin(t * 9)) * 10);

  // boost speed lines behind
  if (fx === "boost") {
    ctx.strokeStyle = hexA(BRAND.teal, 0.8);
    ctx.lineWidth = 3;
    for (let i = 0; i < 6; i++) {
      const ly = -30 - i * 12 + (i % 2) * 6;
      const len = 60 + (i * 13 + t * 900) % 70;
      ctx.beginPath();
      ctx.moveTo(-70 - len, ly);
      ctx.lineTo(-70, ly);
      ctx.stroke();
    }
  }
  // skid smoke
  if (fx === "skid") {
    ctx.fillStyle = hexA("#cccccc", 0.5);
    for (let i = 0; i < 5; i++) {
      const r = 8 + (i * 5 + (t * 60) % 12);
      ctx.beginPath();
      ctx.arc(-70 - i * 14, -6 + Math.sin(i + t * 10) * 4, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ground shadow
  ctx.fillStyle = hexA("#000000", 0.4);
  ctx.beginPath();
  ctx.ellipse(0, 6, 70, 14, 0, 0, Math.PI * 2);
  ctx.fill();

  const wheel = (wx: number) => {
    ctx.save();
    ctx.translate(wx, 4);
    ctx.fillStyle = "#0b0b0b";
    ctx.beginPath();
    ctx.arc(0, 0, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.rotate(t * 12);
    ctx.fillStyle = BRAND.teal;
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#0b0b0b";
    ctx.fillRect(-2, -10, 4, 20);
    ctx.fillRect(-10, -2, 20, 4);
    ctx.restore();
  };
  wheel(-42);
  wheel(46);

  // exhaust flame on boost
  if (fx === "boost") {
    ctx.fillStyle = BRAND.amber;
    ctx.beginPath();
    ctx.moveTo(-64, -10);
    ctx.lineTo(-64, 2);
    ctx.lineTo(-64 - (18 + Math.sin(t * 30) * 8), -4);
    ctx.closePath();
    ctx.fill();
  }

  // chassis (chunky rounded body)
  roundRect(ctx, -66, -34, 128, 40, 16);
  const bg = ctx.createLinearGradient(0, -34, 0, 6);
  bg.addColorStop(0, BRAND.magenta);
  bg.addColorStop(1, BRAND.purple);
  ctx.fillStyle = bg;
  ctx.fill();
  // cobalt trim
  ctx.lineWidth = 4;
  ctx.strokeStyle = hexA("#000000", 0.5);
  ctx.stroke();

  // side pod / number panel
  ctx.fillStyle = BRAND.cobalt;
  roundRect(ctx, -24, -22, 48, 22, 8);
  ctx.fill();

  // rear spoiler
  ctx.fillStyle = "#111";
  ctx.fillRect(-72, -46, 12, 22);
  ctx.fillRect(-78, -50, 24, 8);

  // mood aura glow behind the mochi
  const headCx = 6;
  const headCy = -96;
  if (mood !== "idle") {
    const aura = mood === "happy" ? BRAND.green : BRAND.magenta;
    const gg = ctx.createRadialGradient(headCx, headCy, 4, headCx, headCy, 90);
    gg.addColorStop(0, hexA(aura, 0.55));
    gg.addColorStop(1, hexA(aura, 0));
    ctx.fillStyle = gg;
    ctx.beginPath();
    ctx.arc(headCx, headCy, 90, 0, Math.PI * 2);
    ctx.fill();
  }

  // seat the mascot above the chassis
  if (mascot) {
    const mh = 96;
    const mw = mascot.width * (mh / mascot.height);
    ctx.drawImage(mascot, -mw / 2 + headCx, -34 - mh + 10, mw, mh);
  } else {
    drawVectorMochi(ctx, headCx, -46);
  }

  // facial expression overlaid on the mochi's head + a floating reaction
  if (mood !== "idle") drawExpression(ctx, headCx, headCy - 6, mood, t);

  ctx.restore();
}

// Overlays eyes + mouth on the mochi face and pops a reaction icon above the head.
function drawExpression(ctx: CanvasRenderingContext2D, cx: number, cy: number, mood: Mood, t: number) {
  ctx.save();
  ctx.translate(cx, cy);
  const ink = mood === "happy" ? "#eafff4" : "#ffd7d7";
  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;
  ctx.lineWidth = 3.5;
  ctx.lineCap = "round";

  if (mood === "happy") {
    // ^ ^ eyes
    for (const ex of [-13, 13]) {
      ctx.beginPath();
      ctx.moveTo(ex - 6, 2);
      ctx.lineTo(ex, -6);
      ctx.lineTo(ex + 6, 2);
      ctx.stroke();
    }
    // big smile
    ctx.beginPath();
    ctx.arc(0, 6, 12, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
    // blush
    ctx.fillStyle = hexA("#ff7ac0", 0.6);
    for (const bx of [-22, 22]) {
      ctx.beginPath();
      ctx.ellipse(bx, 6, 5, 3.2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    // angry: slanted brows + squinting eyes
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(s * 6, -10);
      ctx.lineTo(s * 20, -3);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(s * 8, -1);
      ctx.lineTo(s * 18, 3);
      ctx.stroke();
    }
    // frown
    ctx.beginPath();
    ctx.arc(0, 18, 11, 1.15 * Math.PI, 1.85 * Math.PI);
    ctx.stroke();
  }

  // floating reaction icon, bobbing
  const bob = Math.sin(t * 6) * 3;
  ctx.font = "28px system-ui, 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(mood === "happy" ? "😄" : "😡", 34, -30 + bob);
  ctx.restore();
}

// Fallback mochi head if the sprite sheet fails to load.
function drawVectorMochi(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = "#f5f5f5";
  ctx.strokeStyle = "#111";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 0, 26, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // ears
  ctx.fillStyle = BRAND.purple;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(s * 10, -20);
    ctx.lineTo(s * 24, -40);
    ctx.lineTo(s * 26, -14);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  // visor
  ctx.fillStyle = "#0c2f3a";
  roundRect(ctx, -18, -6, 36, 16, 8);
  ctx.fill();
  ctx.fillStyle = BRAND.teal;
  ctx.fillRect(-12, -2, 6, 6);
  ctx.fillRect(6, -2, 6, 6);
  ctx.restore();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
