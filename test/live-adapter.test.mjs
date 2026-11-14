import assert from "node:assert/strict";
import { test } from "node:test";
import engine from "../frontend/js/engine.js";
import { adapt } from "../frontend/js/live-adapter.js";

test("live Horizons samples are normalized and terrain masks are applied locally", () => {
  const site = engine.makeSite({ lat: -89, lon: 0, maskDeg: 5 });
  const result = {
    source: "horizons",
    start: "2027-01-01T00:00:00.000Z",
    stepMin: 10,
    samples: [
      { sun: { el: 4.8, az: 0 }, earth: { el: 10, az: 90 } },
      { sun: { el: 5.3, az: 0 }, earth: { el: 10, az: 90 } },
      { sun: { el: 4, az: 0 }, earth: { el: 10, az: 90 } }
    ]
  };

  const withLimb = adapt(result, site, { sunLimb: true }, engine);
  assert.deepEqual(Array.from(withLimb.ser.sunUp), [1, 1, 0]);
  assert.deepEqual(Array.from(withLimb.ser.earthUp), [1, 1, 1]);
  assert.equal(withLimb.sum.sunFrac, 2 / 3);
  assert.equal(withLimb.mission.sunH, 20 / 60);
  assert.equal(withLimb.mission.earthH, Infinity);

  const centerOnly = adapt(result, site, { sunLimb: false }, engine);
  assert.deepEqual(Array.from(centerOnly.ser.sunUp), [0, 1, 0]);
  assert.equal(centerOnly.sum.sunFrac, 1 / 3);
});
