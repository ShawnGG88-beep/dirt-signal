import type { SensorReading } from "./api";
import {
  AMBIENT_DAY_END_HOUR,
  AMBIENT_DAY_START_HOUR,
  AMBIENT_TEMP_DAY_MAX_C,
  AMBIENT_TEMP_DAY_MIN_C,
  AMBIENT_TEMP_NIGHT_MAX_C,
  AMBIENT_TEMP_NIGHT_MIN_C,
  K_TARGET,
  N_TARGET,
  P_TARGET,
} from "./growingConstants";
import {
  METRICS,
  type MetricKey,
  type MetricBounds,
} from "./metrics";
import { isOutOfBounds } from "./stats";

export interface MetricDaySummary {
  key: string;
  label: string;
  unit: string;
  count: number;
  mean: number | null;
  min: number | null;
  max: number | null;
  /** True when this row participates in pass/fail flagging. */
  flaggable: boolean;
  outOfBounds: boolean;
  bounds: MetricBounds | null;
  /** Human-readable reference shown in the Reports table. */
  referenceLabel: string;
}

export interface DailySummary {
  /** YYYY-MM-DD in local calendar */
  day: string;
  metrics: MetricDaySummary[];
  hasFlags: boolean;
}

function localDayKey(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatBoundsLabel(bounds: MetricBounds, unit: string): string {
  const suffix = unit ? ` ${unit}` : "";
  return `${bounds.min}-${bounds.max}${suffix}`;
}

/** Day period is [AMBIENT_DAY_START_HOUR, AMBIENT_DAY_END_HOUR) local time. */
export function isAmbientDayPeriod(recordedAt: string): boolean {
  const hour = new Date(recordedAt).getHours();
  return hour >= AMBIENT_DAY_START_HOUR && hour < AMBIENT_DAY_END_HOUR;
}

export function ambientBoundsFor(recordedAt: string): MetricBounds {
  return isAmbientDayPeriod(recordedAt)
    ? { min: AMBIENT_TEMP_DAY_MIN_C, max: AMBIENT_TEMP_DAY_MAX_C }
    : { min: AMBIENT_TEMP_NIGHT_MIN_C, max: AMBIENT_TEMP_NIGHT_MAX_C };
}

const AMBIENT_REFERENCE_LABEL = `day ${AMBIENT_TEMP_DAY_MIN_C}-${AMBIENT_TEMP_DAY_MAX_C} / night ${AMBIENT_TEMP_NIGHT_MIN_C}-${AMBIENT_TEMP_NIGHT_MAX_C} °C`;

function summariseFlatMetric(
  values: number[],
  key: MetricKey,
  label: string,
  unit: string,
  bounds: MetricBounds | null,
): MetricDaySummary {
  const flaggable = bounds !== null;
  if (values.length === 0) {
    return {
      key,
      label,
      unit,
      count: 0,
      mean: null,
      min: null,
      max: null,
      flaggable,
      outOfBounds: false,
      bounds,
      referenceLabel: bounds
        ? formatBoundsLabel(bounds, unit)
        : "n/a",
    };
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const outOfBounds =
    flaggable &&
    bounds !== null &&
    (isOutOfBounds(min, bounds) ||
      isOutOfBounds(max, bounds) ||
      isOutOfBounds(mean, bounds));
  return {
    key,
    label,
    unit,
    count: values.length,
    mean,
    min,
    max,
    flaggable,
    outOfBounds,
    bounds,
    referenceLabel: bounds ? formatBoundsLabel(bounds, unit) : "n/a",
  };
}

/** Flag ambient per reading against day or night bounds from timestamp. */
function summariseAmbientTemp(dayReadings: SensorReading[]): MetricDaySummary {
  const samples = dayReadings
    .filter(
      (r): r is SensorReading & { ambient_temp_c: number } =>
        r.ambient_temp_c !== null && r.ambient_temp_c !== undefined,
    )
    .map((r) => ({ value: r.ambient_temp_c, at: r.recorded_at }));

  if (samples.length === 0) {
    return {
      key: "ambient_temp_c",
      label: "Ambient temp",
      unit: "°C",
      count: 0,
      mean: null,
      min: null,
      max: null,
      flaggable: true,
      outOfBounds: false,
      bounds: null,
      referenceLabel: AMBIENT_REFERENCE_LABEL,
    };
  }

  const values = samples.map((s) => s.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const outOfBounds = samples.some((s) =>
    isOutOfBounds(s.value, ambientBoundsFor(s.at)),
  );

  return {
    key: "ambient_temp_c",
    label: "Ambient temp",
    unit: "°C",
    count: samples.length,
    mean,
    min,
    max,
    flaggable: true,
    outOfBounds,
    bounds: null,
    referenceLabel: AMBIENT_REFERENCE_LABEL,
  };
}

function summariseNpkEstimate(
  values: number[],
  key: string,
  label: string,
  target: string,
): MetricDaySummary {
  if (values.length === 0) {
    return {
      key,
      label,
      unit: "",
      count: 0,
      mean: null,
      min: null,
      max: null,
      flaggable: false,
      outOfBounds: false,
      bounds: null,
      referenceLabel: `target ${target} (provisional)`,
    };
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  return {
    key,
    label,
    unit: "",
    count: values.length,
    mean,
    min,
    max,
    flaggable: false,
    outOfBounds: false,
    bounds: null,
    referenceLabel: `target ${target} (provisional)`,
  };
}

/** Build per-calendar-day summaries, most recent day first. */
export function buildDailySummaries(readings: SensorReading[]): DailySummary[] {
  const byDay = new Map<string, SensorReading[]>();
  for (const reading of readings) {
    const key = localDayKey(reading.recorded_at);
    const list = byDay.get(key);
    if (list) list.push(reading);
    else byDay.set(key, [reading]);
  }

  const days = [...byDay.keys()].sort((a, b) => b.localeCompare(a));

  return days.map((day) => {
    const dayReadings = byDay.get(day) ?? [];
    const metrics: MetricDaySummary[] = [];

    for (const metric of METRICS) {
      if (metric.key === "ambient_temp_c") {
        metrics.push(summariseAmbientTemp(dayReadings));
        continue;
      }
      const values = dayReadings
        .map((r) => r[metric.key])
        .filter((v): v is number => v !== null && v !== undefined);
      metrics.push(
        summariseFlatMetric(
          values,
          metric.key,
          metric.label,
          metric.unit,
          metric.bounds,
        ),
      );
    }

    metrics.push(
      summariseNpkEstimate(
        dayReadings
          .map((r) => r.npk_n_est)
          .filter((v): v is number => v !== null && v !== undefined),
        "npk_n_est",
        "N est.",
        N_TARGET,
      ),
      summariseNpkEstimate(
        dayReadings
          .map((r) => r.npk_p_est)
          .filter((v): v is number => v !== null && v !== undefined),
        "npk_p_est",
        "P est.",
        P_TARGET,
      ),
      summariseNpkEstimate(
        dayReadings
          .map((r) => r.npk_k_est)
          .filter((v): v is number => v !== null && v !== undefined),
        "npk_k_est",
        "K est.",
        K_TARGET,
      ),
    );

    return {
      day,
      metrics,
      hasFlags: metrics.some((m) => m.flaggable && m.outOfBounds),
    };
  });
}
