import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SITES } from "./sites.js";
import { series, summarize } from "./ephemeris.js";
import { horizonsSeries } from "./horizons.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONT = path.join(__dirname, "..", "frontend");

// Minimal .env loader (no dependency).
try {
  for (const l of fs.readFileSync(path.join(__dirname, "..", ".env"), "utf8").split("\n")) {
    const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {}
const PORT = process.env.PORT || 3000;
const NASA_API_KEY = process.env.NASA_API_KEY || "DEMO_KEY";

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml" };
const json = (res, code, obj) => { res.writeHead(code, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }); res.end(JSON.stringify(obj)); };
const cache = new Map();
const clamp = (v, lo, hi, d) => Math.min(Math.max(Number.isFinite(+v) && v !== null && v !== "" ? +v : d, lo), hi);

function parseSite(s) {
  if (!s) return null;
  if (s.includes(":")) {
    const [lat, lon] = s.split(":").map(Number);
    if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 360)
      return { id: s, name: `Custom (${lat}, ${lon})`, lat, lon: ((lon + 540) % 360) - 180, group: "Custom" };
    return null;
  }
  return SITES.find((x) => x.id === s) || null;
}

async function computeOne(site, p) {
  const key = [site.lat, site.lon, p.start.toISOString(), p.hours, p.stepMin, p.horizon, p.source].join("|");
  if (cache.has(key)) return cache.get(key);
  let samples, used = "analytic";
  if (p.source === "horizons") {
    try { samples = await horizonsSeries(site, p.start, p.hours, p.stepMin, p.horizon); used = "horizons"; }
    catch (e) { used = `analytic (Horizons unavailable: ${e.message})`; }
  }
  if (!samples) samples = series(site, p.start, p.hours, p.stepMin, p.horizon);
  const out = { site, source: used, start: p.start.toISOString(), hours: p.hours, stepMin: p.stepMin, horizonDeg: p.horizon, summary: summarize(samples), samples };
  cache.set(key, out); if (cache.size > 200) cache.delete(cache.keys().next().value);
  return out;
}

async function api(req, res, url) {
  const q = url.searchParams;
  if (url.pathname === "/api/health") return json(res, 200, { ok: true, nasaKeyConfigured: NASA_API_KEY !== "DEMO_KEY" });
  if (url.pathname === "/api/sites") return json(res, 200, SITES);
  if (url.pathname === "/api/apod") {
    try { const r = await fetch(`https://api.nasa.gov/planetary/apod?api_key=${NASA_API_KEY}`, { signal: AbortSignal.timeout(8000) }); return json(res, r.status, await r.json()); }
    catch (e) { return json(res, 502, { error: e.message }); }
  }
  const start = q.get("start") ? new Date(q.get("start")) : new Date();
  if (isNaN(start)) return json(res, 400, { error: "Invalid start date (use ISO 8601)" });
  const p = { start, hours: clamp(q.get("hours"), 1, 2160, 720), stepMin: clamp(q.get("step"), 5, 720, 60), horizon: clamp(q.get("horizon"), -5, 30, 0), source: q.get("source") || "analytic" };

  if (url.pathname === "/api/timeline") {
    const site = parseSite(q.get("site"));
    if (!site) return json(res, 400, { error: "Provide ?site=<id> or ?site=<lat>:<lon>" });
    return json(res, 200, await computeOne(site, p));
  }
  if (url.pathname === "/api/compare") {
    const sites = (q.get("sites") || "").split(",").filter(Boolean).slice(0, 4).map(parseSite);
    if (!sites.length || sites.includes(null)) return json(res, 400, { error: "Provide ?sites=id1,id2 (ids or lat:lon, max 4)" });
    return json(res, 200, await Promise.all(sites.map((s) => computeOne(s, p))));
  }
  return json(res, 404, { error: "Not found" });
}

export const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname.startsWith("/api/")) return await api(req, res, url);
    const rel = url.pathname === "/" ? "index.html" : path.normalize(url.pathname).replace(/^(\.\.[/\\])+/, "");
    const file = path.join(FRONT, rel);
    if (!file.startsWith(FRONT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end("Not found"); }
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  } catch (e) { json(res, 500, { error: e.message }); }
});

if (process.argv[1] === fileURLToPath(import.meta.url)) server.listen(PORT, () => console.log(`Lunar Apex running at http://localhost:${PORT}`));
