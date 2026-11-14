(function (root) {
  'use strict';

  const SUN_RADIUS_DEG = 0.2666;

  function adapt(result, site, opts, engine) {
    if (!result || !Array.isArray(result.samples) || result.samples.length < 2
        || !Number.isFinite(Date.parse(result.start)) || !Number.isFinite(Number(result.stepMin))) {
      throw new Error('Invalid live ephemeris series');
    }

    const samples = result.samples;
    const stepMs = Number(result.stepMin) * 60_000;
    const series = {
      t0: Date.parse(result.start),
      stepMs,
      n: samples.length,
      sunAlt: new Float32Array(samples.length),
      sunAz: new Float32Array(samples.length),
      earthAlt: new Float32Array(samples.length),
      earthAz: new Float32Array(samples.length),
      sunUp: new Uint8Array(samples.length),
      earthUp: new Uint8Array(samples.length)
    };
    const sunThreshold = Number(opts.minSunElev) || 0;
    const earthThreshold = Number(opts.minEarthElev) || 0;

    samples.forEach((sample, index) => {
      if (!sample || !sample.sun || !sample.earth
          || !Number.isFinite(sample.sun.el) || !Number.isFinite(sample.sun.az)
          || !Number.isFinite(sample.earth.el) || !Number.isFinite(sample.earth.az)) {
        throw new Error(`Invalid live ephemeris sample at index ${index}`);
      }
      series.sunAlt[index] = sample.sun.el;
      series.sunAz[index] = sample.sun.az;
      series.earthAlt[index] = sample.earth.el;
      series.earthAz[index] = sample.earth.az;
      const sunMask = engine.maskAt(site, sample.sun.az);
      const earthMask = engine.maskAt(site, sample.earth.az);
      series.sunUp[index] = sample.sun.el + (opts.sunLimb ? SUN_RADIUS_DEG : 0) >= sunMask + sunThreshold ? 1 : 0;
      series.earthUp[index] = sample.earth.el >= earthMask + earthThreshold ? 1 : 0;
    });

    const continuousHours = (flags) => {
      if (!flags[0]) return 0;
      for (let index = 1; index < flags.length; index++) {
        if (!flags[index]) return index * stepMs / engine.HOUR;
      }
      return Infinity;
    };
    const sum = engine.summarize(series);
    const sunH = continuousHours(series.sunUp);
    const earthH = continuousHours(series.earthUp);
    return {
      ser: series,
      sum,
      mission: { sunH, earthH, bothH: Math.min(sunH, earthH) },
      source: result.source
    };
  }

  root.LunarLiveAdapter = { adapt };
  if (typeof module === 'object' && module.exports) module.exports = { adapt };
}(typeof window !== 'undefined' ? window : globalThis));
