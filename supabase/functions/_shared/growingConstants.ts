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
export type LifecycleStage =
  | "mature"
  | "establishment"
  | "flowering"
  | "germination"
  | "seedling"
  | "vegetative_growth"
  | "fruit_development"
  | "ripening";

export const DEFAULT_CROP_TYPE: CropType = "tomato";
/** Shared null-coalesce for grape devices and missing DB rows. Grape still uses "mature". */
export const DEFAULT_LIFECYCLE_STAGE: LifecycleStage = "mature";

/** Tomato scoring-band fallback; same numbers as the retired tomato "mature" stage. */
export const TOMATO_FALLBACK_LIFECYCLE_STAGE = "vegetative_growth" as const;

export const TOMATO_LIFECYCLE_STAGES = [
  "germination",
  "seedling",
  "vegetative_growth",
  "flowering",
  "fruit_development",
  "ripening",
] as const;

export type TomatoLifecycleStage = (typeof TOMATO_LIFECYCLE_STAGES)[number];

/** Lookup-only aliases for leftover DB values. Not selectable in the picker. */
export const TOMATO_RETIRED_STAGE_ALIASES: Record<string, TomatoLifecycleStage> =
  {
    mature: "vegetative_growth",
    fruiting: "fruit_development",
  };

export const TOMATO_GDD_ACCUMULATION_START_STAGE: TomatoLifecycleStage =
  "seedling";

/** °C·d thresholds, base 10°C, accumulated from the start of seedling. */
export const TOMATO_GDD_STAGE_BANDS = {
  vegetative_growth: 585,
  flowering: 897,
  fruit_development: 1216,
  ripening: 1568,
} as const;

export const TOMATO_GDD_STAGE_BANDS_PROVENANCE =
  "Northern Hemisphere reference data, provisional pending local calibration. Single-study reference (California, one transplant date/season).";

export const TOMATO_LIFECYCLE_STAGE_LABELS: Record<TomatoLifecycleStage, string> =
  {
    germination: "Germination",
    seedling: "Seedling",
    vegetative_growth: "Vegetative growth",
    flowering: "Flowering",
    fruit_development: "Fruit development",
    ripening: "Ripening",
  };

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
  stage_note?: string;
  typical_duration_note?: string;
  gdd_threshold_c_days?: number;
  blossom_end_rot_note?: string;
}

