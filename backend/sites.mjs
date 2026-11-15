import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Curated sites; latitude and longitude are degrees (north/east positive).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const missionCatalog = JSON.parse(readFileSync(path.join(__dirname, "../data/clps-mission-sites.json"), "utf8"));
const missionSites = missionCatalog.sites.map((site) => ({
  ...site,
  h: site.elevationM / 1000,
  catalog: missionCatalog.source.project,
  catalogRevision: missionCatalog.source.revision
}));

export const SITES = [
  { id: "shackleton",  name: "Shackleton rim",          lat: -89.54, lon: 129.78, group: "South pole", note: "Candidate Artemis region; rim sees near-continuous sunlight." },
  { id: "faustini",    name: "Faustini crater floor", lat: -87.3,  lon: 84.0,  group: "South pole", note: "PSR — permanently shadowed region." },
  { id: "haworth",     name: "Haworth crater",         lat: -87.5,  lon: -5.0,  group: "South pole", note: "Near-PSR, candidate for ice deposits." },
  { id: "sverdrup",    name: "Sverdrup Peak",           lat: -88.2,  lon: 152.0, group: "South pole", note: "Elevated site near south pole." },
  { id: "amundsen",    name: "Amundsen crater",         lat: -84.5,  lon: 86.6,  group: "South pole", note: "Large polar impact crater." },
  { id: "aristarchus", name: "Aristarchus Plateau",     lat: 26.3,   lon: -48.5, group: "Near side",  note: "Bright young crater, potential pyroclastics." },
  { id: "marius-hills",name: "Marius Hills",            lat: 13.5,   lon: -53.0, group: "Near side",  note: "Volcanic domes, potential lava tubes." },
  { id: "tycho",       name: "Tycho crater",            lat: -43.3,  lon: -11.2, group: "Near side",  note: "Young rayed crater, Chang'e-6 ROI." },
  { id: "apollo12",    name: "Apollo 12",               lat: -3.01,  lon: -23.42,group: "Apollo",     note: "Ocean of Storms, near Surveyor 3." },
  { id: "apollo14",    name: "Apollo 14",               lat: -3.65,  lon: -17.47,group: "Apollo",     note: "Fra Mauro highlands." },
  { id: "apollo16",    name: "Apollo 16",               lat: -8.97,  lon: 15.50, group: "Apollo",     note: "Descartes highlands." },
  { id: "apollo17",    name: "Apollo 17",               lat: 20.19,  lon: 30.77, group: "Apollo",     note: "Taurus-Littrow valley, last crewed landing." },
  { id: "chang5",      name: "Chang'e-5",               lat: 43.06,  lon: -51.92,group: "Other agencies", note: "CNSA sample return, 2020." },
  { id: "chang6",      name: "Chang'e-6 (Apollo basin)", lat: -41.6, lon: 153.9, group: "Other agencies", note: "CNSA far-side sample return, 2024." },
  { id: "luna25",      name: "Luna 25 (crash site)",    lat: -57.9,  lon: 61.4,  group: "Other agencies", note: "Roscosmos, 2023 crash." },
  { id: "im1",         name: "Intuitive Machines IM-1", lat: -80.13, lon: -1.44, group: "CLPS",       note: "Odysseus lander, Malapert A, 2024." },
  { id: "sightline-shackleton-rim", name: "Shackleton Rim crest (LOLA)", lat: -89.780403, lon: -156.196951, h: 1.7391, terrainProfileId: "sightline-shackleton-rim", group: "South pole", note: "SIGHTLINE LOLA horizon profile; 2 m mast." },
  { id: "sightline-connecting-ridge", name: "Connecting Ridge (LOLA)", lat: -89.463163, lon: -137.489553, h: 1.9448, terrainProfileId: "sightline-connecting-ridge", group: "South pole", note: "SIGHTLINE LOLA horizon profile; 2 m mast." },
  { id: "sightline-de-gerlache-rim", name: "de Gerlache Rim (LOLA)", lat: -88.683418, lon: -67.9321, h: 1.7937, terrainProfileId: "sightline-de-gerlache-rim", group: "South pole", note: "SIGHTLINE LOLA horizon profile; 2 m mast." },
  { id: "malapert",    name: "Malapert massif",         lat: -85.99, lon: 0.12,   group: "South pole", note: "Permanent line of sight to Earth." },
  { id: "nobile",      name: "Nobile rim",              lat: -85.20, lon: 53.0,   group: "South pole", note: "Artemis III candidate area." },
  { id: "connecting",  name: "Connecting ridge",        lat: -89.45, lon: -137.0, group: "South pole", note: "Shackleton–de Gerlache ridge." },
  { id: "cabeus",      name: "Cabeus",                  lat: -84.9,  lon: -35.5,  group: "South pole", note: "LCROSS impact site, water ice detected." },
  { id: "im2",         name: "Intuitive Machines IM-2", lat: -84.8,  lon: 29.2,   group: "CLPS",       note: "Mons Mouton region." },
  { id: "chandrayaan3",name: "Chandrayaan-3 (Shiv Shakti)", lat: -69.37, lon: 32.32, group: "Other agencies", note: "ISRO, 2023." },
  { id: "apollo11",    name: "Apollo 11",               lat: 0.67,   lon: 23.47,  group: "Apollo",     note: "Sea of Tranquility." },
  { id: "apollo15",    name: "Apollo 15",               lat: 26.13,  lon: 3.63,   group: "Apollo",     note: "Hadley Rille." },
  { id: "change4",     name: "Chang'e-4",               lat: -45.46, lon: 177.59, group: "Other agencies", note: "Far side; never sees Earth directly." },
  ...missionSites
];
