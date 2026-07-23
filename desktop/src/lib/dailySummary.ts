import type { SensorReading } from "./api";
import {
  AMBIENT_TEMP_DAY_MAX_C,
  AMBIENT_TEMP_DAY_MIN_C,
  AMBIENT_TEMP_NIGHT_MAX_C,
  AMBIENT_TEMP_NIGHT_MIN_C,
  DEFAULT_CROP_TYPE,
  DEFAULT_LIFECYCLE_STAGE,
  getScoringSemantic,
  npkReferenceLabel,
  type ScoringSemantic,
} from "./growingConstants";
import {
  DEFAULT_DEVICE_TIMEZONE,
  isDayPeriod,
  localDayKey as deviceLocalDayKey,
} from "./dayNight";
import {
  getAmbientBoundsForProfile,
  getMetricBoundsForProfile,
  METRICS,
  type MetricKey,
  type MetricBounds,
} from "./metrics";
import { isFlaggedAgainstBand } from "./stats";

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
  /** Distinct from outOfBounds under restraint: elevated, not broken. */
  elevated?: boolean;
  bounds: MetricBounds | null;
  /** Human-readable reference shown in the Reports table. */
  referenceLabel: string;
}

export interface DailySummary {
  /** YYYY-MM-DD in device-local calendar */
  day: string;
  metrics: MetricDaySummary[];
  hasFlags: boolean;
}

function formatBoundsLabel(
  bounds: MetricBounds,
  unit: string,
  scoringSemantic: ScoringSemantic,
): string {
  const suffix = unit ? ` ${unit}` : "";
  if (scoringSemantic === "restraint") {
    return `watch above ${bounds.max}${suffix}`;
  }
  return `${bounds.min}-${bounds.max}${suffix}`;
}

/** Day period is [6, 18) in the device timezone. */
export function isAmbientDayPeriod(
  recordedAt: string,
  timeZone: string = DEFAULT_DEVICE_TIMEZONE,
): boolean {
  return isDayPeriod(recordedAt, timeZone);
}

export function ambientBoundsFor(
  recordedAt: string,
  timeZone: string = DEFAULT_DEVICE_TIMEZONE,
): MetricBounds {
  return isAmbientDayPeriod(recordedAt, timeZone)
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
  scoringSemantic: ScoringSemantic,
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
      elevated: false,
      bounds,
      referenceLabel: bounds
        ? formatBoundsLabel(bounds, unit, scoringSemantic)
        : "n/a",
    };
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const flagged =
    flaggable &&
    bounds !== null &&
    (isFlaggedAgainstBand(min, bounds, scoringSemantic) ||
      isFlaggedAgainstBand(max, bounds, scoringSemantic) ||
      isFlaggedAgainstBand(mean, bounds, scoringSemantic));
  const elevated = flagged && scoringSemantic === "restraint";
  return {
    key,
    label,
    unit,
    count: values.length,
    mean,
    min,
    max,
    flaggable,
    outOfBounds: flagged && !elevated,
    elevated,
    bounds,
    referenceLabel: bounds
      ? formatBoundsLabel(bounds, unit, scoringSemantic)
      : "n/a",
  };
}

