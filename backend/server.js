'use strict';

const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const LunarEngine = require('../js/engine.js');
const { sites } = require('../js/sites.js');
const { resources, researchGroups } = require('../js/resources.js');
const terrainProfiles = require('../data/terrain/sightline-lola-horizons.json');

const ROOT = path.resolve(__dirname, '..');
const MAX_BODY_BYTES = 256 * 1024;
const MAX_SCENARIOS = 5;
const STATIC_DIRECTORIES = new Set(['css', 'js', 'vendor']);
const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8'
};

class RequestError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function jsonResponse(res, status, value) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff'
  });
  res.end(JSON.stringify(value));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let tooLarge = false;
    const chunks = [];
    req.on('data', (chunk) => {
      if (tooLarge) return;
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        tooLarge = true;
        chunks.length = 0;
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (tooLarge) {
        reject(new RequestError(413, 'body_too_large', 'Request body exceeds 256 KB.'));
        return;
      }
      if (size === 0) {
        reject(new RequestError(400, 'invalid_json', 'Request body must contain JSON.'));
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new RequestError(400, 'invalid_json', 'Request body must contain valid JSON.'));
      }
    });
    req.on('error', reject);
  });
}

function boundedNumber(value, name, min, max, fallback) {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new RequestError(400, 'invalid_request', `${name} must be a number from ${min} to ${max}.`);
  }
  return value;
}

function validateScenario(scenario, index) {
  const label = `scenarios[${index}]`;
  if (!scenario || typeof scenario !== 'object' || Array.isArray(scenario)) {
    throw new RequestError(400, 'invalid_request', `${label} must be an object.`);
  }
  const lat = boundedNumber(scenario.lat, `${label}.lat`, -90, 90);
  const lon = boundedNumber(scenario.lon, `${label}.lon`, -180, 180);
  if (typeof scenario.date !== 'string'
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(scenario.date)
      || !Number.isFinite(Date.parse(scenario.date))) {
    throw new RequestError(400, 'invalid_request', `${label}.date must be an ISO 8601 timestamp with a timezone.`);
  }
  if (scenario.name !== undefined && (typeof scenario.name !== 'string' || scenario.name.length > 100)) {
    throw new RequestError(400, 'invalid_request', `${label}.name must be a string of at most 100 characters.`);
  }
  const site = {
    lat,
    lon,
    h: boundedNumber(scenario.h, `${label}.h`, -10, 100, 0),
    maskDeg: boundedNumber(scenario.maskDeg, `${label}.maskDeg`, -90, 90, 0)
  };
  if (scenario.profile !== undefined) {
    if (!Array.isArray(scenario.profile) || scenario.profile.length < 2 || scenario.profile.length > 4096
        || scenario.profile.some((elevation) => typeof elevation !== 'number'
          || !Number.isFinite(elevation) || elevation < -90 || elevation > 90)) {
      throw new RequestError(400, 'invalid_request', `${label}.profile must contain 2 to 4096 elevations from -90 to 90 degrees.`);
    }
    site.profile = scenario.profile;
  }
  return {
    id: typeof scenario.id === 'string' && scenario.id.length <= 100 ? scenario.id : `scenario-${index + 1}`,
    name: scenario.name || `Scenario ${index + 1}`,
    date: scenario.date,
    site
  };
}

function analyzeScenario(scenario, options, store) {
  const touchdown = Date.parse(scenario.date);
  const site = LunarEngine.makeSite(scenario.site);
  const opts = {
    sunLimb: options.sunLimb,
    minSunElev: options.minSunElev,
    minEarthElev: options.minEarthElev
  };
  const frame = store.at(touchdown);
  const state = LunarEngine.evalSite(site, frame, opts);
  const interval = options.stepMinutes * LunarEngine.MIN;
  const summary = LunarEngine.summarize(LunarEngine.series(
    site, store, touchdown, touchdown + options.days * LunarEngine.DAY, interval, opts
  ));
  const transition = (body) => {
    const event = LunarEngine.nextTransition(site, store, touchdown, body, opts);
    return {
      currentlyUp: event.up,
      type: event.type,
      at: event.at === null ? null : new Date(event.at).toISOString()
    };
  };
  const position = (body) => ({
    altitudeDeg: Number(state[body].alt.toFixed(4)),
    azimuthDeg: Number(state[body].az.toFixed(4)),
    horizonMarginDeg: Number(state[`${body}Margin`].toFixed(4)),
    aboveHorizon: state[`${body}Up`]
  });
  return {
    id: scenario.id,
    name: scenario.name,
    date: new Date(touchdown).toISOString(),
    location: { lat: scenario.site.lat, lon: scenario.site.lon },
    sun: position('sun'),
    earth: position('earth'),
    nextSunTransition: transition('sun'),
    nextEarthTransition: transition('earth'),
    summary
  };
}

