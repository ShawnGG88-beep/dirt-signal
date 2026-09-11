import type { SensorReading } from "../data/types";
import {
  HUMIDITY_MAX_PCT,
  HUMIDITY_MIN_PCT,
  MOISTURE_MAX_PCT,
  MOISTURE_MIN_PCT,
  PH_MAX,
  PH_MIN,
  SOIL_TEMP_IDEAL_MAX_C,
  SOIL_TEMP_IDEAL_MIN_C,
  getCropStage,
  grapeRootZoneTempZone,
  isGrapeCrop,
  type ScoringSemantic,
} from "./growingConstants";
import {
  DEFAULT_DEVICE_TIMEZONE,
  isDayPeriod,
} from "./dayNight";
import { dewPointC, vapourPressureDeficitKpa } from "./derived";

export type MetricKey =
  | "moisture_pct"
  | "ph"
  | "soil_temp_c"
  | "ambient_temp_c"
  | "ambient_humidity_pct"
  | "moisture_raw"
  | "vpd_kpa"
  | "dew_point_c";

export type MetricTier = "primary" | "context" | "diagnostic";

export interface MetricBounds {
  min: number;
  max: number;
}

export interface MetricDef {
  key: MetricKey;
  label: string;
  unit: string;
  colour: string;
  tier: MetricTier;
  /**
   * Tomato/mature flat bounds for backward-compatible defaults.
   * Prefer getMetricBoundsForProfile for profile-aware UI.
   */
  bounds: MetricBounds | null;
  /** When true, value is computed client-side; never scored against bands. */
  derived?: boolean;
}

/**
 * Fallback staleness threshold when /health omits collector_interval_seconds.
 * Prefer staleAfterMsFromInterval(health.collector_interval_seconds).
 */
export const STALE_AFTER_MS = 30 * 60 * 1000;

/** Tomato mature defaults only. Do not use for grape without a profile lookup. */
export const METRIC_BOUNDS: Partial<Record<MetricKey, MetricBounds>> = {
  moisture_pct: { min: MOISTURE_MIN_PCT, max: MOISTURE_MAX_PCT },
  ph: { min: PH_MIN, max: PH_MAX },
  soil_temp_c: { min: SOIL_TEMP_IDEAL_MIN_C, max: SOIL_TEMP_IDEAL_MAX_C },
  ambient_humidity_pct: { min: HUMIDITY_MIN_PCT, max: HUMIDITY_MAX_PCT },
};

/**
 * `colour` is a CSS custom-property name from tokens.css. Charts and
 * sparklines use `--chart-line` / `--chart-band-fill` rather than per-metric
 * hues; this field remains for any caller that still wants a token handle.
 */
export const METRICS: MetricDef[] = [
  {
    key: "moisture_pct",
    label: "Moisture",
    unit: "%",
    colour: "--chart-line",
    tier: "primary",
    bounds: METRIC_BOUNDS.moisture_pct ?? null,
  },
  {
    key: "ph",
    label: "pH",
    unit: "",
    colour: "--chart-line",
    tier: "primary",
    bounds: METRIC_BOUNDS.ph ?? null,
  },
  {
    key: "soil_temp_c",
    label: "Soil temp",
    unit: "°C",
    colour: "--chart-line",
    tier: "primary",
    bounds: METRIC_BOUNDS.soil_temp_c ?? null,
  },
  {
    key: "ambient_temp_c",
    label: "Ambient temp",
    unit: "°C",
    colour: "--chart-line",
    tier: "context",
    // Day/night bounds applied per reading timestamp when the stage has them
    bounds: null,
  },
  {
    key: "ambient_humidity_pct",
    label: "Humidity",
    unit: "%",
    colour: "--chart-line",
    tier: "context",
    bounds: METRIC_BOUNDS.ambient_humidity_pct ?? null,
  },
  {
    key: "vpd_kpa",
    label: "VPD",
    unit: "kPa",
    colour: "--chart-line",
    tier: "context",
    bounds: null,
    derived: true,
  },
  {
    key: "dew_point_c",
    label: "Dew point",
    unit: "°C",
    colour: "--chart-line",
    tier: "context",
    bounds: null,
    derived: true,
  },
  {
    key: "moisture_raw",
    label: "Raw ADC",
    unit: "",
    colour: "--chart-line",
    tier: "diagnostic",
    // Not a crop reference: display only in reports
    bounds: null,
  },
];