/** Flag ambient per reading against day or night bounds from device timezone. */
function summariseAmbientTemp(
  dayReadings: SensorReading[],
  cropType: string,
  lifecycleStage: string,
  scoringSemantic: ScoringSemantic,
  timeZone: string,
): MetricDaySummary {
  const samples = dayReadings
    .filter(
      (r): r is SensorReading & { ambient_temp_c: number } =>
        r.ambient_temp_c !== null && r.ambient_temp_c !== undefined,
    )
    .map((r) => ({ value: r.ambient_temp_c, at: r.recorded_at }));

  const sampleBounds = samples.map((s) =>
    getAmbientBoundsForProfile(s.at, cropType, lifecycleStage, timeZone),
  );
  const flaggable = sampleBounds.some((b) => b !== null);

  if (samples.length === 0) {
    return {
      key: "ambient_temp_c",
      label: "Ambient temp",
      unit: "°C",
      count: 0,
      mean: null,
      min: null,
      max: null,
      flaggable,
      outOfBounds: false,
      elevated: false,
      bounds: null,
      referenceLabel: flaggable ? AMBIENT_REFERENCE_LABEL : "n/a (no band)",
    };
  }

  const values = samples.map((s) => s.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const flagged =
    flaggable &&
    samples.some((s, i) => {
      const bounds = sampleBounds[i];
      return (
        bounds !== null &&
        isFlaggedAgainstBand(s.value, bounds, scoringSemantic)
      );
    });
  const elevated = flagged && scoringSemantic === "restraint";

  return {
    key: "ambient_temp_c",
    label: "Ambient temp",
    unit: "°C",
    count: samples.length,
    mean,
    min,
    max,
    flaggable,
    outOfBounds: flagged && !elevated,
    elevated,
    bounds: null,
    referenceLabel: flaggable ? AMBIENT_REFERENCE_LABEL : "n/a (no band)",
  };
}

function summariseNpkEstimate(
  values: number[],
  key: string,
  label: string,
  referenceLabel: string,
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
      elevated: false,
      bounds: null,
      referenceLabel,
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
    elevated: false,
    bounds: null,
    referenceLabel,
  };
}

export interface BuildDailySummariesOptions {
  cropType?: string | null;
  lifecycleStage?: string | null;
  /** Device IANA timezone — required for correct day bucketing. */
  timeZone?: string | null;
}

/** Build per-device-local-calendar-day summaries, most recent day first. */
export function buildDailySummaries(
  readings: SensorReading[],
  options: BuildDailySummariesOptions = {},
): DailySummary[] {
  const cropType = options.cropType ?? DEFAULT_CROP_TYPE;
  const lifecycleStage = options.lifecycleStage ?? DEFAULT_LIFECYCLE_STAGE;
  const timeZone = options.timeZone ?? DEFAULT_DEVICE_TIMEZONE;
  const scoringSemantic: ScoringSemantic = getScoringSemantic(
    cropType,
    lifecycleStage,
  );

  const byDay = new Map<string, SensorReading[]>();
  for (const reading of readings) {
    const key = deviceLocalDayKey(reading.recorded_at, timeZone);
    const list = byDay.get(key);
    if (list) list.push(reading);
    else byDay.set(key, [reading]);
  }

  const days = [...byDay.keys()].sort((a, b) => b.localeCompare(a));

  return days.map((day) => {
    const dayReadings = byDay.get(day) ?? [];
    const metrics: MetricDaySummary[] = [];

    for (const metric of METRICS) {
      if (metric.derived) continue;
      if (metric.key === "ambient_temp_c") {
        metrics.push(
          summariseAmbientTemp(
            dayReadings,
            cropType,
            lifecycleStage,
            scoringSemantic,
            timeZone,
          ),
        );
        continue;
      }
      const bounds = getMetricBoundsForProfile(
        metric.key,
        cropType,
        lifecycleStage,
      );
      const values = dayReadings
        .map((r) => r[metric.key as keyof SensorReading])
        .filter((v): v is number => typeof v === "number");
      metrics.push(
        summariseFlatMetric(
          values,
          metric.key,
          metric.label,
          metric.unit,
          bounds,
          scoringSemantic,
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
        npkReferenceLabel("n", cropType, lifecycleStage),
      ),
      summariseNpkEstimate(
        dayReadings
          .map((r) => r.npk_p_est)
          .filter((v): v is number => v !== null && v !== undefined),
        "npk_p_est",
        "P est.",
        npkReferenceLabel("p", cropType, lifecycleStage),
      ),
      summariseNpkEstimate(
        dayReadings
          .map((r) => r.npk_k_est)
          .filter((v): v is number => v !== null && v !== undefined),
        "npk_k_est",
        "K est.",
        npkReferenceLabel("k", cropType, lifecycleStage),
      ),
    );

    return {
      day,
      metrics,
      hasFlags: metrics.some(
        (m) => m.flaggable && (m.outOfBounds || m.elevated),
      ),
    };
  });
}
