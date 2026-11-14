import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SITES } from "./sites.js";
import { assess, series, summarize } from "./ephemeris.js";
import { horizonsSeries } from "./horizons.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONT = path.join(__dirname, "..", "frontend");
const startedAt = Date.now();

// Minimal .env loader (no dependency).
try {
  for (const l of fs.readFileSync(path.join(__dirname, "..", ".env"), "utf8").split("\n")) {
    const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {}
const PORT = process.env.PORT || 3000;
const NASA_API_KEY = process.env.NASA_API_KEY || "DEMO_KEY";
const DATA_USE_DISCLAIMER = "NASA does not endorse any non-U.S. Government entity and is not responsible for information contained on non-U.S. Government websites. For non-U.S. Government websites, participants must comply with any data use parameters of that specific website.";
const RESOURCES = [
  { id: "sightline", category: "project", name: "SIGHTLINE", provider: "WarRinOP", url: "https://github.com/WarRinOP/sightline", license: "Apache-2.0", use: "Terrain-aware Sun/Earth visibility and evidence-driven lunar calculations." },
  { id: "clps-moon-browser", category: "project", name: "CLPS Lunar Mission Browser", provider: "localizedprojects", url: "https://github.com/localizedprojects/CLPS-MOON-BROWSER", license: "MIT", use: "Multi-site mission comparison and planning workflows." },
  { id: "lunar-lighting-planner", category: "project", name: "Lunar Lighting Planner", provider: "astoreyai", url: "https://github.com/astoreyai/lunar-lighting-planner", license: "See repository", use: "Landing-date and illumination-window planning." },
  { id: "luminaluna", category: "project", name: "LuminaLuna", provider: "Planet-Coders", url: "https://github.com/Planet-Coders/lunar-landing-site-navigator", license: "See repository", use: "3D lunar landing-site navigation and scientific validation patterns." },
  { id: "lightpath", category: "project", name: "LightPath", provider: "AnmolGarg8", url: "https://github.com/AnmolGarg8/LightPath", license: "MIT", use: "SPICE geometry and rover-planning reference workflows." },
  { id: "lunar-apex", category: "project", name: "LunaSight", provider: "mallikarjunr444-gif", url: "https://github.com/mallikarjunr444-gif/lunar-apex-", license: "MIT", use: "This application: rapid lunar landing-site evaluation." },
  { id: "naif-spice", category: "science", name: "NASA NAIF SPICE", provider: "NASA/JPL", url: "https://naif.jpl.nasa.gov/naif/", use: "Authoritative spacecraft and planetary geometry kernels." },
  { id: "spiceypy", category: "science", name: "SpiceyPy", provider: "Andrew Annex", url: "https://github.com/AndrewAnnex/SpiceyPy", license: "See repository", use: "Python interface to the SPICE toolkit." },
  { id: "lola", category: "science", name: "LOLA data archive", provider: "MIT", url: "https://imbrium.mit.edu/", use: "Lunar laser-altimeter terrain and elevation data." },
  { id: "pds", category: "science", name: "Planetary Data System", provider: "NASA", url: "https://pds.nasa.gov/", use: "NASA planetary science data archive." },
  { id: "horizons", category: "science", name: "Horizons System", provider: "NASA/JPL", url: "https://ssd.jpl.nasa.gov/horizons/", use: "Mission-grade Sun and Earth ephemerides." },
  { id: "horizons-api", category: "science", name: "Horizons API documentation", provider: "NASA/JPL", url: "https://ssd-api.jpl.nasa.gov/doc/horizons.html", use: "Programmatic Horizons request and response reference." },
  { id: "moon-trek", category: "science", name: "Moon Trek", provider: "NASA", url: "https://trek.nasa.gov/moon/", use: "3D terrain and spatial context for landing-site review." },
  { id: "quickmap", category: "science", name: "LROC Quickmap", provider: "Arizona State University", url: "https://quickmap.lroc.asu.edu/", use: "High-resolution lunar imagery, topography, and horizon data." },
  { id: "csa-moon", category: "science", name: "Moon Exploration", provider: "Canadian Space Agency", url: "https://www.asc-csa.gc.ca/eng/astronomy/moon-exploration/", use: "Canadian lunar exploration missions and context." },
  { id: "react", category: "frontend", name: "React", provider: "Meta", url: "https://react.dev/", use: "Component-based interface reference." },
  { id: "typescript", category: "frontend", name: "TypeScript", provider: "Microsoft", url: "https://www.typescriptlang.org/", use: "Typed application development reference." },
  { id: "vite", category: "frontend", name: "Vite", provider: "Vite", url: "https://github.com/vitejs/vite", use: "Fast frontend development and build tooling." },
  { id: "tailwind", category: "frontend", name: "Tailwind CSS", provider: "Tailwind Labs", url: "https://tailwindcss.com/", use: "Utility-first styling reference." },
  { id: "three", category: "frontend", name: "Three.js", provider: "mrdoob", url: "https://github.com/mrdoob/three.js", use: "3D visualization reference." },
  { id: "cesium", category: "frontend", name: "CesiumJS", provider: "Cesium", url: "https://github.com/CesiumGS/cesium", use: "Globe and terrain visualization reference." },
  { id: "maplibre", category: "frontend", name: "MapLibre GL JS", provider: "MapLibre", url: "https://github.com/maplibre/maplibre-gl-js", use: "Interactive map visualization reference." },
  { id: "plotly", category: "frontend", name: "Plotly JavaScript", provider: "Plotly", url: "https://plotly.com/javascript/", use: "Scientific charting reference." },
  { id: "python", category: "backend", name: "Python", provider: "Python Software Foundation", url: "https://www.python.org/", use: "Scientific pipeline language reference." },
  { id: "fastapi", category: "backend", name: "FastAPI", provider: "Sebastián Ramírez", url: "https://fastapi.tiangolo.com/", use: "Typed scientific API reference." },
  { id: "numpy", category: "backend", name: "NumPy", provider: "NumPy", url: "https://numpy.org/", use: "Numerical computing reference." },
  { id: "scipy", category: "backend", name: "SciPy", provider: "SciPy", url: "https://scipy.org/", use: "Scientific algorithms reference." },
  { id: "rasterio", category: "backend", name: "Rasterio", provider: "Mapbox", url: "https://rasterio.readthedocs.io/", use: "Raster terrain data reference." },
  { id: "gdal", category: "backend", name: "GDAL", provider: "OSGeo", url: "https://gdal.org/", use: "Geospatial data processing reference." },
  { id: "postgresql", category: "backend", name: "PostgreSQL", provider: "PostgreSQL Global Development Group", url: "https://www.postgresql.org/", use: "Database reference for persistent mission catalogs." },
  { id: "postgis", category: "backend", name: "PostGIS", provider: "PostGIS", url: "https://postgis.net/", use: "Spatial database reference." }
];
const EVIDENCE = {
  disclaimer: DATA_USE_DISCLAIMER,
  model: {
    analytic: "Meeus-style mean lunar arguments and spherical-Moon vector geometry; suitable for rapid screening.",
    horizons: "JPL Horizons observer ephemerides from a lunar surface coordinate; preferred for mission-grade review.",
    terrain: "A uniform horizon mask is supported by the API; the browser also accepts azimuth/elevation horizon profiles derived from Quickmap or Moon Trek."
  },
  outputs: ["Sun elevation and azimuth", "Earth elevation and azimuth", "sunlight fraction", "Earth-contact fraction", "joint power/link fraction", "mission feasibility"],
  limitations: ["No atmospheric refraction or twilight", "No eclipses, antenna pointing, thermal, dust, or site-slope model", "Analytic mode is a screening estimate and should be checked against Horizons"],
  references: RESOURCES
};

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon" };
const headers = { "X-Content-Type-Options": "nosniff", "Referrer-Policy": "strict-origin-when-cross-origin" };
const json = (res, code, obj) => {
  res.writeHead(code, { ...headers, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*" });
  if (res.req.method !== "HEAD") res.end(JSON.stringify(obj)); else res.end();
};
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
  const key = [site.lat, site.lon, p.start.toISOString(), p.hours, p.stepMin, p.horizon, p.minSunElev, p.minEarthElev, p.source].join("|");
  if (cache.has(key)) return cache.get(key);
  let samples, used = "analytic";
  if (p.source === "horizons") {
    try { samples = await horizonsSeries(site, p.start, p.hours, p.stepMin, p.horizon, p); used = "horizons"; }
    catch (e) { used = `analytic (Horizons unavailable: ${e.message})`; }
  }
  if (!samples) samples = series(site, p.start, p.hours, p.stepMin, p.horizon, p);
  const summary = summarize(samples);
  const out = {
    site, source: used, start: p.start.toISOString(), hours: p.hours, stepMin: p.stepMin,
    horizonDeg: p.horizon, thresholds: { minSunElev: p.minSunElev, minEarthElev: p.minEarthElev },
    mission: assess(summary, p.missionDays), summary, samples
  };
  cache.set(key, out); if (cache.size > 200) cache.delete(cache.keys().next().value);
  return out;
}

async function api(req, res, url) {
  const q = url.searchParams;
  if (url.pathname === "/api/health") return json(res, 200, { ok: true, uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000), nasaKeyConfigured: NASA_API_KEY !== "DEMO_KEY" });
  if (url.pathname === "/api/sites") return json(res, 200, SITES);
  if (url.pathname === "/api/resources") return json(res, 200, RESOURCES);
  if (url.pathname === "/api/evidence") return json(res, 200, EVIDENCE);
  if (url.pathname === "/api/apod") {
    try { const r = await fetch(`https://api.nasa.gov/planetary/apod?api_key=${NASA_API_KEY}`, { signal: AbortSignal.timeout(8000) }); return json(res, r.status, await r.json()); }
    catch (e) { return json(res, 502, { error: e.message }); }
  }
  const start = q.get("start") ? new Date(q.get("start")) : new Date();
  if (isNaN(start)) return json(res, 400, { error: "Invalid start date (use ISO 8601)" });
  const source = q.get("source") || "analytic";
  if (!["analytic", "horizons"].includes(source)) return json(res, 400, { error: "source must be analytic or horizons" });
  const p = {
    start,
    hours: clamp(q.get("hours"), 1, 2160, 720),
    stepMin: clamp(q.get("step"), 5, 720, 60),
    horizon: clamp(q.get("horizon"), -5, 30, 0),
    minSunElev: clamp(q.get("minSun"), -5, 30, 0),
    minEarthElev: clamp(q.get("minEarth"), -5, 30, 0),
    missionDays: clamp(q.get("missionDays"), 0.5, 60, 7),
    source
  };

  if (url.pathname === "/api/timeline") {
    const site = parseSite(q.get("site"));
    if (!site) return json(res, 400, { error: "Provide ?site=<id> or ?site=<lat>:<lon>" });
    return json(res, 200, await computeOne(site, p));
  }
  if (url.pathname === "/api/compare") {
    const sites = (q.get("sites") || "").split(",").filter(Boolean).slice(0, 5).map(parseSite);
    if (!sites.length || sites.includes(null)) return json(res, 400, { error: "Provide ?sites=id1,id2 (ids or lat:lon, max 5)" });
    return json(res, 200, await Promise.all(sites.map((s) => computeOne(s, p))));
  }
  if (url.pathname === "/api/evaluate") {
    const sites = (q.get("sites") || q.get("site") || "").split(",").filter(Boolean).slice(0, 5).map(parseSite);
    if (!sites.length || sites.includes(null)) return json(res, 400, { error: "Provide ?sites=id1,id2 (ids or lat:lon, max 5)" });
    const results = await Promise.all(sites.map((s) => computeOne(s, p)));
    return json(res, 200, {
      request: { start: start.toISOString(), hours: p.hours, stepMin: p.stepMin, missionDays: p.missionDays, source: p.source, horizonDeg: p.horizon, minSunElev: p.minSunElev, minEarthElev: p.minEarthElev },
      ranked: results.slice().sort((a, b) => b.mission.score - a.mission.score),
      results
    });
  }
  return json(res, 404, { error: "Not found" });
}

export const server = http.createServer(async (req, res) => {
  if (!["GET", "HEAD"].includes(req.method)) {
    res.writeHead(405, { ...headers, Allow: "GET, HEAD" });
    return res.end("Method not allowed");
  }
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  try {
    if (url.pathname.startsWith("/api/")) return await api(req, res, url);
    const rel = url.pathname === "/" ? "index.html" : path.normalize(url.pathname).replace(/^(\.\.[/\\])+/, "");
    const file = path.join(FRONT, rel);
    const relative = path.relative(FRONT, file);
    if (relative.startsWith("..") || path.isAbsolute(relative) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404, { ...headers, "Content-Type": "text/plain; charset=utf-8" });
      return res.end("Not found");
    }
    const isHtml = path.extname(file) === ".html";
    res.writeHead(200, { ...headers, "Content-Type": MIME[path.extname(file)] || "application/octet-stream", "Cache-Control": isHtml ? "no-cache" : "public, max-age=3600" });
    if (req.method === "HEAD") return res.end();
    fs.createReadStream(file).pipe(res);
  } catch (e) {
    if (res.headersSent) return res.end();
    json(res, 500, { error: e.message });
  }
});

if (process.argv[1] === fileURLToPath(import.meta.url)) server.listen(PORT, () => console.log(`LunaSight running at http://localhost:${PORT}`));
