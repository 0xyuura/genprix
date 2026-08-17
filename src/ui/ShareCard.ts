import { loadMascot } from "../mascot";
import { loadImage, BRAND, hexA } from "../brand";
import { drawScene } from "../race/race";

export interface ShareData {
  username: string;
  score: number;
  correct: number;
  totalMs: number;
  rank: number | null;
  wpm: number;
  accuracy: number; // 0..1
}

const DISPLAY = "'Chakra Petch', sans-serif";
const MONO = "'JetBrains Mono', monospace";

/** Trackside stencil label. */
function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number) {
  ctx.font = `700 26px ${DISPLAY}`;
  ctx.fillStyle = hexA(BRAND.ceramic, 0.45);
  ctx.fillText(spaced(text.toUpperCase()), x, y);
}

/** Letterspacing by hand: canvas has no letter-spacing in older browsers. */
const spaced = (s: string) => [...s].join(" ");

// Render a 1600x900 share card and trigger a PNG download. Laid out as a results
// sheet rather than text floated over a scrim: the scene is the top third, the
// classification sits on solid panel below it, where it stays readable when X
// shows the card at a couple of hundred pixels wide.
export async function downloadShareCard(data: ShareData): Promise<void> {
  const W = 1600;
  const H = 900;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // Without this the card can render in a fallback face, because the webfonts
  // are only guaranteed to be there once the document says so.
  try {
    await (document as Document & { fonts?: FontFaceSet }).fonts?.ready;
  } catch {
    /* ignore */
  }

  const mascot = await loadMascot();
  drawScene(ctx, { w: W, h: H * 0.62, progress: 1, fx: "boost", mood: "happy", shake: 0, mascot, t: 0.2 });

  // Chequered band across the very top.
  const cell = 22;
  for (let x = 0; x < W; x += cell) {
    for (let r = 0; r < 2; r++) {
      ctx.fillStyle = (Math.floor(x / cell) + r) % 2 === 0 ? "#f2f2f6" : "#101018";
      ctx.fillRect(x, r * cell, cell, cell);
    }
  }

  // The results panel: solid, with the kerb stripe along its top edge.
  const panelY = Math.round(H * 0.5);
  ctx.fillStyle = "#0e0e12";
  ctx.fillRect(0, panelY, W, H - panelY);
  const block = 42;
  for (let x = 0; x < W; x += block) {
    ctx.fillStyle = Math.floor(x / block) % 2 === 0 ? "#e6e6ea" : BRAND.red;
    ctx.fillRect(x, panelY - 9, block, 9);
  }

  // Wordmark, top left, over the scene.
  try {
    const wm = await loadImage("/brand/wordmark-white.png");
    const h = 46;
    ctx.drawImage(wm, 56, 78, wm.width * (h / wm.height), h);
  } catch {
    /* ignore */
  }

  const perfect = data.correct === 10;
  ctx.font = `700 56px ${DISPLAY}`;
  ctx.fillStyle = BRAND.ceramic;
  ctx.fillText(spaced(perfect ? "CLEAN SWEEP" : "CHEQUERED FLAG"), 56, panelY + 72);

  ctx.font = `500 40px ${MONO}`;
  ctx.fillStyle = BRAND.teal;
  ctx.fillText(`@${data.username}`, 58, panelY + 128);

  // Score, right-aligned against the panel edge so long numbers never collide
  // with the name on the left.
  label(ctx, "Final score", W - 56 - 340, panelY + 60);
  ctx.font = `700 132px ${MONO}`;
  ctx.fillStyle = BRAND.magenta;
  ctx.textAlign = "right";
  ctx.fillText(data.score.toLocaleString(), W - 56, panelY + 160);
  ctx.textAlign = "left";

  // Classification row, ruled off from the header above it.
  const rowY = panelY + 214;
  ctx.strokeStyle = "#26262f";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(56, rowY - 46);
  ctx.lineTo(W - 56, rowY - 46);
  ctx.stroke();

  const cols: [string, string][] = [
    ["Checkpoints", `${data.correct}/10`],
    ["Elapsed", `${(data.totalMs / 1000).toFixed(1)}s`],
    ["Speed", `${Math.round(data.wpm)} wpm`],
    ["Accuracy", `${Math.round(data.accuracy * 100)}%`],
  ];
  if (data.rank) cols.push(["Position", `P${data.rank}`]);

  const gap = (W - 112) / cols.length;
  cols.forEach(([l, v], i) => {
    const x = 56 + gap * i;
    label(ctx, l, x, rowY);
    ctx.font = `700 54px ${MONO}`;
    ctx.fillStyle = BRAND.ceramic;
    ctx.fillText(v, x, rowY + 60);
  });

  ctx.font = `500 28px ${MONO}`;
  ctx.fillStyle = hexA(BRAND.ceramic, 0.5);
  ctx.fillText("genprix.vercel.app", 56, H - 40);
  ctx.textAlign = "right";
  ctx.font = `700 28px ${DISPLAY}`;
  ctx.fillText(spaced("TEN QUESTIONS · TEN MINUTES"), W - 56, H - 40);
  ctx.textAlign = "left";

  const blob: Blob = await new Promise((res) => canvas.toBlob((b) => res(b!), "image/png"));
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `genlayer-grand-prix-${data.username}.png`;
  a.click();
  URL.revokeObjectURL(url);
}
