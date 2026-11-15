// Static reference data served by /api/resources and /api/evidence.
export const DATA_USE_DISCLAIMER = "NASA does not endorse any non-U.S. Government entity and is not responsible for information contained on non-U.S. Government websites. For non-U.S. Government websites, participants must comply with any data use parameters of that specific website.";
export const RESOURCES = [
  { id: "sightline", category: "project", name: "SIGHTLINE", url: "https://github.com/WarRinOP/sightline", license: "Apache-2.0" },
  { id: "clps-moon-browser", category: "project", name: "CLPS Lunar Mission Browser", url: "https://github.com/localizedprojects/CLPS-MOON-BROWSER", license: "MIT" },
  { id: "lunar-lighting-planner", category: "project", name: "Lunar Lighting Planner", url: "https://github.com/astoreyai/lunar-lighting-planner" },
  { id: "luminaluna", category: "project", name: "LuminaLuna", url: "https://github.com/Planet-Coders/lunar-landing-site-navigator" },
  { id: "lightpath", category: "project", name: "LightPath", url: "https://github.com/AnmolGarg8/LightPath", license: "MIT" },
  { id: "naif-spice", category: "science", name: "NASA NAIF SPICE", url: "https://naif.jpl.nasa.gov/naif/" },
  { id: "spiceypy", category: "science", name: "SpiceyPy", url: "https://github.com/AndrewAnnex/SpiceyPy" },
  { id: "lola", category: "science", name: "LOLA data archive", url: "https://imbrium.mit.edu/" },
  { id: "pds", category: "science", name: "NASA Planetary Data System", url: "https://pds.nasa.gov/" },
  { id: "horizons", category: "science", name: "JPL Horizons", url: "https://ssd.jpl.nasa.gov/horizons/" },
  { id: "moon-trek", category: "science", name: "NASA Moon Trek", url: "https://trek.nasa.gov/moon/" },
  { id: "quickmap", category: "science", name: "LROC QuickMap", url: "https://quickmap.lroc.im-ldi.com/?prjExtent=-3335249.7991968%2C-1737400%2C3335249.7991968%2C1737400&earthShadowEnabled=true&proj=10&stack=3314&defs=N4IgzGCMAsIFygPYAcCGBjAlgFwJ70gF9Cg" },
  { id: "csa-moon", category: "science", name: "CSA Moon Exploration", url: "https://www.asc-csa.gc.ca/eng/astronomy/moon-exploration/" },
  { id: "csa-canadarm3", category: "science", name: "CSA Canadarm3", url: "https://www.asc-csa.gc.ca/eng/canadarm3/" },
  { id: "csa-gateway", category: "science", name: "CSA Lunar Gateway", url: "https://www.asc-csa.gc.ca/eng/astronomy/moon-exploration/gateway.asp" },
  { id: "csa-utility-rover", category: "science", name: "CSA Canadian utility rover", url: "https://www.asc-csa.gc.ca/eng/astronomy/moon-exploration/canadian-utility-rover-on-the-moon.asp" },
  { id: "csa-artemis", category: "science", name: "CSA Artemis campaign", url: "https://www.asc-csa.gc.ca/eng/astronomy/moon-exploration/artemis-missions.asp" }
];
export const EVIDENCE = {
  disclaimer: DATA_USE_DISCLAIMER,
  model: {
    analytic: "Meeus-style mean lunar arguments and spherical-Moon vector geometry; suitable for rapid screening.",
    horizons: "JPL Horizons observer ephemerides from a lunar surface coordinate; preferred for mission-grade review.",
    terrain: "Three pinned SIGHTLINE horizon profiles derived from LOLA are available to the browser."
  },
  outputs: ["Sun and Earth elevation and azimuth", "sunlight and Earth-contact windows", "joint power/link windows", "mission feasibility"],
  limitations: ["No atmospheric refraction or twilight", "No eclipses, antenna pointing, thermal, dust, or site-slope model", "Analytic mode is a screening estimate and should be checked against Horizons"],
  references: RESOURCES
};
