// Low-precision analytic ephemeris fallback and helpers.
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
export function analyticSample(site, date, horizonDeg = 0, thresholds = {}) {
  const sp = subPoints(toJD(date));
  const s = elAz(site, sp.sun), e = elAz(site, sp.earth);
  const sunFloor = horizonDeg + (Number(thresholds.minSunElev) || 0);
  const earthFloor = horizonDeg + (Number(thresholds.minEarthElev) || 0);
  const sun = { ...s, up: s.el > sunFloor }, earth = { ...e, up: e.el > earthFloor };
  return { t: date.toISOString(), sun, earth, both: { el: Math.min(s.el, e.el), az: s.az, up: sun.up && earth.up } };
}

export function series(site, start, hours, stepMin = 60, horizonDeg = 0, thresholds = {}) {
  const out = [];
  for (let m = 0; m <= hours * 60; m += stepMin)
    out.push(analyticSample(site, new Date(start.getTime() + m * 60000), horizonDeg, thresholds));
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
    const els = samples.map((s) => s[key].el), ups = samples.filter((s) => s[key].up).map((s) => s[key].el);
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
  const sun = stat("sun"), earth = stat("earth"), both = stat("both");
  return {
    sun, earth, both,
    relativePower: +power.toFixed(3),
    relativePowerPercent: +(power * 100).toFixed(1),
    peakSunElevation: sun.maxElevation,
    peakEarthElevation: earth.maxElevation
  };
}

export function assess(summary, missionDays = 7) {
  const requiredHours = Math.max(0, Number(missionDays) || 0) * 24;
  return {
    missionDays: Number(missionDays),
    requiredHours,
    power: summary.sun.longestUpHours >= requiredHours,
    communication: summary.earth.longestUpHours >= requiredHours,
    joint: summary.both.longestUpHours >= requiredHours,
    score: Math.round((Number(summary.sun.percentUp) + Number(summary.earth.percentUp) + Number(summary.both.percentUp)) / 3)
  };
}

// High-precision next sunrise, sunset, earthrise, or earthset
export function nextEvent(site, startDate, body = "sun", horizonDeg = 0, threshold = 0, maxDays = 60, stepMin = 15) {
  const floor = horizonDeg + threshold;
  const isUp = (d) => {
    const sp = subPoints(toJD(d));
    const ea = elAz(site, body === "sun" ? sp.sun : sp.earth);
    return ea.el > floor;
  };

  const t0 = startDate.getTime();
  const up0 = isUp(startDate);
  const maxMs = maxDays * 86400000;
  const stepMs = stepMin * 60000;

  let prev = t0;
  for (let t = t0 + stepMs; t <= t0 + maxMs; t += stepMs) {
    const up = isUp(new Date(t));
    if (up !== up0) {
      let lo = prev, hi = t;
      for (let k = 0; k < 28; k++) {
        const mid = (lo + hi) / 2;
        if (isUp(new Date(mid)) === up0) lo = mid;
        else hi = mid;
      }
      const eventTime = new Date(hi);
      return {
        currentlyUp: up0,
        type: up0 ? (body === "sun" ? "sunset" : "earthset") : (body === "sun" ? "sunrise" : "earthrise"),
        at: eventTime.toISOString(),
        hoursFromNow: +((hi - t0) / 3600000).toFixed(2)
      };
    }
    prev = t;
  }
  return {
    currentlyUp: up0,
    type: null,
    at: null,
    hoursFromNow: null,
    note: up0 ? `Remains continuously in view for at least ${maxDays} days` : `Remains below horizon for at least ${maxDays} days`
  };
}

// Server-side landing window search over candidate dates
export function landingWindows(site, startDate, days = 30, missionDays = 7, stepHours = 3, lookaheadDays = 30, horizonDeg = 0, thresholds = {}) {
  const requiredHours = missionDays * 24;
  const stepMs = 15 * 60000;
  const totalDays = days + lookaheadDays;
  const totalSteps = Math.floor(totalDays * 24 * 60 / 15);
  const t0 = startDate.getTime();

  const sunFloor = horizonDeg + (Number(thresholds.minSunElev) || 0);
  const earthFloor = horizonDeg + (Number(thresholds.minEarthElev) || 0);

  const sunUp = new Uint8Array(totalSteps + 1);
  const earthUp = new Uint8Array(totalSteps + 1);

  for (let i = 0; i <= totalSteps; i++) {
    const d = new Date(t0 + i * stepMs);
    const sp = subPoints(toJD(d));
    const s = elAz(site, sp.sun);
    const e = elAz(site, sp.earth);
    sunUp[i] = s.el > sunFloor ? 1 : 0;
    earthUp[i] = e.el > earthFloor ? 1 : 0;
  }

  const rs = new Uint32Array(totalSteps + 1);
  const re = new Uint32Array(totalSteps + 1);
  const rb = new Uint32Array(totalSteps + 1);

  for (let i = totalSteps - 1; i >= 0; i--) {
    rs[i] = sunUp[i] ? rs[i + 1] + 1 : 0;
    re[i] = earthUp[i] ? re[i + 1] + 1 : 0;
    rb[i] = (sunUp[i] && earthUp[i]) ? rb[i + 1] + 1 : 0;
  }

  const landStepSteps = Math.max(1, Math.round(stepHours * 4));
  const candidateTouchdowns = Math.floor(days * 24 * 4);
  const samples = [];
  const qualifyingWindows = [];
  let currentWindow = null;

  for (let i = 0; i <= candidateTouchdowns; i += landStepSteps) {
    const time = new Date(t0 + i * stepMs).toISOString();
    const sunHours = +(rs[i] * 15 / 60).toFixed(1);
    const earthHours = +(re[i] * 15 / 60).toFixed(1);
    const bothHours = +(rb[i] * 15 / 60).toFixed(1);
    const qualifies = bothHours >= requiredHours;

    samples.push({
      time,
      continuousSunHours: sunHours,
      continuousEarthHours: earthHours,
      continuousBothHours: bothHours,
      meetsMission: qualifies
    });

    if (qualifies) {
      if (!currentWindow) {
        currentWindow = { start: time, end: time, durationTouchdowns: 1 };
      } else {
        currentWindow.end = time;
        currentWindow.durationTouchdowns++;
      }
    } else if (currentWindow) {
      qualifyingWindows.push(currentWindow);
      currentWindow = null;
    }
  }
  if (currentWindow) qualifyingWindows.push(currentWindow);

  return {
    scanDays: days,
    missionDays,
    requiredHours,
    totalTouchdownDatesTested: samples.length,
    qualifyingWindowsCount: qualifyingWindows.length,
    qualifyingTouchdownsCount: samples.filter((s) => s.meetsMission).length,
    qualifyingSharePercent: samples.length ? +((samples.filter((s) => s.meetsMission).length / samples.length) * 100).toFixed(1) : 0,
    qualifyingWindows,
    earliestQualifyingDate: qualifyingWindows[0] ? qualifyingWindows[0].start : null,
    samples: samples.slice(0, 100)
  };
}
