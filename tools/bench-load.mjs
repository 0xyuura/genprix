// Concurrency probe for the static bundle: simulates N cold visitors fetching
// the asset set a real first load pulls, and reports latency percentiles.
// Assets are discovered from dist/index.html so the numbers can't go stale when
// the bundle hash changes.
import { readFile } from "node:fs/promises";

const BASE = process.argv[2] || "http://127.0.0.1:5210";
const USERS = Number(process.argv[3] || 200);

const html = await readFile(new URL("../dist/index.html", import.meta.url), "utf8");
const refs = [...html.matchAll(/(?:href|src)="(\/[^"]+)"/g)].map((m) => m[1]);
// Fetched by React/canvas at first paint, so not referenced as a tag in index.html.
const RUNTIME = ["/brand/mochi-kart.webp", "/brand/wordmark-white.png"];
const ASSETS = ["/", ...new Set([...refs, ...RUNTIME])].filter(
  (a) => !a.startsWith("//") && !a.startsWith("http"),
);

async function visitor() {
  const t0 = performance.now();
  let bytes = 0;
  for (const a of ASSETS) {
    const r = await fetch(BASE + a, { headers: { "accept-encoding": "gzip" } });
    bytes += (await r.arrayBuffer()).byteLength;
  }
  return { ms: performance.now() - t0, bytes };
}

const start = performance.now();
const results = await Promise.all(Array.from({ length: USERS }, visitor));
const wall = performance.now() - start;

const times = results.map((r) => r.ms).sort((a, b) => a - b);
const pct = (p) => times[Math.min(times.length - 1, Math.floor(times.length * p))];
const mb = results[0].bytes / 1024 / 1024;

console.log(
  JSON.stringify(
    {
      assets: ASSETS,
      concurrentVisitors: USERS,
      perVisitorMB: +mb.toFixed(3),
      totalMB: +(mb * USERS).toFixed(1),
      wallClockSec: +(wall / 1000).toFixed(2),
      visitorsPerSec: +(USERS / (wall / 1000)).toFixed(1),
      latencyMs: {
        p50: Math.round(pct(0.5)),
        p95: Math.round(pct(0.95)),
        p99: Math.round(pct(0.99)),
        max: Math.round(times[times.length - 1]),
      },
    },
    null,
    1,
  ),
);
