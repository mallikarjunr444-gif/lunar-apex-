// Request parsing and validation. Pure functions: easy to test, no I/O.
import { RANGES, LIMITS } from "./config.mjs";
import { HttpError } from "./http.mjs";
import { SITES } from "./sites.mjs";

export const clampRange = (value, { min, max, fallback }) => {
  const n = value !== null && value !== "" && Number.isFinite(+value) ? +value : fallback;
  return Math.min(Math.max(n, min), max);
};
const wrapLon = (lon) => ((lon + 540) % 360) - 180;
const validHeightKm = (h) => Number.isFinite(h) && h >= -10 && h <= 100;

/** "<id>" for a catalog site or "<lat>:<lon>[:<elevationKm>]" for a custom one. Returns null if invalid. */
export function parseSite(value) {
  if (!value) return null;
  if (!value.includes(":")) return SITES.find((site) => site.id === value) || null;
  const parts = value.split(":").map(Number);
  const [lat, lon, h = 0] = parts;
  if (parts.length > 3 || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 360 || !validHeightKm(h)) return null;
  return { id: value, name: `Custom (${lat}, ${lon})`, lat, lon: wrapLon(lon), h, group: "Custom" };
}

/** Query string -> analysis parameters (numbers clamped to RANGES). */
export function parseAnalysisParams(q) {
  const start = q.get("start") ? new Date(q.get("start")) : new Date();
  if (Number.isNaN(start.getTime())) throw new HttpError(400, "invalid_start", "Invalid start date (use ISO 8601).");
  const source = q.get("source") || "analytic";
  if (!["analytic", "horizons"].includes(source)) throw new HttpError(400, "invalid_source", "source must be analytic or horizons.");
  return {
    start, source,
    hours: clampRange(q.get("hours"), RANGES.hours),
    stepMin: clampRange(q.get("step"), RANGES.step),
    horizon: clampRange(q.get("horizon"), RANGES.horizon),
    minSunElev: clampRange(q.get("minSun"), RANGES.minSun),
    minEarthElev: clampRange(q.get("minEarth"), RANGES.minEarth),
    missionDays: clampRange(q.get("missionDays"), RANGES.missionDays)
  };
}

export function parseSiteOrFail(value) {
  const site = parseSite(value);
  if (!site) throw new HttpError(400, "invalid_site", "Provide ?site=<id> or ?site=<lat>:<lon>[:<elevationKm>].");
  return site;
}

export function parseSiteList(q) {
  const ids = (q.get("sites") || q.get("site") || "").split(",").filter(Boolean).slice(0, LIMITS.maxSites);
  const sites = ids.map(parseSite);
  if (!sites.length || sites.includes(null)) {
    throw new HttpError(400, "invalid_sites", `Provide ?sites=id1,id2 (catalog ids or lat:lon, max ${LIMITS.maxSites}).`);
  }
  return sites;
}

/** POST /api/horizons/compare body -> { date, site } */
export function parseScenario(body) {
  const scenario = body && body.scenario;
  const date = scenario && new Date(scenario.date);
  const lat = Number(scenario && scenario.lat), lon = Number(scenario && scenario.lon);
  const h = scenario && scenario.h == null ? 0 : Number(scenario && scenario.h);
  if (!scenario || !Number.isFinite(date.getTime()) || !Number.isFinite(lat) || Math.abs(lat) > 90
      || !Number.isFinite(lon) || Math.abs(lon) > 360 || !validHeightKm(h)) {
    throw new HttpError(400, "invalid_scenario", "Provide a valid scenario date, lunar latitude/longitude, and elevation in kilometres.");
  }
  return { date, site: { lat, lon: wrapLon(lon), h } };
}

export function parseStart(q) {
  const start = q.get("start") ? new Date(q.get("start")) : new Date();
  if (Number.isNaN(start.getTime())) throw new HttpError(400, "invalid_start", "Invalid start date (use ISO 8601).");
  return start;
}

export function parseThresholds(q) {
  return { minSun: clampRange(q.get("minSun"), RANGES.minSun), minEarth: clampRange(q.get("minEarth"), RANGES.minEarth) };
}
