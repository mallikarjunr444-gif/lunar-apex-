const $ = (id) => document.getElementById(id);
const MAX = 4;
let sites = [], selected = new Set(["shackleton", "malapert"]);
const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const fmtH = (h) => h == null ? "—" : h >= 48 ? `${(h / 24).toFixed(1)} days` : `${h.toFixed(1)} h`;
const fmtT = (t) => new Date(t).toISOString().slice(0, 16).replace("T", " ") + " UTC";

function renderSites() {
  const groups = {};
  sites.forEach((s) => (groups[s.group] ||= []).push(s));
  $("siteList").innerHTML = Object.entries(groups).map(([g, list]) =>
    `<div class="grp">${g}</div>` + list.map((s) =>
      `<label title="${s.note || ""}"><input type="checkbox" value="${s.id}" ${selected.has(s.id) ? "checked" : ""}> ${s.name}</label>`).join("")).join("");
  $("siteList").querySelectorAll("input").forEach((el) => el.addEventListener("change", () => {
    if (el.checked && selected.size >= MAX) { el.checked = false; $("status").textContent = `You can compare up to ${MAX} sites.`; return; }
    el.checked ? selected.add(el.value) : selected.delete(el.value);
  }));
}

function toIso(local) { return local ? local + ":00Z" : new Date().toISOString(); }

async function run() {
  if (!selected.size) { $("status").textContent = "Select at least one site."; return; }
  $("status").textContent = "Calculating…"; $("run").disabled = true;
  const q = new URLSearchParams({ sites: [...selected].join(","), start: toIso($("start").value), hours: $("hours").value,
    horizon: $("horizon").value || 0, source: $("source").value, step: +$("hours").value > 400 ? 120 : 60 });
  try {
    const res = await fetch(`/api/compare?${q}`); const data = await res.json();
    if (!res.ok) throw new Error(data.error || res.statusText);
    $("empty").hidden = true; render(data);
    const note = data.find((d) => d.source.startsWith("analytic (")); 
    $("status").textContent = note ? note.source : `Source: ${data[0].source}`;
  } catch (e) { $("status").textContent = `Could not load data: ${e.message}`; }
  $("run").disabled = false;
}

function render(data) {
  $("cards").innerHTML = "";
  data.forEach((d) => {
    const { sun, earth } = d.summary, s0 = d.samples[0];
    const card = document.createElement("section"); card.className = "card";
    const sunLine = sun.hoursUntilChange == null ? (sun.currentlyUp ? "No sunset in window" : "No sunrise in window")
      : `${fmtH(sun.hoursUntilChange)} to ${sun.currentlyUp ? "sunset" : "sunrise"}`;
    const earthLine = earth.hoursUntilChange == null ? (earth.currentlyUp ? "No Earthset in window" : "Earth never rises in window")
      : `${fmtH(earth.hoursUntilChange)} to ${earth.currentlyUp ? "Earthset" : "Earthrise"}`;
    card.innerHTML = `
      <h2>${d.site.name}</h2>
      <p class="note">${d.site.lat.toFixed(2)}°, ${d.site.lon.toFixed(2)}° · ${d.site.note || "Custom coordinates"}</p>
      <div class="verdict">
        <div class="sun"><b>${sun.percentUp}%</b><span>Sunlit · ${sunLine}</span></div>
        <div class="earth"><b>${earth.percentUp}%</b><span>Earth in view · ${earthLine}</span></div>
      </div>
      <div class="layout"><canvas class="tl" aria-label="Sun and Earth elevation over time"></canvas><canvas class="sky" aria-label="Sky view"></canvas></div>
      <p class="readout"></p>
      <table>
        <tr><td>Longest darkness</td><td>${fmtH(sun.longestDownHours)}</td></tr>
        <tr><td>Longest continuous sunlight</td><td>${fmtH(sun.longestUpHours)}</td></tr>
        <tr><td>Peak Sun elevation</td><td>${sun.maxElevation}°</td></tr>
        <tr><td>Longest Earth blackout</td><td>${fmtH(earth.longestDownHours)}</td></tr>
        <tr><td>Relative solar power (horizontal panel)</td><td>${(d.summary.relativePower * 100).toFixed(0)}%</td></tr>
      </table>`;
    $("cards").appendChild(card);
    const tl = card.querySelector(".tl"), sky = card.querySelector(".sky"), ro = card.querySelector(".readout");
    let idx = 0;
    const draw = () => { drawTimeline(tl, d, idx); drawSky(sky, d, idx); const s = d.samples[idx];
      ro.innerHTML = `<b>${fmtT(s.t)}</b> — Sun ${s.sun.el.toFixed(1)}° ${s.sun.up ? "" : "(below horizon)"}, Earth ${s.earth.el.toFixed(1)}° ${s.earth.up ? "" : "(below horizon)"}`; };
    const move = (ev) => { const r = tl.getBoundingClientRect(); const x = (ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left;
      idx = Math.max(0, Math.min(d.samples.length - 1, Math.round(((x - 34) / (r.width - 44)) * (d.samples.length - 1)))); draw(); };
    tl.addEventListener("pointermove", move); tl.addEventListener("pointerdown", move);
    new ResizeObserver(draw).observe(card); draw();
  });
}

function setup(c) { const dpr = devicePixelRatio || 1, r = c.getBoundingClientRect(); c.width = r.width * dpr; c.height = r.height * dpr;
  const g = c.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, r.width, r.height); return [g, r.width, r.height]; }

