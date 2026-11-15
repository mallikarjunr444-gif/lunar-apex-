// Analysis services: memoised timelines and the live Horizons cross-check.
import { LIMITS } from "./config.mjs";
import { HttpError } from "./http.mjs";
import { assess, elAz, series, subPoints, summarize, toJD } from "./ephemeris.mjs";
import { horizonsElAz, horizonsSeries } from "./horizons.mjs";

const cache = new Map();   // insertion-ordered: oldest entry is evicted first

export async function computeTimeline(site, params) {
  const key = [site.lat, site.lon, site.h || 0, params.start.toISOString(), params.hours, params.stepMin, params.horizon,
    params.minSunElev, params.minEarthElev, params.source].join("|");
  if (cache.has(key)) return cache.get(key);
  let samples, used = "analytic";
  if (params.source === "horizons") {
    try {
      samples = await horizonsSeries(site, params.start, params.hours, params.stepMin, params.horizon, params);
      used = "horizons";
    } catch (error) {
      used = `analytic (Horizons unavailable: ${error.message})`;   // graceful fallback, reported to the caller
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
  if (cache.size > LIMITS.cacheEntries) cache.delete(cache.keys().next().value);
  return result;
}

const angleDifference = (a, b) => ((b - a + 540) % 360) - 180;
const compareAngles = (local, external) => ({
  local: { altitudeDeg: local.el, azimuthDeg: local.az },
  horizons: { altitudeDeg: external.el, azimuthDeg: external.az },
  differenceDeg: { altitude: external.el - local.el, azimuth: angleDifference(local.az, external.az) }
});

/** Compare the local model with JPL Horizons for one touchdown. */
export async function compareWithHorizons({ date, site }) {
  const stop = new Date(date.getTime() + 60_000);
  try {
    const [sunRows, earthRows] = await Promise.all([horizonsElAz(site, "10", date, stop, 1), horizonsElAz(site, "399", date, stop, 1)]);
    if (!sunRows.length || !earthRows.length) throw new Error("Horizons returned no position samples");
    const points = subPoints(toJD(date));
    return {
      source: "NASA/JPL Horizons API", date: date.toISOString(),
      location: { lat: site.lat, lon: site.lon, elevationKm: site.h },
      positions: { sun: compareAngles(elAz(site, points.sun), sunRows[0]), earth: compareAngles(elAz(site, points.earth), earthRows[0]) }
    };
  } catch (error) {
    throw new HttpError(502, "horizons_unavailable", `JPL Horizons comparison unavailable: ${error.message}`);
  }
}
