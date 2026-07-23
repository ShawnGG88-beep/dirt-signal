import type { SensorReading } from "./api";
import {
  AMBIENT_TEMP_DAY_MAX_C,
  AMBIENT_TEMP_DAY_MIN_C,
  AMBIENT_TEMP_NIGHT_MAX_C,
  AMBIENT_TEMP_NIGHT_MIN_C,
  CROP_PROFILES,
  DEFAULT_CROP_TYPE,
  DEFAULT_LIFECYCLE_STAGE,
  HUMIDITY_MAX_PCT,
  HUMIDITY_MIN_PCT,
  MOISTURE_MAX_PCT,
  MOISTURE_MIN_PCT,
  PH_MAX,
  PH_MIN,
  SOIL_TEMP_IDEAL_MAX_C,
  SOIL_TEMP_IDEAL_MIN_C,
  type ScoringSemantic,
} from "./growingConstants";

export type MetricKey =
  | "moisture_pct"
  | "ph"
  | "soil_temp_c"
  | "ambient_temp_c"
  | "ambient_humidity_pct"
  | "moisture_raw";

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

export const METRICS: MetricDef[] = [
  {
    key: "moisture_pct",
    label: "Moisture",
    unit: "%",
    colour: "#2DB500",
    tier: "primary",
    bounds: METRIC_BOUNDS.moisture_pct ?? null,
  },
  {
    key: "ph",
    label: "pH",
    unit: "",
    colour: "#107EEC",
    tier: "primary",
    bounds: METRIC_BOUNDS.ph ?? null,
  },
  {
    key: "soil_temp_c",
    label: "Soil temp",
    unit: "°C",
    colour: "#FF8A00",
    tier: "primary",
    bounds: METRIC_BOUNDS.soil_temp_c ?? null,
  },
  {
    key: "ambient_temp_c",
    label: "Ambient temp",
    unit: "°C",
    colour: "#107EEC",
    tier: "context",
    // Day/night bounds applied per reading timestamp when the stage has them
    bounds: null,
  },
  {
    key: "ambient_humidity_pct",
    label: "Humidity",
    unit: "%",
    colour: "#2DB500",
    tier: "context",
    bounds: METRIC_BOUNDS.ambient_humidity_pct ?? null,
  },
  {
    key: "moisture_raw",
    label: "Raw ADC",
    unit: "",
    colour: "#FF8A00",
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
  if (key === "moisture_raw" || key === "ambient_temp_c") {
    return null;
  }

  const cropKey = cropType ?? DEFAULT_CROP_TYPE;
  const stageKey = lifecycleStage ?? DEFAULT_LIFECYCLE_STAGE;
  const stage = CROP_PROFILES[cropKey]?.stages[stageKey];
  if (!stage) {
    return null;
  }

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
 * Ambient day/night bounds only when the stage defines them (tomato mature).
 * Otherwise null: show raw value with no coloured band.
 */
export function getAmbientBoundsForProfile(
  recordedAt: string,
  cropType?: string | null,
  lifecycleStage?: string | null,
): MetricBounds | null {
  const cropKey = cropType ?? DEFAULT_CROP_TYPE;
  const stageKey = lifecycleStage ?? DEFAULT_LIFECYCLE_STAGE;
  const stage = CROP_PROFILES[cropKey]?.stages[stageKey];
  if (!stage) {
    return null;
  }
  if (
    stage.ambient_temp_day_min_c === undefined ||
    stage.ambient_temp_day_max_c === undefined ||
    stage.ambient_temp_night_min_c === undefined ||
    stage.ambient_temp_night_max_c === undefined
  ) {
    // Tomato mature exposes ambient via aliases; prefer those when this is
    // the tomato/mature stage even if CropStageBase typing omitted them.
    if (
      cropKey === DEFAULT_CROP_TYPE &&
      stageKey === DEFAULT_LIFECYCLE_STAGE
    ) {
      const hour = new Date(recordedAt).getHours();
      const isDay = hour >= 6 && hour < 18;
      return isDay
        ? { min: AMBIENT_TEMP_DAY_MIN_C, max: AMBIENT_TEMP_DAY_MAX_C }
        : { min: AMBIENT_TEMP_NIGHT_MIN_C, max: AMBIENT_TEMP_NIGHT_MAX_C };
    }
    return null;
  }
  const hour = new Date(recordedAt).getHours();
  const isDay = hour >= 6 && hour < 18;
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

export interface MetricScore {
  status: MetricStatus;
  bounds: MetricBounds | null;
  /**
   * Normalised position within bounds (0 at min, 1 at max).
   * May be &lt;0 or &gt;1 when the value is outside the band. Null when unscored.
   */
  position: number | null;
}

const WATCH_FRACTION = 0.1;

function normalisedPosition(value: number, bounds: MetricBounds): number {
  const width = bounds.max - bounds.min;
  if (width === 0) return 0.5;
  return (value - bounds.min) / width;
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
    return { status: "unknown", bounds: bounds ?? null, position: null };
  }

  if (options?.displayOnly) {
    return { status: "ok", bounds: null, position: null };
  }

  if (!bounds) {
    return { status: "unknown", bounds: null, position: null };
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

export function extractMetricValues(
  readings: SensorReading[],
  key: MetricKey,
): number[] {
  return readings
    .map((r) => r[key])
    .filter((v): v is number => v !== null && v !== undefined);
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
};

export function metricKeyFromSlug(slug: string): MetricKey | null {
  return SLUG_TO_METRIC[slug] ?? null;
}

export function isRangePreset(value: string): value is RangePreset {
  return RANGE_PRESETS.some((p) => p.id === value);
}