export function getMetric(key: MetricKey): MetricDef {
  const metric = METRICS.find((m) => m.key === key);
  if (!metric) {
    throw new Error(`Unknown metric: ${key}`);
  }
  return metric;
}

/**
 * Resolve flat min/max for a metric from the crop stage profile.
 * Returns null when the stage has no band for that metric (e.g. grape
 * moisture / temperature). Never falls back to tomato bounds for another crop.
 */
export function getMetricBoundsForProfile(
  key: MetricKey,
  cropType?: string | null,
  lifecycleStage?: string | null,
): MetricBounds | null {
  if (key === "moisture_raw" || key === "ambient_temp_c" || key === "vpd_kpa" || key === "dew_point_c") {
    return null;
  }

  const stage = getCropStage(cropType, lifecycleStage);

  if (key === "moisture_pct") {
    if (
      stage.moisture_min_pct === undefined ||
      stage.moisture_max_pct === undefined
    ) {
      return null;
    }
    return { min: stage.moisture_min_pct, max: stage.moisture_max_pct };
  }

  if (key === "ph") {
    if (stage.ph_min === undefined || stage.ph_max === undefined) {
      return null;
    }
    return { min: stage.ph_min, max: stage.ph_max };
  }

  if (key === "soil_temp_c") {
    if (
      stage.soil_temp_ideal_min_c === undefined ||
      stage.soil_temp_ideal_max_c === undefined
    ) {
      return null;
    }
    return {
      min: stage.soil_temp_ideal_min_c,
      max: stage.soil_temp_ideal_max_c,
    };
  }

  if (key === "ambient_humidity_pct") {
    if (
      stage.humidity_min_pct === undefined ||
      stage.humidity_max_pct === undefined
    ) {
      return null;
    }
    return { min: stage.humidity_min_pct, max: stage.humidity_max_pct };
  }

  return null;
}

/**
 * Ambient day/night bounds only when the stage defines them (tomato stages
 * that carry ambient bands). Otherwise null: show raw value with no coloured band.
 *
 * `timeZone` is the device IANA timezone — never browser local.
 */
export function getAmbientBoundsForProfile(
  recordedAt: string,
  cropType?: string | null,
  lifecycleStage?: string | null,
  timeZone: string = DEFAULT_DEVICE_TIMEZONE,
): MetricBounds | null {
  const stage = getCropStage(cropType, lifecycleStage);
  if (
    stage.ambient_temp_day_min_c === undefined ||
    stage.ambient_temp_day_max_c === undefined ||
    stage.ambient_temp_night_min_c === undefined ||
    stage.ambient_temp_night_max_c === undefined
  ) {
    return null;
  }
  const isDay = isDayPeriod(recordedAt, timeZone);
  return isDay
    ? {
        min: stage.ambient_temp_day_min_c,
        max: stage.ambient_temp_day_max_c,
      }
    : {
        min: stage.ambient_temp_night_min_c,
        max: stage.ambient_temp_night_max_c,
      };
}

export type MetricStatus =
  | "ok"
  | "watch"
  | "warn"
  | "elevated"
  | "error"
  | "unknown";

/** Why a metric returned unknown / was left unscored. */
export type MetricUnscoredReason =
  | "no_value"
  | "no_band"
  | "needs_calibration";

export interface MetricScore {
  status: MetricStatus;
  bounds: MetricBounds | null;
  /**
   * Normalised position within bounds (0 at min, 1 at max).
   * May be &lt;0 or &gt;1 when the value is outside the band. Null when unscored.
   */
  position: number | null;
  /** Present when status is unknown (or when calibration is the gap). */
  reason?: MetricUnscoredReason;
  /**
   * Percent depletion of available water when scored via soil moisture
   * anchors (0 at field capacity, 100 at refill point).
   */
  depletionPct?: number | null;
  /** Zone id when soil temp was scored via grape root-zone zones. */
  zoneId?: string;
  zoneLabel?: string;
}

