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

export interface MetricBounds {
  min: number;
  max: number;
}

export interface MetricDef {
  key: MetricKey;
  label: string;
  unit: string;
  colour: string;
  /**
   * Tomato/mature flat bounds for backward-compatible defaults.
   * Prefer getMetricBoundsForProfile for profile-aware UI.
   */
  bounds: MetricBounds | null;
}

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
    bounds: METRIC_BOUNDS.moisture_pct ?? null,
  },
  {
    key: "ph",
    label: "pH",
    unit: "",
    colour: "#107EEC",
    bounds: METRIC_BOUNDS.ph ?? null,
  },
  {
    key: "soil_temp_c",
    label: "Soil temp",
    unit: "°C",
    colour: "#FF8A00",
    bounds: METRIC_BOUNDS.soil_temp_c ?? null,
  },
  {
    key: "ambient_temp_c",
    label: "Ambient temp",
    unit: "°C",
    colour: "#107EEC",
    // Day/night bounds applied per reading timestamp when the stage has them
    bounds: null,
  },
  {
    key: "ambient_humidity_pct",
    label: "Humidity",
    unit: "%",
    colour: "#2DB500",
    bounds: METRIC_BOUNDS.ambient_humidity_pct ?? null,
  },
  {
    key: "moisture_raw",
    label: "Raw ADC",
    unit: "",
    colour: "#FF8A00",
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

export type MetricStatus = "ok" | "warn" | "elevated" | "error" | "unknown";

/**
 * Score a value against profile bounds and scoring_semantic.
 * restraint: only values above the band are a concern (excess vigour),
 * coloured as elevated (orange), not as a deficiency to fix.
 */
export function scoreMetricValue(
  value: number | null | undefined,
  bounds: MetricBounds | null,
  scoringSemantic: ScoringSemantic,
): MetricStatus {
  if (value === null || value === undefined) return "unknown";
  if (!bounds) return "unknown";

  if (scoringSemantic === "restraint") {
    if (value > bounds.max) return "elevated";
    return "ok";
  }

  if (value < bounds.min || value > bounds.max) return "warn";
  return "ok";
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
