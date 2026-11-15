// API route table. Each handler returns the JSON body (or throws HttpError); the router does the rest.
import fs from "node:fs";
import { NASA_API_KEY, LIMITS, RANGES, TERRAIN_FILE } from "./config.mjs";
import { HttpError, readJson, sendJson } from "./http.mjs";
import { parseAnalysisParams, parseScenario, parseSiteList, parseSiteOrFail, parseStart, parseThresholds, clampRange } from "./params.mjs";
import { SITES } from "./sites.mjs";
import { RESOURCES, EVIDENCE } from "./resources.mjs";
import { compareWithHorizons, computeTimeline, cacheStats } from "./service.mjs";
import { elAz, landingWindows, nextEvent, subPoints, toJD } from "./ephemeris.mjs";

const TERRAIN = JSON.parse(fs.readFileSync(TERRAIN_FILE, "utf8"));
const startedAt = Date.now();

async function apod() {
  let response;
  try {
    response = await fetch(`https://api.nasa.gov/planetary/apod?api_key=${NASA_API_KEY}`, { signal: AbortSignal.timeout(LIMITS.apodTimeoutMs) });
  } catch (error) {
    throw new HttpError(502, "upstream_unavailable", `NASA APOD unavailable: ${error.message}`);
  }
  if (!response.ok) throw new HttpError(502, "upstream_error", `NASA APOD returned HTTP ${response.status}.`);
  return response.json();
}


const SYNODIC = 29.530589, JD_NEW_MOON = 2451550.1;
const PHASES = ["New Moon", "Waxing Crescent", "First Quarter", "Waxing Gibbous", "Full Moon", "Waning Gibbous", "Last Quarter", "Waning Crescent"];
const jdToDate = (jd) => new Date((jd - 2440587.5) * 86400000);

function lunarPhase() {
  const jd = toJD(new Date(Math.floor(Date.now() / 60000) * 60000));   // minute-aligned so responses are cacheable
  const age = (((jd - JD_NEW_MOON) % SYNODIC) + SYNODIC) % SYNODIC;
  const fraction = age / SYNODIC, phaseAngle = fraction * 360;
  const cycle = Math.floor((jd - JD_NEW_MOON) / SYNODIC);
  return {
    phaseAngle, ageDays: age, phaseName: PHASES[Math.floor(fraction * 8) % 8],
    illuminationFraction: (1 - Math.cos(phaseAngle * Math.PI / 180)) / 2,
    nextNewMoon: jdToDate(JD_NEW_MOON + (cycle + 1) * SYNODIC).toISOString(),
    nextFullMoon: jdToDate(JD_NEW_MOON + (cycle + (fraction < 0.5 ? 0.5 : 1.5)) * SYNODIC).toISOString()
  };
}

const sideSummary = (site, point, next) => {
  const now = elAz(site, point);
  return {
    currentElevation: +now.el.toFixed(2), currentAzimuth: +now.az.toFixed(2), currentlyUp: next.currentlyUp,
    nextTransition: next.type ? { type: next.type, time: next.at, hoursFromNow: next.hoursFromNow } : null,
    note: next.note || null
  };
};

function sunriseNext({ q }) {
  const site = parseSiteOrFail(q.get("site")), start = parseStart(q);
  const horizon = clampRange(q.get("horizon"), RANGES.horizon), { minSun, minEarth } = parseThresholds(q);
  const maxDays = clampRange(q.get("maxDays"), { min: 1, max: 90, fallback: 60 });
  const points = subPoints(toJD(start));
  return {
    site, from: start.toISOString(), horizonDeg: horizon, thresholds: { minSun, minEarth },
    sun: sideSummary(site, points.sun, nextEvent(site, start, "sun", horizon, minSun, maxDays)),
    earth: sideSummary(site, points.earth, nextEvent(site, start, "earth", horizon, minEarth, maxDays))
  };
}

function landingWindowsRoute({ q }) {
  const site = parseSiteOrFail(q.get("site")), start = parseStart(q);
  const { minSun, minEarth } = parseThresholds(q);
  const windows = landingWindows(site, start,
    clampRange(q.get("days"), { min: 7, max: 365, fallback: 30 }),
    clampRange(q.get("missionDays"), RANGES.missionDays),
    clampRange(q.get("stepHours"), { min: 1, max: 24, fallback: 3 }), 30,
    clampRange(q.get("horizon"), RANGES.horizon), { minSunElev: minSun, minEarthElev: minEarth });
  return { site, start: start.toISOString(), ...windows };
}

function elevationProfile({ q }) {
  const site = parseSiteOrFail(q.get("site"));
  const profile = site.terrainProfileId ? TERRAIN.profiles.find((p) => p.id === site.terrainProfileId) : null;
  return {
    site, hasTerrainData: Boolean(profile), profileId: profile ? profile.id : null,
    mastHeightM: profile ? profile.mastHeightM : null,
    azimuthSamples: profile ? profile.horizonElevationDeg.length : 360,
    profile: profile ? profile.horizonElevationDeg : new Array(360).fill(0)
  };
}

