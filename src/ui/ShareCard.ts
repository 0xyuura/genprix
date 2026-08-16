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

// Render a 1600x900 share card (finish-line scene + stats) and trigger a PNG download.
export async function downloadShareCard(data: ShareData): Promise<void> {
  const W = 1600;
  const H = 900;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  const mascot = await loadMascot();
  drawScene(ctx, { w: W, h: H, progress: 1, fx: "boost", mood: "happy", shake: 0, mascot, t: 0.2 });

  // dark scrim for legibility
  ctx.fillStyle = hexA("#000000", 0.42);
  ctx.fillRect(0, 0, W, H);

  // wordmark
  try {
    const wm = await loadImage("/brand/wordmark-white.png");
    const h = 54;
    ctx.drawImage(wm, 60, 54, wm.width * (h / wm.height), h);
  } catch {
    /* ignore */
  }

  ctx.fillStyle = BRAND.ceramic;
  ctx.font = "700 84px 'Space Grotesk', sans-serif";
  ctx.fillText("GenLayer Grand Prix", 60, 210);

  ctx.font = "600 44px 'Space Grotesk', sans-serif";
  ctx.fillStyle = BRAND.teal;
  ctx.fillText(`@${data.username}`, 62, 280);

  // big score
  ctx.font = "700 190px 'Space Grotesk', sans-serif";
  ctx.fillStyle = BRAND.magenta;
  ctx.fillText(data.score.toLocaleString(), 60, 500);
  ctx.font = "600 46px 'Space Grotesk', sans-serif";
  ctx.fillStyle = hexA(BRAND.ceramic, 0.85);
  ctx.fillText("points", 66, 552);

  // stat row
  const stat = (label: string, value: string, x: number) => {
    ctx.font = "700 60px 'Space Grotesk', sans-serif";
    ctx.fillStyle = BRAND.ceramic;
    ctx.fillText(value, x, 700);
    ctx.font = "500 30px 'Space Grotesk', sans-serif";
    ctx.fillStyle = hexA(BRAND.ceramic, 0.6);
    ctx.fillText(label, x, 742);
  };
  stat("CORRECT", `${data.correct}/10`, 62);
  stat("TIME", `${(data.totalMs / 1000).toFixed(1)}s`, 340);
  stat("TYPING", `${Math.round(data.wpm)} wpm`, 600);
  stat("ACCURACY", `${Math.round(data.accuracy * 100)}%`, 900);
  if (data.rank) stat("RANK", `#${data.rank}`, 1180);

  ctx.font = "500 30px 'Space Grotesk', sans-serif";
  ctx.fillStyle = hexA(BRAND.ceramic, 0.7);
  ctx.fillText("Play at GenLayer Grand Prix. Race the mochi, learn GenLayer.", 60, 840);

  const blob: Blob = await new Promise((res) => canvas.toBlob((b) => res(b!), "image/png"));
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `genlayer-grand-prix-${data.username}.png`;
  a.click();
  URL.revokeObjectURL(url);
}
