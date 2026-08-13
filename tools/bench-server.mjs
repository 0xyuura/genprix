// Minimal static file server for dist/, used only for local perf benchmarking.
// Binds 0.0.0.0 so both IPv4 and IPv6 clients can reach it.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { gzipSync } from "node:zlib";

const ROOT = new URL("../dist/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const PORT = Number(process.argv[2] || 5210);
const GZIP = process.argv.includes("--gzip");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".json": "application/json",
};

const cache = new Map();

async function load(path) {
  if (cache.has(path)) return cache.get(path);
  const buf = await readFile(path);
  const entry = { buf, gz: GZIP ? gzipSync(buf, { level: 6 }) : null };
  cache.set(path, entry);
  return entry;
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://x");
    let p = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, "");
    if (p === "" || p.endsWith("/")) p = "index.html";
    let file = join(ROOT, p);
    try {
      await stat(file);
    } catch {
      file = join(ROOT, "index.html"); // SPA fallback
    }
    const ext = extname(file).toLowerCase();
    const { buf, gz } = await load(file);
    const acceptsGz = GZIP && /\bgzip\b/.test(req.headers["accept-encoding"] || "") && gz;
    const body = acceptsGz ? gz : buf;
    res.writeHead(200, {
      "content-type": TYPES[ext] || "application/octet-stream",
      "content-length": body.length,
      ...(acceptsGz ? { "content-encoding": "gzip" } : {}),
      "cache-control": ext === ".html" ? "no-cache" : "public, max-age=31536000, immutable",
    });
    res.end(req.method === "HEAD" ? undefined : body);
  } catch (e) {
    res.writeHead(500).end(String(e));
  }
}).listen(PORT, "0.0.0.0", () => {
  console.log(`bench-server on http://127.0.0.1:${PORT} (gzip=${GZIP})`);
});