/** Per-device HW-390 relative-saturation anchors for depletion scoring. */
export interface SoilMoistureAnchors {
  fieldCapacityPct: number | null;
  refillPointPct: number | null;
}

const WATCH_FRACTION = 0.1;

function normalisedPosition(value: number, bounds: MetricBounds): number {
  const width = bounds.max - bounds.min;
  if (width === 0) return 0.5;
  return (value - bounds.min) / width;
}

export function anchorsAreComplete(
  anchors: SoilMoistureAnchors | null | undefined,
): anchors is {
  fieldCapacityPct: number;
  refillPointPct: number;
} {
  if (!anchors) return false;
  const { fieldCapacityPct, refillPointPct } = anchors;
  return (
    typeof fieldCapacityPct === "number" &&
    typeof refillPointPct === "number" &&
    Number.isFinite(fieldCapacityPct) &&
    Number.isFinite(refillPointPct) &&
    fieldCapacityPct > refillPointPct
  );
}

/**
 * Percent depletion of available water between field capacity and refill.
 * 0 at field capacity, 100 at refill point. Null when anchors incomplete.
 */
export function moistureDepletionPct(
  value: number,
  anchors: SoilMoistureAnchors,
): number | null {
  if (!anchorsAreComplete(anchors)) return null;
  const span = anchors.fieldCapacityPct - anchors.refillPointPct;
  if (span <= 0) return null;
  return ((anchors.fieldCapacityPct - value) / span) * 100;
}

/**
 * Score moisture against user-supplied FC / refill anchors (depletion),
 * not against a crop percentage band. Status stays unknown until both
 * anchors are populated — never invent defaults.
 */
export function scoreMoistureDepletion(
  value: number | null | undefined,
  anchors: SoilMoistureAnchors | null | undefined,
): MetricScore {
  if (value === null || value === undefined) {
    return {
      status: "unknown",
      bounds: null,
      position: null,
      reason: "no_value",
    };
  }
  if (!anchorsAreComplete(anchors)) {
    return {
      status: "unknown",
      bounds: null,
      position: null,
      reason: "needs_calibration",
    };
  }

  const bounds: MetricBounds = {
    min: anchors.refillPointPct,
    max: anchors.fieldCapacityPct,
  };
  const depletion = moistureDepletionPct(value, anchors);
  const position = normalisedPosition(value, bounds);
  const width = bounds.max - bounds.min;
  const watchMargin = width * WATCH_FRACTION;

  // Above field capacity: gravitational water, not plant-available.
  // Definitional (METER Group plant-available water); no invented literature %.
  if (value > anchors.fieldCapacityPct) {
    return {
      status: "watch",
      bounds,
      position,
      depletionPct: depletion,
    };
  }
  // At or past the grower's refill point.
  if (value <= anchors.refillPointPct) {
    return {
      status: "warn",
      bounds,
      position,
      depletionPct: depletion,
    };
  }
  // Approaching refill within the existing 10% watch margin.
  if (value <= anchors.refillPointPct + watchMargin) {
    return {
      status: "watch",
      bounds,
      position,
      depletionPct: depletion,
    };
  }
  return {
    status: "ok",
    bounds,
    position,
    depletionPct: depletion,
  };
}

/**
 * Score grape root-zone temperature via the graded zone table.
 * Bypasses scoring_semantic restraint — cold soil is a genuine problem
 * even on mature grape_wine (restraint is a nitrogen/vigour concept).
 */
