#!/usr/bin/env node
/*
 * Cross-check the LunaSight engine against JPL Horizons (run on a machine with internet).
 *   node tools/compare_horizons.js <lat> <lon_east> "<YYYY-MM-DD HH:MM>" [hours=48] [stepMin=360]
 * Example: node tools/compare_horizons.js -89.9 0 "2027-03-01 00:00" 48 360
 *
 * This is a comparison aid, not a validation guarantee: Horizons and the local model use
 * different ephemerides and physical approximations.
 */
'use strict';
const LE = require('../frontend/js/engine.js');
const [lat, lon, start, hours = '48', stepMin = '360'] = process.argv.slice(2);
if (!start) { console.error('usage: node tools/compare_horizons.js <lat> <lon_east> "<YYYY-MM-DD HH:MM>" [hours] [stepMin]'); process.exit(1); }

const t0 = Date.parse(start.replace(' ', 'T') + ':00Z');
const t1 = t0 + Number(hours) * 3600000;
const fmt = (ms) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ');

async function horizons(cmd) {
  const q = {
    format: 'json', COMMAND: `'${cmd}'`, OBJ_DATA: "'NO'", MAKE_EPHEM: "'YES'", EPHEM_TYPE: "'OBSERVER'",
    CENTER: "'coord@301'", COORD_TYPE: "'GEODETIC'", SITE_COORD: `'${lon},${lat},0'`,
    START_TIME: `'${fmt(t0)}'`, STOP_TIME: `'${fmt(t1)}'`, STEP_SIZE: `'${stepMin} m'`,
    QUANTITIES: "'4'", ANG_FORMAT: "'DEG'", CSV_FORMAT: "'YES'", TIME_TYPE: "'UT'"
  };
  const url = 'https://ssd.jpl.nasa.gov/api/horizons.api?' + Object.entries(q).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  const res = await (await fetch(url)).json();
  const text = res.result || '';
  const body = text.split('$$SOE')[1];
  if (!body) throw new Error('Horizons returned no ephemeris:\n' + text.slice(0, 600));
  return body.split('$$EOE')[0].trim().split('\n').map((line) => {
    const nums = line.split(',').map((s) => parseFloat(s)).filter((v) => !isNaN(v));
    return { az: nums[nums.length - 2], el: nums[nums.length - 1] };
  });
}

(async () => {
  const sun = await horizons('10'), earth = await horizons('399');
  const site = LE.makeSite({ lat: Number(lat), lon: Number(lon) });
  const store = new LE.FrameStore();
  console.log('time (UTC)         | Sun el  (eng / JPL / d)      | Earth el (eng / JPL / d)');
  let maxS = 0, maxE = 0;
  sun.forEach((s, i) => {
    const ms = t0 + i * Number(stepMin) * 60000;
    const e = LE.evalSite(site, store.at(ms), LE.DEFAULT_OPTS);
    const dS = e.sun.alt - s.el, dE = e.earth.alt - earth[i].el;
    maxS = Math.max(maxS, Math.abs(dS)); maxE = Math.max(maxE, Math.abs(dE));
    console.log(`${fmt(ms)} | ${e.sun.alt.toFixed(3).padStart(8)} ${s.el.toFixed(3).padStart(8)} ${dS.toFixed(3).padStart(7)} | ${e.earth.alt.toFixed(3).padStart(8)} ${earth[i].el.toFixed(3).padStart(8)} ${dE.toFixed(3).padStart(7)}`);
  });
  console.log(`max |Δ| Sun ${maxS.toFixed(3)}°  Earth ${maxE.toFixed(3)}°`);
})().catch((e) => { console.error(e.message); process.exit(1); });
