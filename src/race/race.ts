// Pure canvas drawing for the side-scroll race. No React here so it stays testable
// and the rAF loop in RaceCanvas can just call drawScene() each frame.
import { BRAND, hexA } from "../brand";
import type { MascotImage } from "../mascot";

export type Fx = "idle" | "boost" | "skid";
export type Mood = "idle" | "happy" | "angry";

export interface SceneState {
  w: number;
  h: number;
  progress: number; // 0..1 (eased kart position from start to finish)
  fx: Fx;
  mood: Mood; // mochi's face: neutral / happy (correct) / angry (wrong)
  shake: number; // px magnitude
  mascot: MascotImage | null;
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
  // Sits lower than it used to: at 0.66 a third of the frame was empty run-off
  // under the kart, which just read as a dead black band.
  const groundY = h * 0.7;
  drawHills(ctx, w, h, groundY, t);
  drawGround(ctx, w, h, groundY, s.progress, t);
  drawCheckpoints(ctx, w, h, groundY, s.progress);
  drawFinish(ctx, w, h, groundY);

  const kartX = w * (KART_START + (KART_END - KART_START) * s.progress);
  const kartY = groundY + h * 0.06;
  drawKart(ctx, kartX, kartY, h / 520, s.mascot, s.fx, s.mood, t);

  ctx.restore();
}

function drawSky(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
  // A night circuit, not a synthwave poster. The purple-to-magenta sky with a
  // radial sun in it was the most generic thing on the screen; what makes a
  // racetrack look like a racetrack is floodlights, a full grandstand and a
  // barrier, so the budget goes there instead.
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#06060c");
  g.addColorStop(1, "#0d0d18");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // stars, dimmer than before so the floodlights are the brightest thing
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  for (let i = 0; i < 28; i++) {
    const x = (i * 97.13) % w;
    const y = (i * 53.7) % (h * 0.42);
    ctx.globalAlpha = (0.3 + 0.5 * Math.abs(Math.sin(t * 1.6 + i))) * 0.7;
    ctx.fillRect(x, y, 2, 2);
  }
  ctx.globalAlpha = 1;

  drawFloodlights(ctx, w, h, t);
}

/** Lighting masts behind the grandstand, each throwing a soft cone downward. */
function drawFloodlights(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
  const masts = [0.16, 0.46, 0.79];
  masts.forEach((fx, i) => {
    const x = w * fx;
    const headY = h * 0.1;
    const footY = h * 0.6;
    // Mains hum: each mast sits at its own brightness and drifts a little.
    const lit = 0.72 + 0.1 * Math.sin(t * 2.3 + i * 2.1);

    // cone of light
    const cone = ctx.createLinearGradient(x, headY, x, footY);
    cone.addColorStop(0, hexA("#cfe8ff", 0.1 * lit));
    cone.addColorStop(1, hexA("#cfe8ff", 0));
    ctx.fillStyle = cone;
    ctx.beginPath();
    ctx.moveTo(x - 8, headY);
    ctx.lineTo(x + 8, headY);
    ctx.lineTo(x + h * 0.16, footY);
    ctx.lineTo(x - h * 0.16, footY);
    ctx.closePath();
    ctx.fill();

    // mast
    ctx.strokeStyle = "#1b1b26";
    ctx.lineWidth = Math.max(2, h * 0.008);
    ctx.beginPath();
    ctx.moveTo(x, headY);
    ctx.lineTo(x, footY);
    ctx.stroke();

    // lamp bank: two rows of small squares
    const lw = Math.max(3, h * 0.014);
    for (let r = 0; r < 2; r++) {
      for (let c = -2; c <= 2; c++) {
        ctx.fillStyle = hexA("#f2f8ff", lit);
        ctx.fillRect(x + c * (lw + 1.5) - lw / 2, headY - lw * (2 - r) - 2, lw, lw);
      }
    }
  });
}

/**
 * Grandstand and barrier. Replaces the two layers of purple hills: a venue with
 * a crowd in it does more for "this is a race" than scenery does, and the seats
 * give the scene something that moves without anything having to scroll fast.
 */