/** Scoring-band baseline shared by tomato stages unless a stage overrides. Formerly the tomato "mature" stage. */
const TOMATO_BASELINE: TomatoMatureStage = {
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
  {
    /** Mirrors constants.py display_name; used for profile pickers. */
    display_name?: string;
    gdd_base_c?: number;
    stages: Record<string, CropStageBase>;
  }
> = {
  tomato: {
    display_name: "Tomato",
    gdd_base_c: 10,
    stages: {
      germination: {
        ...TOMATO_BASELINE,
        typical_duration_note:
          "Typical duration 5-10 days at 21-27°C soil temperature. Informational only, not an enforced boundary.",
        stage_note:
          "Germination: no GDD threshold and no GDD accumulation. Seed-tray germination is usually complete before an outdoor sensor is measuring the plant.",
      },
      seedling: {
        ...TOMATO_BASELINE,
        typical_duration_note:
          "Typical duration 2-3 weeks after germination until true leaves establish. Informational only, not an enforced boundary.",
        stage_note:
          "Seedling: no GDD threshold to check against, but GDD accumulation starts here (base 10°C), once the plant is potted nearer its growing environment.",
      },
      vegetative_growth: {
        ...TOMATO_BASELINE,
        gdd_threshold_c_days: 585,
        stage_note:
          "Vegetative growth: GDD threshold 585 °C·d (base 10°C, accumulated from the start of seedling). " +
          TOMATO_GDD_STAGE_BANDS_PROVENANCE,
      },
      flowering: {
        ...TOMATO_BASELINE,
        gdd_threshold_c_days: 897,
        stage_note:
          "Flowering: blossom-drop risk uses forecast night lows ≤13°C when this stage is selected. GDD threshold 897 °C·d (base 10°C, accumulated from the start of seedling). " +
          TOMATO_GDD_STAGE_BANDS_PROVENANCE,
      },
      fruit_development: {
        ...TOMATO_BASELINE,
        moisture_min_pct: 65,
        moisture_max_pct: 85,
        gdd_threshold_c_days: 1216,
        blossom_end_rot_note:
          "Fruit development: moisture stability advisories reference 25-38 mm/week and cracking/BER influx after dry spells.",
        stage_note:
          "Fruit development: GDD threshold 1216 °C·d (base 10°C, accumulated from the start of seedling). " +
          TOMATO_GDD_STAGE_BANDS_PROVENANCE,
      },
      ripening: {
        ...TOMATO_BASELINE,
        moisture_min_pct: 65,
        moisture_max_pct: 85,
        gdd_threshold_c_days: 1568,
        stage_note:
          "Ripening: GDD threshold 1568 °C·d (base 10°C, accumulated from the start of seedling). " +
          TOMATO_GDD_STAGE_BANDS_PROVENANCE,
      },
    },
  },
  grape_wine: {
    display_name: "Wine grape",
    gdd_base_c: 10,
    stages: {
      // Zhao et al. 2019: no significant variety differences in soil OM /
      // available nutrients; split by production goal and stage only.
      // Cultivar phenology/frost/water-stress lives in GRAPE_WINE_CULTIVAR_PROFILES.
      establishment: {
        scoring_semantic: "optimal_band",
        // Rosen 2014 ph_target range [6.0, 7.0]
        ph_min: 6.0,
        ph_max: 7.0,
        // Zhang et al. 2024 optimal root-zone band 21-24°C (same for both stages;
        // no sourced reason to differentiate establishment vs mature).
        soil_temp_ideal_min_c: 21.0,
        soil_temp_ideal_max_c: 24.0,
        nitrogen: {
          direction: "adequate_then_restrain",
          soil_test_reliable: false,
          note: "Rosen 2014: soil N tests unreliable; non-bearing guidance by OM class in lb N/acre (not converted).",
        },
      },
      mature: {
        scoring_semantic: "restraint",
        // Zhang et al. 2024 optimal root-zone band 21-24°C (same for both stages;
        // no sourced reason to differentiate establishment vs mature).
        soil_temp_ideal_min_c: 21.0,
        soil_temp_ideal_max_c: 24.0,
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
    display_name: "Table grape",
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

export function canonicalTomatoLifecycleStage(
  lifecycleStage: string | null | undefined,
): TomatoLifecycleStage | null {
  if (lifecycleStage == null || lifecycleStage === "") return null;
  if ((TOMATO_LIFECYCLE_STAGES as readonly string[]).includes(lifecycleStage)) {
    return lifecycleStage as TomatoLifecycleStage;
  }
  return TOMATO_RETIRED_STAGE_ALIASES[lifecycleStage] ?? null;
}

export function tomatoGddAccumulationActive(
  lifecycleStage: string | null | undefined,
): boolean {
  const canonical = canonicalTomatoLifecycleStage(lifecycleStage);
  if (canonical == null) return false;
  const start = TOMATO_LIFECYCLE_STAGES.indexOf(
    TOMATO_GDD_ACCUMULATION_START_STAGE,
  );
  return TOMATO_LIFECYCLE_STAGES.indexOf(canonical) >= start;
}

export function shouldAccumulateGdd(
  cropType?: string | null,
  lifecycleStage?: string | null,
): boolean {
  const cropKey = cropType ?? DEFAULT_CROP_TYPE;
  if (cropKey !== "tomato") return true;
  return tomatoGddAccumulationActive(lifecycleStage);
}

export function getCropStage(
  cropType: string | null | undefined = DEFAULT_CROP_TYPE,
  lifecycleStage: string | null | undefined = DEFAULT_LIFECYCLE_STAGE,
): CropStageBase {
  const cropKey = cropType ?? DEFAULT_CROP_TYPE;
  let stageKey = lifecycleStage ?? DEFAULT_LIFECYCLE_STAGE;
  if (cropKey === "tomato") {
    stageKey =
      canonicalTomatoLifecycleStage(stageKey) ??
      TOMATO_FALLBACK_LIFECYCLE_STAGE;
  }
  const crop = CROP_PROFILES[cropKey];
  const stage = crop?.stages[stageKey];
  if (!stage) {
    return CROP_PROFILES[DEFAULT_CROP_TYPE].stages[
      TOMATO_FALLBACK_LIFECYCLE_STAGE
    ];
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
// Grape wine root-zone soil temperature zones (graded scale, not a single
// min/max band). Applied to both establishment and mature stages — no sourced
// reason to differentiate was found.
// SOURCE OF TRUTH: ml-backend/constants.py — mirror when refining.
// ---------------------------------------------------------------------------

export type GrapeRootZoneTempSeverity = "ok" | "watch" | "warn";

export interface GrapeRootZoneTempZone {
  id: string;
  label: string;
  /** Inclusive lower bound (°C); null = unbounded below. */
  min_c: number | null;
  /** Exclusive upper bound (°C); null = unbounded above. */
  max_c: number | null;
  severity: GrapeRootZoneTempSeverity;
  note: string;
}

/**
 * Ordered root-zone temperature zones for grape_wine.
 *
 * Deliberate deviation from a round 24-30 / >30 split: the sourced upper
 * photosynthesis threshold is ~29.7°C, so the heat-stress boundary is 29.7
 * rather than an unsourced 30.
 */
export const GRAPE_ROOT_ZONE_TEMP_ZONES: readonly GrapeRootZoneTempZone[] = [
  {
    id: "dormant",
    label: "Dormant / no root activity",
    min_c: null,
    // Zhang et al. 2024, Horticulturae 10(3):245: root activity floor 8-10°C at 5cm
    max_c: 8.0,
    severity: "warn",
    note: "Below root activity floor; nutrient and water uptake has not begun.",
  },
  {
    id: "impaired",
    label: "Root activity beginning, nutrient uptake impaired",
    // Zhang et al. 2024, Horticulturae 10(3):245: root activity begins 8-10°C at 5cm
    min_c: 8.0,
    // Washington State University Extension, Vineyard Nutrient Management in
    // Washington State: practical nutrient-uptake floor ~13°C (55°F).
    // Zelleke and Kliewer 1980 (cited in Root Zone Temperature overview,
    // ScienceDirect Topics): at 12°C, xylem sap cytokinin is ~50% of the
    // level at 25°C.
    max_c: 13.0,
    severity: "warn",
    note: "Roots active but nutrient uptake still impaired relative to warmer soil.",
  },
  {
    id: "functional",
    label: "Functional, below optimal",
    // Washington State University Extension practical uptake floor ~13°C
    min_c: 13.0,
    // Zhang et al. 2024, Horticulturae 10(3):245: optimal band starts 21°C
    max_c: 21.0,
    severity: "watch",
    note: "Functional root-zone temperature; below the flowering/fruiting optimum.",
  },
  {
    id: "optimal",
    label: "Optimal",
    // Zhang et al. 2024, Horticulturae 10(3):245: optimal 21-24°C (flowering/fruiting)
    min_c: 21.0,
    max_c: 24.0,
    severity: "ok",
    note: "Optimal root-zone band for flowering and fruiting.",
  },
  {
    id: "above_optimal",
    label: "Above optimal, approaching photosynthesis ceiling",
    // Zhang et al. 2024 optimal upper bound 24°C
    min_c: 24.0,
    // Field study reported in Relationship between Root Growth of 'Thompson
    // Seedless' Grapevines and Soil Temperature: ~29.7°C root zone sits near
    // the upper threshold of optimum grapevine photosynthesis. Used as 29.7
    // rather than rounding to an unsourced 30.
    max_c: 29.7,
    severity: "watch",
    note: "Above optimal; approaching the upper photosynthesis threshold.",
  },
  {
    id: "heat_stress",
    label: "Heat stress / root survival risk",
    // ~29.7°C upper photosynthesis threshold (Thompson Seedless field study)
    min_c: 29.7,
    max_c: null,
    severity: "warn",
    note: "Heat stress. Root survival risk rises above 35°C (Huang et al. 2005).",
  },
] as const;

/**
 * Huang et al. 2005, cited in Holzapfel et al., Soil Temperature Prior to
 * Veraison Alters Grapevine Carbon Partitioning, Am. J. Enol. Vitic. 71(1):52:
 * root survival risk above 35°C. Marker within the heat_stress zone; not a
 * separate scoring boundary.
 */
export const GRAPE_ROOT_SURVIVAL_RISK_C = 35.0;

export const GRAPE_ROOT_ZONE_TEMP_PROVENANCE =
  "Graded root-zone temperature scale for grape_wine, applied identically to "
  + "establishment and mature (no sourced reason to differentiate). "
  + "Thresholds: Zhang et al. 2024 Horticulturae 10(3):245; Washington State "
  + "University Extension Vineyard Nutrient Management; Zelleke and Kliewer "
  + "1980; Thompson Seedless root-growth field study (~29.7°C); Huang et al. "
  + "2005 via Holzapfel et al. Am. J. Enol. Vitic. 71(1):52.";

/** Look up the graded zone containing a root-zone temperature (°C). */
export function grapeRootZoneTempZone(
  tempC: number,
): GrapeRootZoneTempZone {
  for (const zone of GRAPE_ROOT_ZONE_TEMP_ZONES) {
    const aboveMin = zone.min_c === null || tempC >= zone.min_c;
    const belowMax = zone.max_c === null || tempC < zone.max_c;
    if (aboveMin && belowMax) return zone;
  }
  return GRAPE_ROOT_ZONE_TEMP_ZONES[GRAPE_ROOT_ZONE_TEMP_ZONES.length - 1];
}

// ---------------------------------------------------------------------------
// Backward-compatible tomato / mature aliases (values unchanged)
// ---------------------------------------------------------------------------

export const PH_MIN = TOMATO_BASELINE.ph_min;
export const PH_MAX = TOMATO_BASELINE.ph_max;
export const PH_IDEAL = TOMATO_BASELINE.ph_ideal;

export const MOISTURE_MIN_PCT = TOMATO_BASELINE.moisture_min_pct;
export const MOISTURE_MAX_PCT = TOMATO_BASELINE.moisture_max_pct;

export const SOIL_TEMP_MIN_C = TOMATO_BASELINE.soil_temp_min_c;
export const SOIL_TEMP_PLANTING_MIN_C = TOMATO_BASELINE.soil_temp_planting_min_c;
export const SOIL_TEMP_IDEAL_MIN_C = TOMATO_BASELINE.soil_temp_ideal_min_c;
export const SOIL_TEMP_IDEAL_MAX_C = TOMATO_BASELINE.soil_temp_ideal_max_c;
export const SOIL_TEMP_MAX_C = TOMATO_BASELINE.soil_temp_max_c;

export const AMBIENT_TEMP_DAY_MIN_C = TOMATO_BASELINE.ambient_temp_day_min_c;
export const AMBIENT_TEMP_DAY_MAX_C = TOMATO_BASELINE.ambient_temp_day_max_c;
export const AMBIENT_TEMP_NIGHT_MIN_C = TOMATO_BASELINE.ambient_temp_night_min_c;
export const AMBIENT_TEMP_NIGHT_MAX_C = TOMATO_BASELINE.ambient_temp_night_max_c;
export const AMBIENT_TEMP_FRUIT_SET_CEILING_C =
  TOMATO_BASELINE.ambient_temp_fruit_set_ceiling_c;

/**
 * Local clock hours treating ambient as "day" vs "night".
 * Day bounds apply for [start, end); night otherwise. Spec: roughly 06:00-18:00.
 */
export const AMBIENT_DAY_START_HOUR = 6;
export const AMBIENT_DAY_END_HOUR = 18;

export const HUMIDITY_MIN_PCT = TOMATO_BASELINE.humidity_min_pct;
export const HUMIDITY_MAX_PCT = TOMATO_BASELINE.humidity_max_pct;

export const EC_MIN_MS_CM = TOMATO_BASELINE.ec_min_ms_cm;
export const EC_MAX_MS_CM = TOMATO_BASELINE.ec_max_ms_cm;

export const NPK_LEVELS = TOMATO_BASELINE.npk_levels;
export const N_TARGET = TOMATO_BASELINE.n_target;
export const P_TARGET = TOMATO_BASELINE.p_target;
export const K_TARGET = TOMATO_BASELINE.k_target;

// ---------------------------------------------------------------------------
// Grape wine GDD phenology and cultivar reference profiles
// Distinct from Oklahoma State University tomato constants above.
// SOURCE OF TRUTH: ml-backend/constants.py — mirror when refining.
//
// devices.cultivar is a nullable sibling of crop_type. Null keeps the shared
// GDD bands below (Chardonnay working points). Nutrient scoring stays on
// crop_type grape_wine (Zhao et al. 2019).
// ---------------------------------------------------------------------------

export const GRAPE_WINE_GDD_STAGE_BANDS_PROVENANCE =
  "Northern Hemisphere reference data, provisional pending local calibration";

export const GRAPE_WINE_CULTIVAR_GDD_PROVENANCE =
  "provisional - Northern Hemisphere reference data (Chile, Washington, France), pending local calibration";

/** Southern Hemisphere season start hint only; never auto-applied. */
export const GRAPE_WINE_SEASON_START_MONTH = 9;
export const GRAPE_WINE_SEASON_START_DAY = 1;

/**
 * °C·d working thresholds (base 10°C). Fallback when cultivar is null, and
 * the explicit Chardonnay table. Budburst uses the lower bound of ~75-100.
 *
 * Do not put Winkler regional classification totals (Region I <2500, Region
 * II-III 2500-3500 °F GDD, base 50°F) in these stage bands. Winkler is
 * whole-season climate classification, not budbreak-to-harvest accumulation.
 * The two numbers are easily confused and must not be conflated.
 */
export const GRAPE_WINE_GDD_STAGE_BANDS = {
  budburst: 75,
  flowering: 345,
  veraison: 1267,
  harvest: 1275,
} as const;

/**
 * Cabernet Sauvignon working points (base 10°C). Budburst 84 is the lower
 * bound of ~84-92. Veraison 1200 is the midpoint of 1100-1300 (lower
 * confidence). Harvest 1450 is the midpoint of 1352-1558.
 *
 * Not the Winkler Region II-III total (2500-3500 °F GDD).
 */
export const GRAPE_WINE_CABERNET_GDD_STAGE_BANDS = {
  budburst: 84,
  flowering: 375,
  veraison: 1200,
  harvest: 1450,
} as const;

export type GrapeWineGddStageKey = keyof typeof GRAPE_WINE_GDD_STAGE_BANDS;

/** Winkler Index Region I ceiling (°F GDD, base 50°F). Not compared to °C bands. */
export const WINKLER_REGION_I_CEILING_GDD_F = 2500;
export const WINKLER_INDEX_PROVENANCE =
  "Winkler Index Region I ceiling (°F GDD, base 50°F); not comparable to °C phenology bands";
export const WINKLER_REGION_II_III_MIN_GDD_F = 2500;
export const WINKLER_REGION_II_III_MAX_GDD_F = 3500;
export const WINKLER_INDEX_NOT_PHENOLOGY_NOTE =
  "Winkler Index is whole-season climate classification in °F GDD (base 50°F). It is not comparable to the °C·d phenology stage bands (base 10°C) and must not be used as budburst, flowering, veraison or harvest thresholds.";

export const GRAPE_WINE_CULTIVAR_CHARDONNAY = "chardonnay";
export const GRAPE_WINE_CULTIVAR_PINOT_NOIR = "pinot_noir";
export const GRAPE_WINE_CULTIVAR_CABERNET_SAUVIGNON = "cabernet_sauvignon";

export const GRAPE_WINE_CULTIVAR_IDS = [
  GRAPE_WINE_CULTIVAR_CHARDONNAY,
  GRAPE_WINE_CULTIVAR_PINOT_NOIR,
  GRAPE_WINE_CULTIVAR_CABERNET_SAUVIGNON,
] as const;

export type GrapeWineCultivarId = (typeof GRAPE_WINE_CULTIVAR_IDS)[number];

export const GRAPE_WINE_WATER_STRESS_DRIVES_IRRIGATION = false as const;
export const GRAPE_WINE_WATER_STRESS_HARDWARE_NOTE =
  "If you take a pressure chamber reading, compare it against this reference. The HW-390 measures soil moisture, not water potential of any kind. Live irrigation continues to run on soil-moisture depletion/dry-down. This table is for future manual calibration/validation, not live automation.";

export type GrapeFrostCoverage = "single_point" | "el_staged_table";

export interface GrapeFrostElRow {
  el_min: number;
  el_max: number;
  threshold_c: number;
  label: string;
}

export interface GrapeWineFrostReference {
  coverage: GrapeFrostCoverage;
  stage_label: string;
  slight_damage_c: number | null;
  slight_damage_f: number | null;
  el_rows: GrapeFrostElRow[] | null;
  note: string;
  deacclimation_note: string | null;
}

export type GrapeWaterStressMetricType =
  | "leaf_water_potential_gs50"
  | "stem_water_potential";

export interface GrapeStemWaterPotentialStage {
  phenological_stage: string;
  psi_stem_mpa: number;
}

export interface GrapeWineWaterStressReference {
  metric_type: GrapeWaterStressMetricType | null;
  psi_mpa: number | null;
  psi_mpa_plus_minus: number | null;
  units: "MPa" | null;
  stages: GrapeStemWaterPotentialStage[] | null;
  open_gap: boolean;
  rdi_note: string | null;
  severity_warning: string | null;
  drives_irrigation: false;
  note: string;
}

export interface GrapeWineCultivarProfile {
  id: GrapeWineCultivarId;
  display_name: string;
  gdd_stage_bands: Record<GrapeWineGddStageKey, number>;
  gdd_stage_band_notes: Record<GrapeWineGddStageKey, string>;
  gdd_provenance: string;
  winkler_region: string;
  winkler_region_label: string;
  winkler_gdd_f_min: number | null;
  winkler_gdd_f_max: number;
  winkler_note: string;
  frost: GrapeWineFrostReference;
  water_stress: GrapeWineWaterStressReference;
}

export const GRAPE_WINE_CULTIVAR_PROFILES: Record<
  GrapeWineCultivarId,
  GrapeWineCultivarProfile
> = {
  chardonnay: {
    id: "chardonnay",
    display_name: "Chardonnay",
    gdd_stage_bands: { ...GRAPE_WINE_GDD_STAGE_BANDS },
    gdd_stage_band_notes: {
      budburst: "~75-100 °C·d; working threshold 75 (lower bound)",
      flowering: "~345 °C·d",
      veraison: "~1267 °C·d",
      harvest: "~1275 °C·d",
    },
    gdd_provenance:
      "Chardonnay GDD stage bands. " + GRAPE_WINE_CULTIVAR_GDD_PROVENANCE,
    winkler_region: "I",
    winkler_region_label: "Region I (<2500 total seasonal GDD)",
    winkler_gdd_f_min: null,
    winkler_gdd_f_max: WINKLER_REGION_I_CEILING_GDD_F,
    winkler_note: WINKLER_INDEX_NOT_PHENOLOGY_NOTE,
    frost: {
      coverage: "single_point",
      stage_label: "budswell/budbreak",
      slight_damage_c: -2.8,
      slight_damage_f: 27,
      el_rows: null,
      note: "Provisional single-point reference: slight damage at budswell/budbreak at 27°F (-2.8°C). Not a full E-L-staged table; none was independently sourced for Chardonnay.",
      deacclimation_note: null,
    },
    water_stress: {
      metric_type: "leaf_water_potential_gs50",
      psi_mpa: -1.22,
      psi_mpa_plus_minus: 0.06,
      units: "MPa",
      stages: null,
      open_gap: false,
      rdi_note: null,
      severity_warning: null,
      drives_irrigation: GRAPE_WINE_WATER_STRESS_DRIVES_IRRIGATION,
      note: GRAPE_WINE_WATER_STRESS_HARDWARE_NOTE,
    },
  },
  pinot_noir: {
    id: "pinot_noir",
    display_name: "Pinot Noir",
    gdd_stage_bands: { ...GRAPE_WINE_GDD_STAGE_BANDS },
    gdd_stage_band_notes: {
      budburst:
        "Pinot Noir GDD not independently sourced; using Chardonnay as provisional proxy, same early-ripening Winkler Region I group",
      flowering:
        "Pinot Noir GDD not independently sourced; using Chardonnay as provisional proxy (~345 °C·d)",
      veraison:
        "Pinot Noir GDD not independently sourced; using Chardonnay as provisional proxy (~1267 °C·d)",
      harvest:
        "Pinot Noir GDD not independently sourced; using Chardonnay as provisional proxy (~1275 °C·d)",
    },
    gdd_provenance:
      "Pinot Noir GDD not independently sourced; using Chardonnay as provisional proxy, same early-ripening Winkler Region I group. " +
      GRAPE_WINE_CULTIVAR_GDD_PROVENANCE,
    winkler_region: "I",
    winkler_region_label: "Region I (<2500 total seasonal GDD)",
    winkler_gdd_f_min: null,
    winkler_gdd_f_max: WINKLER_REGION_I_CEILING_GDD_F,
    winkler_note: WINKLER_INDEX_NOT_PHENOLOGY_NOTE,
    frost: {
      coverage: "el_staged_table",
      stage_label: "E-L staged",
      slight_damage_c: null,
      slight_damage_f: null,
      el_rows: [
        {
          el_min: 2,
          el_max: 3,
          threshold_c: -3.3,
          label: "early (E-L 2-3)",
        },
        {
          el_min: 4,
          el_max: 4,
          threshold_c: -2.2,
          label: "budburst (E-L 4)",
        },
        { el_min: 9, el_max: 9, threshold_c: -1.7, label: "E-L 9" },
        { el_min: 11, el_max: 11, threshold_c: -1.1, label: "E-L 11" },
      ],
      note: "E-L-staged frost thresholds: tissue hardens as the season progresses even as the exposure window lengthens. Approximately -3.3°C at E-L 2-3, -2.2°C at E-L 4 (budburst), -1.7°C at E-L 9, -1.1°C at E-L 11.",
      deacclimation_note: null,
    },
    water_stress: {
      metric_type: null,
      psi_mpa: null,
      psi_mpa_plus_minus: null,
      units: null,
      stages: null,
      open_gap: true,
      rdi_note: null,
      severity_warning: null,
      drives_irrigation: GRAPE_WINE_WATER_STRESS_DRIVES_IRRIGATION,
      note: "Pinot Noir water-stress reference not sourced; omitted rather than guessed. Open gap.",
    },
  },
  cabernet_sauvignon: {
    id: "cabernet_sauvignon",
    display_name: "Cabernet Sauvignon",
    gdd_stage_bands: { ...GRAPE_WINE_CABERNET_GDD_STAGE_BANDS },
    gdd_stage_band_notes: {
      budburst:
        "~84-92 °C·d (later-budding than Chardonnay ~75-100); working threshold 84 (lower bound)",
      flowering: "~375 °C·d",
      veraison:
        "~1100-1300 °C·d illustrative bracket, lower confidence; working midpoint 1200",
      harvest:
        "~1352-1558 °C·d from two independent studies; working midpoint 1450",
    },
    gdd_provenance:
      "Cabernet Sauvignon GDD stage bands. " + GRAPE_WINE_CULTIVAR_GDD_PROVENANCE,
    winkler_region: "II-III",
    winkler_region_label: "Region II-III (2500-3500 total seasonal GDD)",
    winkler_gdd_f_min: WINKLER_REGION_II_III_MIN_GDD_F,
    winkler_gdd_f_max: WINKLER_REGION_II_III_MAX_GDD_F,
    winkler_note: WINKLER_INDEX_NOT_PHENOLOGY_NOTE,
    frost: {
      coverage: "single_point",
      stage_label: "budswell",
      slight_damage_c: -3.9,
      slight_damage_f: 25,
      el_rows: null,
      note: "Provisional single-point reference: no damage down to 25°F (-3.9°C) at budswell. Notably more frost-tolerant at this early stage than Chardonnay (slight damage at 27°F / -2.8°C). Not a full E-L-staged table.",
      deacclimation_note:
        "Warm-climate variety with lower peak midwinter cold hardiness but slower deacclimation: less prone to false-spring-triggered early budbreak, but less hardiness in reserve if a hard freeze lands during an already-active period. Future frost-risk logic should weight forecast warm spells versus sudden late freezes differently for this cultivar.",
    },
    water_stress: {
      metric_type: "stem_water_potential",
      psi_mpa: null,
      psi_mpa_plus_minus: null,
      units: "MPa",
      stages: [
        { phenological_stage: "2 weeks pre-bloom", psi_stem_mpa: -0.6 },
        { phenological_stage: "Bunch closure", psi_stem_mpa: -0.8 },
        { phenological_stage: "Veraison initiation", psi_stem_mpa: -1.0 },
        { phenological_stage: "End of veraison", psi_stem_mpa: -1.2 },
      ],
      open_gap: false,
      rdi_note:
        "RDI regime found effective in trials: 50% ETc fruit-set to veraison, 80% ETc veraison to harvest. Descriptive note, not an automation input.",
      severity_warning:
        "25% ETc strongly limited gas exchange and was economically unsustainable in one trial. Descriptive note, not an automation input.",
      drives_irrigation: GRAPE_WINE_WATER_STRESS_DRIVES_IRRIGATION,
      note: GRAPE_WINE_WATER_STRESS_HARDWARE_NOTE,
    },
  },
};

export function normaliseGrapeWineCultivar(
  cultivar: string | null | undefined,
): GrapeWineCultivarId | null {
  if (cultivar == null) return null;
  const key = cultivar.trim().toLowerCase();
  if (key === "") return null;
  if ((GRAPE_WINE_CULTIVAR_IDS as readonly string[]).includes(key)) {
    return key as GrapeWineCultivarId;
  }
  return null;
}

export function isValidGrapeWineCultivar(
  cultivar: string | null | undefined,
): boolean {
  if (cultivar == null || cultivar.trim() === "") return true;
  return normaliseGrapeWineCultivar(cultivar) != null;
}

export function getGrapeWineCultivarProfile(
  cultivar: string | null | undefined,
): GrapeWineCultivarProfile | null {
  const key = normaliseGrapeWineCultivar(cultivar);
  if (key == null) return null;
  return GRAPE_WINE_CULTIVAR_PROFILES[key];
}

export function getGrapeWineGddStageBands(
  cultivar?: string | null,
): Record<GrapeWineGddStageKey, number> {
  const profile = getGrapeWineCultivarProfile(cultivar);
  if (profile == null) return { ...GRAPE_WINE_GDD_STAGE_BANDS };
  return { ...profile.gdd_stage_bands };
}

export function getGrapeWineGddProvenance(cultivar?: string | null): string {
  const profile = getGrapeWineCultivarProfile(cultivar);
  if (profile == null) return GRAPE_WINE_GDD_STAGE_BANDS_PROVENANCE;
  return profile.gdd_provenance;
}

export function grapeWineCultivarOptions(): {
  cultivar: GrapeWineCultivarId;
  display_name: string;
}[] {
  return GRAPE_WINE_CULTIVAR_IDS.map((id) => ({
    cultivar: id,
    display_name: GRAPE_WINE_CULTIVAR_PROFILES[id].display_name,
  }));
}

export type GrapeWinePhenologyStage =
  | "pre_budburst"
  | "budburst"
  | "flowering"
  | "veraison"
  | "harvest";

export const GRAPE_WINE_PHENOLOGY_STAGE_LABELS: Record<
  GrapeWinePhenologyStage,
  string
> = {
  pre_budburst: "Pre-budburst",
  budburst: "Budburst",
  flowering: "Flowering",
  veraison: "Veraison",
  harvest: "Harvest",
};

export interface ElToBbchPhase {
  phase: string;
  el_min: number;
  el_max: number;
  bbch_min: number;
  bbch_max: number;
}

/** E-L to BBCH lookup for later disease gating. */
export const EL_TO_BBCH_PHASES: ElToBbchPhase[] = [
  {
    phase: "shoot_development",
    el_min: 5,
    el_max: 18,
    bbch_min: 9,
    bbch_max: 17,
  },
  {
    phase: "flowering",
    el_min: 19,
    el_max: 26,
    bbch_min: 53,
    bbch_max: 65,
  },
  {
    phase: "berry_development",
    el_min: 27,
    el_max: 33,
    bbch_min: 71,
    bbch_max: 79,
  },
  {
    phase: "ripening",
    el_min: 34,
    el_max: 38,
    bbch_min: 81,
    bbch_max: 89,
  },
];
