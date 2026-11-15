/*
 * Lunar Apex - deep links into the NASA / LROC tools for a selected site. Pure functions, no DOM.
 * The Quickmap layer stack, Earth-shadow flag and projection come from the Quickmap view supplied
 * for this project; only the map extent is changed to centre on the site.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LunarLinks = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const R = 1737400;                                    // m, radius used by Quickmap's map units
  const QM = 'https://quickmap.lroc.im-ldi.com/';
  const QM_TAIL = '&earthShadowEnabled=true&proj=10&stack=3314&defs=N4IgzGCMAsIFygPYAcCGBjAlgFwJ70gF9Cg';
  const BASE_HALF_W = 3335249.7991968, BASE_HALF_H = 1737400;
  const ASPECT = BASE_HALF_W / BASE_HALF_H;
  const r3 = (x) => Math.round(x * 1000) / 1000;

  /** The exact Quickmap view supplied for the project (global view, Earth shadow on). */
  const quickmapBase = () => `${QM}?prjExtent=${-BASE_HALF_W}%2C${-BASE_HALF_H}%2C${BASE_HALF_W}%2C${BASE_HALF_H}${QM_TAIL}`;

  /**
   * Same view, re-centred on a site. proj=10 is treated as the simple cylindrical map
   * (x = R*lon, y = R*lat), which is consistent with the supplied extent. Polar sites are stretched
   * in that projection; switch to Quickmap's polar projection after it opens if needed.
   */
  function quickmapURL(lat, lon, halfWidthKm) {
    const hw = (halfWidthKm || 150) * 1000, hh = hw / ASPECT;
    const cx = R * lon * Math.PI / 180, cy = R * lat * Math.PI / 180;
    return `${QM}?prjExtent=${[cx - hw, cy - hh, cx + hw, cy + hh].map(r3).join('%2C')}${QM_TAIL}`;
  }
  const trekURL = () => 'https://trek.nasa.gov/moon/';   // no documented coordinate deep link: copy the coordinates instead
  return { quickmapBase, quickmapURL, trekURL };
}));