function drawHills(ctx: CanvasRenderingContext2D, w: number, h: number, groundY: number, t: number) {
  // The stand has to finish well clear of the asphalt: the barrier and the kerb
  // are both red-and-white, so if they touch they read as one striped smear.
  const standTop = groundY - h * 0.46;
  const standBottom = groundY - h * 0.21;
  const roofDrop = h * 0.05; // the rake, left side higher than right

  ctx.fillStyle = "#12121c";
  ctx.beginPath();
  ctx.moveTo(0, standBottom);
  ctx.lineTo(0, standTop + roofDrop);
  ctx.lineTo(w, standTop);
  ctx.lineTo(w, standBottom);
  ctx.closePath();
  ctx.fill();

  // Roof edge and the pillars holding it up. Structure is what separates a
  // grandstand from a dark rectangle.
  ctx.strokeStyle = "#262636";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, standTop + roofDrop);
  ctx.lineTo(w, standTop);
  ctx.stroke();
  ctx.strokeStyle = "#1a1a26";
  ctx.lineWidth = Math.max(2, w / 300);
  for (let i = 1; i < 6; i++) {
    const x = (w / 6) * i;
    ctx.beginPath();
    ctx.moveTo(x, standTop + roofDrop * (1 - x / w));
    ctx.lineTo(x, standBottom);
    ctx.stroke();
  }

  // The crowd: dense enough to read as people. Each seat catches the light at
  // its own moment, which is the only thing in the scene that moves when the
  // kart is standing still.
  const rows = 10;
  const step = Math.max(5, w / 112);
  for (let r = 0; r < rows; r++) {
    const rowT = r / (rows - 1);
    for (let c = 0; c * step < w; c++) {
      const x = c * step + (r % 2) * (step / 2);
      const top = standTop + roofDrop * (1 - x / w);
      const y = top + (standBottom - top) * (0.16 + rowT * 0.78);
      const seed = (c * 13 + r * 7) % 19;
      const flick = 0.35 + 0.65 * Math.abs(Math.sin(t * 1.1 + seed));
      // A few in GenLayer colours; the rest pale, like a night crowd.
      const tone = seed % 8 === 0 ? BRAND.teal : seed % 11 === 0 ? BRAND.magenta : "#9a9ab2";
      ctx.fillStyle = hexA(tone, 0.16 + flick * 0.34);
      ctx.fillRect(x, y, 2, 2);
    }
  }

  // Trackside barrier, hung on the front of the stand: white panels with red
  // ends on a teal rail. It drifts slowly, so it parallaxes against the kerb.
  const barH = Math.max(7, h * 0.032);
  const barY = standBottom;
  const seg = Math.max(30, w / 13);
  const shift = (t * 8) % (seg * 2);
  for (let x = -shift; x < w + seg; x += seg) {
    ctx.fillStyle = Math.floor((x + shift) / seg) % 2 === 0 ? "#d8d8de" : BRAND.red;
    ctx.fillRect(x, barY, seg - 2, barH);
  }
  ctx.fillStyle = hexA(BRAND.teal, 0.7);
  ctx.fillRect(0, barY - 2, w, 2);
  // A shadow under the barrier so the checkpoints in front of it read as nearer.
  const sh = ctx.createLinearGradient(0, barY + barH, 0, barY + barH + h * 0.06);
  sh.addColorStop(0, hexA("#000000", 0.55));
  sh.addColorStop(1, hexA("#000000", 0));
  ctx.fillStyle = sh;
  ctx.fillRect(0, barY + barH, w, h * 0.06);
}

function drawGround(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  groundY: number,
  progress: number,
  t: number,
) {
  // run-off, then the asphalt
  ctx.fillStyle = "#0b0b10";
  ctx.fillRect(0, groundY, w, h - groundY);
  const trackTop = groundY + h * 0.02;
  const trackH = h * 0.2;
  ctx.fillStyle = "#1b1b21";
  ctx.fillRect(0, trackTop, w, trackH);

  // Kerb along the top edge of the asphalt: the red-and-white blocks are the
  // single most recognisable marking on any circuit, and they scroll, which is
  // where most of the sense of speed comes from.
  const kerbH = Math.max(4, h * 0.013);
  const block = Math.max(16, w / 26);
  const kShift = (t * 120 + progress * 900) % (block * 2);
  for (let x = -kShift; x < w + block; x += block) {
    ctx.fillStyle = Math.floor((x + kShift) / block) % 2 === 0 ? "#e6e6ea" : BRAND.red;
    ctx.fillRect(x, trackTop - kerbH, block, kerbH);
  }
  ctx.fillStyle = hexA("#000000", 0.4);
  ctx.fillRect(0, trackTop, w, 3);

  // scrolling centre line (faster feel via progress + time)
  const midY = trackTop + trackH * 0.55;
  ctx.fillStyle = hexA("#e9e9ef", 0.8);
  const dash = 46;
  const gap = 40;
  const shift = (t * 220 + progress * 1600) % (dash + gap);
  for (let x = -shift; x < w; x += dash + gap) {
    ctx.fillRect(x, midY - 2.5, dash, 5);
  }
}

