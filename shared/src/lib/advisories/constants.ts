/** Advisory thresholds and provenance strings. Python mirror: ml-backend/advisories/constants.py */

export const SPRAY_PRECIP_PROB_MAX = 20.0;
export const SPRAY_WIND_DRIFT_MAX_KMH = 15.0;
export const SPRAY_WIND_DRIFT_PROVENANCE =
  "Provisional drift threshold (15 km/h); needs local calibration against actual spray equipment.";
export const SPRAY_HORIZON_HOURS = 48;

export const TOMATO_FROST_C = 0.0;
export const TOMATO_CHILL_MAX_C = 5.0;
export const TOMATO_SLOW_GROWTH_MAX_C = 10.0;
export const TOMATO_BLOSSOM_DROP_C = 13.0;
export const CHILL_CONSECUTIVE_HOURS = 3;

export const EARLY_BLIGHT_DSV_THRESHOLD = 15.0;
export const LATE_BLIGHT_DSV_THRESHOLD = 15.0;
export const LATE_BLIGHT_MIN_MEAN_TEMP_C = 12.0;
export const LATE_BLIGHT_RH_THRESHOLD = 88.0;
export const LATE_BLIGHT_WET_HOURS_MIN = 10;

export const LEVEILLULA_OPTIMAL_MIN_C = 20.0;
export const LEVEILLULA_OPTIMAL_MAX_C = 30.0;
export const LEVEILLULA_DELETERIOUS_C = 30.0;
export const LEVEILLULA_NIGHT_DAY_DELTA_C = 8.0;
export const OIDIUM_CANDIDATE_LABEL =
  "candidate/unvalidated, less likely in this climate";

export const MOISTURE_ROLLING_DAYS = 7;
export const MOISTURE_DEPLETION_FRACTION = 0.22;
export const MOISTURE_WEEKLY_MM_MIN = 25.0;
export const MOISTURE_WEEKLY_MM_MAX = 38.0;
export const MOISTURE_WEEKLY_NOTE =
  "Reference 25-38 mm/week during fruit development for context only, not a hard rule.";

export const SOIL_TEXTURE_DEPLETION_PCT: Record<string, number> = {
  sand: 55.0,
  sandy_loam: 58.0,
  loam: 60.0,
  clay: 62.0,
};
export const SOIL_TEXTURE_PROVENANCE =
  "Placeholder depletion bands pending HW-390 calibration curve translation.";

export const MIN_OBSERVED_COVERAGE_HOURS = 18;

export const DISEASE_KEYS = ["early_blight", "late_blight"] as const;
export type DiseaseKey = (typeof DISEASE_KEYS)[number];

export const DEFAULT_DSV_THRESHOLDS: Record<DiseaseKey, number> = {
  early_blight: EARLY_BLIGHT_DSV_THRESHOLD,
  late_blight: LATE_BLIGHT_DSV_THRESHOLD,
};