function parseHorizonsPosition(result) {
  const section = typeof result === 'string' && result.match(/\$\$SOE([\s\S]*?)\$\$EOE/);
  if (!section) throw new RequestError(502, 'horizons_unavailable', 'JPL Horizons returned no ephemeris rows.');
  for (const line of section[1].trim().split(/\r?\n/)) {
    const values = line.split(',').slice(1).map((field) => field.trim())
      .filter((field) => field !== '').map(Number).filter(Number.isFinite);
    if (values.length >= 2) {
      return { azimuthDeg: values[values.length - 2], altitudeDeg: values[values.length - 1] };
    }
  }
  throw new RequestError(502, 'horizons_unavailable', 'JPL Horizons returned an unrecognized ephemeris table.');
}

async function fetchHorizonsPosition(command, scenario, fetchImpl) {
  const start = Date.parse(scenario.date);
  const formatTime = (ms) => new Date(ms).toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '');
  const params = new URLSearchParams({
    format: 'json',
    COMMAND: `'${command}'`,
    OBJ_DATA: "'NO'",
    MAKE_EPHEM: "'YES'",
    EPHEM_TYPE: "'OBSERVER'",
    CENTER: "'coord@301'",
    COORD_TYPE: "'GEODETIC'",
    SITE_COORD: `'${scenario.site.lon},${scenario.site.lat},${scenario.site.h}'`,
    START_TIME: `'${formatTime(start)}'`,
    STOP_TIME: `'${formatTime(start + 60 * 1000)}'`,
    STEP_SIZE: "'1 m'",
    TIME_DIGITS: "'SECONDS'",
    QUANTITIES: "'4'",
    CSV_FORMAT: "'YES'",
    TIME_TYPE: "'UT'"
  });
  let response;
  try {
    response = await fetchImpl(`https://ssd.jpl.nasa.gov/api/horizons.api?${params}`, {
      signal: AbortSignal.timeout(12000)
    });
  } catch {
    throw new RequestError(502, 'horizons_unavailable', 'Could not reach JPL Horizons. Try again later.');
  }
  if (!response.ok) {
    throw new RequestError(502, 'horizons_unavailable', `JPL Horizons returned HTTP ${response.status}.`);
  }
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new RequestError(502, 'horizons_unavailable', 'JPL Horizons returned an invalid response.');
  }
  return parseHorizonsPosition(payload.result);
}

function comparePosition(local, external) {
  const azimuthDelta = ((external.azimuthDeg - local.az + 540) % 360) - 180;
  return {
    local: { azimuthDeg: local.az, altitudeDeg: local.alt },
    horizons: external,
    differenceDeg: {
      azimuth: azimuthDelta,
      altitude: external.altitudeDeg - local.alt
    }
  };
}

async function serveStatic(pathname, res) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    jsonResponse(res, 400, { error: { code: 'invalid_path', message: 'Malformed URL path.' } });
    return;
  }
  const relative = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  const filename = path.resolve(ROOT, relative);
  if (filename !== ROOT && !filename.startsWith(`${ROOT}${path.sep}`)) {
    jsonResponse(res, 403, { error: { code: 'forbidden', message: 'Path is outside the application.' } });
    return;
  }
  const firstSegment = relative.split(path.sep)[0];
  if (relative !== 'index.html' && !STATIC_DIRECTORIES.has(firstSegment)) {
    jsonResponse(res, 404, { error: { code: 'not_found', message: 'File not found.' } });
    return;
  }
  try {
    const stat = await fs.stat(filename);
    if (!stat.isFile()) {
      jsonResponse(res, 404, { error: { code: 'not_found', message: 'File not found.' } });
      return;
    }
    const content = await fs.readFile(filename);
    res.writeHead(200, {
      'content-type': MIME_TYPES[path.extname(filename)] || 'application/octet-stream',
      'content-length': content.length,
      'x-content-type-options': 'nosniff'
    });
    res.end(content);
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'EISDIR') {
      jsonResponse(res, 404, { error: { code: 'not_found', message: 'File not found.' } });
      return;
    }
    throw error;
  }
}

