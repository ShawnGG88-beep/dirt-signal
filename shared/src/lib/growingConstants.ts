/**
 * Crop growing reference profiles for the Reports feature.
 *
 * SOURCE OF TRUTH: ml-backend/constants.py
 * Mirror that file when refining bounds. Do not invent thresholds in Reports
 * logic. Import named helpers and constants instead of inlining numbers.
 *
 * Desktop cannot import Python; keep values identical to constants.py.
 *
 * Always spell out Oklahoma State University and Ohio State University in
 * full. Never use the bare abbreviation that confuses the two.
 */

export type ScoringSemantic = "optimal_band" | "restraint";

export type CropType = "tomato" | "grape_table" | "grape_wine";
export type LifecycleStage = "mature" | "establishment";

export const DEFAULT_CROP_TYPE: CropType = "tomato";
export const DEFAULT_LIFECYCLE_STAGE: LifecycleStage = "mature";

/** Shared sampling limitations surfaced in Reports for any grape device. */
export const SAMPLING_LIMITATIONS: string[] = [
  "All three source studies used composite sampling. Zhao et al. took five positions per vineyard in an S pattern with five duplicates. Rosen recommends 15 to 20 cores per sample in a zig-zag pattern and calls sampling the weakest link in a soil testing programme. Gonzalez-Maldonado et al. found tractor rows and vine rows differ significantly. Dirt Signal reads a single fixed point. It measures that point, not the plot.",
  "Rosen recommends soil testing before planting and every 4 to 5 years thereafter, supplemented by petiole analysis once vines are established. Continuous sensor data is a different instrument answering a different question, and is not a substitute for either.",
  "None of the three sources is South African. Shanghai is subtropical humid monsoon, Napa is semi-arid Mediterranean, Minnesota and Michigan are cool continental. Local validation is required before any Cape Winelands claim.",
  "Air VPD assumes leaf temperature equals air temperature. That assumption is weakest under artificial lighting and still air — both of which describe the current indoor setup. Displayed VPD is air VPD, not leaf-to-air VPD.",
  "The sensor stack cannot measure leaf wetness, canopy humidity, or rainfall. Ambient relative humidity at probe height is a weak substitute for all three. High-humidity hours are a proxy for leaf wetness duration, never leaf wetness itself and never a disease risk score.",
];

export interface TomatoMatureStage {
  scoring_semantic: ScoringSemantic;
  ph_min: number;
  ph_max: number;
  ph_ideal: number;
  moisture_min_pct: number;
  moisture_max_pct: number;
  soil_temp_min_c: number;
  soil_temp_planting_min_c: number;
  soil_temp_ideal_min_c: number;
  soil_temp_ideal_max_c: number;
  soil_temp_max_c: number;
  ambient_temp_day_min_c: number;
  ambient_temp_day_max_c: number;
  ambient_temp_night_min_c: number;
  ambient_temp_night_max_c: number;
  ambient_temp_fruit_set_ceiling_c: number;
  humidity_min_pct: number;
  humidity_max_pct: number;
  ec_min_ms_cm: number;
  ec_max_ms_cm: number;
  npk_levels: readonly string[];
  n_target: string;
  p_target: string;
  k_target: string;
}

/** Minimal stage shape used by lookup helpers (all profiles). */
export interface CropStageBase {
  scoring_semantic: ScoringSemantic;
  n_target?: string;
  p_target?: string;
  k_target?: string;
  nitrogen?: {
    direction: string;
    soil_test_reliable: boolean;
    note: string;
  };
  unmeasurable_but_dominant?: { note: string };
  scale_incompatibility_warning?: string;
  ph_min?: number;
  ph_max?: number;
  moisture_min_pct?: number;
  moisture_max_pct?: number;
  soil_temp_ideal_min_c?: number;
  soil_temp_ideal_max_c?: number;
  humidity_min_pct?: number;
  humidity_max_pct?: number;
  ambient_temp_day_min_c?: number;
  ambient_temp_day_max_c?: number;
  ambient_temp_night_min_c?: number;
  ambient_temp_night_max_c?: number;
}

