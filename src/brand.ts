// GenLayer brand system — palette + asset loaders (adapted from genlayer-banner-studio).

export const BRAND = {
  cobalt: "#110FFF",
  void: "#070707",
  magenta: "#E63BD3",
  purple: "#7A2BF5",
  teal: "#2FE1D6",
  green: "#00FF66",
  amber: "#F5C542",
  red: "#FF3B4E",
  ceramic: "#F5F5F5",
  chassis: "#CACACA",
  asphalt: "#606060",
} as const;

export function hexA(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

// HSL helper for the username-hashed avatar tint.
export function hsl(h: number, s: number, l: number): string {
  return `hsl(${h % 360}, ${s}%, ${l}%)`;
}

// Load a same-origin brand image (kept in /public/brand, so canvas stays untainted).
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// One cached film-grain tile, drawn at low alpha to kill flat-gradient banding.
let grainTile: HTMLCanvasElement | null = null;
export function grain(): HTMLCanvasElement {
  if (grainTile) return grainTile;
  const n = 160;
  const c = document.createElement("canvas");
  c.width = n;
  c.height = n;
  const g = c.getContext("2d")!;
  const data = g.createImageData(n, n);
  for (let i = 0; i < data.data.length; i += 4) {
    const v = Math.random() * 255;
    data.data[i] = data.data[i + 1] = data.data[i + 2] = v;
    data.data[i + 3] = 255;
  }
  g.putImageData(data, 0, 0);
  grainTile = c;
  return c;
}
