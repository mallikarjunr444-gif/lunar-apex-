# LunaSight — Lunar Landing Site Navigator

Compare lunar landing **sites and dates** in seconds. For any point on the Moon it shows where the **Sun** and **Earth** sit relative to the horizon, how long until sunset / Earthset, and when a lander has **power** (Sun up) and a **direct-to-Earth link** (Earth up) — side by side.

Built for the NASA "Lunar Landing Site Navigator" challenge. Pure static web app (HTML/JS/canvas), no build step, runs offline.

## Run it

```bash
npm start            # serves http://localhost:3000
npm test             # engine and backend geometry tests
```

## What it does

- **Scenarios** — up to 5 cards, each a site + UTC touchdown date. 25 curated sites (south-pole craters, CLPS/commercial, Apollo, Chang'e, Chandrayaan-3, SLIM, Luna 25) or any custom lat/lon. Duplicate a card and nudge the date by ±1 d / ±1 lunation to see what a schedule slip does at the same site.
- **Sky view** — panorama (azimuth × elevation) or polar dome. Sun and Earth at true angular size, hollow when below the horizon, terrain mask drawn in grey.
- **Countdowns** — time to sunset/sunrise and Earthset/Earthrise (refined to seconds), shadow length of a 1 m object, elevation and azimuth.
- **Timeline + lanes** — Sun/Earth elevation over 3–60 days after touchdown with Power / Link / Both lanes per scenario; drag to scrub, or play it as an animation.
- **Comparison table** — continuous sunlight and Earth contact from touchdown, pass/fail against your mission length, duty cycles, longest dark/outage, peak elevations, energy proxies; best value per row highlighted.
- **Landing-window finder** — scans up to a year of touchdown dates and plots how long sunlight / Earth contact last uninterrupted, lists the date ranges that satisfy your mission length, and jumps a scenario to the start of one.
- **Shareable** — the comparison is encoded in the URL hash ("Copy link").
- **Explainer tiles** for educators and the public.

## How it works

| Piece | Source |
|---|---|
| Moon & Sun positions | [Astronomy Engine](https://github.com/cosinekitty/astronomy) (vendored, MIT) |
| Libration + sub-solar point | Meeus, *Astronomical Algorithms* ch. 53 (optical + physical libration), Mean-Earth/Polar-axis frame as used by LOLA, Quickmap, Moon Trek |
| Topocentric Sun/Earth alt-az | vector geometry on a spherical Moon (R = 1737.4 km), includes Earth's lunar parallax |
| Speed | frames cached on a 30-min grid and interpolated; 400 days at 15-min resolution ≈ 0.5 s |

No atmosphere ⇒ no refraction. Sunrise/sunset uses the Sun's upper limb by default (switchable); Earth "in view" uses the disc centre above the mask plus your minimum elevation.

### Terrain (important)

By default the horizon is the smooth-sphere horizon, so **polar results with no mask are optimistic**. Real topography enters two ways:

1. a uniform **terrain mask** angle per scenario, or
2. a **horizon profile** upload (CSV/TXT rows of `azimuth°, elevation°`, azimuth clockwise from north) that you derive from LOLA data via [Quickmap](https://quickmap.lroc.asu.edu/) or [Moon Trek](https://trek.nasa.gov/moon/).

The app does not ship LOLA DEMs; computing horizon masks from them is the main next step.

## Validation

`npm test` checks: libration vs Astronomy Engine's `Libration()` and the Meeus ch. 53 worked example (1992-04-12); Apollo 11 touchdown (Sun ≈ 10.8° up, in the east); New/Full Moon geometry; south-pole Sun within ±1.54° and Earth within ±7° over a year; equatorial lunar day = 29.5 d; event times land on the horizon crossing; frame interpolation error < 0.002°; terrain mask behaviour.

**Not yet cross-checked against JPL Horizons** — the build sandbox could not reach it. Run it yourself:

```bash
node tools/compare_horizons.js -89.9 0 "2027-03-01 00:00" 48 360
```

(Written to the documented Horizons API but untested against the live service; expect agreement within a few hundredths of a degree.)

## Limits / not modelled

Eclipses of the site by Earth/Sun, antenna pointing limits, thermal limits, site tilt, dust, Earth-disc size in link budgets. Events shorter than ~15 min can be missed by the scan. Curated coordinates marked ≈ are region centres — verify before design use.

## Resources used

[Quickmap](https://quickmap.lroc.asu.edu/) · [Moon Trek](https://trek.nasa.gov/moon/) · [JPL Horizons](https://ssd.jpl.nasa.gov/horizons/) · [CSA Moon Exploration](https://www.asc-csa.gc.ca/eng/astronomy/moon-exploration/). NASA does not endorse any non-U.S. Government entity.

MIT licensed.

## Project layout

- `frontend/` contains the static application, styles, charts, curated sites, and vendored browser library.
- `backend/` contains the optional Node server and Horizons/analytic API modules.
- `test/` contains the browser-engine and backend geometry tests.
- `tools/` contains diagnostic scripts such as the Horizons comparison utility.

## Backend evaluation API

Run `npm start` to expose the static frontend and a JSON API on port `3000`.

- `GET /api/sites` — curated sites with coordinates, mission grouping, and notes.
- `GET /api/resources` — Quickmap, Moon Trek, JPL Horizons, and CSA reference links.
- `GET /api/evidence` — calculation methods, outputs, limitations, and source provenance for review-ready results.
- `GET /api/timeline?site=shackleton&start=2027-03-01T00:00:00Z&hours=720` — sampled Sun/Earth positions and summary metrics.
- `GET /api/compare?sites=shackleton,malapert&missionDays=7` — compare up to five sites.
- `GET /api/evaluate?sites=shackleton,malapert&source=horizons` — ranked mission assessment with power, communications, joint-window, and score results.

Common parameters include `source=analytic|horizons`, `step` in minutes, `horizon` terrain-mask degrees, `minSun`, `minEarth`, and `missionDays`. Horizons requests automatically fall back to the analytic model with the fallback reason included in `source`.

## Reference projects and attribution

LunaSight is an independent implementation. It does not vendor or combine the reference repositories, but its workflow and research direction were informed by:

- [SIGHTLINE](https://github.com/WarRinOP/sightline) — Apache-2.0; NASA terrain horizons, evidence-driven validation, and mission barcode concepts.
- [CLPS Lunar Mission Browser](https://github.com/localizedprojects/CLPS-MOON-BROWSER) — MIT; mission/site comparison and planning workflow ideas.
- [Lunar Lighting Planner](https://github.com/astoreyai/lunar-lighting-planner) — MIT; illumination windows and horizon-analysis concepts.
- [LuminaLuna](https://github.com/Planet-Coders/lunar-landing-site-navigator) — 3D lunar navigation and archived NASA Horizons validation patterns.
- [LightPath](https://github.com/AnmolGarg8/LightPath) — MIT; SPICE geometry and rover-planning reference workflows.

Scientific data sources remain the NASA/JPL resources listed above. External project code and assets are not copied into this repository.