const TOMATO_MATURE: TomatoMatureStage = {
  scoring_semantic: "optimal_band",
  // Oklahoma State University HLA-6012
  ph_min: 6.0,
  ph_max: 6.8,
  ph_ideal: 6.5,
  moisture_min_pct: 60.0,
  moisture_max_pct: 80.0,
  soil_temp_min_c: 10.0,
  soil_temp_planting_min_c: 15.5,
  soil_temp_ideal_min_c: 18.0,
  soil_temp_ideal_max_c: 24.0,
  soil_temp_max_c: 32.0,
  ambient_temp_day_min_c: 21.0,
  ambient_temp_day_max_c: 27.0,
  ambient_temp_night_min_c: 15.5,
  ambient_temp_night_max_c: 21.0,
  ambient_temp_fruit_set_ceiling_c: 33.0,
  humidity_min_pct: 65.0,
  humidity_max_pct: 75.0,
  ec_min_ms_cm: 2.0,
  ec_max_ms_cm: 3.5,
  npk_levels: ["depleted", "low", "medium", "high", "surplus"],
  n_target: "low",
  p_target: "high",
  k_target: "high",
};

/**
 * Crop profiles keyed by crop_type, then lifecycle_stage.
 * Grape detail (sufficiency tables, ASI bands, Napa observations) lives in
 * ml-backend/constants.py; desktop mirrors lookup semantics and tomato bounds
 * used for report flagging, plus grape sampling limitations and restraint rules.
 */
export const CROP_PROFILES: Record<
  string,
  { gdd_base_c?: number; stages: Record<string, CropStageBase> }
> = {
  tomato: {
    gdd_base_c: 10,
    stages: {
      mature: TOMATO_MATURE,
    },
  },
  grape_wine: {
    gdd_base_c: 10,
    stages: {
      // Zhao et al. 2019: no significant variety differences in soil OM /
      // available nutrients; split by production goal and stage only.
      establishment: {
        scoring_semantic: "optimal_band",
        // Rosen 2014 ph_target range [6.0, 7.0]
        ph_min: 6.0,
        ph_max: 7.0,
        nitrogen: {
          direction: "adequate_then_restrain",
          soil_test_reliable: false,
          note: "Rosen 2014: soil N tests unreliable; non-bearing guidance by OM class in lb N/acre (not converted).",
        },
      },
      mature: {
        scoring_semantic: "restraint",
        nitrogen: {
          direction: "restraint",
          soil_test_reliable: false,
          note: "Never advise increasing N for a grape_wine mature device.",
        },
        unmeasurable_but_dominant: {
          note: "Random Forest importance ranked clay, sand and tillage above EC and pH. Dirt Signal measures only EC and pH of the top predictors.",
        },
      },
    },
  },
  grape_table: {
    gdd_base_c: 10,
    stages: {
      mature: {
        scoring_semantic: "optimal_band",
        scale_incompatibility_warning:
          "Do NOT cross-compare this profile's ASI bands with the grape_wine sufficiency ranges. Different extraction methods, units, crops and production goals.",
      },
    },
  },
};

export function getCropStage(
  cropType: string | null | undefined = DEFAULT_CROP_TYPE,
  lifecycleStage: string | null | undefined = DEFAULT_LIFECYCLE_STAGE,
): CropStageBase {
  const crop = CROP_PROFILES[cropType ?? ""];
  const stage = crop?.stages[lifecycleStage ?? ""];
  if (!stage) {
    return CROP_PROFILES[DEFAULT_CROP_TYPE].stages[DEFAULT_LIFECYCLE_STAGE];
  }
  return stage;
}

/** Single-triangle GDD base temperature (°C) for a crop profile. */
export function getGddBaseC(cropType?: string | null): number {
  const crop = CROP_PROFILES[cropType ?? DEFAULT_CROP_TYPE];
  return crop?.gdd_base_c ?? CROP_PROFILES[DEFAULT_CROP_TYPE].gdd_base_c ?? 10;
}

