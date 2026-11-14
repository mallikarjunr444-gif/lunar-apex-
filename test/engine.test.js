'use strict';
const test = require('node:test');
const assert = require('node:assert');
const Astronomy = require('../frontend/vendor/astronomy.min.js');
const LE = require('../frontend/js/engine.js');

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} expected ${b} ± ${tol}, got ${a}`);
const store = new LE.FrameStore();
const OPTS = { sunLimb: false, minSunElev: 0, minEarthElev: 0 };
const at = (site, iso, opts) => LE.evalSite(LE.makeSite(site), store.at(Date.parse(iso)), opts || OPTS);

test('sub-Earth point (libration) agrees with Astronomy Engine Libration()', () => {
  for (const iso of ['2026-11-14T12:00:00Z', '2027-03-05T03:00:00Z', '2030-07-01T18:30:00Z']) {
    const f = LE.computeFrame(Date.parse(iso));
    const ref = Astronomy.Libration(new Date(iso));
    near(f.earthLon, ref.elon, 0.01, `lon ${iso}`);
    near(f.earthLat, ref.elat, 0.01, `lat ${iso}`);
  }
});

test('Meeus ch.53 example: 1992-04-12 0h TD  l=-1.206  b=+4.194', () => {
  const f = LE.computeFrame(Date.UTC(1992, 3, 11, 23, 59, 1));   // 0h TD ~ 23:59:01 UT
  near(f.earthLon, -1.206, 0.03, 'libration lon');
  near(f.earthLat, 4.194, 0.03, 'libration lat');
});

test('Apollo 11 touchdown: Sun about 10-11 deg up, in the east; Earth high', () => {
  const e = at({ lat: 0.67408, lon: 23.47297 }, '1969-07-20T20:17:40Z');
  near(e.sun.alt, 10.8, 1.5, 'sun elevation');
  assert.ok(e.sun.az > 60 && e.sun.az < 120, `sun azimuth ${e.sun.az}`);
  assert.ok(e.earth.alt > 55 && e.earth.alt < 80, `earth elevation ${e.earth.alt}`);
});

test('New Moon: far-side centre is in full daylight and the Earth is below the horizon', () => {
  const nm = Astronomy.SearchMoonPhase(0, new Date('2026-11-01T00:00:00Z'), 40).date;
  const e = at({ lat: 0, lon: 180 }, nm.toISOString());
  assert.ok(e.sun.alt > 80, `sun ${e.sun.alt}`);
  assert.ok(e.earth.alt < -80, `earth ${e.earth.alt}`);
});

test('Full Moon: near-side centre is at lunar noon, with the Earth overhead too', () => {
  const fm = Astronomy.SearchMoonPhase(180, new Date('2026-11-01T00:00:00Z'), 40).date;
  const e = at({ lat: 0, lon: 0 }, fm.toISOString());
  assert.ok(e.sun.alt > 80, `sun ${e.sun.alt}`);        // Sun-Earth-Moon aligned: near side is lit
  assert.ok(e.earth.alt > 75, `earth ${e.earth.alt}`);
});

test('South pole: Sun stays within ~1.6 deg, Earth within ~7 deg of the horizon over a year', () => {
  const site = LE.makeSite({ lat: -90, lon: 0 });
  let maxSun = -90, minSun = 90, maxEarth = -90;
  for (let d = 0; d < 366; d += 0.25) {
    const e = LE.evalSite(site, store.at(Date.UTC(2027, 0, 1) + d * LE.DAY), OPTS);
    maxSun = Math.max(maxSun, e.sun.alt); minSun = Math.min(minSun, e.sun.alt);
    maxEarth = Math.max(maxEarth, e.earth.alt);
  }
  near(maxSun, 1.54, 0.2, 'max sun elevation at pole');
  near(minSun, -1.54, 0.2, 'min sun elevation at pole');
  assert.ok(maxEarth > 6 && maxEarth < 7.2, `max Earth elevation ${maxEarth}`);
});

test('Equatorial site: successive sunsets are one synodic month apart', () => {
  const site = LE.makeSite({ lat: 0, lon: 0 });
  const t0 = Date.UTC(2027, 5, 1);
  const a = LE.nextTransition(site, store, t0, 'sun', OPTS);
  const b = LE.nextTransition(site, store, a.at + 6 * LE.HOUR, 'sun', OPTS);
  const c = LE.nextTransition(site, store, b.at + 6 * LE.HOUR, 'sun', OPTS);
  const dayLen = (c.at - a.at) / LE.DAY;
  near(dayLen, LE.SYNODIC_DAYS, 0.6, 'lunar day length');
  assert.notStrictEqual(a.type, b.type);
});

test('nextTransition lands on the horizon crossing', () => {
  const t = Date.UTC(2027, 2, 3);
  // Earth never sets at lon 10 (deep near side) but does near the limb, so use lon 85 for it.
  for (const [which, site] of [['sun', LE.makeSite({ lat: 30, lon: 10 })], ['earth', LE.makeSite({ lat: 30, lon: 85 })]]) {
    const tr = LE.nextTransition(site, store, t, which, OPTS);
    assert.ok(tr.at);
    const e = LE.evalSite(site, store.at(tr.at), OPTS);
    near(which === 'sun' ? e.sunMargin : e.earthMargin, 0, 0.02, `${which} margin at event`);
  }
});

test('terrain mask removes sunlight', () => {
  const t0 = Date.UTC(2027, 0, 1), t1 = t0 + 30 * LE.DAY;
  const clear = LE.summarize(LE.series(LE.makeSite({ lat: -89, lon: 0 }), store, t0, t1, 30 * LE.MIN, OPTS));
  const masked = LE.summarize(LE.series(LE.makeSite({ lat: -89, lon: 0, maskDeg: 3 }), store, t0, t1, 30 * LE.MIN, OPTS));
  assert.ok(masked.sunFrac < clear.sunFrac);
  assert.strictEqual(masked.sunFrac, 0);   // Sun never exceeds ~3 deg near the pole
});

test('interpolated frames match direct computation to < 0.002 deg', () => {
  const site = LE.makeSite({ lat: -85, lon: 30 });
  for (let k = 0; k < 20; k++) {
    const ms = Date.UTC(2027, 3, 1) + k * 7.3 * LE.HOUR + 1234567;
    const a = LE.evalSite(site, store.at(ms), OPTS);
    const b = LE.evalSite(site, LE.computeFrame(ms), OPTS);
    near(a.sun.alt, b.sun.alt, 0.002, 'sun alt');
    near(a.earth.alt, b.earth.alt, 0.002, 'earth alt');
  }
});

test('landing windows: run lengths are consistent with the series', () => {
  const site = LE.makeSite({ lat: 0, lon: 0 });
  const w = LE.landingWindows(site, store, Date.UTC(2027, 0, 1), 40, OPTS);
  assert.ok(w.t.length > 300);
  const maxSun = Math.max(...w.sunH) / 24;
  assert.ok(maxSun > 13 && maxSun < 16, `equatorial daylight ~14.8 d, got ${maxSun}`);
});

test('horizon profile parser interpolates and wraps', () => {
  const p = LE.parseHorizonProfile('0,2\n90,4\n180,0\n270,4');
  near(p[0], 2, 1e-6); near(p[45], 3, 1e-6); near(p[359], 4 + (2 - 4) * 89 / 90, 1e-3);   // wraps from (270,4) back to (0,2)
  assert.strictEqual(LE.parseHorizonProfile('nonsense'), null);
});

test('terrain profiles interpolate at their native resolution and preserve below-horizontal horizons', () => {
  const profile = new Float32Array(1440).fill(-4);
  profile[0] = 4;
  const site = LE.makeSite({ lat: -89.7, lon: 12, h: 1.7, profile });
  near(LE.maskAt(site, 0), 4, 1e-6);
  near(LE.maskAt(site, 359.875), 0, 1e-5);
  near(LE.maskAt(site, 90), -4, 1e-6);
  near(LE.maskAt(LE.makeSite({ lat: -89.7, profile, maskDeg: 2 }), 90), 2, 1e-6);
});
