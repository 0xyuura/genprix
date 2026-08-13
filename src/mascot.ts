import { loadImage } from "./brand";

// The kart mascot is a pre-baked sprite (see tools/bake-mascot.md). It used to be
// cropped out of the 1.1 MB brand sheet at runtime and then flood-filled to knock
// out the background — 1.1 MB down the wire plus ~176 ms of main-thread work per
// visitor. The sheet already ships an alpha channel, so the knockout never removed
// a single pixel; baking the crop at 264x320 once turns all of that into a 22 KB
// image decode the browser does off the main thread.

export type MascotImage = HTMLImageElement | HTMLCanvasElement;

// WebP first (22 KB), PNG for anything that can't decode it (69 KB).
const SOURCES = ["/brand/mochi-kart.webp", "/brand/mochi-kart.png"];

let pending: Promise<MascotImage | null> | null = null;

export function loadMascot(): Promise<MascotImage | null> {
  // Cache the promise, not just the result: RaceCanvas and ShareCard can both ask
  // before the first load settles, and neither should trigger a second fetch.
  if (!pending) {
    pending = (async () => {
      for (const src of SOURCES) {
        try {
          return await loadImage(src);
        } catch {
          /* try the next format */
        }
      }
      return null; // race.ts falls back to the vector mochi
    })();
  }
  return pending;
}
