'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('../backend/server.js');

test('HTTP API serves health, curated sites, and validated scenario analysis', async (t) => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));
  const base = `http://127.0.0.1:${server.address().port}`;

  const health = await fetch(`${base}/api/health`);
  assert.equal(health.status, 200);
  assert.equal((await health.json()).status, 'ok');

  const catalog = await fetch(`${base}/api/sites`);
  const sites = await catalog.json();
  assert.ok(sites.groups.some((group) => group.items.some((site) => site.id === 'shackleton')));
  assert.ok(sites.groups.some((group) => group.items.some((site) => site.terrainProfileId === 'sightline-shackleton-rim')));

  const terrain = await fetch(`${base}/api/terrain/profiles`);
  assert.equal(terrain.status, 200);
  const terrainCatalog = await terrain.json();
  assert.equal(terrainCatalog.source.name, 'SIGHTLINE');
  assert.equal(terrainCatalog.sampling.azimuthStepDeg, 0.25);
  assert.equal(terrainCatalog.profiles.length, 3);
  assert.equal(terrainCatalog.profiles[0].horizonElevationDeg.length, 1440);

  const response = await fetch(`${base}/api/analyze`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      scenarios: [{
        id: 'apollo-11',
        name: 'Apollo 11',
        lat: 0.67408,
        lon: 23.47297,
        h: 1.7391,
        profile: Array(1440).fill(0),
        date: '1969-07-20T20:17:40Z'
      }],
      options: { days: 1, stepMinutes: 60 }
    })
  });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.results.length, 1);
  assert.equal(result.results[0].id, 'apollo-11');
  assert.ok(result.results[0].sun.altitudeDeg > 9 && result.results[0].sun.altitudeDeg < 13);
  assert.equal(typeof result.results[0].summary.sunFrac, 'number');
  assert.ok('nextSunTransition' in result.results[0]);
});

test('HTTP API rejects malformed coordinates and unknown API routes', async (t) => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));
  const base = `http://127.0.0.1:${server.address().port}`;

  const invalid = await fetch(`${base}/api/analyze`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      scenarios: [{ lat: 91, lon: 0, date: '2027-01-01T00:00:00Z' }]
    })
  });
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.json()).error.code, 'invalid_request');

  const oversized = await fetch(`${base}/api/analyze`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: ' '.repeat(256 * 1024 + 1)
  });
  assert.equal(oversized.status, 413);
  assert.equal((await oversized.json()).error.code, 'body_too_large');

  const missing = await fetch(`${base}/api/missing`);
  assert.equal(missing.status, 404);
  assert.equal((await missing.json()).error.code, 'not_found');
});

test('JPL Horizons comparison uses Moon-surface coordinates and returns Sun/Earth deltas', async (t) => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(new URL(url));
    const command = calls.at(-1).searchParams.get('COMMAND');
    const values = command === "'10'" ? '120.5, 1.25' : '275.5, -2.5';
    const result = `$$SOE\n 2027-Mar-01 00:17:40.000, , , ${values}\n$$EOE`;
    return new Response(JSON.stringify({ result }), { status: 200 });
  };
  const server = createServer({ fetchImpl });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/horizons/compare`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      scenario: { lat: -89.9, lon: 12, h: 1.7391, date: '2027-03-01T00:17:40Z' }
    })
  });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.source, 'NASA/JPL Horizons API');
  assert.equal(result.positions.sun.horizons.altitudeDeg, 1.25);
  assert.equal(result.positions.earth.horizons.azimuthDeg, 275.5);
  assert.equal(calls.length, 2);
  assert.ok(calls.every((url) => url.searchParams.get('CENTER') === "'coord@301'"));
  assert.ok(calls.every((url) => url.searchParams.get('SITE_COORD') === "'12,-89.9,1.7391'"));
});

test('HTTP server serves the frontend without exposing repository files', async (t) => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));

  const response = await fetch(`http://127.0.0.1:${server.address().port}/`);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /Lunar Apex/);

  const privateFile = await fetch(`http://127.0.0.1:${server.address().port}/backend/server.js`);
  assert.equal(privateFile.status, 404);

  const resourceList = await fetch(`http://127.0.0.1:${server.address().port}/api/resources`);
  const { resources, researchGroups } = await resourceList.json();
  assert.deepEqual(resources.map((resource) => resource.id), ['quickmap', 'moon-trek', 'horizons', 'csa']);
  assert.deepEqual(researchGroups.map((group) => group.id), [
    'open-source-projects', 'nasa-science-data', 'frontend-visualization', 'backend-scientific-computing'
  ]);
  assert.ok(researchGroups[0].items.find((item) => item.name === 'LuminaLuna').status.includes('No license'));
});
