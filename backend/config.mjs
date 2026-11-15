// Runtime configuration and limits. Everything tunable lives here.
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export const ROOT = path.join(here, "..");
export const FRONTEND_DIR = path.join(ROOT, "frontend");
export const TERRAIN_FILE = path.join(ROOT, "data/terrain/sightline-lola-horizons.json");

export const PORT = Number(process.env.PORT) || 3000;
export const NASA_API_KEY = process.env.NASA_API_KEY || "DEMO_KEY";

export const LIMITS = {
  bodyBytes: 64 * 1024,        // max JSON request body
  maxSites: 5,                 // sites per /api/compare or /api/evaluate request
  cacheEntries: 200,           // memoised timeline results
  horizonsTimeoutMs: 15000,
  apodTimeoutMs: 8000
};

// Query-parameter ranges. Out-of-range numbers are clamped, not rejected.
export const RANGES = {
  hours: { min: 1, max: 2160, fallback: 720 },
  step: { min: 5, max: 720, fallback: 60 },
  horizon: { min: -5, max: 30, fallback: 0 },
  minSun: { min: -5, max: 30, fallback: 0 },
  minEarth: { min: -5, max: 30, fallback: 0 },
  missionDays: { min: 0.5, max: 60, fallback: 7 }
};