function drawTimeline(c, d, idx) {
  const [g, W, H] = setup(c), L = 34, R = 10, T = 8, B = 20, n = d.samples.length;
  const els = d.samples.flatMap((s) => [s.sun.el, s.earth.el]);
  const lo = Math.min(-5, Math.floor(Math.min(...els) / 5) * 5), hi = Math.max(5, Math.ceil(Math.max(...els) / 5) * 5);
  const X = (i) => L + (i / (n - 1)) * (W - L - R), Y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  g.font = "11px system-ui"; g.fillStyle = css("--muted"); g.strokeStyle = css("--line"); g.lineWidth = 1;
  for (let v = lo; v <= hi; v += (hi - lo > 40 ? 20 : 10)) { g.beginPath(); g.moveTo(L, Y(v)); g.lineTo(W - R, Y(v)); g.stroke(); g.fillText(v + "°", 4, Y(v) + 4); }
  // shade below-horizon band
  g.fillStyle = "rgba(128,128,128,.12)"; g.fillRect(L, Y(d.horizonDeg), W - L - R, H - B - Y(d.horizonDeg));
  g.strokeStyle = css("--muted"); g.beginPath(); g.moveTo(L, Y(d.horizonDeg)); g.lineTo(W - R, Y(d.horizonDeg)); g.stroke();
  [["sun", "--sun"], ["earth", "--earth"]].forEach(([k, col]) => { g.strokeStyle = css(col); g.lineWidth = 2; g.beginPath();
    d.samples.forEach((s, i) => (i ? g.lineTo(X(i), Y(s[k].el)) : g.moveTo(X(i), Y(s[k].el)))); g.stroke(); });
  // day ticks
  g.fillStyle = css("--muted"); const days = d.hours / 24, step = days > 40 ? 15 : days > 14 ? 5 : 1;
  for (let k = 0; k <= days; k += step) g.fillText(`d${k}`, X((k * 24 * 60 / d.stepMin)) - 8, H - 5);
  g.strokeStyle = css("--text"); g.lineWidth = 1; g.beginPath(); g.moveTo(X(idx), T); g.lineTo(X(idx), H - B); g.stroke();
}

function drawSky(c, d, idx) {
  const [g, W, H] = setup(c), s = d.samples[idx], cx = W / 2, base = H - 14, rad = Math.min(W / 2 - 14, H - 24);
  g.strokeStyle = css("--line"); g.lineWidth = 1; g.beginPath(); g.arc(cx, base, rad, Math.PI, 0); g.stroke();
  g.beginPath(); g.moveTo(cx - rad - 8, base); g.lineTo(cx + rad + 8, base); g.strokeStyle = css("--muted"); g.stroke();
  g.fillStyle = css("--muted"); g.font = "10px system-ui"; ["N", "E", "S", "W"].forEach((t, i) => {});
  const body = (b, col, label, r) => {
    const a = b.az * Math.PI / 180, el = Math.max(b.el, -8) * Math.PI / 180;
    // azimuth maps left→right across horizon (N-E-S-W-N unrolled over 360°); elevation maps up
    const x = cx - rad + ((b.az / 360) * 2 * rad), y = base - (Math.max(el, 0) / (Math.PI / 2)) * rad * 0.95 + (b.el < 0 ? 8 : 0);
    g.globalAlpha = b.up ? 1 : .35; g.fillStyle = col; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    g.fillStyle = css("--text"); g.fillText(label, x + r + 3, y + 3); g.globalAlpha = 1;
  };
  body(s.sun, css("--sun"), "Sun", 7); body(s.earth, css("--earth"), "Earth", 5);
  g.fillStyle = css("--muted"); g.fillText("N", cx - rad - 2, base + 11); g.fillText("S", cx - 3, base + 11); g.fillText("N", cx + rad - 2, base + 11);
}

$("addCustom").addEventListener("click", () => {
  const lat = parseFloat($("customLat").value), lon = parseFloat($("customLon").value);
  if (!(Math.abs(lat) <= 90) || !(Math.abs(lon) <= 360)) { $("status").textContent = "Enter latitude (−90 to 90) and longitude (−180 to 360)."; return; }
  if (selected.size >= MAX) { $("status").textContent = `You can compare up to ${MAX} sites.`; return; }
  const id = `${lat}:${lon}`; sites.push({ id, name: `Custom (${lat}, ${lon})`, group: "Custom", lat, lon }); selected.add(id); renderSites();
});
$("run").addEventListener("click", run);
addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.tagName === "INPUT" && e.target.type !== "checkbox") run(); });

(async () => {
  $("start").value = new Date().toISOString().slice(0, 16);
  sites = await (await fetch("/api/sites")).json(); renderSites(); run();
})();