export function getScoringSemantic(
  cropType?: string | null,
  lifecycleStage?: string | null,
): ScoringSemantic {
  return getCropStage(cropType, lifecycleStage).scoring_semantic;
}

export function isGrapeCrop(cropType: string | null | undefined): boolean {
  return (cropType ?? "").startsWith("grape_");
}

/** Under restraint, UI and advice must never recommend increasing nitrogen. */
export function neverAdviseIncreaseNitrogen(
  cropType?: string | null,
  lifecycleStage?: string | null,
): boolean {
  if (getScoringSemantic(cropType, lifecycleStage) === "restraint") {
    return true;
  }
  const nitrogen = getCropStage(cropType, lifecycleStage).nitrogen;
  return nitrogen?.direction === "restraint";
}

export function npkReferenceLabel(
  nutrient: "n" | "p" | "k",
  cropType?: string | null,
  lifecycleStage?: string | null,
): string {
  const stage = getCropStage(cropType, lifecycleStage);
  if (nutrient === "n" && neverAdviseIncreaseNitrogen(cropType, lifecycleStage)) {
    return "restraint: never increase N";
  }
  const target =
    nutrient === "n"
      ? stage.n_target
      : nutrient === "p"
        ? stage.p_target
        : stage.k_target;
  if (target) {
    return `target ${target} (provisional)`;
  }
  return "see crop profile (provisional)";
}

// ---------------------------------------------------------------------------
// Backward-compatible tomato / mature aliases (values unchanged)
// ---------------------------------------------------------------------------

export const PH_MIN = TOMATO_MATURE.ph_min;
export const PH_MAX = TOMATO_MATURE.ph_max;
export const PH_IDEAL = TOMATO_MATURE.ph_ideal;

export const MOISTURE_MIN_PCT = TOMATO_MATURE.moisture_min_pct;
export const MOISTURE_MAX_PCT = TOMATO_MATURE.moisture_max_pct;

export const SOIL_TEMP_MIN_C = TOMATO_MATURE.soil_temp_min_c;
export const SOIL_TEMP_PLANTING_MIN_C = TOMATO_MATURE.soil_temp_planting_min_c;
export const SOIL_TEMP_IDEAL_MIN_C = TOMATO_MATURE.soil_temp_ideal_min_c;
export const SOIL_TEMP_IDEAL_MAX_C = TOMATO_MATURE.soil_temp_ideal_max_c;
export const SOIL_TEMP_MAX_C = TOMATO_MATURE.soil_temp_max_c;

export const AMBIENT_TEMP_DAY_MIN_C = TOMATO_MATURE.ambient_temp_day_min_c;
export const AMBIENT_TEMP_DAY_MAX_C = TOMATO_MATURE.ambient_temp_day_max_c;
export const AMBIENT_TEMP_NIGHT_MIN_C = TOMATO_MATURE.ambient_temp_night_min_c;
export const AMBIENT_TEMP_NIGHT_MAX_C = TOMATO_MATURE.ambient_temp_night_max_c;
export const AMBIENT_TEMP_FRUIT_SET_CEILING_C =
  TOMATO_MATURE.ambient_temp_fruit_set_ceiling_c;

/**
 * Local clock hours treating ambient as "day" vs "night".
 * Day bounds apply for [start, end); night otherwise. Spec: roughly 06:00-18:00.
 */
export const AMBIENT_DAY_START_HOUR = 6;
export const AMBIENT_DAY_END_HOUR = 18;

export const HUMIDITY_MIN_PCT = TOMATO_MATURE.humidity_min_pct;
export const HUMIDITY_MAX_PCT = TOMATO_MATURE.humidity_max_pct;

export const EC_MIN_MS_CM = TOMATO_MATURE.ec_min_ms_cm;
export const EC_MAX_MS_CM = TOMATO_MATURE.ec_max_ms_cm;

export const NPK_LEVELS = TOMATO_MATURE.npk_levels;
export const N_TARGET = TOMATO_MATURE.n_target;
export const P_TARGET = TOMATO_MATURE.p_target;
export const K_TARGET = TOMATO_MATURE.k_target;
