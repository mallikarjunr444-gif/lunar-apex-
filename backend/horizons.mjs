// JPL Horizons client; lunar observer coordinates include site elevation in kilometres.
const BASE = "https://ssd.jpl.nasa.gov/api/horizons.api";
const fmt = (d) => d.toISOString().slice(0, 16).replace("T", " ");

export async function horizonsElAz(site, bodyId, start, stop, stepMin) {
  const q = new URLSearchParams({
    format: "json", COMMAND: `'${bodyId}'`, MAKE_EPHEM: "YES", EPHEM_TYPE: "OBSERVER",
    CENTER: "'coord@301'", COORD_TYPE: "'GEODETIC'", SITE_COORD: `'${site.lon},${site.lat},${site.h ?? 0}'`,
    START_TIME: `'${fmt(start)}'`, STOP_TIME: `'${fmt(stop)}'`, STEP_SIZE: `'${stepMin} m'`,
    QUANTITIES: "'4'", ANG_FORMAT: "DEG", CSV_FORMAT: "YES", APPARENT: "AIRLESS"
  });
  const res = await fetch(`${BASE}?${q}`, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Horizons HTTP ${res.status}`);
  const { result, error } = await res.json();
  if (error || !result) throw new Error(error || "Empty Horizons response");
  const body = result.split("$$SOE")[1]?.split("$$EOE")[0];
  if (!body) throw new Error("no ephemeris rows (check coordinates/date range)");
  return body.trim().split("\n").map((line) => {
    const c = line.split(",").map((s) => s.trim());   // date, solar flag, lunar flag, azimuth, elevation
    return { t: new Date(c[0] + " UTC").toISOString(), az: +c[3], el: +c[4] };
  });
}

export async function horizonsSeries(site, start, hours, stepMin, horizonDeg = 0, thresholds = {}) {
  const stop = new Date(start.getTime() + hours * 3600000);
  const [sun, earth] = await Promise.all([horizonsElAz(site, "10", start, stop, stepMin), horizonsElAz(site, "399", start, stop, stepMin)]);
  const sunFloor = horizonDeg + (Number(thresholds.minSunElev) || 0);
  const earthFloor = horizonDeg + (Number(thresholds.minEarthElev) || 0);
  return sun.map((s, i) => {
    const e = earth[i];
    const sunUp = s.el > sunFloor, earthUp = e.el > earthFloor;
    return { t: s.t, sun: { el: s.el, az: s.az, up: sunUp }, earth: { el: e.el, az: e.az, up: earthUp }, both: { el: Math.min(s.el, e.el), az: s.az, up: sunUp && earthUp } };
  });
}
