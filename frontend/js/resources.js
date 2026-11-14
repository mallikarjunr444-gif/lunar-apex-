(function (root) {
'use strict';

const resources = [
  {
    id: 'quickmap',
    name: 'LROC QuickMap',
    url: 'https://quickmap.lroc.asu.edu/',
    summary: 'Explore LRO imagery, elevation layers, and local terrain that can raise or block the horizon.',
    role: 'Terrain and imagery'
  },
  {
    id: 'moon-trek',
    name: 'NASA Moon Trek',
    url: 'https://trek.nasa.gov/moon/',
    summary: 'Inspect the landing region in NASA’s 3D lunar globe and use its elevation data to understand relief.',
    role: '3D surface context'
  },
  {
    id: 'horizons',
    name: 'JPL Horizons',
    url: 'https://ssd.jpl.nasa.gov/horizons/',
    summary: 'Compare the local ephemeris with JPL observer-position Sun and Earth azimuth/elevation at touchdown.',
    role: 'Live ephemeris cross-check'
  },
  {
    id: 'csa',
    name: 'CSA Moon Exploration',
    url: 'https://www.asc-csa.gc.ca/eng/astronomy/moon-exploration/',
    summary: 'Read about lunar exploration, Canadian technologies, research, and Artemis participation.',
    role: 'Mission and education context'
  }
];

const researchGroups = [
  {
    id: 'open-source-projects',
    title: 'Open-source lunar projects',
    items: [
      {
        name: 'SIGHTLINE',
        url: 'https://github.com/WarRinOP/sightline',
        summary: 'South-pole sunlight, Earth visibility, LOLA terrain, and SPICE.',
        status: 'Active data integration: three pinned LOLA-derived horizon profiles are used in site scenarios. Apache-2.0; no project code is vendored.'
      },
      {
        name: 'CLPS Lunar Mission Browser (Lunar Horizon)',
        url: 'https://github.com/localizedprojects/CLPS-MOON-BROWSER',
        summary: 'Flutter lunar mission browser with comparison and landing-window planning.',
        status: 'Active data integration: 16 attributed Artemis, illumination-study, and mission locations are available as selectable sites. MIT dataset snapshot 9801046.'
      },
      {
        name: 'Lunar Lighting Planner',
        url: 'https://github.com/astoreyai/lunar-lighting-planner',
        summary: 'Lunar lighting and landing-date planning.',
        status: 'Clean-room capability: the landing-window finder ranks qualifying touchdown-date ranges. No license was found, so no upstream code or data is reused.'
      },
      {
        name: 'LuminaLuna',
        url: 'https://github.com/Planet-Coders/lunar-landing-site-navigator',
        summary: 'JPL Horizons comparison and 3D lunar site navigation.',
        status: 'Clean-room capabilities: live JPL Horizons comparison and a 2D interactive south-pole map. No upstream code or assets are reused; the repository has no license.'
      },
      {
        name: 'LightPath',
        url: 'https://github.com/AnmolGarg8/LightPath',
        summary: 'SPICE geometry, terrain horizons, and rover-route planning prototype.',
        status: 'Active workflow adaptation: export a provenance-bearing mission-evidence JSON report from this app’s own results. Rover routing is not claimed because upstream real-terrain checks remain pending and fixtures are synthetic.'
      }
    ]
  },
  {
    id: 'nasa-science-data',
    title: 'NASA and scientific data',
    items: [
      { name: 'NASA NAIF SPICE', url: 'https://naif.jpl.nasa.gov/naif/', summary: 'Planetary geometry toolkit and mission kernels.' },
      { name: 'SpiceyPy', url: 'https://github.com/AndrewAnnex/SpiceyPy', summary: 'Python interface to the NAIF SPICE toolkit.' },
      { name: 'LOLA / MIT PDS node', url: 'https://imbrium.mit.edu/', summary: 'Lunar Orbiter Laser Altimeter data archive; source DEMs and provenance before deriving local horizons.' },
      { name: 'NASA Planetary Data System', url: 'https://pds.nasa.gov/', summary: 'NASA planetary science data archive and documentation.' },
      { name: 'JPL Horizons system', url: 'https://ssd.jpl.nasa.gov/horizons/', summary: 'Interactive ephemeris and observer geometry service.' },
      { name: 'JPL Horizons API documentation', url: 'https://ssd-api.jpl.nasa.gov/doc/horizons.html', summary: 'API reference used by Lunar Apex live position checks.' },
      { name: 'NASA Moon Trek', url: 'https://trek.nasa.gov/moon/', summary: 'Interactive 3D lunar terrain and mission context.' },
      { name: 'LROC QuickMap', url: 'https://quickmap.lroc.asu.edu/', summary: 'LRO imagery and lunar topography exploration.' }
    ]
  },
  {
    id: 'frontend-visualization',
    title: 'Frontend and 3D visualization',
    items: [
      { name: 'React', url: 'https://react.dev/', summary: 'Component-based UI library.' },
      { name: 'TypeScript', url: 'https://www.typescriptlang.org/', summary: 'Typed JavaScript documentation.' },
      { name: 'Vite', url: 'https://github.com/vitejs/vite', summary: 'Frontend build and development tooling.' },
      { name: 'Tailwind CSS', url: 'https://tailwindcss.com/', summary: 'Utility-first CSS framework.' },
      { name: 'Three.js', url: 'https://github.com/mrdoob/three.js', summary: 'WebGL 3D visualization library.' },
      { name: 'CesiumJS', url: 'https://github.com/CesiumGS/cesium', summary: 'Geospatial 3D globe and terrain rendering.' },
      { name: 'MapLibre GL JS', url: 'https://github.com/maplibre/maplibre-gl-js', summary: 'Open-source interactive map rendering.' },
      { name: 'Plotly JavaScript', url: 'https://plotly.com/javascript/', summary: 'Interactive charts and data visualization.' }
    ]
  },
  {
    id: 'backend-scientific-computing',
    title: 'Backend and scientific computing',
    items: [
      { name: 'Python', url: 'https://www.python.org/', summary: 'Scientific-computing language and runtime.' },
      { name: 'FastAPI', url: 'https://fastapi.tiangolo.com/', summary: 'Python API framework.' },
      { name: 'NumPy', url: 'https://numpy.org/', summary: 'Array and numerical computing.' },
      { name: 'SciPy', url: 'https://scipy.org/', summary: 'Scientific algorithms and numerical methods.' },
      { name: 'Rasterio', url: 'https://rasterio.readthedocs.io/', summary: 'Raster geospatial data I/O for Python.' },
      { name: 'GDAL', url: 'https://gdal.org/', summary: 'Geospatial raster and vector data tools.' },
      { name: 'PostgreSQL', url: 'https://www.postgresql.org/', summary: 'Relational database.' },
      { name: 'PostGIS', url: 'https://postgis.net/', summary: 'Spatial data support for PostgreSQL.' }
    ]
  }
];

root.LUNAR_RESOURCES = resources;
root.LUNAR_RESEARCH_GROUPS = researchGroups;
if (typeof module === 'object' && module.exports) module.exports = { resources, researchGroups };
}(typeof window !== 'undefined' ? window : globalThis));