function siteById({ path }) {
  const id = decodeURIComponent(path.slice("/api/sites/".length));
  const site = SITES.find((s) => s.id === id);
  if (!site) throw new HttpError(404, "site_not_found", `Site '${id}' not found.`);
  return site;
}

const stats = () => ({ uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000), cache: cacheStats(), sitesCount: SITES.length, version: "2.1.0" });

async function evaluate({ q }) {
  const params = parseAnalysisParams(q);
  const results = await Promise.all(parseSiteList(q).map((site) => computeTimeline(site, params)));
  return {
    request: {
      start: params.start.toISOString(), hours: params.hours, stepMin: params.stepMin, missionDays: params.missionDays,
      source: params.source, horizonDeg: params.horizon, minSunElev: params.minSunElev, minEarthElev: params.minEarthElev
    },
    ranked: results.slice().sort((a, b) => b.mission.score - a.mission.score),
    results
  };
}

/** path -> { methods, description, handler }. HEAD is served wherever GET is. */
export const ROUTES = {
  "/api/health": { methods: ["GET"], description: "Service status.",
    handler: () => ({ ok: true, uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000), nasaKeyConfigured: NASA_API_KEY !== "DEMO_KEY" }) },
  "/api/sites": { methods: ["GET"], description: "Built-in catalog plus attributed CLPS mission and candidate sites.", handler: () => SITES },
  "/api/resources": { methods: ["GET"], description: "NASA, CSA, project and mission resource links.", handler: () => RESOURCES },
  "/api/evidence": { methods: ["GET"], description: "Methods, outputs, limitations and provenance.", handler: () => EVIDENCE },
  "/api/terrain/profiles": { methods: ["GET"], description: "Provenance and LOLA-derived horizon profiles.", handler: () => TERRAIN },
  "/api/apod": { methods: ["GET"], description: "NASA Astronomy Picture of the Day (proxy).", handler: apod },
  "/api/lunar-phase": { methods: ["GET"], description: "Current lunar phase, illumination and next new/full moon.", handler: lunarPhase },
  "/api/stats": { methods: ["GET"], description: "Uptime, cache metrics, catalog size and version.", handler: stats },
  "/api/sunrise-next": { methods: ["GET"], description: "Is the Sun/Earth up now, and when is the next rise or set? ?site=&start=&horizon=&minSun=&minEarth=&maxDays=", handler: sunriseNext },
  "/api/landing-windows": { methods: ["GET"], description: "Touchdown dates whose whole mission passes the Sun and Earth thresholds. ?site=&start=&days=&missionDays=&stepHours=", handler: landingWindowsRoute },
  "/api/elevation-profile": { methods: ["GET"], description: "Terrain horizon profile for a site (LOLA-derived where available). ?site=", handler: elevationProfile },
  "/api/timeline": { methods: ["GET"], description: "Sun/Earth samples and window statistics for one site. ?site=<id|lat:lon[:km]>&start=&hours=&step=&source=analytic|horizons",
    handler: ({ q }) => computeTimeline(parseSiteOrFail(q.get("site")), parseAnalysisParams(q)) },
  "/api/compare": { methods: ["GET"], description: "Timelines for up to 5 sites. ?sites=id1,id2",
    handler: ({ q }) => { const params = parseAnalysisParams(q); return Promise.all(parseSiteList(q).map((site) => computeTimeline(site, params))); } },
  "/api/evaluate": { methods: ["GET"], description: "Ranked mission-feasibility assessment for up to 5 sites. ?sites=id1,id2&missionDays=7", handler: evaluate },
  "/api/horizons/compare": { methods: ["POST"], description: "Compare the local model with JPL Horizons for one touchdown. Body: { scenario: { lat, lon, h?, date } }",
    handler: async ({ req }) => compareWithHorizons(parseScenario(await readJson(req))) }
};

const INDEX = {
  name: "LunaSight API",
  endpoints: Object.entries(ROUTES).map(([path, r]) => ({ path, methods: r.methods, description: r.description })),
  errors: "Failures return { error: { code, message } } with an appropriate HTTP status."
};

export async function handleApi(req, res, url) {
  const path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, "") : url.pathname;
  const q = url.searchParams;
  if (path === "/api") return sendJson(res, 200, INDEX);
  const route = ROUTES[path] || (path.startsWith("/api/sites/") ? { methods: ["GET"], handler: siteById } : null);
  if (!route) throw new HttpError(404, "not_found", `No such endpoint: ${path}`);
  const method = req.method === "HEAD" ? "GET" : req.method;
  if (!route.methods.includes(method)) {
    const error = new HttpError(405, "method_not_allowed", `Use ${route.methods.join(" or ")} for ${path}.`);
    error.allow = route.methods.join(", ") + (route.methods.includes("GET") ? ", HEAD" : "");
    throw error;
  }
  return sendJson(res, 200, await route.handler({ req, res, url, q, path }));
}
