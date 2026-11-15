import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SITES } from "./sites.mjs";
import { assess, elAz, series, subPoints, summarize, toJD } from "./ephemeris.mjs";
import { horizonsElAz, horizonsSeries } from "./horizons.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const FRONT = path.join(ROOT, "frontend");
const TERRAIN = JSON.parse(fs.readFileSync(path.join(ROOT, "data/terrain/sightline-lola-horizons.json"), "utf8"));
const startedAt = Date.now();
const PORT = process.env.PORT || 3000;
const NASA_API_KEY = process.env.NASA_API_KEY || "DEMO_KEY";
const DATA_USE_DISCLAIMER = "NASA does not endorse any non-U.S. Government entity and is not responsible for information contained on non-U.S. Government websites. For non-U.S. Government websites, participants must comply with any data use parameters of that specific website.";
const RESOURCES = [
  { id: "sightline", category: "project", name: "SIGHTLINE", url: "https://github.com/WarRinOP/sightline", license: "Apache-2.0" },
  { id: "clps-moon-browser", category: "project", name: "CLPS Lunar Mission Browser", url: "https://github.com/localizedprojects/CLPS-MOON-BROWSER", license: "MIT" },
  { id: "lunar-lighting-planner", category: "project", name: "Lunar Lighting Planner", url: "https://github.com/astoreyai/lunar-lighting-planner" },
  { id: "luminaluna", category: "project", name: "LuminaLuna", url: "https://github.com/Planet-Coders/lunar-landing-site-navigator" },
  { id: "lightpath", category: "project", name: "LightPath", url: "https://github.com/AnmolGarg8/LightPath", license: "MIT" },
  { id: "naif-spice", category: "science", name: "NASA NAIF SPICE", url: "https://naif.jpl.nasa.gov/naif/" },
  { id: "spiceypy", category: "science", name: "SpiceyPy", url: "https://github.com/AndrewAnnex/SpiceyPy" },
  { id: "lola", category: "science", name: "LOLA data archive", url: "https://imbrium.mit.edu/" },
  { id: "pds", category: "science", name: "NASA Planetary Data System", url: "https://pds.nasa.gov/" },
  { id: "horizons", category: "science", name: "JPL Horizons", url: "https://ssd.jpl.nasa.gov/horizons/" },
  { id: "moon-trek", category: "science", name: "NASA Moon Trek", url: "https://trek.nasa.gov/moon/" },
  { id: "quickmap", category: "science", name: "LROC QuickMap", url: "https://quickmap.lroc.im-ldi.com/?prjExtent=-3335249.7991968%2C-1737400%2C3335249.7991968%2C1737400&earthShadowEnabled=true&proj=10&stack=3314&defs=N4IgzGCMAsIFygPYAcCGBjAlgFwJ70gF9Cg" },
  { id: "csa-moon", category: "science", name: "CSA Moon Exploration", url: "https://www.asc-csa.gc.ca/eng/astronomy/moon-exploration/" },
  { id: "csa-canadarm3", category: "science", name: "CSA Canadarm3", url: "https://www.asc-csa.gc.ca/eng/canadarm3/" },
  { id: "csa-gateway", category: "science", name: "CSA Lunar Gateway", url: "https://www.asc-csa.gc.ca/eng/astronomy/moon-exploration/gateway.asp" },
  { id: "csa-utility-rover", category: "science", name: "CSA Canadian utility rover", url: "https://www.asc-csa.gc.ca/eng/astronomy/moon-exploration/canadian-utility-rover-on-the-moon.asp" },
  { id: "csa-artemis", category: "science", name: "CSA Artemis campaign", url: "https://www.asc-csa.gc.ca/eng/astronomy/moon-exploration/artemis-missions.asp" }
];
const EVIDENCE = {
  disclaimer: DATA_USE_DISCLAIMER,
  model: {
    analytic: "Meeus-style mean lunar arguments and spherical-Moon vector geometry; suitable for rapid screening.",
    horizons: "JPL Horizons observer ephemerides from a lunar surface coordinate; preferred for mission-grade review.",
    terrain: "Three pinned SIGHTLINE horizon profiles derived from LOLA are available to the browser."
  },
  outputs: ["Sun and Earth elevation and azimuth", "sunlight and Earth-contact windows", "joint power/link windows", "mission feasibility"],
  limitations: ["No atmospheric refraction or twilight", "No eclipses, antenna pointing, thermal, dust, or site-slope model", "Analytic mode is a screening estimate and should be checked against Horizons"],
  references: RESOURCES
};
const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon"
};
const headers = { "X-Content-Type-Options": "nosniff", "Referrer-Policy": "strict-origin-when-cross-origin" };
const cache = new Map();
const clamp = (value, min, max, fallback) => Math.min(Math.max(Number.isFinite(+value) && value !== null && value !== "" ? +value : fallback, min), max);