/**
 * Marshal posts, one per question. Sized off the canvas height like everything
 * else in the scene: when these were fixed pixels they collided with the barrier
 * at small sizes and floated free of the track at large ones.
 */
function drawCheckpoints(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  groundY: number,
  progress: number,
) {
  const reached = Math.round(progress * CHECKPOINTS);
  const poleH = h * 0.1;
  const r = Math.max(6, h * 0.024);
  for (let i = 1; i <= CHECKPOINTS; i++) {
    const x = w * (KART_START + (KART_END - KART_START) * (i / CHECKPOINTS));
    const done = i <= reached;
    ctx.fillStyle = done ? BRAND.teal : hexA("#ffffff", 0.22);
    ctx.fillRect(x - 2, groundY - poleH, 4, poleH);
    ctx.beginPath();
    ctx.arc(x, groundY - poleH - r * 0.7, r, 0, Math.PI * 2);
    ctx.fillStyle = done ? BRAND.green : "#20202c";
    ctx.fill();
    ctx.strokeStyle = done ? hexA("#000000", 0.5) : hexA("#ffffff", 0.28);
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = done ? hexA("#000000", 0.7) : hexA("#ffffff", 0.5);
    ctx.font = `bold ${Math.round(r * 1.15)}px 'Chakra Petch', sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(i), x, groundY - poleH - r * 0.7 + 0.5);
  }
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
}

/** The finish gantry: a post with the chequered board bolted to it. */
function drawFinish(ctx: CanvasRenderingContext2D, w: number, h: number, groundY: number) {
  const x = w * 0.9;
  const postH = h * 0.19;
  const top = groundY - postH;
  ctx.fillStyle = "#d8d8de";
  ctx.fillRect(x, top, Math.max(3, h * 0.009), postH);

  const cell = Math.max(6, h * 0.026);
  const cols = 4;
  const rows = 3;
  for (let rr = 0; rr < rows; rr++) {
    for (let c = 0; c < cols; c++) {
      ctx.fillStyle = (rr + c) % 2 === 0 ? "#f2f2f6" : "#101018";
      ctx.fillRect(x + Math.max(3, h * 0.009) + c * cell, top + rr * cell, cell, cell);
    }
  }
  ctx.strokeStyle = hexA("#000000", 0.5);
  ctx.lineWidth = 1;
  ctx.strokeRect(x + Math.max(3, h * 0.009), top, cell * cols, cell * rows);
}

function drawKart(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  mascot: MascotImage | null,
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

  // A marshal's flag rather than an emoji: green when the answer landed, yellow
  // when it did not. Emoji render as a different picture on every OS, which is
  // the last thing you want as the game's one piece of feedback.
  const bob = Math.sin(t * 6) * 3;
  const fy = -34 + bob;
  ctx.save();
  ctx.strokeStyle = "#e9e9ef";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(40, fy + 26);
  ctx.lineTo(40, fy - 8);
  ctx.stroke();
  ctx.fillStyle = mood === "happy" ? BRAND.green : BRAND.amber;
  ctx.beginPath();
  ctx.moveTo(41, fy - 8);
  // a wave in the cloth, so the flag looks held up rather than pasted on
  ctx.quadraticCurveTo(56, fy - 4 + Math.sin(t * 9) * 3, 70, fy - 7);
  ctx.lineTo(70, fy + 9);
  ctx.quadraticCurveTo(56, fy + 12 + Math.sin(t * 9) * 3, 41, fy + 8);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
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
