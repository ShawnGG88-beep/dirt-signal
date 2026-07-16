import type { SensorReading } from "./api";
import {
  HUMIDITY_MAX_PCT,
  HUMIDITY_MIN_PCT,
  MOISTURE_MAX_PCT,
  MOISTURE_MIN_PCT,
  PH_MAX,
  PH_MIN,
  SOIL_TEMP_IDEAL_MAX_C,
  SOIL_TEMP_IDEAL_MIN_C,
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
   * Flat min/max for report flagging.
   * Null when the metric has no flat horticultural bounds (ambient uses
   * day/night separately; raw ADC is not crop-bounded).
   */
  bounds: MetricBounds | null;
}

/**
 * Report flagging ranges from ml-backend/constants.py (via growingConstants).
 * Ambient temperature is handled in dailySummary with day/night constants.
 */
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
    // Day/night bounds applied per reading timestamp in dailySummary
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
    // Not a crop reference — display only in reports
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
  if (value === null || value === undefined) return "—";
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
