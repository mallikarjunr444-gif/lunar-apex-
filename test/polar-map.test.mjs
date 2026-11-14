import assert from "node:assert/strict";
import { test } from "node:test";
import charts from "../frontend/js/charts.js";

test("south-pole map projection round-trips latitude and longitude", () => {
  for (const [lat, lon] of [[-90, 0], [-89.5, 123], [-75, -45], [-60, 179]]) {
    const point = charts.projectPolar(lat, lon, 400, 200, 150);
    const inverse = charts.unprojectPolar(point.x, point.y, 400, 200, 150);
    assert.ok(Math.abs(inverse.lat - lat) < 1e-9);
    const longitudeError = ((inverse.lon - lon + 540) % 360) - 180;
    assert.ok(Math.abs(longitudeError) < 1e-9);
  }
  assert.equal(charts.unprojectPolar(600, 200, 400, 200, 150), null);
});
