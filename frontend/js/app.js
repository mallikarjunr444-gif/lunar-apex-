/* LunaSight — lunar landing site evaluation application */
(function () {
  'use strict';
  const LE = window.LunarEngine, CH = window.LunarCharts;
  const { MIN, HOUR, DAY } = LE;
  const COLORS = ['#4cc9f0', '#f72585', '#b5e48c', '#ff9f1c', '#c77dff', '#80ed99'];
  const MAX_SC = 5;
  const LUNATION = LE.SYNODIC_DAYS * DAY;
  const store = new LE.FrameStore();
  const $ = (id) => document.getElementById(id);
  let uid = 1;

  const state = {
    scenarios: [], windowDays: 30, missionDays: 7,
    opts: { sunLimb: true, minSunElev: 0, minEarthElev: 0 },
    view: 'panorama', yMode: 'zoom', offsetMs: 0, playing: false, dataSource: 'analytic',
    finderId: null, finderDays: 365, theme: 'dark', terrainProfiles: []
  };

  // ------------------------------------------------------------ formatting
  const p2 = (n) => String(n).padStart(2, '0');
  const dateStr = (ms) => { const d = new Date(ms); return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`; };
  const timeStr = (ms) => { const d = new Date(ms); return `${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`; };
  const utcStr = (ms) => `${dateStr(ms)} ${timeStr(ms)} UTC`;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  function fmtDur(ms) {
    ms = Math.max(0, ms);
    if (ms >= DAY) { const d = Math.floor(ms / DAY), h = Math.round((ms - d * DAY) / HOUR); return h === 24 ? `${d + 1} d` : `${d} d ${h} h`; }
    if (ms >= HOUR) { const h = Math.floor(ms / HOUR), m = Math.round((ms - h * HOUR) / MIN); return m === 60 ? `${h + 1} h` : `${h} h ${m} m`; }
    if (ms >= MIN) return `${Math.round(ms / MIN)} min`;
    return `${Math.round(ms / 1000)} s`;
  }
  const fmtHours = (h) => (h === Infinity ? '> 60 d' : h < 1 ? `${Math.round(h * 60)} min` : h < 48 ? `${h.toFixed(1)} h` : `${(h / 24).toFixed(1)} d`);
  const pct = (v) => (v > 0 && v < 0.1 ? (v * 100).toFixed(1) : (v * 100).toFixed(0)) + '%';
  const deg = (v) => (v == null ? '—' : v.toFixed(1) + '°');
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const normLon = (x) => { x = ((x + 180) % 360 + 360) % 360 - 180; return x === -180 ? 180 : x; };
  const status = (message) => {
    const el = $('app-status'); if (!el) return;
    el.textContent = message;
    clearTimeout(status.timer);
    if (message) status.timer = setTimeout(() => { el.textContent = ''; }, 2600);
  };
  function setTheme(theme) {
    state.theme = theme === 'light' ? 'light' : 'dark';
    document.documentElement.dataset.theme = state.theme;
    localStorage.setItem('lunasight-theme', state.theme);
    $('btn-theme').textContent = state.theme === 'light' ? 'Dark theme' : 'Light theme';
  }

  // -------------------------------------------------------------- scenarios
  function pickColor() { const used = state.scenarios.map((s) => s.color); return COLORS.find((c) => used.indexOf(c) < 0) || COLORS[0]; }
  function terrainProfileFor(site) {
    return site && site.terrainProfileId
      ? state.terrainProfiles.find((profile) => profile.id === site.terrainProfileId) || null
      : null;
  }
  function profileLabel(profile) {
    return profile ? `SIGHTLINE LOLA horizon · ${profile.mastHeightM} m mast` : '';
  }
  function newScenario(siteId, tMs, over) {
    const s = window.LUNAR_SITE_INDEX[siteId];
    const terrain = terrainProfileFor(s);
    return Object.assign({
      id: uid++, siteId: siteId, name: s ? s.name : 'Custom site', autoName: true,
      lat: s ? s.lat : 0, lon: s ? s.lon : 0, h: s ? (s.h || 0) : 0, tMs: tMs, maskDeg: 0,
      profile: terrain ? Float32Array.from(terrain.horizonElevationDeg) : null,
      profileName: profileLabel(terrain), profileId: terrain ? 1 : 0, color: pickColor()
    }, over || {});
  }
  const byId = (id) => state.scenarios.find((s) => s.id === Number(id));
  const siteOf = (sc) => LE.makeSite({ lat: sc.lat, lon: sc.lon, h: sc.h, maskDeg: sc.maskDeg, profile: sc.profile });
  const horizonsKey = (sc) => `${sc.lat}|${sc.lon}|${sc.h}|${sc.tMs + state.offsetMs}`;
  const optKey = () => `${state.opts.sunLimb ? 1 : 0}|${state.opts.minSunElev}|${state.opts.minEarthElev}`;
  const siteKey = (sc) => `${sc.lat}|${sc.lon}|${sc.h}|${sc.maskDeg}|${sc.profileId}|${optKey()}`;

  // ------------------------------------------------------- derived (cached)
  const cache = new Map();
  const liveResults = new Map();
  let liveRequestKey = '';
  let liveLoading = false;
  const liveKey = () => JSON.stringify({
    source: state.dataSource, windowDays: state.windowDays, missionDays: state.missionDays, opts: state.opts,
    scenarios: state.scenarios.map((s) => [s.id, s.siteId, s.lat, s.lon, s.tMs, s.maskDeg, s.profileId])
  });
  function derived(sc) {
    const k = `${siteKey(sc)}|${sc.tMs}|${state.windowDays}`;
    const live = liveResults.get(sc.id);
    if (state.dataSource === 'horizons' && live && live.key === liveKey()) return live.value;
    let d = cache.get(k);
    if (d) return d;
    if (cache.size > 60) cache.clear();
    const site = siteOf(sc);
    const step = state.windowDays <= 7 ? 5 * MIN : state.windowDays <= 15 ? 10 * MIN : 15 * MIN;
    const ser = LE.series(site, store, sc.tMs, sc.tMs + state.windowDays * DAY, step, state.opts);
    const sum = LE.summarize(ser);
    const trS = LE.nextTransition(site, store, sc.tMs, 'sun', state.opts, 60 * DAY, 15 * MIN);
    const trE = LE.nextTransition(site, store, sc.tMs, 'earth', state.opts, 60 * DAY, 15 * MIN);
    const run = (tr) => (tr.up ? (tr.at ? (tr.at - sc.tMs) / HOUR : Infinity) : 0);
    const sunH = run(trS), earthH = run(trE);
    d = { site, ser, sum, mission: { sunH, earthH, bothH: Math.min(sunH, earthH) } };
    cache.set(k, d);
    return d;
  }

  async function loadLiveData() {
    if (state.dataSource !== 'horizons') return;
    if (state.scenarios.some((s) => s.profile)) {
      status('Live Horizons mode is unavailable for uploaded terrain profiles; using the local model.');
      return;
    }
    const key = liveKey();
    if (liveLoading || liveRequestKey === key) return;
    liveLoading = true; liveRequestKey = key; status('Loading live JPL Horizons ephemerides…');
    try {
      const results = await Promise.all(state.scenarios.map(async (sc) => {
        const q = new URLSearchParams({
          site: `${sc.lat}:${sc.lon}`, start: new Date(sc.tMs).toISOString(),
          hours: String(state.windowDays * 24),
          step: state.windowDays <= 7 ? '5' : state.windowDays <= 15 ? '10' : '15',
          horizon: String(sc.maskDeg), minSun: String(state.opts.minSunElev),
          minEarth: String(state.opts.minEarthElev), missionDays: String(state.missionDays), source: 'horizons'
        });
        const response = await fetch(`/api/timeline?${q}`);
        if (!response.ok) throw new Error(`JPL Horizons request failed (${response.status})`);
        return { id: sc.id, result: await response.json() };
      }));
      liveResults.clear();
      let fallback = 0;
      results.forEach(({ id, result }) => {
        if (result.source !== 'horizons') fallback++;
        const continuous = (part) => part.currentlyUp ? (part.hoursUntilChange == null ? Infinity : part.hoursUntilChange) : 0;
        liveResults.set(id, {
          key, value: {
            site: siteOf(byId(id)), ser: result.samples, sum: result.summary,
            mission: { sunH: continuous(result.summary.sun), earthH: continuous(result.summary.earth), bothH: continuous(result.summary.both) }
          }
        });
      });
      cache.clear();
      status(fallback ? `Live Horizons unavailable for ${fallback} site${fallback === 1 ? '' : 's'}; analytic fallback used.` : 'Live JPL Horizons data loaded.');
      refresh({ finder: false, live: false });
    } catch (error) {
      liveResults.clear(); status(`Live data unavailable: ${error.message}`);
    } finally {
      liveLoading = false;
      if (state.dataSource === 'horizons' && liveRequestKey !== liveKey()) {
        liveRequestKey = '';
        loadLiveData();
      }
    }
  }

  // Next rise/set, cached as absolute event times so playback stays cheap.
  function nextEvent(sc, which, td, site) {
    sc._tr = sc._tr || {};
    const k = siteKey(sc), c = sc._tr[which];
    if (c && c.key === k && td >= c.from && td < (c.at || c.from + 30 * DAY)) return c;
    const tr = LE.nextTransition(site, store, td, which, state.opts, 60 * DAY, 15 * MIN);
    sc._tr[which] = { key: k, from: td, at: tr.at, type: tr.type, up: tr.up };
    return sc._tr[which];
  }

  // ----------------------------------------------------------------- cards
  function siteOptions(sc) {
    let h = '';
    window.LUNAR_SITES.forEach((g) => {
      h += `<optgroup label="${esc(g.group)}">` + g.items.map((s) => `<option value="${s.id}"${sc.siteId === s.id ? ' selected' : ''}>${esc(s.name)}${s.approx ? ' ≈' : ''}</option>`).join('') + '</optgroup>';
    });
    return `<option value="custom"${sc.siteId === 'custom' ? ' selected' : ''}>Custom coordinates…</option>` + h;
  }

  function cardHTML(sc) {
    return `
    <article class="card" data-id="${sc.id}" style="--c:${sc.color}">
      <header class="card-h">
        <span class="dot"></span>
        <input class="name f-name" value="${esc(sc.name)}" aria-label="Scenario name">
        <button class="icon" data-act="dup" title="Duplicate (then change its date or site)" aria-label="Duplicate scenario">⧉</button>
        <button class="icon" data-act="rm" title="Remove" aria-label="Remove scenario">✕</button>
      </header>
      <div class="ctl">
        <label class="full">Site <select class="f-site">${siteOptions(sc)}</select></label>
        <label>Latitude (° N+) <input class="f-lat" type="number" step="0.01" min="-90" max="90" value="${sc.lat}"></label>
        <label>Longitude (° E+) <input class="f-lon" type="number" step="0.01" min="-180" max="360" value="${sc.lon}"></label>
        <div class="full">
          <div class="dt">
            <label>Touchdown date (UTC) <input class="f-date" type="date" value="${dateStr(sc.tMs)}"></label>
            <label>Time <input class="f-time" type="time" value="${timeStr(sc.tMs)}"></label>
          </div>
          <div class="nudge" style="margin-top:5px">
            <button data-nudge="${-LUNATION}" title="One lunation earlier">−1 lunation</button>
            <button data-nudge="${-DAY}">−1 d</button><button data-nudge="${DAY}">+1 d</button>
            <button data-nudge="${LUNATION}" title="One lunation later">+1 lunation</button>
          </div>
        </div>
        <label>Terrain mask (°) <input class="f-mask" type="number" step="0.1" min="0" max="45" value="${sc.maskDeg}" title="Uniform horizon elevation from surrounding terrain"></label>
        <div class="file">
          <label style="display:block">Horizon profile (CSV: az,el)<input class="f-file" type="file" accept=".csv,.txt,text/plain,text/csv"></label>
          <span class="pname">${sc.profileName ? esc(sc.profileName) + ' <button class="pclear" data-act="clearp">remove</button>' : ''}</span>
        </div>
      </div>
      <div class="when mono" style="color:var(--mute);font-size:12px"></div>
      <canvas class="sky" aria-label="Sun and Earth positions relative to the horizon"></canvas>
      <div class="chips"></div>
      <dl class="stats"></dl>
      <div class="site-resources">
        <div class="resource-coords">Map coordinates: ${sc.lat.toFixed(4)}° N+, ${sc.lon.toFixed(4)}° E+</div>
        <div class="resource-actions">
          <a class="btn small" href="https://quickmap.lroc.asu.edu/" target="_blank" rel="noopener">QuickMap</a>
          <a class="btn small" href="https://trek.nasa.gov/moon/" target="_blank" rel="noopener">Moon Trek</a>
          <button class="btn small" data-act="copy-coordinates">Copy coordinates</button>
          <button class="btn small" data-act="horizons">Check with JPL Horizons</button>
        </div>
        <output class="horizons-result" aria-live="polite"></output>
      </div>
    </article>`;
  }

  function renderCards() {
    $('cards').innerHTML = state.scenarios.map(cardHTML).join('');
    const sel = $('finder-sc');
    sel.innerHTML = state.scenarios.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
    if (!byId(state.finderId)) state.finderId = state.scenarios[0] ? state.scenarios[0].id : null;
    sel.value = String(state.finderId);
    updateCards();
  }

  function updateCards() {
    const now = performance.now();
    state.scenarios.forEach((sc) => {
      const el = document.querySelector(`.card[data-id="${sc.id}"]`);
      if (!el) return;
      const horizonsResult = el.querySelector('.horizons-result');
      const key = horizonsKey(sc);
      if (horizonsResult.dataset.resultKey && horizonsResult.dataset.resultKey !== key) {
        horizonsResult.textContent = '';
        delete horizonsResult.dataset.resultKey;
      }
      if (horizonsResult.dataset.requestKey && horizonsResult.dataset.requestKey !== key) {
        delete horizonsResult.dataset.requestKey;
        horizonsResult.removeAttribute('aria-busy');
        horizonsResult.textContent = '';
        el.querySelector('[data-act="horizons"]').disabled = false;
      }
      const d = derived(sc);
      const td = sc.tMs + state.offsetMs;
      const ev = LE.evalSite(d.site, store.at(td), state.opts);
      const canvas = el.querySelector('canvas.sky');
      canvas.classList.toggle('dome', state.view === 'dome');
      (state.view === 'dome' ? CH.drawDome : CH.drawPanorama)(canvas, ev, d.site);
      el.querySelector('.when').textContent = `T+${(state.offsetMs / DAY).toFixed(2)} d · ${utcStr(td)}`;

      const m = d.mission, need = state.missionDays * 24;
      const chip = (cls, t) => `<span class="chip ${cls}">${t}</span>`;
      el.querySelector('.chips').innerHTML =
        chip(ev.sunUp ? 'sun' : 'dark', ev.sunUp ? '☀ Sunlit' : '● In darkness') +
        chip(ev.earthUp ? 'earth' : 'dark', ev.earthUp ? '⌖ Earth in view' : '⌖ No Earth link') +
        chip(m.sunH >= need ? 'pass' : 'fail', `Power ${m.sunH >= need ? '✓' : '✗'} ${fmtHours(m.sunH)} from T+0`) +
        chip(m.earthH >= need ? 'pass' : 'fail', `Comm ${m.earthH >= need ? '✓' : '✗'} ${fmtHours(m.earthH)} from T+0`);

      const evS = nextEvent(sc, 'sun', td, d.site), evE = nextEvent(sc, 'earth', td, d.site);
      const cd = (e) => (e.at ? `${fmtDur(e.at - td)}` : '> 60 d');
      const lbl = (e, a, b) => (e.up ? a : b);
      const shadow = ev.sun.alt > 0.05 ? (1 / Math.tan(ev.sun.alt * Math.PI / 180)) : null;
      el.querySelector('.stats').innerHTML = `
        <div><dt>Sun elevation</dt><dd>${ev.sun.alt.toFixed(2)}°<small> az ${ev.sun.az.toFixed(0)}°</small></dd></div>
        <div><dt>Earth elevation</dt><dd>${ev.earth.alt.toFixed(2)}°<small> az ${ev.earth.az.toFixed(0)}°</small></dd></div>
        <div><dt>${lbl(evS, 'Sunset in', 'Sunrise in')}</dt><dd>${cd(evS)}</dd></div>
        <div><dt>${lbl(evE, 'Earthset in', 'Earthrise in')}</dt><dd>${cd(evE)}</dd></div>
        <div><dt>Shadow of a 1 m object</dt><dd>${shadow ? (shadow > 99 ? '> 99' : shadow.toFixed(1)) + ' m' : '—'}</dd></div>
        <div><dt>Sunlit this window</dt><dd>${pct(d.sum.sunFrac)}<small> · Earth ${pct(d.sum.earthFrac)}</small></dd></div>`;
    });
  }

  // ------------------------------------------------------------- timelines
  function drawTimelines() {
    const items = state.scenarios.map((sc) => ({ color: sc.color, name: sc.name, ser: derived(sc).ser }));
    CH.drawTimeline($('tl'), items, state.offsetMs, state.yMode);
    CH.drawLanes($('lanes'), items, state.offsetMs);
  }

  function updateClock() {
    const total = state.windowDays * DAY;
    $('clock').value = String(Math.round(state.offsetMs / total * 1000));
    $('clock-lbl').textContent = `T+${(state.offsetMs / DAY).toFixed(2)} d`;
  }

  // ----------------------------------------------------------------- table
  const ROWS = [
    { sec: 'From touchdown (T+0)' },
    { k: (d) => d.mission.sunH, label: 'Continuous sunlight', f: fmtHours, best: 'max' },
    { k: (d) => d.mission.earthH, label: 'Continuous Earth contact', f: fmtHours, best: 'max' },
    { k: (d) => d.mission.bothH, label: 'Sun + Earth together', f: fmtHours, best: 'max' },
    { verdict: true },
    { sec: 'Over the window' },
    { k: (d) => d.sum.sunFrac, label: 'Sunlit', f: pct, best: 'max' },
    { k: (d) => d.sum.earthFrac, label: 'Earth in view', f: pct, best: 'max' },
    { k: (d) => d.sum.bothFrac, label: 'Sun + Earth together', f: pct, best: 'max' },
    { k: (d) => d.sum.longestSunH, label: 'Longest sunlit stretch', f: fmtHours, best: 'max' },
    { k: (d) => d.sum.longestDarkH, label: 'Longest dark stretch', f: fmtHours, best: 'min' },
    { k: (d) => d.sum.longestEarthOutH, label: 'Longest Earth outage', f: fmtHours, best: 'min' },
    { k: (d) => d.sum.sunsets, label: 'Sunsets', f: (v) => v, best: 'min' },
    { k: (d) => d.sum.earthsets, label: 'Earthsets', f: (v) => v, best: 'min' },
    { sec: 'Geometry & power proxies' },
    { k: (d) => d.sum.maxSunAlt, label: 'Peak Sun elevation', f: deg, best: 'max' },
    { k: (d) => d.sum.meanSunAlt, label: 'Mean Sun elevation while lit', f: deg, best: 'max' },
    { k: (d) => d.sum.maxEarthAlt, label: 'Peak Earth elevation', f: deg, best: 'max' },
    { k: (d) => d.sum.energyHoriz, label: 'Energy · flat panel (% of Sun-normal)', f: pct, best: 'max' },
    { k: (d) => d.sum.energyVert, label: 'Energy · Sun-facing vertical array (% of Sun-normal)', f: pct, best: 'max' },
    { k: (d) => d.sum.shadowPer1m, label: 'Shadow of a 1 m object (mean, lit)', f: (v) => (v == null ? '—' : (v > 99 ? '> 99' : v.toFixed(1)) + ' m'), best: 'min' }
  ];

  function renderTable() {
    const sc = state.scenarios, ds = sc.map(derived);
    const need = state.missionDays * 24;
    $('table-sub').textContent = `Window: ${state.windowDays} days after each touchdown · mission length ${state.missionDays} d · green = best value in the row.`;
    let h = '<thead><tr><th></th>' + sc.map((s) => `<th><span class="dot" style="background:${s.color}"></span>${esc(s.name)}<div style="font-weight:400;color:var(--mute);font-size:11px">${utcStr(s.tMs)}</div></th>`).join('') + '</tr></thead><tbody>';
    ROWS.forEach((r) => {
      if (r.sec) { h += `<tr class="sec"><td colspan="${sc.length + 1}">${r.sec}</td></tr>`; return; }
      if (r.verdict) {
        h += `<tr><td>Meets a ${state.missionDays}-day mission?</td>` + ds.map((d) => {
          const p = d.mission.sunH >= need, c = d.mission.earthH >= need, b = d.mission.bothH >= need;
          return `<td><span class="${p ? 'pass' : 'fail'}">Power ${p ? '✓' : '✗'}</span> · <span class="${c ? 'pass' : 'fail'}">Comm ${c ? '✓' : '✗'}</span> · <span class="${b ? 'pass' : 'fail'}">Both ${b ? '✓' : '✗'}</span></td>`;
        }).join('') + '</tr>';
        return;
      }
      const vals = ds.map(r.k);
      const nums = vals.filter((v) => typeof v === 'number' && isFinite(v) || v === Infinity);
      let best = null;
      if (nums.length > 1 && nums.some((v) => v !== nums[0])) best = r.best === 'max' ? Math.max(...nums) : Math.min(...nums);
      h += `<tr><td>${r.label}</td>` + vals.map((v) => `<td class="${best !== null && v === best ? 'best' : ''}">${v == null ? '—' : r.f(v)}</td>`).join('') + '</tr>';
    });
    $('cmp').innerHTML = h + '</tbody>';
  }

  function exportCsv() {
    const rows = [['Scenario', 'Site', 'Touchdown UTC', 'Window days', 'Mission days', 'Sunlit', 'Earth in view', 'Sun + Earth', 'Continuous sunlight hours', 'Continuous Earth hours', 'Meets mission']];
    state.scenarios.forEach((sc) => {
      const d = derived(sc), need = state.missionDays * 24;
      rows.push([
        sc.name, `${sc.lat.toFixed(4)}, ${sc.lon.toFixed(4)}`, utcStr(sc.tMs), state.windowDays, state.missionDays,
        pct(d.sum.sunFrac), pct(d.sum.earthFrac), pct(d.sum.bothFrac),
        fmtHours(d.mission.sunH), fmtHours(d.mission.earthH),
        d.mission.sunH >= need && d.mission.earthH >= need ? 'yes' : 'no'
      ]);
    });
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = `lunasight-${dateStr(Date.now())}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    status('Comparison exported as CSV.');
  }

  // ---------------------------------------------------------------- finder
  let finderTimer = null, finderData = null, finderSc = null;
  function scheduleFinder() {
    clearTimeout(finderTimer);
    $('finder').classList.add('busy');
    finderTimer = setTimeout(renderFinder, 220);
  }
  function renderFinder() {
    const sc = byId(state.finderId);
    if (!sc) { CH.drawFinder($('finder'), null, 7); $('finder-out').innerHTML = ''; return; }
    const site = siteOf(sc);
    finderData = LE.landingWindows(site, store, sc.tMs, state.finderDays, state.opts, { stepMs: 15 * MIN, landStepMs: 3 * HOUR, lookaheadDays: 45 });
    finderSc = sc;
    $('finder').classList.remove('busy');
    CH.drawFinder($('finder'), finderData, state.missionDays, null);
    finderSummary();
  }
  function ranges(data, arr, needH) {
    const out = []; let s = -1;
    for (let i = 0; i <= arr.length; i++) {
      const ok = i < arr.length && arr[i] >= needH;
      if (ok && s < 0) s = i;
      if (!ok && s >= 0) { out.push([s, i - 1]); s = -1; }
    }
    return out;
  }
  function finderSummary() {
    const d = finderData, need = state.missionDays * 24, box = $('finder-out');
    const list = (title, arr) => {
      const rs = ranges(d, arr, need);
      if (!rs.length) return `<div><b>${title}:</b> no touchdown date in the next ${state.finderDays} days gives ${state.missionDays} d without interruption.</div>`;
      const share = rs.reduce((a, r) => a + (r[1] - r[0] + 1), 0) / d.t.length;
      return `<div><b>${title}:</b> ${rs.length} window${rs.length > 1 ? 's' : ''}, ${pct(share)} of dates qualify.<ul>` +
        rs.slice(0, 4).map((r) => `<li>${dateStr(d.t[r[0]])} ${timeStr(d.t[r[0]])} → ${dateStr(d.t[r[1]])} ${timeStr(d.t[r[1]])} UTC <button class="nudge-btn btn small" data-set="${d.t[r[0]]}">use start</button></li>`).join('') +
        (rs.length > 4 ? `<li>… and ${rs.length - 4} more</li>` : '') + '</ul></div>';
    };
    box.innerHTML = list('Power and Earth contact together', d.bothH) + list('Sunlight alone', d.sunH);
  }

  // ------------------------------------------------------------------ tiles
  function renderTiles() {
    const sc = state.scenarios[0], tiles = [];
    tiles.push(['29.5 d', 'One lunar day', 'Sunrise to sunrise takes a full lunation. The Sun creeps ~0.5° per hour across the lunar sky — 30× slower than on Earth — so a site can be lit or dark for two weeks.']);
    tiles.push(['0°', 'No atmosphere, no twilight', 'No refraction or scattering: sunset is abrupt, shadows are razor-sharp and the sky is black even at noon. The horizon is purely geometry plus terrain.']);
    tiles.push(['38 m', 'Shadow of a 1 m object', 'At the poles the Sun never rises above ~1.5°, so a 1 m mast casts a shadow up to ~38 m long. Craters rims and floors swing between sun and permanent shadow.']);
    tiles.push(['±7°', 'Earth barely moves', 'Libration wobbles Earth by about ±7° in longitude and ±6.7° in latitude. At near-side sites Earth is fixed in the sky; at the poles it hugs the horizon, so terrain can end the radio link.']);
    if (sc) {
      const site = siteOf(sc);
      const a = LE.nextTransition(site, store, sc.tMs, 'sun', state.opts, 60 * DAY, 15 * MIN);
      const b = LE.nextTransition(site, store, sc.tMs + DAY, 'sun', state.opts, 60 * DAY, 15 * MIN);
      const t = (x, t0) => (x.up ? (x.at ? fmtDur(x.at - t0) : '> 60 d') : 'darkness');
      tiles.push([`${t(a, sc.tMs)} → ${t(b, sc.tMs + DAY)}`, 'One day later changes everything', `At ${esc(sc.name)}, touching down on ${dateStr(sc.tMs)} gives sunlight for ${t(a, sc.tMs)}; one day later, ${t(b, sc.tMs + DAY)}${b.up ? '' : ' (still dark)'}.`]);
    }
    $('tiles').innerHTML = tiles.map((x) => `<div class="tile"><div class="big">${x[0]}</div><h3>${x[1]}</h3><p>${x[2]}</p></div>`).join('');
  }

  function renderResources() {
    $('resource-tiles').innerHTML = window.LUNAR_RESOURCES.map((resource) =>
      `<article class="tile resource-tile">
        <span class="role">${esc(resource.role)}</span>
        <h3>${esc(resource.name)}</h3>
        <p>${esc(resource.summary)}</p>
        <a href="${esc(resource.url)}" target="_blank" rel="noopener">Open ${esc(resource.name)} ↗</a>
      </article>`
    ).join('');
    $('research-groups').innerHTML = window.LUNAR_RESEARCH_GROUPS.map((group) =>
      `<section class="research-group">
        <h3>${esc(group.title)}</h3>
        <ul>${group.items.map((item) =>
          `<li>
            <a href="${esc(item.url)}" target="_blank" rel="noopener">${esc(item.name)} ↗</a>
            <p>${esc(item.summary)}</p>
            ${item.status ? `<p class="review-note">${esc(item.status)}</p>` : ''}
          </li>`
        ).join('')}</ul>
      </section>`
    ).join('');
  }

  async function checkHorizons(sc, card, button) {
    const output = card.querySelector('.horizons-result');
    const key = horizonsKey(sc);
    const date = new Date(sc.tMs + state.offsetMs).toISOString();
    button.disabled = true;
    output.dataset.requestKey = key;
    output.setAttribute('aria-busy', 'true');
    output.textContent = 'Requesting an independent JPL Horizons ephemeris…';
    try {
      const response = await fetch('/api/horizons/compare', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          scenario: {
            id: String(sc.id), name: sc.name, lat: sc.lat, lon: sc.lon,
            date, h: sc.h, maskDeg: sc.maskDeg
          }
        })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error && result.error.message || 'Horizons request failed.');
      if (output.dataset.requestKey !== key) return;
      const fmt = (value) => {
        const signed = (number) => `${number >= 0 ? '+' : ''}${number.toFixed(2)}°`;
        return `elev ${value.local.altitudeDeg.toFixed(2)}° / ${value.horizons.altitudeDeg.toFixed(2)}° (Δ ${signed(value.differenceDeg.altitude)}), az ${value.local.azimuthDeg.toFixed(2)}° / ${value.horizons.azimuthDeg.toFixed(2)}° (Δ ${signed(value.differenceDeg.azimuth)})`;
      };
      output.textContent = `${result.source} · ${result.date}. Sun: ${fmt(result.positions.sun)}; Earth: ${fmt(result.positions.earth)}. Values are local model / Horizons.`;
      output.dataset.resultKey = key;
    } catch (error) {
      if (output.dataset.requestKey === key) {
        output.textContent = `JPL Horizons comparison unavailable: ${error.message}`;
        output.dataset.resultKey = key;
      }
    } finally {
      if (output.dataset.requestKey === key) {
        delete output.dataset.requestKey;
        output.removeAttribute('aria-busy');
        button.disabled = false;
      }
    }
  }

  // -------------------------------------------------------------- hash I/O
  function saveHash() {
    try {
      const o = state.opts;
      const sc = state.scenarios.map((s) => [s.lat, s.lon, new Date(s.tMs).toISOString().slice(0, 16), s.maskDeg, encodeURIComponent(s.name)].join(','));
      const h = `#w=${state.windowDays}&m=${state.missionDays}&u=${o.minSunElev}&e=${o.minEarthElev}&l=${o.sunLimb ? 1 : 0}&v=${state.view}&s=${sc.join('|')}`;
      history.replaceState(null, '', h);
    } catch (e) { /* ignore */ }
  }
  function loadHash() {
    try {
      const q = new URLSearchParams(location.hash.slice(1));
      if (!q.get('s')) return false;
      state.windowDays = Number(q.get('w')) || 30; state.missionDays = Number(q.get('m')) || 7;
      state.opts.minSunElev = Number(q.get('u')) || 0; state.opts.minEarthElev = Number(q.get('e')) || 0;
      state.opts.sunLimb = q.get('l') !== '0'; state.view = q.get('v') === 'dome' ? 'dome' : 'panorama';
      state.scenarios = [];
      q.get('s').split('|').slice(0, MAX_SC).forEach((part) => {
        const f = part.split(',');
        const lat = Number(f[0]), lon = Number(f[1]), t = Date.parse(f[2] + ':00Z');
        if (!isFinite(lat) || !isFinite(lon) || !isFinite(t)) return;
        const match = Object.values(window.LUNAR_SITE_INDEX).find((s) => s.lat === lat && s.lon === lon);
        state.scenarios.push(newScenario(match ? match.id : 'custom', t, { lat, lon, maskDeg: Number(f[3]) || 0, name: decodeURIComponent(f[4] || 'Custom site'), autoName: false }));
      });
      return state.scenarios.length > 0;
    } catch (e) { return false; }
  }

  // ---------------------------------------------------------------- refresh
  function refresh(opt) {
    opt = opt || {};
    state.offsetMs = clamp(state.offsetMs, 0, state.windowDays * DAY);
    updateCards(); drawTimelines(); renderTable(); updateClock(); renderTiles(); saveHash();
    if (opt.finder !== false) scheduleFinder();
    if (state.dataSource === 'horizons' && opt.live !== false) loadLiveData();
  }
  function refreshDynamic() { updateCards(); drawTimelines(); updateClock(); }

  // ---------------------------------------------------------------- events
  function syncInputs(sc) {
    const el = document.querySelector(`.card[data-id="${sc.id}"]`);
    if (!el) return;
    el.querySelector('.f-lat').value = sc.lat; el.querySelector('.f-lon').value = sc.lon;
    el.querySelector('.f-site').value = sc.siteId;
    el.querySelector('.f-date').value = dateStr(sc.tMs); el.querySelector('.f-time').value = timeStr(sc.tMs);
    el.querySelector('.f-name').value = sc.name; el.querySelector('.f-mask').value = sc.maskDeg;
    el.querySelector('.pname').innerHTML = sc.profileName ? `${esc(sc.profileName)} <button class="pclear" data-act="clearp">remove</button>` : '';
  }
  function syncFinderSelect() {
    $('finder-sc').innerHTML = state.scenarios.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
    $('finder-sc').value = String(state.finderId);
  }

  function bind() {
    const cards = $('cards');
    cards.addEventListener('input', (e) => {
      const el = e.target.closest('.card'); if (!el) return;
      const sc = byId(el.dataset.id), t = e.target;
      if (t.classList.contains('f-name')) { sc.name = t.value; sc.autoName = false; syncFinderSelect(); saveHash(); return; }
      if (t.classList.contains('f-lat') || t.classList.contains('f-lon')) {
        const v = parseFloat(t.value); if (!isFinite(v)) return;
        if (t.classList.contains('f-lat')) sc.lat = clamp(v, -90, 90); else sc.lon = normLon(v);
        sc.siteId = 'custom'; el.querySelector('.f-site').value = 'custom';
        sc.h = 0; sc.profile = null; sc.profileName = ''; sc.profileId++;
        el.querySelector('.pname').textContent = '';
        if (sc.autoName) { sc.name = `Custom ${sc.lat.toFixed(2)}°, ${sc.lon.toFixed(2)}°`; el.querySelector('.f-name').value = sc.name; syncFinderSelect(); }
        refresh(); return;
      }
      if (t.classList.contains('f-mask')) { sc.maskDeg = clamp(parseFloat(t.value) || 0, 0, 45); refresh(); return; }
    });
    cards.addEventListener('change', (e) => {
      const el = e.target.closest('.card'); if (!el) return;
      const sc = byId(el.dataset.id), t = e.target;
      if (t.classList.contains('f-site')) {
        const s = window.LUNAR_SITE_INDEX[t.value];
        sc.siteId = t.value;
        if (s) {
          sc.lat = s.lat; sc.lon = s.lon;
          if (sc.autoName) sc.name = s.name;
        }
        const terrain = terrainProfileFor(s);
        sc.h = s ? (s.h || 0) : 0;
        sc.profile = terrain ? Float32Array.from(terrain.horizonElevationDeg) : null;
        sc.profileName = profileLabel(terrain); sc.profileId++;
        syncInputs(sc); syncFinderSelect(); refresh(); return;
      }
      if (t.classList.contains('f-date') || t.classList.contains('f-time')) {
        const ms = Date.parse(`${el.querySelector('.f-date').value}T${el.querySelector('.f-time').value || '00:00'}:00Z`);
        if (isFinite(ms)) { sc.tMs = ms; refresh(); }
        return;
      }
      if (t.classList.contains('f-file') && t.files && t.files[0]) {
        const file = t.files[0], rd = new FileReader();
        rd.onload = () => {
          const prof = LE.parseHorizonProfile(String(rd.result));
          if (!prof) { el.querySelector('.pname').textContent = 'Could not read — expected rows of "azimuth, elevation".'; return; }
          sc.profile = prof; sc.profileName = file.name; sc.profileId++; syncInputs(sc); refresh();
        };
        rd.readAsText(file);
      }
    });
    cards.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      const el = b.closest('.card'); if (!el) return;
      const sc = byId(el.dataset.id);
      if (b.dataset.act === 'horizons') { checkHorizons(sc, el, b); return; }
      if (b.dataset.act === 'copy-coordinates') {
        const coordinates = `${sc.lat.toFixed(6)}, ${sc.lon.toFixed(6)}`;
        if (navigator.clipboard) navigator.clipboard.writeText(coordinates).catch(() => window.prompt('Copy lunar latitude, longitude:', coordinates));
        else window.prompt('Copy lunar latitude, longitude:', coordinates);
        return;
      }
      if (b.dataset.nudge) { sc.tMs += Number(b.dataset.nudge); syncInputs(sc); refresh(); return; }
      if (b.dataset.act === 'clearp') { sc.profile = null; sc.profileName = ''; sc.profileId++; syncInputs(sc); refresh(); return; }
      if (b.dataset.act === 'rm') {
        if (state.scenarios.length <= 1) return;
        state.scenarios = state.scenarios.filter((s) => s !== sc);
        renderCards(); refresh(); return;
      }
      if (b.dataset.act === 'dup') {
        if (state.scenarios.length >= MAX_SC) return;
        const copy = Object.assign({}, sc, { id: uid++, color: pickColor(), name: sc.name + ' (copy)', autoName: false, _tr: null, tMs: sc.tMs + DAY });
        state.scenarios.splice(state.scenarios.indexOf(sc) + 1, 0, copy);
        renderCards(); refresh();
      }
    });

    $('shift-btns').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      const m = b.dataset.shift.match(/^(-?\d+)([dh])$/); if (!m) return;
      const ms = Number(m[1]) * (m[2] === 'd' ? DAY : HOUR);
      state.scenarios.forEach((s) => { s.tMs += ms; syncInputs(s); });
      refresh();
    });
    $('btn-now').addEventListener('click', () => { const n = Math.floor(Date.now() / MIN) * MIN; state.scenarios.forEach((s) => { s.tMs = n; syncInputs(s); }); refresh(); });
    $('btn-sync').addEventListener('click', () => { const t = state.scenarios[0].tMs; state.scenarios.forEach((s) => { s.tMs = t; syncInputs(s); }); refresh(); });
    $('win').addEventListener('change', (e) => { state.windowDays = Number(e.target.value); refresh({ finder: false }); });
    const num = (id, fn) => $(id).addEventListener('input', (e) => { const v = parseFloat(e.target.value); if (isFinite(v)) { fn(v); refresh(); } });
    num('missionDays', (v) => { state.missionDays = clamp(v, 0.5, 60); });
    num('minSun', (v) => { state.opts.minSunElev = v; });
    num('minEarth', (v) => { state.opts.minEarthElev = v; });
    $('data-source').addEventListener('change', (e) => {
      state.dataSource = e.target.value === 'horizons' ? 'horizons' : 'analytic';
      liveResults.clear(); liveRequestKey = ''; cache.clear();
      refresh({ finder: false });
    });
    $('limb').addEventListener('change', (e) => { state.opts.sunLimb = e.target.checked; refresh(); });
    $('view-btns').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; state.view = b.dataset.view; markSeg('view-btns', 'view', state.view); updateCards(); saveHash(); });
    $('y-btns').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; state.yMode = b.dataset.y; markSeg('y-btns', 'y', state.yMode); drawTimelines(); });
    $('btn-add').addEventListener('click', () => {
      if (state.scenarios.length >= MAX_SC) return;
      const last = state.scenarios[state.scenarios.length - 1];
      const used = state.scenarios.map((s) => s.siteId);
      const all = Object.keys(window.LUNAR_SITE_INDEX);
      state.scenarios.push(newScenario(all.find((id) => used.indexOf(id) < 0) || 'pole', last ? last.tMs : Date.now()));
      renderCards(); refresh();
    });
    $('btn-help').addEventListener('click', (e) => { const h = $('help'); h.hidden = !h.hidden; e.currentTarget.setAttribute('aria-expanded', String(!h.hidden)); });
    $('btn-share').addEventListener('click', async (e) => {
      saveHash();
      try { await navigator.clipboard.writeText(location.href); e.target.textContent = 'Link copied ✓'; }
      catch (err) { window.prompt('Copy this link:', location.href); }
      setTimeout(() => { e.target.textContent = 'Copy link'; }, 1800);
    });
    $('btn-export').addEventListener('click', exportCsv);
    $('btn-theme').addEventListener('click', () => setTheme(state.theme === 'light' ? 'dark' : 'light'));
    window.addEventListener('keydown', (e) => {
      if (e.key.toLowerCase() === 't' && !/input|select|textarea/i.test(e.target.tagName)) {
        setTheme(state.theme === 'light' ? 'dark' : 'light');
      }
    });

    // clock, scrubbing, playback
    $('clock').addEventListener('input', (e) => { state.offsetMs = Number(e.target.value) / 1000 * state.windowDays * DAY; refreshDynamic(); });
    const scrub = (canvas) => {
      const set = (ev) => {
        const g = canvas._g; if (!g || !g.total) return;
        const r = canvas.getBoundingClientRect();
        state.offsetMs = clamp((ev.clientX - r.left - g.L) / g.pw, 0, 1) * g.total;
        refreshDynamic();
      };
      let down = false;
      canvas.addEventListener('pointerdown', (ev) => { down = true; canvas.setPointerCapture(ev.pointerId); set(ev); });
      canvas.addEventListener('pointermove', (ev) => { if (down) set(ev); });
      canvas.addEventListener('pointerup', () => { down = false; });
      canvas.addEventListener('pointercancel', () => { down = false; });
    };
    scrub($('tl')); scrub($('lanes'));
    $('btn-reset').addEventListener('click', () => { state.offsetMs = 0; refreshDynamic(); });
    $('btn-play').addEventListener('click', () => setPlaying(!state.playing));

    $('finder-sc').addEventListener('change', (e) => { state.finderId = Number(e.target.value); scheduleFinder(); });
    $('finder-days').addEventListener('change', (e) => { state.finderDays = Number(e.target.value); scheduleFinder(); });
    $('finder-out').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-set]'); if (!b) return;
      const sc = byId(state.finderId); if (!sc) return;
      sc.tMs = Number(b.dataset.set); syncInputs(sc); refresh();
      document.querySelector(`.card[data-id="${sc.id}"]`).scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    const fin = $('finder');
    fin.addEventListener('pointermove', (ev) => {
      const g = fin._g, d = finderData; if (!g || !d) return;
      const r = fin.getBoundingClientRect();
      const i = Math.round(clamp((ev.clientX - r.left - g.L) / g.pw, 0, 1) * (d.t.length - 1));
      CH.drawFinder(fin, d, state.missionDays, i);
      let tip = fin.parentNode.querySelector('.tip');
      if (!tip) { tip = document.createElement('div'); tip.className = 'tip'; fin.parentNode.appendChild(tip); }
      tip.innerHTML = `<b>${utcStr(d.t[i])}</b><br>Sunlight ${fmtHours(d.sunH[i])}${d.capped[i] && d.sunH[i] >= d.lookaheadH ? '+' : ''} · Earth ${fmtHours(d.earthH[i])} · Both ${fmtHours(d.bothH[i])}`;
      tip.style.left = clamp(ev.clientX - r.left, 90, r.width - 90) + 'px'; tip.style.top = (ev.clientY - r.top) + 'px';
    });
    fin.addEventListener('pointerleave', () => { const tip = fin.parentNode.querySelector('.tip'); if (tip) tip.remove(); if (finderData) CH.drawFinder(fin, finderData, state.missionDays, null); });

    let rz = null;
    window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { refreshDynamic(); if (finderData) CH.drawFinder($('finder'), finderData, state.missionDays, null); }, 120); });
  }

  function markSeg(id, key, val) { document.querySelectorAll(`#${id} button`).forEach((b) => b.classList.toggle('on', b.dataset[key] === val)); }

  let raf = 0, last = 0;
  function setPlaying(on) {
    state.playing = on;
    $('btn-play').textContent = on ? '❚❚ Pause' : '▶ Play';
    cancelAnimationFrame(raf);
    if (!on) return;
    last = performance.now();
    const tick = (now) => {
      const dt = Math.min(100, now - last); last = now;
      state.offsetMs += Number($('speed').value) * dt / 1000;
      if (state.offsetMs > state.windowDays * DAY) state.offsetMs = 0;
      refreshDynamic();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }

  // ------------------------------------------------------------------ init
  async function init() {
    try {
      const response = await fetch('/api/terrain/profiles');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const catalog = await response.json();
      if (catalog.schemaVersion !== 1 || !Array.isArray(catalog.profiles)
          || catalog.profiles.some((profile) => !profile || typeof profile.id !== 'string'
            || !Array.isArray(profile.horizonElevationDeg)
            || profile.horizonElevationDeg.length !== catalog.sampling.azimuthSamples
            || profile.horizonElevationDeg.some((value) => !Number.isFinite(value)))) {
        throw new Error('Invalid terrain profile catalog');
      }
      state.terrainProfiles = catalog.profiles;
      $('terrain-status-text').textContent = `LOLA horizons ready: ${catalog.profiles.length} sites, ${catalog.sampling.azimuthStepDeg}° bearings, ${catalog.sampling.mastHeightM} m mast.`;
      $('terrain-status').classList.remove('terrain-warning');
    } catch (error) {
      $('terrain-status-text').textContent = 'LOLA terrain profiles could not be loaded; terrain-preset sites will use the smooth-horizon fallback.';
      $('terrain-status').classList.add('terrain-warning');
      console.error('Terrain profiles unavailable:', error);
    }
    const savedTheme = localStorage.getItem('lunasight-theme');
    setTheme(savedTheme || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'));
    if (!loadHash()) {
      const t0 = Math.floor(Date.now() / HOUR) * HOUR;
      state.scenarios = [];
      ['sightline-shackleton-rim', 'malapert', 'im1'].forEach((id) => state.scenarios.push(newScenario(id, t0)));
    }
    $('win').value = String(state.windowDays);
    $('missionDays').value = state.missionDays; $('minSun').value = state.opts.minSunElev; $('minEarth').value = state.opts.minEarthElev;
    $('data-source').value = state.dataSource;
    $('limb').checked = state.opts.sunLimb;
    markSeg('view-btns', 'view', state.view); markSeg('y-btns', 'y', state.yMode);
    bind(); renderResources(); renderCards(); refresh();
  }

  window.__lunar = { state, store, refresh, derived, LE };   // handy for debugging in the console
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
