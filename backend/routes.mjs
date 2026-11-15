// API route table. Each handler returns the JSON body (or throws HttpError); the router does the rest.
import fs from "node:fs";
import { NASA_API_KEY, LIMITS, TERRAIN_FILE } from "./config.mjs";
import { HttpError, readJson, sendJson } from "./http.mjs";
import { parseAnalysisParams, parseScenario, parseSiteList, parseSiteOrFail } from "./params.mjs";
import { SITES } from "./sites.mjs";
import { RESOURCES, EVIDENCE } from "./resources.mjs";
import { compareWithHorizons, computeTimeline } from "./service.mjs";

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
  const route = ROUTES[path];
  if (!route) throw new HttpError(404, "not_found", `No such endpoint: ${path}`);
  const method = req.method === "HEAD" ? "GET" : req.method;
  if (!route.methods.includes(method)) {
    const error = new HttpError(405, "method_not_allowed", `Use ${route.methods.join(" or ")} for ${path}.`);
    error.allow = route.methods.join(", ") + (route.methods.includes("GET") ? ", HEAD" : "");
    throw error;
  }
  return sendJson(res, 200, await route.handler({ req, res, url, q }));
}
