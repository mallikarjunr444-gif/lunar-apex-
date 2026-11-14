/*
 * LunaSight — ephemeris + visibility engine
 *
 * Computes where the Sun and the Earth appear in the sky of any point on the Moon.
 *
 *  - Geocentric Moon / Sun positions come from the vendored Astronomy Engine (MIT).
 *  - Selenographic sub-Earth and sub-solar points follow Meeus, "Astronomical Algorithms"
 *    ch. 53: optical libration + physical libration (rho, sigma, tau), in the
 *    Mean-Earth / Polar-axis frame that LOLA / Quickmap / Moon Trek use.
 *  - Topocentric altitude/azimuth is plain vector geometry on a spherical Moon
 *    (R = 1737.4 km), so lunar parallax of the Earth (up to ~0.26 deg) is included.
 *  - No atmosphere: no refraction. The horizon is the geometric horizon plus an
 *    optional terrain mask (uniform angle and/or a 360-value azimuth profile).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../vendor/astronomy.min.js'));
  } else {
    root.LunarEngine = factory(root.Astronomy);
  }
}(typeof self !== 'undefined' ? self : this, function (Astronomy) {
  'use strict';

  const D2R = Math.PI / 180;
  const R2D = 180 / Math.PI;
  const R_MOON = 1737.4;          // km, IAU mean radius
  const R_SUN = 695700;           // km
  const R_EARTH = 6371.0;         // km
  const KM_AU = 149597870.7;
  const SYNODIC_DAYS = 29.530588;
  const MIN = 60000, HOUR = 3600000, DAY = 86400000;

  const norm360 = (x) => { x %= 360; return x < 0 ? x + 360 : x; };
  const wrap180 = (x) => { x = norm360(x); return x > 180 ? x - 360 : x; };

  // ---------------------------------------------------------------- frames

  /** Mean lunar arguments (Meeus ch. 47/53), radians. */
  function lunarArgs(T) {
    const T2 = T * T, T3 = T2 * T, T4 = T2 * T2;
    return {
      D: D2R * norm360(297.8501921 + 445267.1114034 * T - 0.0018819 * T2 + T3 / 545868 - T4 / 113065000),
      M: D2R * norm360(357.5291092 + 35999.0502909 * T - 0.0001536 * T2 + T3 / 24490000),
      Mp: D2R * norm360(134.9633964 + 477198.8675055 * T + 0.0087414 * T2 + T3 / 69699 - T4 / 14712000),
      F: D2R * norm360(93.2720950 + 483202.0175233 * T - 0.0036539 * T2 - T3 / 3526000 + T4 / 863310000),
      Om: D2R * norm360(125.0445479 - 1934.1362891 * T + 0.0020754 * T2 + T3 / 467441 - T4 / 60616000),
      E: 1 - 0.002516 * T - 0.0000074 * T2,
      K1: D2R * (119.75 + 131.849 * T),
      K2: D2R * (72.56 + 20.186 * T),
      L: D2R * norm360(280.4665 + 36000.7698 * T),   // Sun mean longitude (for nutation)
      Lp: D2R * norm360(218.3165 + 481267.8813 * T)  // Moon mean longitude (for nutation)
    };
  }

  /** Nutation in longitude, degrees (Meeus ch. 22, 4-term). */
  function nutationLon(a) {
    return (-17.20 * Math.sin(a.Om) - 1.32 * Math.sin(2 * a.L) - 0.23 * Math.sin(2 * a.Lp) + 0.21 * Math.sin(2 * a.Om)) / 3600;
  }

  /**
   * Selenographic longitude/latitude (deg, east positive) of the point on the Moon that
   * faces an observer located along ecliptic direction (lon, lat) *towards* the Moon
   * (mean equinox of date). For the Earth observer this is the sub-Earth point
   * (libration); for the Sun as observer it is the sub-solar point.
   */
  function sublunarPoint(lonDeg, latDeg, a) {
    const I = D2R * 1.54242;
    const lon = D2R * lonDeg, lat = D2R * latDeg;
    const W = lon - a.Om;
    const A = Math.atan2(Math.sin(W) * Math.cos(lat) * Math.cos(I) - Math.sin(lat) * Math.sin(I),
                         Math.cos(W) * Math.cos(lat));
    const lp = wrap180(R2D * (A - a.F));
    const bp = Math.asin(-Math.sin(W) * Math.cos(lat) * Math.sin(I) - Math.sin(lat) * Math.cos(I));
    const { D, M, Mp, F, Om, E, K1, K2 } = a;
    const rho = -0.02752 * Math.cos(Mp) - 0.02245 * Math.sin(F) + 0.00684 * Math.cos(Mp - 2 * F)
      - 0.00293 * Math.cos(2 * F) - 0.00085 * Math.cos(2 * F - 2 * D) - 0.00054 * Math.cos(Mp - 2 * D)
      - 0.00020 * Math.sin(Mp + F) - 0.00020 * Math.cos(Mp + 2 * F) - 0.00020 * Math.cos(Mp - F)
      + 0.00014 * Math.cos(Mp + 2 * F - 2 * D);
    const sigma = -0.02816 * Math.sin(Mp) + 0.02244 * Math.cos(F) - 0.00682 * Math.sin(Mp - 2 * F)
      - 0.00279 * Math.sin(2 * F) - 0.00083 * Math.sin(2 * F - 2 * D) + 0.00069 * Math.sin(Mp - 2 * D)
      + 0.00040 * Math.cos(Mp + F) - 0.00025 * Math.sin(2 * Mp) - 0.00023 * Math.sin(Mp + 2 * F)
      + 0.00020 * Math.cos(Mp - F) + 0.00019 * Math.sin(Mp - F) + 0.00013 * Math.sin(Mp + 2 * F - 2 * D)
      - 0.00010 * Math.cos(Mp - 3 * F);
    const tau = 0.02520 * E * Math.sin(M) + 0.00473 * Math.sin(2 * Mp - 2 * F) - 0.00467 * Math.sin(Mp)
      + 0.00396 * Math.sin(K1) + 0.00276 * Math.sin(2 * Mp - 2 * D) + 0.00196 * Math.sin(Om)
      - 0.00183 * Math.cos(Mp - F) + 0.00115 * Math.sin(Mp - 2 * D) - 0.00096 * Math.sin(Mp - D)
      + 0.00046 * Math.sin(2 * F - 2 * D) - 0.00039 * Math.sin(Mp - F) - 0.00032 * Math.sin(Mp - M - D)
      + 0.00027 * Math.sin(2 * Mp - M - 2 * D) + 0.00023 * Math.sin(K2) - 0.00014 * Math.sin(2 * D)
      + 0.00014 * Math.cos(2 * Mp - 2 * F) - 0.00012 * Math.sin(Mp - 2 * F) - 0.00012 * Math.sin(2 * Mp)
      + 0.00011 * Math.sin(2 * Mp - 2 * M - 2 * D);
    const lpp = -tau + (rho * Math.cos(A) + sigma * Math.sin(A)) * Math.tan(bp);
    const bpp = sigma * Math.cos(A) - rho * Math.sin(A);
    return { lon: lp + lpp, lat: R2D * bp + bpp };
  }

  const sph = (lonDeg, latDeg) => {
    const l = lonDeg * D2R, b = latDeg * D2R;
    return [Math.cos(b) * Math.cos(l), Math.cos(b) * Math.sin(l), Math.sin(b)];
  };

  /**
   * Instantaneous geometry: unit vectors (selenographic Cartesian, Moon-fixed) pointing
   * from the Moon's centre to the Earth (e*) and to the Sun (s*), plus distances in km.
   */
  function computeFrame(ms) {
    const time = Astronomy.MakeTime(new Date(ms));
    const T = time.tt / 36525;
    const a = lunarArgs(T);
    const lib = Astronomy.Libration(time);            // mlon/mlat: mean equinox of date
    const sunPos = Astronomy.SunPosition(time);       // true equinox of date, apparent
    const sunLon = sunPos.elon - nutationLon(a);      // -> mean equinox of date
    const sunDist = sunPos.vec.Length() * KM_AU;

    const mg = sph(lib.mlon, lib.mlat).map((v) => v * lib.dist_km);   // Earth -> Moon
    const sg = sph(sunLon, sunPos.elat).map((v) => v * sunDist);       // Earth -> Sun
    const h = [mg[0] - sg[0], mg[1] - sg[1], mg[2] - sg[2]];           // Sun -> Moon
    const dS = Math.hypot(h[0], h[1], h[2]);
    const lonH = norm360(R2D * Math.atan2(h[1], h[0]));
    const latH = R2D * Math.asin(h[2] / dS);

    const pe = sublunarPoint(lib.mlon, lib.mlat, a);
    const ps = sublunarPoint(lonH, latH, a);
    const ue = sph(pe.lon, pe.lat), us = sph(ps.lon, ps.lat);
    return {
      ms,
      ex: ue[0], ey: ue[1], ez: ue[2], dE: lib.dist_km,
      sx: us[0], sy: us[1], sz: us[2], dS,
      earthLon: pe.lon, earthLat: pe.lat, sunLon: ps.lon, sunLat: ps.lat
    };
  }

  /** Caches frames on a 30-minute grid and interpolates between them (fast scans). */
  class FrameStore {
    constructor(stepMs) {
      this.step = stepMs || 30 * MIN;
      this.cache = new Map();
    }
    grid(i) {
      let f = this.cache.get(i);
      if (!f) { f = computeFrame(i * this.step); this.cache.set(i, f); }
      return f;
    }
    at(ms) {
      const x = ms / this.step, i = Math.floor(x), w = x - i;
      const A = this.grid(i);
      if (w < 1e-9) return A;
      const B = this.grid(i + 1);
      const nl = (ax, ay, az, bx, by, bz) => {
        const x1 = ax + (bx - ax) * w, y1 = ay + (by - ay) * w, z1 = az + (bz - az) * w;
        const n = Math.hypot(x1, y1, z1);
        return [x1 / n, y1 / n, z1 / n];
      };
      const e = nl(A.ex, A.ey, A.ez, B.ex, B.ey, B.ez);
      const s = nl(A.sx, A.sy, A.sz, B.sx, B.sy, B.sz);
      return {
        ms, ex: e[0], ey: e[1], ez: e[2], dE: A.dE + (B.dE - A.dE) * w,
        sx: s[0], sy: s[1], sz: s[2], dS: A.dS + (B.dS - A.dS) * w
      };
    }
    clear() { this.cache.clear(); }
  }

  // ----------------------------------------------------------------- sites

  /**
   * site: { lat, lon (deg, east +), h (km above reference sphere, default 0),
   *         maskDeg (uniform terrain mask), profile (array of 360 elevations, az 0..359) }
   */
  function makeSite(s) {
    const lat = Math.max(-90, Math.min(90, Number(s.lat) || 0));
    const lon = Number(s.lon) || 0;
    const h = Number(s.h) || 0;
    const p = lat * D2R, l = lon * D2R;
    const cp = Math.cos(p), sp = Math.sin(p), cl = Math.cos(l), sl = Math.sin(l);
    const r = R_MOON + h;
    return {
      lat, lon, h, maskDeg: Number(s.maskDeg) || 0, profile: s.profile || null,
      px: r * cp * cl, py: r * cp * sl, pz: r * sp,
      ux: cp * cl, uy: cp * sl, uz: sp,
      ex: -sl, ey: cl, ez: 0,
      nx: -sp * cl, ny: -sp * sl, nz: cp
    };
  }

  function maskAt(site, az) {
    let m = site.maskDeg || 0;
    const p = site.profile;
    if (p && p.length === 360) {
      const x = norm360(az), i = Math.floor(x), w = x - i;
      const a = p[i % 360], b = p[(i + 1) % 360];
      m = Math.max(m, a + (b - a) * w);
    }
    return m;
  }

  function altAz(site, ux, uy, uz, d) {
    const vx = d * ux - site.px, vy = d * uy - site.py, vz = d * uz - site.pz;
    const vl = Math.hypot(vx, vy, vz);
    const sinAlt = (vx * site.ux + vy * site.uy + vz * site.uz) / vl;
    return {
      alt: R2D * Math.asin(Math.max(-1, Math.min(1, sinAlt))),
      az: norm360(R2D * Math.atan2(vx * site.ex + vy * site.ey + vz * site.ez,
                                   vx * site.nx + vy * site.ny + vz * site.nz))
    };
  }

  const DEFAULT_OPTS = { sunLimb: true, minSunElev: 0, minEarthElev: 0 };

  /** Full state of the sky at a site for one frame. */
  function evalSite(site, f, opts) {
    const o = opts || DEFAULT_OPTS;
    const sun = altAz(site, f.sx, f.sy, f.sz, f.dS);
    const earth = altAz(site, f.ex, f.ey, f.ez, f.dE);
    sun.rad = R2D * Math.asin(R_SUN / f.dS);
    earth.rad = R2D * Math.asin(R_EARTH / f.dE);
    sun.mask = maskAt(site, sun.az);
    earth.mask = maskAt(site, earth.az);
    const sunMargin = sun.alt - sun.mask + (o.sunLimb ? sun.rad : 0) - (o.minSunElev || 0);
    const earthMargin = earth.alt - earth.mask - (o.minEarthElev || 0);
    return { sun, earth, sunMargin, earthMargin, sunUp: sunMargin >= 0, earthUp: earthMargin >= 0 };
  }

  // ---------------------------------------------------------------- series

  function series(site, store, t0, t1, stepMs, opts) {
    const n = Math.floor((t1 - t0) / stepMs) + 1;
    const out = {
      t0, stepMs, n,
      sunAlt: new Float32Array(n), sunAz: new Float32Array(n),
      earthAlt: new Float32Array(n), earthAz: new Float32Array(n),
      sunUp: new Uint8Array(n), earthUp: new Uint8Array(n)
    };
    for (let i = 0; i < n; i++) {
      const e = evalSite(site, store.at(t0 + i * stepMs), opts);
      out.sunAlt[i] = e.sun.alt; out.sunAz[i] = e.sun.az;
      out.earthAlt[i] = e.earth.alt; out.earthAz[i] = e.earth.az;
      out.sunUp[i] = e.sunUp ? 1 : 0; out.earthUp[i] = e.earthUp ? 1 : 0;
    }
    return out;
  }

  function runStats(flags, stepMs, want) {
    let longest = 0, cur = 0, count = 0, longestStart = -1, curStart = 0, prev = -1;
    const n = flags.length;
    for (let i = 0; i < n; i++) {
      const on = flags[i] === want;
      if (on) {
        if (cur === 0) curStart = i;
        cur++;
        if (cur > longest) { longest = cur; longestStart = curStart; }
      } else { cur = 0; }
      if (prev !== -1 && prev !== want && on) count++;
      prev = flags[i];
    }
    return { longestH: longest * stepMs / HOUR, longestStart, count };
  }

  /** Window statistics for one scenario. */
  function summarize(s) {
    const n = s.n, stepMs = s.stepMs;
    let sun = 0, earth = 0, both = 0, maxAlt = -90, sumAltUp = 0, nUp = 0, eH = 0, eV = 0;
    let maxEarth = -90;
    for (let i = 0; i < n; i++) {
      if (s.sunUp[i]) {
        sun++;
        const a = s.sunAlt[i] * D2R;
        sumAltUp += s.sunAlt[i]; nUp++;
        if (a > 0) { eH += Math.sin(a); eV += Math.cos(a); }
      }
      if (s.earthUp[i]) earth++;
      if (s.sunUp[i] && s.earthUp[i]) both++;
      if (s.sunAlt[i] > maxAlt) maxAlt = s.sunAlt[i];
      if (s.earthAlt[i] > maxEarth) maxEarth = s.earthAlt[i];
    }
    const lit = runStats(s.sunUp, stepMs, 1);
    const dark = runStats(s.sunUp, stepMs, 0);
    const eVis = runStats(s.earthUp, stepMs, 1);
    const eOut = runStats(s.earthUp, stepMs, 0);
    const meanAlt = nUp ? sumAltUp / nUp : null;
    return {
      hours: n * stepMs / HOUR,
      sunFrac: sun / n, earthFrac: earth / n, bothFrac: both / n,
      maxSunAlt: maxAlt, meanSunAlt: meanAlt, maxEarthAlt: maxEarth,
      longestSunH: lit.longestH, longestDarkH: dark.longestH,
      longestEarthH: eVis.longestH, longestEarthOutH: eOut.longestH,
      sunsets: countTransitions(s.sunUp, 1, 0), earthsets: countTransitions(s.earthUp, 1, 0),
      energyHoriz: eH / n, energyVert: eV / n,
      shadowPer1m: meanAlt !== null && meanAlt > 0.01 ? 1 / Math.tan(meanAlt * D2R) : null
    };
  }

  function countTransitions(flags, from, to) {
    let c = 0;
    for (let i = 1; i < flags.length; i++) if (flags[i - 1] === from && flags[i] === to) c++;
    return c;
  }

  // ----------------------------------------------------------- transitions

  /**
   * Next rise/set of the Sun or Earth from time t.
   * Returns { up, type: 'set'|'rise', at: ms|null } (at is null if none within maxMs).
   */
  function nextTransition(site, store, t, which, opts, maxMs, stepMs) {
    maxMs = maxMs || 60 * DAY; stepMs = stepMs || 10 * MIN;
    const m = (ms) => {
      const e = evalSite(site, store.at(ms), opts);
      return which === 'sun' ? e.sunMargin : e.earthMargin;
    };
    const up0 = m(t) >= 0;
    let prev = t;
    for (let tt = t + stepMs; tt <= t + maxMs; tt += stepMs) {
      if ((m(tt) >= 0) !== up0) {
        let lo = prev, hi = tt;
        for (let k = 0; k < 40; k++) {
          const mid = (lo + hi) / 2;
          if ((m(mid) >= 0) === up0) lo = mid; else hi = mid;
        }
        return { up: up0, type: up0 ? 'set' : 'rise', at: hi };
      }
      prev = tt;
    }
    return { up: up0, type: up0 ? 'set' : 'rise', at: null };
  }

  // -------------------------------------------------------- landing windows

  /**
   * For every candidate landing time in [t0, t0+days]: how long do sunlight / Earth contact
   * / both last continuously after touchdown? (capped by lookaheadDays)
   */
  function landingWindows(site, store, t0, days, opts, cfg) {
    cfg = cfg || {};
    const stepMs = cfg.stepMs || 15 * MIN, landStep = cfg.landStepMs || 3 * HOUR;
    const look = cfg.lookaheadDays || 45;
    const s = series(site, store, t0, t0 + (days + look) * DAY, stepMs, opts);
    const n = s.n;
    const rs = new Uint32Array(n + 1), re = new Uint32Array(n + 1), rb = new Uint32Array(n + 1);
    for (let i = n - 1; i >= 0; i--) {
      rs[i] = s.sunUp[i] ? rs[i + 1] + 1 : 0;
      re[i] = s.earthUp[i] ? re[i + 1] + 1 : 0;
      rb[i] = (s.sunUp[i] && s.earthUp[i]) ? rb[i + 1] + 1 : 0;
    }
    const every = Math.round(landStep / stepMs);
    const out = { t: [], sunH: [], earthH: [], bothH: [], capped: [], lookaheadH: look * 24 };
    const lastLand = Math.floor(days * DAY / stepMs);
    for (let i = 0; i <= lastLand; i += every) {
      out.t.push(t0 + i * stepMs);
      out.sunH.push(rs[i] * stepMs / HOUR);
      out.earthH.push(re[i] * stepMs / HOUR);
      out.bothH.push(rb[i] * stepMs / HOUR);
      out.capped.push(i + rs[i] >= n || i + re[i] >= n);
    }
    return out;
  }

  /** Parse CSV / whitespace text "azimuth,elevation" into a 360-value profile. */
  function parseHorizonProfile(text) {
    const pts = [];
    String(text).split(/\r?\n/).forEach((line) => {
      const m = line.trim().match(/^(-?\d+(?:\.\d+)?)[\s,;\t]+(-?\d+(?:\.\d+)?)/);
      if (m) pts.push([norm360(parseFloat(m[1])), parseFloat(m[2])]);
    });
    if (pts.length < 2) return null;
    pts.sort((a, b) => a[0] - b[0]);
    const prof = new Float32Array(360);
    for (let az = 0; az < 360; az++) {
      let lo = null, hi = null;
      for (const p of pts) { if (p[0] <= az) lo = p; if (p[0] >= az && hi === null) hi = p; }
      if (!lo) lo = [pts[pts.length - 1][0] - 360, pts[pts.length - 1][1]];
      if (!hi) hi = [pts[0][0] + 360, pts[0][1]];
      const span = hi[0] - lo[0];
      prof[az] = span === 0 ? lo[1] : lo[1] + (hi[1] - lo[1]) * (az - lo[0]) / span;
    }
    return prof;
  }

  return {
    R_MOON, R_SUN, R_EARTH, SYNODIC_DAYS, MIN, HOUR, DAY,
    computeFrame, FrameStore, makeSite, maskAt, altAz, evalSite, series, summarize,
    nextTransition, landingWindows, parseHorizonProfile, sublunarPoint, lunarArgs,
    norm360, wrap180, DEFAULT_OPTS
  };
}));
