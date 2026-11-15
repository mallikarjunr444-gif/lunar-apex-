import assert from "node:assert/strict";
import { test } from "node:test";
import { server } from "../backend/server.mjs";
import { parseAnalysisParams, parseSite, parseScenario } from "../backend/params.mjs";

const start = () => new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${server.address().port}`)));
const stop = () => new Promise((resolve) => server.close(resolve));

test("API: index, error shape, methods, limits and static safety", async (t) => {
  const base = await start();
  t.after(stop);
  const errorOf = async (response) => (await response.json()).error;

  const index = await (await fetch(`${base}/api`)).json();
  assert.ok(index.endpoints.some((e) => e.path === "/api/timeline" && e.methods.includes("GET")));
  assert.ok(index.endpoints.every((e) => e.description));

  // unknown endpoint -> JSON 404
  let r = await fetch(`${base}/api/nope`);
  assert.equal(r.status, 404);
  assert.equal((await errorOf(r)).code, "not_found");

  // invalid input -> 400 with { error: { code, message } }
  r = await fetch(`${base}/api/timeline?site=not-a-site`);
  assert.equal(r.status, 400);
  const bad = await errorOf(r);
  assert.equal(bad.code, "invalid_site");
  assert.equal(typeof bad.message, "string");
  r = await fetch(`${base}/api/timeline?site=malapert&start=garbage`);
  assert.equal((await errorOf(r)).code, "invalid_start");
  r = await fetch(`${base}/api/timeline?site=malapert&source=magic`);
  assert.equal((await errorOf(r)).code, "invalid_source");
  r = await fetch(`${base}/api/compare`);
  assert.equal((await errorOf(r)).code, "invalid_sites");

  // wrong method -> 405 with Allow
  r = await fetch(`${base}/api/health`, { method: "POST" });
  assert.equal(r.status, 405);
  assert.match(r.headers.get("allow"), /GET/);
  r = await fetch(`${base}/api/horizons/compare`);
  assert.equal(r.status, 405);
  assert.match(r.headers.get("allow"), /POST/);

  // HEAD works and has no body; trailing slash is tolerated
  r = await fetch(`${base}/api/health`, { method: "HEAD" });
  assert.equal(r.status, 200);
  assert.equal((await r.text()), "");
  assert.equal((await fetch(`${base}/api/health/`)).status, 200);

  // body problems
  r = await fetch(`${base}/api/horizons/compare`, { method: "POST", body: "{not json" });
  assert.equal((await errorOf(r)).code, "invalid_json");
  r = await fetch(`${base}/api/horizons/compare`, { method: "POST", body: JSON.stringify({ pad: "x".repeat(70 * 1024) }) });
  assert.equal(r.status, 413);
  assert.equal((await errorOf(r)).code, "payload_too_large");

  // a valid analytic timeline still works, and numbers are clamped rather than rejected
  r = await fetch(`${base}/api/timeline?site=malapert&start=2027-01-01T00:00:00Z&hours=999999&step=1`);
  assert.equal(r.status, 200);
  const timeline = await r.json();
  assert.equal(timeline.hours, 2160);
  assert.equal(timeline.stepMin, 5);

  // static files: CSP on HTML, no traversal, no directory listing
  r = await fetch(`${base}/`);
  assert.equal(r.status, 200);
  assert.match(r.headers.get("content-security-policy"), /default-src 'self'/);
  assert.equal(r.headers.get("x-content-type-options"), "nosniff");
  for (const path of ["/..%2f..%2fpackage.json", "/%2e%2e/package.json", "/js", "/%E0%A4%A"]) {
    assert.equal((await fetch(`${base}${path}`)).status, 404, path);
  }
  assert.equal((await fetch(`${base}/js/app.js`)).headers.get("content-type"), "text/javascript; charset=utf-8");
  r = await fetch(`${base}/index.html`, { method: "DELETE" });
  assert.equal(r.status, 405);
});

test("params: site parsing and validation", () => {
  assert.equal(parseSite("malapert").id, "malapert");
  assert.equal(parseSite("nope"), null);
  assert.deepEqual(parseSite("-89.5:190:1.5"), { id: "-89.5:190:1.5", name: "Custom (-89.5, 190)", lat: -89.5, lon: -170, h: 1.5, group: "Custom" });
  assert.equal(parseSite("95:0"), null);
  assert.equal(parseSite("1:2:3:4"), null);
  assert.equal(parseSite("0:0:500"), null);
  const p = parseAnalysisParams(new URLSearchParams("hours=abc&step=1&minSun=99&missionDays=0"));
  assert.equal(p.hours, 720);        // not a number -> fallback
  assert.equal(p.stepMin, 5);        // clamped up
  assert.equal(p.minSunElev, 30);    // clamped down
  assert.equal(p.missionDays, 0.5);
  assert.throws(() => parseScenario({ scenario: { lat: 0, lon: 0, date: "nope" } }), { code: "invalid_scenario" });
  assert.equal(parseScenario({ scenario: { lat: 1, lon: 200, date: "2027-01-01" } }).site.lon, -160);
});
