import { loadImage } from "./brand";

// Extract the front-facing mochi pose from the brand sheet and knock out the
// white/light background via an edge flood-fill, so it composites cleanly onto
// dark scenes. The mascot's white body is sealed by its black outline, so the
// fill (seeded from the crop's border) can't reach it.

// Crop box for the front pose within the 4000x2437 sheet.
const FRONT = { x: 150, y: 520, w: 1320, h: 1620 };

function isBg(r: number, g: number, b: number): boolean {
  const mn = Math.min(r, g, b);
  const mx = Math.max(r, g, b);
  return mn > 198 && mx - mn < 28;
}

function knockoutBackground(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d")!;
  const { width: w, height: h } = canvas;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const seen = new Uint8Array(w * h);
  const stack: number[] = [];
  const seed = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    stack.push(y * w + x);
  };
  for (let x = 0; x < w; x++) {
    seed(x, 0);
    seed(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    seed(0, y);
    seed(w - 1, y);
  }
  while (stack.length) {
    const p = stack.pop()!;
    if (seen[p]) continue;
    seen[p] = 1;
    const i = p * 4;
    if (!isBg(d[i], d[i + 1], d[i + 2])) continue;
    d[i + 3] = 0;
    const x = p % w;
    const y = (p - x) / w;
    if (x > 0) stack.push(p - 1);
    if (x < w - 1) stack.push(p + 1);
    if (y > 0) stack.push(p - w);
    if (y < h - 1) stack.push(p + w);
  }
  ctx.putImageData(img, 0, 0);
}

let cached: HTMLCanvasElement | null | undefined;

export async function loadMascot(): Promise<HTMLCanvasElement | null> {
  if (cached !== undefined) return cached;
  try {
    const sheet = await loadImage("/brand/mascot-sheet.png");
    const c = document.createElement("canvas");
    c.width = FRONT.w;
    c.height = FRONT.h;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(sheet, FRONT.x, FRONT.y, FRONT.w, FRONT.h, 0, 0, FRONT.w, FRONT.h);
    knockoutBackground(c);
    cached = c;
    return c;
  } catch {
    cached = null;
    return null;
  }
}
