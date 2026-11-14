import assert from "node:assert/strict";
import { test } from "node:test";
import { server } from "../backend/server.mjs";

test("HTTP API serves terrain data and compares a touchdown with Horizons", async (t) => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));
  const address = server.address();
  const base = `http://127.0.0.1:${address.port}`;

  const health = await fetch(`${base}/api/health`);
  assert.equal(health.status, 200);
  assert.equal((await health.json()).ok, true);

  const terrainResponse = await fetch(`${base}/api/terrain/profiles`);
  assert.equal(terrainResponse.status, 200);
  const terrain = await terrainResponse.json();
  assert.equal(terrain.source.name, "SIGHTLINE");
  assert.equal(terrain.sampling.azimuthStepDeg, 0.25);
  assert.equal(terrain.profiles.length, 3);
  assert.equal(terrain.profiles[0].horizonElevationDeg.length, 1440);

  const nativeFetch = globalThis.fetch;
  const horizonRequests = [];
  globalThis.fetch = async (input, options) => {
    const url = new URL(input);
    if (url.hostname !== "ssd.jpl.nasa.gov") return nativeFetch(input, options);
    horizonRequests.push(url);
    return new Response(JSON.stringify({
      result: "$$SOE\n2027-Jan-01 00:00:00, , , 120.0, 25.0\n$$EOE"
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  t.after(() => { globalThis.fetch = nativeFetch; });

  const response = await fetch(`${base}/api/horizons/compare`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      scenario: {
        id: "sightline-shackleton-rim",
        lat: -89.780403,
        lon: -156.196951,
        h: 1.7391,
        date: "2027-01-01T00:00:00Z"
      }
    })
  });
  assert.equal(response.status, 200);
  const comparison = await response.json();
  assert.equal(comparison.source, "NASA/JPL Horizons API");
  assert.equal(comparison.positions.sun.horizons.altitudeDeg, 25);
  assert.equal(comparison.positions.sun.horizons.azimuthDeg, 120);
  assert.equal(horizonRequests.length, 2);
  assert.ok(horizonRequests.every((url) => url.searchParams.get("SITE_COORD").includes("1.7391")));

  const invalid = await fetch(`${base}/api/horizons/compare`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ scenario: { lat: 100, lon: 0, date: "2027-01-01T00:00:00Z" } })
  });
  assert.equal(invalid.status, 400);
});