export function scoreGrapeSoilTemp(
  value: number | null | undefined,
): MetricScore {
  if (value === null || value === undefined) {
    return {
      status: "unknown",
      bounds: null,
      position: null,
      reason: "no_value",
    };
  }
  const zone = grapeRootZoneTempZone(value);
  const idealBounds: MetricBounds = {
    // Zhang et al. 2024, Horticulturae 10(3):245: optimal 21-24°C
    min: 21.0,
    max: 24.0,
  };
  return {
    status: zone.severity,
    bounds: idealBounds,
    position: normalisedPosition(value, idealBounds),
    zoneId: zone.id,
    zoneLabel: zone.label,
  };
}

/**
 * Score a value against profile bounds and scoring_semantic.
 * restraint: only values above the band are a concern (excess vigour),
 * coloured as elevated (orange), not as a deficiency to fix.
 * watch: inside the band but within 10% of band width of a relevant bound.
 */
export function scoreMetricValue(
  value: number | null | undefined,
  bounds: MetricBounds | null,
  scoringSemantic: ScoringSemantic,
  options?: { displayOnly?: boolean },
): MetricScore {
  if (value === null || value === undefined) {
    return {
      status: "unknown",
      bounds: bounds ?? null,
      position: null,
      reason: "no_value",
    };
  }

  if (options?.displayOnly) {
    return { status: "ok", bounds: null, position: null };
  }

  if (!bounds) {
    return {
      status: "unknown",
      bounds: null,
      position: null,
      reason: "no_band",
    };
  }

  const position = normalisedPosition(value, bounds);
  const width = bounds.max - bounds.min;
  const watchMargin = width * WATCH_FRACTION;

  if (scoringSemantic === "restraint") {
    if (value > bounds.max) {
      return { status: "elevated", bounds, position };
    }
    // Approaching the upper watch band only; never flag the lower end.
    if (value >= bounds.max - watchMargin) {
      return { status: "watch", bounds, position };
    }
    return { status: "ok", bounds, position };
  }

  if (value < bounds.min || value > bounds.max) {
    return { status: "warn", bounds, position };
  }
  if (value <= bounds.min + watchMargin || value >= bounds.max - watchMargin) {
    return { status: "watch", bounds, position };
  }
  return { status: "ok", bounds, position };
}

/**
 * Profile-aware scoring entry point used by the Dashboard.
 * Routes grape soil temp through graded zones (bypassing restraint) and
 * grape moisture through depletion anchors when the stage has no band.
 */
export function scoreMetricForProfile(
  key: MetricKey,
  value: number | null | undefined,
  cropType: string,
  lifecycleStage: string,
  recordedAt: string | null | undefined,
  timeZone: string,
  options?: {
    derived?: boolean;
    anchors?: SoilMoistureAnchors | null;
  },
): MetricScore {
  const semantic = getCropStage(cropType, lifecycleStage).scoring_semantic;
  if (options?.derived || key === "moisture_raw") {
    return scoreMetricValue(value, null, semantic, { displayOnly: true });
  }

  if (key === "soil_temp_c" && isGrapeCrop(cropType)) {
    return scoreGrapeSoilTemp(value);
  }

  if (key === "ambient_temp_c") {
    const at = recordedAt ?? new Date().toISOString();
    const bounds = getAmbientBoundsForProfile(
      at,
      cropType,
      lifecycleStage,
      timeZone,
    );
    return scoreMetricValue(value, bounds, semantic);
  }

  if (key === "moisture_pct") {
    const bandBounds = getMetricBoundsForProfile(
      key,
      cropType,
      lifecycleStage,
    );
    // Tomato (and any crop with a moisture band) keeps band scoring.
    if (bandBounds) {
      return scoreMetricValue(value, bandBounds, semantic);
    }
    // Grape (no band): depletion against per-device anchors only.
    return scoreMoistureDepletion(value, options?.anchors ?? null);
  }

  const bounds = getMetricBoundsForProfile(key, cropType, lifecycleStage);
  return scoreMetricValue(value, bounds, semantic);
}