function json(res, code, body) {
  res.writeHead(code, {
    ...headers, "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*"
  });
  if (res.req.method === "HEAD") res.end();
  else res.end(JSON.stringify(body));
}

async function readJson(req) {
  const chunks = [];
  let length = 0;
  for await (const chunk of req) {
    length += chunk.length;
    if (length > 64 * 1024) throw new Error("Request body exceeds 64 KiB");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function parseSite(value) {
  if (!value) return null;
  if (value.includes(":")) {
    const parts = value.split(":").map(Number);
    const [lat, lon, h = 0] = parts;
    if (parts.length <= 3 && Number.isFinite(lat) && Number.isFinite(lon) && Number.isFinite(h)
        && Math.abs(lat) <= 90 && Math.abs(lon) <= 360 && h >= -10 && h <= 100) {
      return { id: value, name: `Custom (${lat}, ${lon})`, lat, lon: ((lon + 540) % 360) - 180, h, group: "Custom" };
    }
    return null;
  }
  return SITES.find((site) => site.id === value) || null;
}

async function computeOne(site, params) {
  const key = [site.lat, site.lon, site.h || 0, params.start.toISOString(), params.hours, params.stepMin, params.horizon,
    params.minSunElev, params.minEarthElev, params.source].join("|");
  if (cache.has(key)) return cache.get(key);
  let samples, used = "analytic";
  if (params.source === "horizons") {
    try {
      samples = await horizonsSeries(site, params.start, params.hours, params.stepMin, params.horizon, params);
      used = "horizons";
    } catch (error) {
      used = `analytic (Horizons unavailable: ${error.message})`;
    }
  }
  if (!samples) samples = series(site, params.start, params.hours, params.stepMin, params.horizon, params);
  const summary = summarize(samples);
  const result = {
    site, source: used, start: params.start.toISOString(), hours: params.hours, stepMin: params.stepMin,
    horizonDeg: params.horizon,
    thresholds: { minSunElev: params.minSunElev, minEarthElev: params.minEarthElev },
    mission: assess(summary, params.missionDays), summary, samples
  };
  cache.set(key, result);
  if (cache.size > 200) cache.delete(cache.keys().next().value);
  return result;
}

function compareAngles(local, external) {
  const azimuthDifference = ((external.az - local.az + 540) % 360) - 180;
  return {
    local: { altitudeDeg: local.el, azimuthDeg: local.az },
    horizons: { altitudeDeg: external.el, azimuthDeg: external.az },
    differenceDeg: { altitude: external.el - local.el, azimuth: azimuthDifference }
  };
}

async function compareHorizons(req, res) {
  let body;
  try {
    body = await readJson(req);
  } catch (error) {
    return json(res, 400, { error: error.message === "Unexpected end of JSON input" ? "Request body must be valid JSON" : error.message });
  }
  const scenario = body && body.scenario;
  const date = scenario && new Date(scenario.date);
  const lat = Number(scenario && scenario.lat);
  const lon = Number(scenario && scenario.lon);
  const h = scenario && scenario.h == null ? 0 : Number(scenario && scenario.h);
  if (!scenario || !Number.isFinite(date.getTime()) || !Number.isFinite(lat) || Math.abs(lat) > 90
      || !Number.isFinite(lon) || Math.abs(lon) > 360 || !Number.isFinite(h) || h < -10 || h > 100) {
    return json(res, 400, { error: "Provide a valid scenario date, lunar latitude/longitude, and elevation in kilometres." });
  }
  const site = { lat, lon: ((lon + 540) % 360) - 180, h };
  const stop = new Date(date.getTime() + 60_000);
  try {
    const [sunRows, earthRows] = await Promise.all([
      horizonsElAz(site, "10", date, stop, 1),
      horizonsElAz(site, "399", date, stop, 1)
    ]);
    if (!sunRows.length || !earthRows.length) throw new Error("Horizons returned no position samples");
    const points = subPoints(toJD(date));
    return json(res, 200, {
      source: "NASA/JPL Horizons API",
      date: date.toISOString(),
      location: { lat, lon: site.lon, elevationKm: h },
      positions: {
        sun: compareAngles(elAz(site, points.sun), sunRows[0]),
        earth: compareAngles(elAz(site, points.earth), earthRows[0])
      }
    });
  } catch (error) {
    return json(res, 502, { error: `JPL Horizons comparison unavailable: ${error.message}` });
  }
}

async function api(req, res, url) {
  const q = url.searchParams;
  if (url.pathname === "/api/horizons/compare") {
    if (req.method !== "POST") return json(res, 405, { error: "Use POST for this endpoint." });
    return compareHorizons(req, res);
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { ...headers, Allow: "GET, HEAD, POST" });
    return res.end("Method not allowed");
  }
  if (url.pathname === "/api/health") return json(res, 200, { ok: true, uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000), nasaKeyConfigured: NASA_API_KEY !== "DEMO_KEY" });
  if (url.pathname === "/api/sites") return json(res, 200, SITES);
  if (url.pathname === "/api/resources") return json(res, 200, RESOURCES);
  if (url.pathname === "/api/evidence") return json(res, 200, EVIDENCE);
  if (url.pathname === "/api/terrain/profiles") return json(res, 200, TERRAIN);
  if (url.pathname === "/api/apod") {
    try {
      const response = await fetch(`https://api.nasa.gov/planetary/apod?api_key=${NASA_API_KEY}`, { signal: AbortSignal.timeout(8000) });
      return json(res, response.status, await response.json());
    } catch (error) {
      return json(res, 502, { error: error.message });
    }
  }

  const start = q.get("start") ? new Date(q.get("start")) : new Date();
  if (Number.isNaN(start.getTime())) return json(res, 400, { error: "Invalid start date (use ISO 8601)" });
  const source = q.get("source") || "analytic";
  if (!["analytic", "horizons"].includes(source)) return json(res, 400, { error: "source must be analytic or horizons" });
  const params = {
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
    return json(res, 200, await computeOne(site, params));
  }
  if (url.pathname === "/api/compare" || url.pathname === "/api/evaluate") {
    const sites = (q.get("sites") || q.get("site") || "").split(",").filter(Boolean).slice(0, 5).map(parseSite);
    if (!sites.length || sites.includes(null)) return json(res, 400, { error: "Provide ?sites=id1,id2 (ids or lat:lon, max 5)" });
    const results = await Promise.all(sites.map((site) => computeOne(site, params)));
    if (url.pathname === "/api/compare") return json(res, 200, results);
    return json(res, 200, {
      request: { start: start.toISOString(), hours: params.hours, stepMin: params.stepMin, missionDays: params.missionDays, source, horizonDeg: params.horizon, minSunElev: params.minSunElev, minEarthElev: params.minEarthElev },
      ranked: results.slice().sort((a, b) => b.mission.score - a.mission.score),
      results
    });
  }
  return json(res, 404, { error: "Not found" });
}