async function handleRequest(req, res, fetchImpl) {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api/health') {
    if (req.method !== 'GET') throw new RequestError(405, 'method_not_allowed', 'Use GET for this endpoint.');
    jsonResponse(res, 200, { status: 'ok', service: 'lunar-apex-api', version: 1 });
    return;
  }
  if (url.pathname === '/api/sites') {
    if (req.method !== 'GET') throw new RequestError(405, 'method_not_allowed', 'Use GET for this endpoint.');
    jsonResponse(res, 200, { groups: sites });
    return;
  }
  if (url.pathname === '/api/resources') {
    if (req.method !== 'GET') throw new RequestError(405, 'method_not_allowed', 'Use GET for this endpoint.');
    jsonResponse(res, 200, { resources, researchGroups });
    return;
  }
  if (url.pathname === '/api/terrain/profiles') {
    if (req.method !== 'GET') throw new RequestError(405, 'method_not_allowed', 'Use GET for this endpoint.');
    jsonResponse(res, 200, terrainProfiles);
    return;
  }
  if (url.pathname === '/api/analyze') {
    if (req.method !== 'POST') throw new RequestError(405, 'method_not_allowed', 'Use POST for this endpoint.');
    const body = await readJson(req);
    if (!body || typeof body !== 'object' || Array.isArray(body)
        || !Array.isArray(body.scenarios) || body.scenarios.length < 1
        || body.scenarios.length > MAX_SCENARIOS) {
      throw new RequestError(400, 'invalid_request', `scenarios must contain 1 to ${MAX_SCENARIOS} scenarios.`);
    }
    const rawOptions = body.options || {};
    if (typeof rawOptions !== 'object' || Array.isArray(rawOptions)) {
      throw new RequestError(400, 'invalid_request', 'options must be an object.');
    }
    for (const key of ['sunLimb']) {
      if (rawOptions[key] !== undefined && typeof rawOptions[key] !== 'boolean') {
        throw new RequestError(400, 'invalid_request', `options.${key} must be a boolean.`);
      }
    }
    const options = {
      days: boundedNumber(rawOptions.days, 'options.days', 1, 60, 7),
      stepMinutes: boundedNumber(rawOptions.stepMinutes, 'options.stepMinutes', 5, 120, 30),
      minSunElev: boundedNumber(rawOptions.minSunElev, 'options.minSunElev', -2, 20, 0),
      minEarthElev: boundedNumber(rawOptions.minEarthElev, 'options.minEarthElev', -2, 30, 0),
      sunLimb: rawOptions.sunLimb === undefined ? true : rawOptions.sunLimb
    };
    const scenarios = body.scenarios.map(validateScenario);
    const store = new LunarEngine.FrameStore();
    const results = scenarios.map((scenario) => analyzeScenario(scenario, options, store));
    jsonResponse(res, 200, {
      model: 'spherical-moon-meeus-libration',
      disclaimer: 'Planning aid only; polar terrain and mission constraints may materially change visibility.',
      options,
      results
    });
    return;
  }
  if (url.pathname === '/api/horizons/compare') {
    if (req.method !== 'POST') throw new RequestError(405, 'method_not_allowed', 'Use POST for this endpoint.');
    const body = await readJson(req);
    if (!body || typeof body !== 'object' || Array.isArray(body) || !body.scenario) {
      throw new RequestError(400, 'invalid_request', 'scenario must contain one site and touchdown date.');
    }
    const scenario = validateScenario(body.scenario, 0);
    const store = new LunarEngine.FrameStore();
    const localState = LunarEngine.evalSite(
      LunarEngine.makeSite(scenario.site),
      store.at(Date.parse(scenario.date)),
      LunarEngine.DEFAULT_OPTS
    );
    const [sun, earth] = await Promise.all([
      fetchHorizonsPosition('10', scenario, fetchImpl),
      fetchHorizonsPosition('399', scenario, fetchImpl)
    ]);
    jsonResponse(res, 200, {
      source: 'NASA/JPL Horizons API',
      date: new Date(Date.parse(scenario.date)).toISOString(),
      location: { lat: scenario.site.lat, lon: scenario.site.lon },
      positions: {
        sun: comparePosition(localState.sun, sun),
        earth: comparePosition(localState.earth, earth)
      }
    });
    return;
  }
  if (url.pathname.startsWith('/api/')) {
    throw new RequestError(404, 'not_found', 'API endpoint not found.');
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    throw new RequestError(405, 'method_not_allowed', 'Use GET to load application files.');
  }
  await serveStatic(url.pathname, res);
}

function createServer(options) {
  const fetchImpl = options && options.fetchImpl ? options.fetchImpl : globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new TypeError('A Fetch API implementation is required.');
  return http.createServer((req, res) => {
    handleRequest(req, res, fetchImpl).catch((error) => {
      if (res.headersSent || res.destroyed) return;
      if (error instanceof RequestError) {
        jsonResponse(res, error.status, { error: { code: error.code, message: error.message } });
        return;
      }
      console.error('Request failed:', error);
      jsonResponse(res, 500, { error: { code: 'internal_error', message: 'An unexpected server error occurred.' } });
    });
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT || 8080);
  const host = process.env.HOST || '127.0.0.1';
  createServer().listen(port, host, () => {
    console.log(`Lunar Apex app and API listening at http://${host}:${port}`);
  });
}

module.exports = { createServer };
