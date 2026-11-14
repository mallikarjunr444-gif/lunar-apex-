'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

const COMMIT = 'e6507e2a6f28605d2acf12811f73010f9fb71a37';
const MAST_HEIGHT_M = 2;
const SITES = [
  { id: 'sightline-shackleton-rim', sourceId: 'shackleton-rim', name: 'Shackleton Rim crest' },
  { id: 'sightline-connecting-ridge', sourceId: 'connecting-ridge', name: 'Connecting Ridge' },
  { id: 'sightline-de-gerlache-rim', sourceId: 'de-gerlache-rim', name: 'de Gerlache Rim' }
];
const SOURCE_BASE = `https://raw.githubusercontent.com/WarRinOP/sightline/${COMMIT}/packages/engine/src/data`;

function assertProfile(data, siteId) {
  const { azimuth_samples: count, hull_offsets: offsets, hull_a: a, hull_b: b } = data;
  if (data.schema_version !== 2 || data.site_id !== siteId || count !== 1440
      || !Array.isArray(offsets) || offsets.length !== count + 1
      || !Array.isArray(a) || !Array.isArray(b) || a.length !== b.length
      || offsets[0] !== 0 || offsets[count] !== a.length
      || a.some((value) => !Number.isFinite(value))
      || b.some((value) => !Number.isFinite(value))) {
    throw new Error(`Unexpected SIGHTLINE horizon profile schema for ${siteId}.`);
  }
  for (let i = 0; i < count; i++) {
    if (!Number.isInteger(offsets[i]) || offsets[i] > offsets[i + 1]) {
      throw new Error(`Invalid horizon hull offsets for ${siteId}.`);
    }
  }
}

function horizonAtMast(data, mastHeightM) {
  const mask = new Array(data.azimuth_samples);
  for (let az = 0; az < mask.length; az++) {
    let peak = -Infinity;
    for (let i = data.hull_offsets[az]; i < data.hull_offsets[az + 1]; i++) {
      peak = Math.max(peak, data.hull_a[i] - mastHeightM * data.hull_b[i]);
    }
    if (!Number.isFinite(peak)) throw new Error(`No terrain samples cover azimuth ${az}.`);
    mask[az] = Math.atan(peak) * 180 / Math.PI;
  }
  return mask;
}

async function main() {
  const profiles = [];
  for (const site of SITES) {
    const sourceFile = `horizon_${site.sourceId}.json`;
    const response = await fetch(`${SOURCE_BASE}/${sourceFile}`, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`Could not fetch ${sourceFile}: HTTP ${response.status}.`);
    const data = await response.json();
    assertProfile(data, site.sourceId);
    if (MAST_HEIGHT_M > data.max_mast_height_m) {
      throw new Error(`Requested mast height exceeds the profile limit for ${site.sourceId}.`);
    }
    const sourceLonDeg = data.location.lon_rad * 180 / Math.PI;
    const longitudeDeg = ((sourceLonDeg + 180) % 360 + 360) % 360 - 180;
    profiles.push({
      id: site.id,
      name: site.name,
      latitudeDeg: Number((data.location.lat_rad * 180 / Math.PI).toFixed(6)),
      longitudeDeg: Number(longitudeDeg.toFixed(6)),
      elevationKm: Number((data.location.elev_m / 1000).toFixed(4)),
      mastHeightM: MAST_HEIGHT_M,
      azimuthSamples: data.azimuth_samples,
      azimuthStepDeg: Number((data.azimuth_step_rad * 180 / Math.PI).toFixed(6)),
      horizonElevationDeg: horizonAtMast(data, MAST_HEIGHT_M),
      sourceFile: `packages/engine/src/data/${sourceFile}`,
      nearDem: data.method.near,
      farDem: data.method.far,
      dataSources: data.provenance.data_sources,
      simulated: data.provenance.simulated,
      pipelineVersion: data.provenance.pipeline_version,
      dataVersion: data.provenance.data_version
    });
  }

  const result = {
    schemaVersion: 1,
    source: {
      name: 'SIGHTLINE',
      repository: 'https://github.com/WarRinOP/sightline',
      commit: COMMIT,
      license: 'Apache-2.0',
      horizonGenerator: 'pipeline/sightline_pipeline/horizon.py'
    },
    sampling: {
      azimuthSamples: 1440,
      azimuthStepDeg: 0.25,
      mastHeightM: MAST_HEIGHT_M,
      nearResolutionM: 5,
      nearRangeKm: 12,
      farResolutionM: 80,
      farRangeKm: 300,
      coverageNote: 'Lower-bound horizon: terrain beyond 300 km or outside the source DEMs is not included.'
    },
    profiles
  };
  const output = path.resolve(__dirname, '../data/terrain/sightline-lola-horizons.json');
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, `${JSON.stringify(result)}\n`);
  console.log(`Wrote ${profiles.length} LOLA terrain horizons to ${output}.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