/** Resolve a metric value from a reading, including derived metrics. */
export function readingMetricValue(
  reading: SensorReading,
  key: MetricKey,
): number | null {
  if (key === "vpd_kpa") {
    return vapourPressureDeficitKpa(
      reading.ambient_temp_c,
      reading.ambient_humidity_pct,
    );
  }
  if (key === "dew_point_c") {
    return dewPointC(reading.ambient_temp_c, reading.ambient_humidity_pct);
  }
  const v = reading[key as keyof SensorReading];
  return typeof v === "number" ? v : null;
}

export function extractMetricValues(
  readings: SensorReading[],
  key: MetricKey,
): number[] {
  return readings
    .map((r) => readingMetricValue(r, key))
    .filter((v): v is number => v !== null);
}

export function isDerivedMetric(key: MetricKey): boolean {
  return key === "vpd_kpa" || key === "dew_point_c";
}

export function formatMetricValue(
  value: number | null | undefined,
  unit: string,
  digits = 1,
): string {
  if (value === null || value === undefined) return "n/a";
  const formatted = Number.isInteger(value)
    ? String(value)
    : value.toFixed(digits);
  return unit ? `${formatted} ${unit}` : formatted;
}

export type RangePreset = "6h" | "24h" | "7d" | "30d";

export const RANGE_PRESETS: { id: RangePreset; label: string; ms: number }[] = [
  { id: "6h", label: "6h", ms: 6 * 60 * 60 * 1000 },
  { id: "24h", label: "24h", ms: 24 * 60 * 60 * 1000 },
  { id: "7d", label: "7d", ms: 7 * 24 * 60 * 60 * 1000 },
  { id: "30d", label: "30d", ms: 30 * 24 * 60 * 60 * 1000 },
];

export function rangeFromPreset(preset: RangePreset): { from: Date; to: Date } {
  const entry = RANGE_PRESETS.find((p) => p.id === preset);
  const ms = entry?.ms ?? RANGE_PRESETS[0].ms;
  const to = new Date();
  return { from: new Date(to.getTime() - ms), to };
}

/** Effective profile for a reading; null provenance falls back to device. */
export function effectiveReadingProfile(
  reading: SensorReading,
  deviceCropType: string,
  deviceLifecycleStage: string,
): {
  cropType: string;
  lifecycleStage: string;
  provenanceKnown: boolean;
} {
  const crop = reading.crop_type_at_reading;
  const stage = reading.lifecycle_stage_at_reading;
  if (crop && stage) {
    return { cropType: crop, lifecycleStage: stage, provenanceKnown: true };
  }
  return {
    cropType: deviceCropType,
    lifecycleStage: deviceLifecycleStage,
    provenanceKnown: false,
  };
}

export function profileSegmentKey(
  cropType: string,
  lifecycleStage: string,
): string {
  return `${cropType}/${lifecycleStage}`;
}

/** Short URL slug for a metric key (hash routes). */
export const METRIC_SLUG: Record<MetricKey, string> = {
  moisture_pct: "moisture",
  ph: "ph",
  soil_temp_c: "soil_temp",
  ambient_temp_c: "ambient_temp",
  ambient_humidity_pct: "humidity",
  moisture_raw: "moisture_raw",
  vpd_kpa: "vpd",
  dew_point_c: "dew_point",
};

const SLUG_TO_METRIC: Record<string, MetricKey> = {
  moisture: "moisture_pct",
  moisture_pct: "moisture_pct",
  ph: "ph",
  soil_temp: "soil_temp_c",
  soil_temp_c: "soil_temp_c",
  ambient_temp: "ambient_temp_c",
  ambient_temp_c: "ambient_temp_c",
  humidity: "ambient_humidity_pct",
  ambient_humidity_pct: "ambient_humidity_pct",
  moisture_raw: "moisture_raw",
  raw: "moisture_raw",
  vpd: "vpd_kpa",
  vpd_kpa: "vpd_kpa",
  dew_point: "dew_point_c",
  dew_point_c: "dew_point_c",
};

export function metricKeyFromSlug(slug: string): MetricKey | null {
  return SLUG_TO_METRIC[slug] ?? null;
}

export function isRangePreset(value: string): value is RangePreset {
  return RANGE_PRESETS.some((p) => p.id === value);
}
