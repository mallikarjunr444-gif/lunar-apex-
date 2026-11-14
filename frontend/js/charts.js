/* LunaSight — canvas renderers (no dependencies). */
(function (root) {
  'use strict';
  const SUN = '#ffd166', EARTH = '#4cc9f0', OK = '#52d273', GRID = '#1b2540', TEXT = '#93a0bb';
  const LE = root.LunarEngine;
  const D2R = Math.PI / 180, R2D = 180 / Math.PI;

  function setup(canvas) {
    const dpr = root.devicePixelRatio || 1;
    const r = canvas.getBoundingClientRect();
    const w = Math.max(10, Math.round(r.width)), h = Math.max(10, Math.round(r.height));
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return { ctx, w, h };
  }

  // deterministic star field
  const STARS = (function () {
    let s = 1234567; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const a = []; for (let i = 0; i < 90; i++) a.push([rnd(), rnd(), 0.4 + rnd() * 0.9, 0.25 + rnd() * 0.6]);
    return a;
  })();

  const fmtDeg = (v) => (Math.abs(v) < 10 ? v.toFixed(1) : v.toFixed(0)) + '°';

  function maxMask(site) {
    let m = site.maskDeg || 0;
    if (site.profile) for (let i = 0; i < 360; i++) if (site.profile[i] > m) m = site.profile[i];
    return m;
  }

  function sunDisc(ctx, x, y, r, up) {
    if (up) {
      const g = ctx.createRadialGradient(x, y, r * 0.2, x, y, r * 4);
      g.addColorStop(0, 'rgba(255,209,102,.55)'); g.addColorStop(1, 'rgba(255,209,102,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 4, 0, 7); ctx.fill();
      ctx.fillStyle = SUN; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    } else {
      ctx.setLineDash([3, 3]); ctx.strokeStyle = 'rgba(255,209,102,.75)'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.stroke(); ctx.setLineDash([]);
    }
  }
  function earthDisc(ctx, x, y, r, up) {
    if (up) {
      const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
      g.addColorStop(0, '#bfe8ff'); g.addColorStop(0.5, '#3d8bd9'); g.addColorStop(1, '#173f7a');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(190,230,255,.6)'; ctx.lineWidth = 1; ctx.stroke();
    } else {
      ctx.setLineDash([3, 3]); ctx.strokeStyle = 'rgba(76,201,240,.8)'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.stroke(); ctx.setLineDash([]);
    }
  }

  /** Azimuth (x) vs elevation (y) strip. ev = LunarEngine.evalSite result. */
  function drawPanorama(canvas, ev, site) {
    const { ctx, w, h } = setup(canvas);
    const L = 32, R = 8, T = 8, B = 18, pw = w - L - R, ph = h - T - B;
    const top = Math.max(ev.sun.alt, ev.earth.alt, maxMask(site), 0);
    const ymax = Math.max(12, Math.ceil((top + 4) / 6) * 6), ymin = -6;
    const X = (az) => L + az / 360 * pw, Y = (el) => T + (ymax - el) / (ymax - ymin) * ph;
    const ppd = ph / (ymax - ymin);

    ctx.fillStyle = '#03060d'; ctx.fillRect(L, T, pw, ph);
    for (const s of STARS) {
      const sy = T + s[1] * ph; if (sy > Y(0)) continue;
      ctx.fillStyle = `rgba(255,255,255,${s[3]})`; ctx.fillRect(L + s[0] * pw, sy, s[2], s[2]);
    }
    // below-horizon band
    ctx.fillStyle = '#10131a'; ctx.fillRect(L, Y(0), pw, T + ph - Y(0));

    // grid
    const range = ymax - ymin, step = range <= 24 ? 5 : range <= 48 ? 10 : range <= 90 ? 15 : 30;
    ctx.font = '10px system-ui'; ctx.textBaseline = 'middle'; ctx.textAlign = 'right';
    for (let el = Math.ceil(ymin / step) * step; el <= ymax; el += step) {
      ctx.strokeStyle = el === 0 ? '#6e7a96' : GRID; ctx.lineWidth = el === 0 ? 1.2 : 1;
      ctx.beginPath(); ctx.moveTo(L, Y(el)); ctx.lineTo(L + pw, Y(el)); ctx.stroke();
      ctx.fillStyle = TEXT; ctx.fillText(el + '°', L - 4, Y(el));
    }
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    [[0, 'N'], [45, 'NE'], [90, 'E'], [135, 'SE'], [180, 'S'], [225, 'SW'], [270, 'W'], [315, 'NW'], [360, 'N']].forEach(([az, t]) => {
      ctx.strokeStyle = GRID; ctx.beginPath(); ctx.moveTo(X(az), T); ctx.lineTo(X(az), T + ph); ctx.stroke();
      ctx.fillStyle = TEXT; ctx.fillText(t, X(az), T + ph + 3);
    });

    // terrain mask silhouette
    if (maxMask(site) > 0) {
      ctx.beginPath(); ctx.moveTo(X(0), Y(0));
      for (let az = 0; az <= 360; az += 1) ctx.lineTo(X(az), Y(LE.maskAt(site, az)));
      ctx.lineTo(X(360), Y(0)); ctx.closePath();
      ctx.fillStyle = '#272b34'; ctx.fill();
      ctx.beginPath();
      for (let az = 0; az <= 360; az += 1) { const y = Y(LE.maskAt(site, az)); az ? ctx.lineTo(X(az), y) : ctx.moveTo(X(az), y); }
      ctx.strokeStyle = '#7b8498'; ctx.lineWidth = 1.2; ctx.stroke();
    }

    ctx.save(); ctx.beginPath(); ctx.rect(L, T, pw, ph); ctx.clip();
    const put = (body, draw, minPx, label, col) => {
      const rpx = Math.max(minPx, body.rad * ppd);
      const y = Y(body.alt);
      [0, -pw, pw].forEach((off) => {
        const x = X(body.az) + off;
        if (x < L - rpx * 4 || x > L + pw + rpx * 4) return;
        draw(ctx, x, y, rpx, body.up);
      });
      const lx = Math.min(Math.max(X(body.az), L + 28), L + pw - 28);
      ctx.fillStyle = col; ctx.font = '11px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      const ly = y - rpx - (body.up && label === 'Sun' ? rpx * 3 : 4);
      ctx.fillText(`${label} ${fmtDeg(body.alt)}`, lx, ly < T + 12 ? y + rpx + 14 : ly);
    };
    put({ alt: ev.sun.alt, az: ev.sun.az, rad: ev.sun.rad, up: ev.sunUp }, sunDisc, 4, 'Sun', SUN);
    put({ alt: ev.earth.alt, az: ev.earth.az, rad: ev.earth.rad, up: ev.earthUp }, earthDisc, 5, 'Earth', EARTH);
    ctx.restore();
  }

  /** Polar sky dome: zenith centre, N up, E left (as you look up). */
  function drawDome(canvas, ev, site) {
    const { ctx, w, h } = setup(canvas);
    const cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2 - 20;
    const P = (az, el) => { const r = R * (90 - Math.max(el, -9)) / 90, a = az * Math.PI / 180; return [cx - r * Math.sin(a), cy - r * Math.cos(a)]; };
    ctx.fillStyle = '#03060d'; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.clip();
    for (const s of STARS) { ctx.fillStyle = `rgba(255,255,255,${s[3]})`; ctx.fillRect(cx - R + s[0] * 2 * R, cy - R + s[1] * 2 * R, s[2], s[2]); }
    ctx.restore();
    [30, 60].forEach((el) => { ctx.strokeStyle = GRID; ctx.beginPath(); ctx.arc(cx, cy, R * (90 - el) / 90, 0, 7); ctx.stroke(); });
    for (let az = 0; az < 360; az += 45) { const p = P(az, 0); ctx.strokeStyle = GRID; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(p[0], p[1]); ctx.stroke(); }
    // ground / mask
    ctx.beginPath(); ctx.arc(cx, cy, R + 12, 0, 7);
    for (let az = 360; az >= 0; az -= 2) { const p = P(az, Math.max(0, LE.maskAt(site, az))); az === 360 ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1]); }
    ctx.closePath();
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, R + 12, 0, 7); ctx.clip();
    ctx.fillStyle = '#171a21'; ctx.fill('evenodd'); ctx.restore();
    ctx.strokeStyle = '#7b8498'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.stroke();
    if (maxMask(site) > 0) {
      ctx.beginPath();
      for (let az = 0; az <= 360; az += 2) { const p = P(az, LE.maskAt(site, az)); az ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); }
      ctx.stroke();
    }
    ctx.fillStyle = TEXT; ctx.font = '11px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    [['N', 0], ['E', 90], ['S', 180], ['W', 270]].forEach(([t, az]) => { const p = P(az, -9 - 1.2); ctx.fillText(t, p[0] + (az === 90 ? -4 : az === 270 ? 4 : 0), p[1] + (az === 0 ? -4 : az === 180 ? 4 : 0)); });
    const ppd = R / 90;
    const body = (b, draw, col, label, minPx) => {
      const p = P(b.az, b.alt), rpx = Math.max(minPx, b.rad * ppd);
      draw(ctx, p[0], p[1], rpx, b.up);
      ctx.fillStyle = col; ctx.textAlign = 'left'; ctx.fillText(`${label} ${fmtDeg(b.alt)}`, p[0] + rpx + 6, p[1] - rpx - 2);
    };
    body({ alt: ev.sun.alt, az: ev.sun.az, rad: ev.sun.rad, up: ev.sunUp }, sunDisc, SUN, 'Sun', 4);
    body({ alt: ev.earth.alt, az: ev.earth.az, rad: ev.earth.rad, up: ev.earthUp }, earthDisc, EARTH, 'Earth', 5);
  }

  function dayTicks(days) { return days <= 4 ? 0.5 : days <= 9 ? 1 : days <= 20 ? 2 : days <= 40 ? 5 : 10; }

  /** items: [{color,name,ser}] — all series share duration. cursorMs = offset from T0. */
  function drawTimeline(canvas, items, cursorMs, yMode) {
    const { ctx, w, h } = setup(canvas);
    const L = 40, R = 10, T = 10, B = 22, pw = w - L - R, ph = h - T - B;
    canvas._g = { L, pw, total: 0 };
    if (!items.length) return;
    const total = (items[0].ser.n - 1) * items[0].ser.stepMs;
    canvas._g.total = total;
    const days = total / 86400000;
    let ymin = -10, ymax = 10;
    if (yMode === 'full') { ymin = -90; ymax = 90; }
    const X = (ms) => L + ms / total * pw, Y = (el) => T + (ymax - Math.max(ymin, Math.min(ymax, el))) / (ymax - ymin) * ph;
    ctx.fillStyle = '#060a14'; ctx.fillRect(L, T, pw, ph);
    // below-horizon tint
    ctx.fillStyle = 'rgba(255,255,255,.03)'; ctx.fillRect(L, Y(0), pw, T + ph - Y(0));
    const yStep = yMode === 'full' ? 30 : 5;
    ctx.font = '10px system-ui'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let el = ymin; el <= ymax; el += yStep) {
      ctx.strokeStyle = el === 0 ? '#6e7a96' : GRID; ctx.lineWidth = el === 0 ? 1.2 : 1;
      ctx.beginPath(); ctx.moveTo(L, Y(el)); ctx.lineTo(L + pw, Y(el)); ctx.stroke();
      ctx.fillStyle = TEXT; ctx.fillText(el + '°', L - 5, Y(el));
    }
    const dt = dayTicks(days);
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let d = 0; d <= days + 1e-9; d += dt) {
      const x = X(d * 86400000);
      ctx.strokeStyle = GRID; ctx.beginPath(); ctx.moveTo(x, T); ctx.lineTo(x, T + ph); ctx.stroke();
      ctx.fillStyle = TEXT; ctx.fillText('T+' + (Number.isInteger(d) ? d : d.toFixed(1)) + 'd', x, T + ph + 5);
    }
    ctx.save(); ctx.beginPath(); ctx.rect(L, T, pw, ph); ctx.clip();
    items.forEach((it) => {
      const s = it.ser;
      const line = (arr, dash, width) => {
        ctx.beginPath(); ctx.setLineDash(dash); ctx.strokeStyle = it.color; ctx.lineWidth = width; ctx.globalAlpha = dash.length ? 0.75 : 1;
        for (let i = 0; i < s.n; i++) { const x = X(i * s.stepMs), y = Y(arr[i]); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
        ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
      };
      line(s.earthAlt, [5, 4], 1.3);
      line(s.sunAlt, [], 1.9);
    });
    ctx.restore();
    if (cursorMs != null) {
      const x = X(Math.min(cursorMs, total));
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, T); ctx.lineTo(x, T + ph); ctx.stroke();
    }
  }

  /** Availability lanes: per scenario Sun / Earth / Both. */
  function drawLanes(canvas, items, cursorMs) {
    const lanes = items.length * 3;
    const wantH = Math.max(80, 18 + lanes * 12 + items.length * 6);
    canvas.style.height = wantH + 'px';
    const { ctx, w, h } = setup(canvas);
    const L = 40, R = 10, T = 6, pw = w - L - R;
    canvas._g = { L, pw, total: 0 };
    if (!items.length) return;
    const total = (items[0].ser.n - 1) * items[0].ser.stepMs;
    canvas._g.total = total;
    const laneH = 9, gap = 3, grp = 8;
    let y = T;
    const X = (ms) => L + ms / total * pw;
    items.forEach((it) => {
      const s = it.ser;
      const rows = [['☀', (i) => s.sunUp[i], SUN], ['⌖', (i) => s.earthUp[i], EARTH], ['✓', (i) => s.sunUp[i] && s.earthUp[i], OK]];
      ctx.fillStyle = it.color; ctx.fillRect(2, y, 4, rows.length * (laneH + gap) - gap);
      rows.forEach((row, ri) => {
        const yy = y + ri * (laneH + gap);
        ctx.fillStyle = 'rgba(255,255,255,.05)'; ctx.fillRect(L, yy, pw, laneH);
        ctx.fillStyle = row[2];
        let start = -1;
        for (let i = 0; i <= s.n; i++) {
          const on = i < s.n && row[1](i);
          if (on && start < 0) start = i;
          if (!on && start >= 0) { const x0 = X(start * s.stepMs), x1 = X(i * s.stepMs); ctx.fillRect(x0, yy, Math.max(1, x1 - x0), laneH); start = -1; }
        }
        ctx.fillStyle = TEXT; ctx.font = '10px system-ui'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
        ctx.fillText(row[0], L - 6, yy + laneH / 2 + 0.5);
      });
      y += rows.length * (laneH + gap) - gap + grp;
    });
    if (cursorMs != null) {
      const x = X(Math.min(cursorMs, total));
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, 2); ctx.lineTo(x, h - 2); ctx.stroke();
    }
  }

  function projectPolar(lat, lon, cx, cy, radius) {
    const r = Math.tan((90 + lat) * D2R / 2) / Math.tan(15 * D2R);
    const a = lon * D2R;
    return { x: cx + radius * r * Math.sin(a), y: cy - radius * r * Math.cos(a) };
  }

  function unprojectPolar(x, y, cx, cy, radius) {
    const dx = (x - cx) / radius, dy = (cy - y) / radius;
    const r = Math.hypot(dx, dy);
    if (r > 1 + 1e-12) return null;
    const colat = 2 * Math.atan(Math.min(r, 1) * Math.tan(15 * D2R));
    const lon = ((Math.atan2(dx, dy) * R2D + 540) % 360) - 180;
    return { lat: -90 + colat * R2D, lon };
  }

  function drawPolarMap(canvas, sites, scenarios, activeId) {
    const { ctx, w, h } = setup(canvas);
    const cx = w / 2, cy = h / 2, radius = Math.max(10, Math.min(w * 0.44, h * 0.44));
    ctx.fillStyle = '#050a14'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(76,201,240,.035)'; ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.fill();

    [-80, -70, -60].forEach((lat) => {
      const p = projectPolar(lat, 0, cx, cy, radius);
      const r = Math.hypot(p.x - cx, p.y - cy);
      ctx.strokeStyle = GRID; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = TEXT; ctx.font = '10px system-ui'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(`${Math.abs(lat)}°S`, cx + 4, cy - r + 8);
    });
    for (let lon = 0; lon < 360; lon += 30) {
      const p = projectPolar(-60, lon, cx, cy, radius);
      ctx.strokeStyle = GRID; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(p.x, p.y); ctx.stroke();
      if (lon % 90 === 0) {
        ctx.fillStyle = TEXT; ctx.font = '10px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(`${lon}°`, p.x, p.y);
      }
    }

    const markers = [];
    sites.forEach((site) => {
      if (site.lat > -60 || site.lat < -90) return;
      const point = projectPolar(site.lat, site.lon, cx, cy, radius);
      markers.push({ ...point, site });
      ctx.beginPath(); ctx.arc(point.x, point.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = site.approx ? '#8290a8' : '#c6d3e8';
      if (site.approx) { ctx.strokeStyle = '#8290a8'; ctx.lineWidth = 1.2; ctx.stroke(); }
      else ctx.fill();
    });
    scenarios.forEach((scenario) => {
      if (scenario.lat > -60 || scenario.lat < -90) return;
      const point = projectPolar(scenario.lat, scenario.lon, cx, cy, radius);
      ctx.beginPath(); ctx.arc(point.x, point.y, scenario.id === activeId ? 7 : 5, 0, Math.PI * 2);
      ctx.strokeStyle = scenario.color; ctx.lineWidth = scenario.id === activeId ? 2 : 1.2; ctx.stroke();
      ctx.beginPath(); ctx.arc(point.x, point.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = scenario.color; ctx.fill();
    });
    ctx.fillStyle = TEXT; ctx.font = '11px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('90°S', cx, cy);
    const geometry = { cx, cy, radius, markers };
    canvas._polarGeometry = geometry;
    return geometry;
  }

  /** Landing-window finder. data = LunarEngine.landingWindows result. */
  function drawFinder(canvas, data, missionDays, hoverIdx) {
    const { ctx, w, h } = setup(canvas);
    const L = 44, R = 10, T = 10, B = 24, pw = w - L - R, ph = h - T - B;
    canvas._g = { L, pw, n: data ? data.t.length : 0 };
    ctx.fillStyle = '#060a14'; ctx.fillRect(L, T, pw, ph);
    if (!data || !data.t.length) return;
    const n = data.t.length;
    const maxD = Math.max(missionDays * 1.5, 5, ...data.sunH.map((v) => v / 24), ...data.earthH.map((v) => v / 24));
    const ymax = Math.ceil(maxD / (maxD > 60 ? 10 : 5)) * (maxD > 60 ? 10 : 5) || 5;
    const X = (i) => L + i / (n - 1 || 1) * pw, Y = (d) => T + (1 - Math.min(d, ymax) / ymax) * ph;
    ctx.font = '10px system-ui'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    const gs = ymax <= 20 ? 5 : ymax <= 60 ? 10 : ymax <= 120 ? 20 : 50;
    for (let d = 0; d <= ymax; d += gs) {
      ctx.strokeStyle = GRID; ctx.beginPath(); ctx.moveTo(L, Y(d)); ctx.lineTo(L + pw, Y(d)); ctx.stroke();
      ctx.fillStyle = TEXT; ctx.fillText(d + ' d', L - 5, Y(d));
    }
    // month ticks
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    let lastLabel = -1;
    data.t.forEach((t, i) => {
      const dt = new Date(t);
      if (dt.getUTCDate() <= 1 && dt.getUTCHours() < 3 && i !== lastLabel) {
        lastLabel = i;
        ctx.strokeStyle = GRID; ctx.beginPath(); ctx.moveTo(X(i), T); ctx.lineTo(X(i), T + ph); ctx.stroke();
        const lbl = dt.toLocaleString('en', { month: 'short', timeZone: 'UTC' }) + (dt.getUTCMonth() === 0 ? ' ' + dt.getUTCFullYear() : '');
        ctx.fillStyle = TEXT; ctx.fillText(lbl, X(i), T + ph + 5);
      }
    });
    const colW = Math.max(1, pw / n);
    // feasible band
    for (let i = 0; i < n; i++) {
      if (data.bothH[i] / 24 >= missionDays) { ctx.fillStyle = 'rgba(82,210,115,.14)'; ctx.fillRect(X(i) - colW / 2, T, colW + 0.5, ph); }
    }
    const area = (arr, col, alpha) => {
      ctx.beginPath(); ctx.moveTo(X(0), Y(0));
      for (let i = 0; i < n; i++) ctx.lineTo(X(i), Y(arr[i] / 24));
      ctx.lineTo(X(n - 1), Y(0)); ctx.closePath(); ctx.fillStyle = col; ctx.globalAlpha = alpha; ctx.fill(); ctx.globalAlpha = 1;
    };
    area(data.sunH, SUN, 0.55);
    area(data.earthH, EARTH, 0.4);
    ctx.beginPath(); for (let i = 0; i < n; i++) { const y = Y(data.bothH[i] / 24); i ? ctx.lineTo(X(i), y) : ctx.moveTo(X(i), y); }
    ctx.strokeStyle = OK; ctx.lineWidth = 1.6; ctx.stroke();
    ctx.setLineDash([6, 4]); ctx.strokeStyle = '#ff9f1c'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(L, Y(missionDays)); ctx.lineTo(L + pw, Y(missionDays)); ctx.stroke(); ctx.setLineDash([]);
    if (hoverIdx != null && hoverIdx >= 0 && hoverIdx < n) {
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(X(hoverIdx), T); ctx.lineTo(X(hoverIdx), T + ph); ctx.stroke();
    }
  }

  const api = {
    drawPanorama, drawDome, drawTimeline, drawLanes, drawFinder, drawPolarMap,
    projectPolar, unprojectPolar, SUN, EARTH, OK
  };
  root.LunarCharts = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : this);
