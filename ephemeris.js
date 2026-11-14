// Low-precision analytic ephemeris (fallback) + helpers.
// Accuracy: roughly 1-3 deg. Use Horizons (horizons.js) for mission-grade numbers.
const D2R = Math.PI / 180, R2D = 180 / Math.PI;
const SYNODIC = 29.530589;
const JD_NEW_MOON = 2451550.1;   // 2000-01-06 18:14 UT
const wrap180 = (x) => ((x + 540) % 360 + 360) % 360 - 180;
export const toJD = (date) => date.getTime() / 86400000 + 2440587.5;

// Sub-body point on the Moon (selenographic lat/lon, degrees) for Sun and Earth.
// Uses mean orbital elements (Meeus-style): sub-solar latitude from the Sun's longitude relative to the
// lunar node; sub-Earth point from optical libration (longitude: equation of centre; latitude: argument of latitude).
export function subPoints(jd) {
  const d = jd - 2451545.0;
  const lonSun = (280.460 + 0.9856474 * d) % 360;          // Sun ecliptic longitude (low precision)
  const node = (125.045 - 0.0529538 * d) % 360;            // ascending node of the lunar orbit
  const M = (134.963 + 13.064993 * d) * D2R;               // Moon mean anomaly
  const D = (297.850 + 12.190749 * d) * D2R;               // mean elongation
  const F = (93.272 + 13.229350 * d) * D2R;                // argument of latitude
  const frac = (((jd - JD_NEW_MOON) / SYNODIC) % 1 + 1) % 1;
  return {
    sun: { lon: wrap180(180 - 360 * frac), lat: -1.54 * Math.cos((lonSun - node) * D2R) },
    earth: { lon: 6.289 * Math.sin(M) + 1.274 * Math.sin(2 * D - M) + 0.658 * Math.sin(2 * D), lat: -6.7 * Math.sin(F) }
  };
}

// Elevation/azimuth of a body whose sub-point is `sp`, seen from a site.
export function elAz(site, sp) {
  const φ = site.lat * D2R, φs = sp.lat * D2R, Δ = (sp.lon - site.lon) * D2R;
  const sinEl = Math.sin(φ) * Math.sin(φs) + Math.cos(φ) * Math.cos(φs) * Math.cos(Δ);
  const el = Math.asin(Math.max(-1, Math.min(1, sinEl))) * R2D;
  const y = Math.cos(φs) * Math.sin(Δ);
  const x = Math.cos(φ) * Math.sin(φs) - Math.sin(φ) * Math.cos(φs) * Math.cos(Δ);
  return { el, az: (Math.atan2(y, x) * R2D + 360) % 360 };
}

// horizonDeg = terrain mask (flat default). A body is "up" when el > horizonDeg.
export function analyticSample(site, date, horizonDeg = 0) {
  const sp = subPoints(toJD(date));
  const s = elAz(site, sp.sun), e = elAz(site, sp.earth);
  return { t: date.toISOString(), sun: { ...s, up: s.el > horizonDeg }, earth: { ...e, up: e.el > horizonDeg } };
}

export function series(site, start, hours, stepMin = 60, horizonDeg = 0) {
  const out = [];
  for (let m = 0; m <= hours * 60; m += stepMin)
    out.push(analyticSample(site, new Date(start.getTime() + m * 60000), horizonDeg));
  return out;
}

// Summaries: windows, longest up/down run, % time up, time until next set/rise.
export function summarize(samples) {
  const dt = samples.length > 1 ? (Date.parse(samples[1].t) - Date.parse(samples[0].t)) / 3600000 : 1;
  const stat = (key) => {
    let upN = 0, longestUp = 0, longestDown = 0, run = 0, runDown = 0, open = null;
    const windows = [];
    samples.forEach((s, i) => {
      if (s[key].up) { upN++; run++; runDown = 0; if (open === null) open = i; }
      else { runDown++; run = 0; if (open !== null) { windows.push([samples[open].t, samples[i - 1].t]); open = null; } }
      longestUp = Math.max(longestUp, run); longestDown = Math.max(longestDown, runDown);
    });
    if (open !== null) windows.push([samples[open].t, samples[samples.length - 1].t]);
    let toChange = null;
    for (let i = 1; i < samples.length; i++) if (samples[i][key].up !== samples[0][key].up) { toChange = +(i * dt).toFixed(2); break; }
    const els = samples.map((s) => s[key].el), ups = els.filter((x) => x > 0);
    return {
      percentUp: +(100 * upN / samples.length).toFixed(1),
      longestUpHours: +(longestUp * dt).toFixed(1),
      longestDownHours: +(longestDown * dt).toFixed(1),
      maxElevation: +Math.max(...els).toFixed(2),
      meanElevationWhenUp: +(ups.reduce((a, b) => a + b, 0) / Math.max(1, ups.length)).toFixed(2),
      hoursUntilChange: toChange, currentlyUp: samples[0][key].up, windows
    };
  };
  const power = samples.reduce((a, s) => a + Math.max(0, Math.sin(s.sun.el * D2R)), 0) / samples.length;
  return { sun: stat("sun"), earth: stat("earth"), relativePower: +power.toFixed(3) };
}
