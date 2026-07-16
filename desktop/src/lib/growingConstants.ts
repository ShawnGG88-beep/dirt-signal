/**
 * Tomato growing reference bounds for the Reports feature.
 *
 * SOURCE OF TRUTH: ml-backend/constants.py
 * Mirror that file when refining bounds — do not invent thresholds in Reports
 * logic. Import these named constants instead of inlining numbers.
 *
 * Desktop cannot import Python; keep values identical to constants.py.
 */

// Soil pH
export const PH_MIN = 6.0;
export const PH_MAX = 6.8;
export const PH_IDEAL = 6.5;

// Soil moisture (%)
export const MOISTURE_MIN_PCT = 60.0;
export const MOISTURE_MAX_PCT = 80.0;

// Soil temperature (°C)
export const SOIL_TEMP_MIN_C = 10.0;
export const SOIL_TEMP_PLANTING_MIN_C = 15.5;
export const SOIL_TEMP_IDEAL_MIN_C = 18.0;
export const SOIL_TEMP_IDEAL_MAX_C = 24.0;
export const SOIL_TEMP_MAX_C = 32.0;

// Ambient temperature (°C)
export const AMBIENT_TEMP_DAY_MIN_C = 21.0;
export const AMBIENT_TEMP_DAY_MAX_C = 27.0;
export const AMBIENT_TEMP_NIGHT_MIN_C = 15.5;
export const AMBIENT_TEMP_NIGHT_MAX_C = 21.0;
export const AMBIENT_TEMP_FRUIT_SET_CEILING_C = 33.0;

/**
 * Local clock hours treating ambient as "day" vs "night".
 * Day bounds apply for [start, end); night otherwise. Spec: roughly 06:00–18:00.
 */
export const AMBIENT_DAY_START_HOUR = 6;
export const AMBIENT_DAY_END_HOUR = 18;

// Ambient humidity (%)
export const HUMIDITY_MIN_PCT = 65.0;
export const HUMIDITY_MAX_PCT = 75.0;

// Electrical conductivity (mS/cm) — reserved for when EC sensor is online
export const EC_MIN_MS_CM = 2.0;
export const EC_MAX_MS_CM = 3.5;

// N, P, K directional targets (no numeric pass/fail until calibrated)
export const NPK_LEVELS = [
  "depleted",
  "low",
  "medium",
  "high",
  "surplus",
] as const;
export const N_TARGET = "low";
export const P_TARGET = "high";
export const K_TARGET = "high";