export const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const isComparison = url.pathname === "/api/horizons/compare";
  if (url.pathname.startsWith("/api/")) {
    if (!["GET", "HEAD"].includes(req.method) && !(isComparison && req.method === "POST")) {
      res.writeHead(405, { ...headers, Allow: isComparison ? "POST" : "GET, HEAD" });
      return res.end("Method not allowed");
    }
    try {
      return await api(req, res, url);
    } catch (error) {
      if (res.headersSent) return res.end();
      return json(res, 500, { error: error.message });
    }
  }
  if (!["GET", "HEAD"].includes(req.method)) {
    res.writeHead(405, { ...headers, Allow: "GET, HEAD" });
    return res.end("Method not allowed");
  }
  try {
    const relativePath = url.pathname === "/" ? "index.html" : path.normalize(url.pathname).replace(/^(\.\.[/\\])+/, "");
    const file = path.join(FRONT, relativePath);
    const relative = path.relative(FRONT, file);
    if (relative.startsWith("..") || path.isAbsolute(relative) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404, { ...headers, "Content-Type": "text/plain; charset=utf-8" });
      return res.end("Not found");
    }
    const isHtml = path.extname(file) === ".html";
    res.writeHead(200, {
      ...headers, "Content-Type": MIME[path.extname(file)] || "application/octet-stream",
      "Cache-Control": isHtml ? "no-cache" : "public, max-age=3600"
    });
    if (req.method === "HEAD") return res.end();
    fs.createReadStream(file).pipe(res);
  } catch (error) {
    if (res.headersSent) return res.end();
    return json(res, 500, { error: error.message });
  }
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  server.listen(PORT, () => console.log(`LunaSight running at http://localhost:${PORT}`));
}
