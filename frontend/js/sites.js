/*
 * Curated lunar sites. Coordinates are selenographic (Mean-Earth/Polar-axis frame),
 * latitude north +, longitude east +.
 * Entries marked approx:true are region centres (crater centres / announced targets) — good for
 * comparison, not for final design. Verify against Quickmap / Moon Trek before use.
 */
(function (root) {
'use strict';

const sites = [
  {
    group: 'South pole region',
    items: [
      { id: 'pole', name: 'Lunar south pole (90°S)', lat: -90, lon: 0, approx: true },
      { id: 'shackleton', name: 'Shackleton crater (rim region)', lat: -89.9, lon: 0, approx: true },
      { id: 'haworth', name: 'Haworth crater', lat: -87.5, lon: -5, approx: true },
      { id: 'faustini', name: 'Faustini crater', lat: -87.3, lon: 77, approx: true },
      { id: 'shoemaker', name: 'Shoemaker crater', lat: -88.1, lon: 44.9, approx: true },
      { id: 'degerlache', name: 'de Gerlache crater', lat: -88.5, lon: -87.1, approx: true },
      { id: 'malapert', name: 'Malapert massif', lat: -86, lon: 0, approx: true },
      { id: 'cabeus', name: 'Cabeus crater', lat: -84.9, lon: -35.5, approx: true },
      { id: 'amundsen', name: 'Amundsen crater', lat: -84.5, lon: 82.8, approx: true },
      { id: 'nobile', name: 'Nobile crater', lat: -85.2, lon: 53.5, approx: true }
    ]
  },
  {
    group: 'South pole LOLA terrain profiles',
    items: [
      { id: 'sightline-shackleton-rim', name: 'Shackleton Rim crest (LOLA)', lat: -89.780403, lon: -156.196951, h: 1.7391, terrainProfileId: 'sightline-shackleton-rim' },
      { id: 'sightline-connecting-ridge', name: 'Connecting Ridge (LOLA)', lat: -89.463163, lon: -137.489553, h: 1.9448, terrainProfileId: 'sightline-connecting-ridge' },
      { id: 'sightline-de-gerlache-rim', name: 'de Gerlache Rim (LOLA)', lat: -88.683418, lon: -67.9321, h: 1.7937, terrainProfileId: 'sightline-de-gerlache-rim' }
    ]
  },
  {
    group: 'CLPS & commercial',
    items: [
      { id: 'im1', name: 'IM-1 Odysseus (Malapert A)', lat: -80.13, lon: 1.44, approx: true },
      { id: 'im2', name: 'IM-2 Athena (Mons Mouton region)', lat: -84.8, lon: 29.2, approx: true },
      { id: 'bluegh', name: 'Blue Ghost M1 (Mare Crisium)', lat: 18.56, lon: 61.81, approx: true }
    ]
  },
  {
    group: 'Other national programs',
    items: [
      { id: 'ch3', name: "Chang'e 3 (Mare Imbrium)", lat: 44.1214, lon: -19.5116 },
      { id: 'ch4', name: "Chang'e 4 (Von Kármán, far side)", lat: -45.4446, lon: 177.5991 },
      { id: 'ch5', name: "Chang'e 5 (Oceanus Procellarum)", lat: 43.0576, lon: -51.9161 },
      { id: 'cy3', name: 'Chandrayaan-3 (Shiv Shakti)', lat: -69.373, lon: 32.319 },
      { id: 'luna25', name: 'Luna 25 target (Boguslawsky)', lat: -57.865, lon: 61.36, approx: true },
      { id: 'slim', name: 'SLIM (Shioli crater)', lat: -13.316, lon: 25.251, approx: true }
    ]
  },
  {
    group: 'Apollo',
    items: [
      { id: 'a11', name: 'Apollo 11 — Tranquility Base', lat: 0.67408, lon: 23.47297 },
      { id: 'a12', name: 'Apollo 12 — Oceanus Procellarum', lat: -3.01239, lon: -23.42157 },
      { id: 'a14', name: 'Apollo 14 — Fra Mauro', lat: -3.6453, lon: -17.47136 },
      { id: 'a15', name: 'Apollo 15 — Hadley–Apennine', lat: 26.13224, lon: 3.62981 },
      { id: 'a16', name: 'Apollo 16 — Descartes', lat: -8.97301, lon: 15.50019 },
      { id: 'a17', name: 'Apollo 17 — Taurus–Littrow', lat: 20.1908, lon: 30.7717 }
    ]
  }
];
const index = {};
sites.forEach(function (g) {
  g.items.forEach(function (s) { index[s.id] = s; });
});

root.LUNAR_SITES = sites;
root.LUNAR_SITE_INDEX = index;
if (typeof module === 'object' && module.exports) module.exports = { sites, index };
}(typeof window !== 'undefined' ? window : globalThis));
