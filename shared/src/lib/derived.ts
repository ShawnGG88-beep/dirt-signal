/**
 * Derived metrics: VPD, dew point, dry-down, high-humidity hours, GDD.
 *
 * Pure functions, no I/O. Backend mirrors in derived.py; shared fixtures assert
 * identical results. Where a value is a proxy, UI must surface the matching
 * SAMPLING_LIMITATIONS note — never invent threshold bands without a source.
 */

import { localDayKey, localHour } from "./dayNight";

/**
 * Provisional: mock traces fit far more cleanly than a capacitive probe in real
 * soil under a diurnal cycle. Re-tune against real sensor traces before treating
 * this as a hard quality gate.
 */
export const MIN_R_SQUARED = 0.7;
export const MIN_SAMPLES = 4;

export const HIGH_HUMIDITY_THRESHOLD_PCT = 85;
/** Days below this coverage are incomplete and excluded from cumulative GDD. */
export const MIN_COVERAGE_HOURS = 18;

export const DEFAULT_GDD_BASE_C = 10;

export interface DryDownProjection {
  hours_to_lower_bound: number;
  slope_pct_per_hour: number;
  intercept_pct: number;
  r_squared: number;
  moisture_lower_bound: number;
  segment_start: string;
  sample_count: number;
}

export interface DryDownResult {
  projection: DryDownProjection | null;
  suppressed_reason: string | null;
}

function parseAt(raw: string | Date | null | undefined): Date | null {
  if (raw == null) return null;
  const d = typeof raw === "string" ? new Date(raw) : raw;
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Air VPD (kPa). Null if either input is null — never interpolate.
 *
 * Assumes leaf temperature equals air temperature — weakest under artificial
 * lighting and still air.
 */
export function vapourPressureDeficitKpa(
  ambientTempC: number | null | undefined,
  ambientHumidityPct: number | null | undefined,
): number | null {
  if (
    ambientTempC === null ||
    ambientTempC === undefined ||
    ambientHumidityPct === null ||
    ambientHumidityPct === undefined
  ) {
    return null;
  }
  const t = ambientTempC;
  const rh = ambientHumidityPct;
  const es = 0.6108 * Math.exp((17.27 * t) / (t + 237.3));
  return es * (1 - rh / 100);
}

/** Dew point (°C). Null if either input is null — never interpolate. */
export function dewPointC(
  ambientTempC: number | null | undefined,
  ambientHumidityPct: number | null | undefined,
): number | null {
  if (
    ambientTempC === null ||
    ambientTempC === undefined ||
    ambientHumidityPct === null ||
    ambientHumidityPct === undefined
  ) {
    return null;
  }
  const t = ambientTempC;
  const rh = ambientHumidityPct;
  if (rh <= 0) return null;
  const a = Math.log(rh / 100) + (17.27 * t) / (t + 237.3);
  const denom = 17.27 - a;
  if (Math.abs(denom) < 1e-12) return null;
  return (237.3 * a) / denom;
}

export interface DryDownReading {
  recorded_at: string;
  moisture_pct?: number | null;
}

export interface DryDownEvent {
  event_type: string;
  occurred_at: string;
}

export function projectDrydown(
  readings: DryDownReading[],
  events: DryDownEvent[],
  options: {
    moistureLowerBound: number | null;
    now?: Date | string | null;
  },
): DryDownResult {
  const { moistureLowerBound } = options;
  if (moistureLowerBound === null) {
    return { projection: null, suppressed_reason: "no_moisture_lower_bound" };
  }

  const now = parseAt(options.now ?? new Date()) ?? new Date();

  const irrigations = events
    .filter((e) => e.event_type === "irrigation" && parseAt(e.occurred_at))
    .sort(
      (a, b) =>
        (parseAt(a.occurred_at)?.getTime() ?? 0) -
        (parseAt(b.occurred_at)?.getTime() ?? 0),
    );
  if (irrigations.length === 0) {
    return { projection: null, suppressed_reason: "missing_irrigation_event" };
  }

  const lastIrrigationAt = parseAt(
    irrigations[irrigations.length - 1].occurred_at,
  )!;

  const maintenance = events.some((e) => {
    if (e.event_type !== "sensor_maintenance") return false;
    const at = parseAt(e.occurred_at);
    return at != null && at.getTime() >= lastIrrigationAt.getTime();
  });
  if (maintenance) {
    return {
      projection: null,
      suppressed_reason: "sensor_maintenance_in_segment",
    };
  }

  const points: { hours: number; moisture: number }[] = [];
  for (const reading of readings) {
    const at = parseAt(reading.recorded_at);
    const moisture = reading.moisture_pct;
    if (at == null || moisture == null) continue;
    if (at.getTime() < lastIrrigationAt.getTime()) continue;
    const hours =
      (at.getTime() - lastIrrigationAt.getTime()) / (3600 * 1000);
    points.push({ hours, moisture });
  }

  if (points.length < MIN_SAMPLES) {
    return { projection: null, suppressed_reason: "insufficient_samples" };
  }

  const n = points.length;
  const meanX = points.reduce((s, p) => s + p.hours, 0) / n;
  const meanY = points.reduce((s, p) => s + p.moisture, 0) / n;
  const ssXx = points.reduce((s, p) => s + (p.hours - meanX) ** 2, 0);
  const ssYy = points.reduce((s, p) => s + (p.moisture - meanY) ** 2, 0);
  const ssXy = points.reduce(
    (s, p) => s + (p.hours - meanX) * (p.moisture - meanY),
    0,
  );

  if (ssXx <= 0) {
    return { projection: null, suppressed_reason: "poor_fit" };
  }

  const slope = ssXy / ssXx;
  const intercept = meanY - slope * meanX;

  if (slope >= 0) {
    return { projection: null, suppressed_reason: "non_negative_slope" };
  }

  const ssRes = points.reduce(
    (s, p) => s + (p.moisture - (intercept + slope * p.hours)) ** 2,
    0,
  );
  const rSquared = ssYy > 0 ? 1 - ssRes / ssYy : 0;
  if (rSquared < MIN_R_SQUARED) {
    return { projection: null, suppressed_reason: "poor_fit" };
  }

  const hoursFromIrrigation = (moistureLowerBound - intercept) / slope;
  const hoursElapsed =
    (now.getTime() - lastIrrigationAt.getTime()) / (3600 * 1000);
  const hoursToBound = hoursFromIrrigation - hoursElapsed;

  return {
    projection: {
      hours_to_lower_bound: hoursToBound,
      slope_pct_per_hour: slope,
      intercept_pct: intercept,
      r_squared: rSquared,
      moisture_lower_bound: moistureLowerBound,
      segment_start: lastIrrigationAt.toISOString(),
      sample_count: n,
    },
    suppressed_reason: null,
  };
}

export interface HighHumidityDay {
  day: string;
  high_humidity_hours: number;
  coverage_hours: number;
  incomplete: boolean;
}

export function highHumidityHoursByDay(
  readings: { recorded_at: string; ambient_humidity_pct?: number | null }[],
  timeZone: string,
  options?: {
    thresholdPct?: number;
    minCoverageHours?: number;
  },
): HighHumidityDay[] {
  const threshold = options?.thresholdPct ?? HIGH_HUMIDITY_THRESHOLD_PCT;
  const minCoverage = options?.minCoverageHours ?? MIN_COVERAGE_HOURS;
  const hoursByDay = new Map<string, Set<number>>();
  const highByDay = new Map<string, Set<number>>();

  for (const reading of readings) {
    const at = parseAt(reading.recorded_at);
    if (!at) continue;
    const day = localDayKey(at, timeZone);
    const hour = localHour(at, timeZone);
    if (!hoursByDay.has(day)) hoursByDay.set(day, new Set());
    hoursByDay.get(day)!.add(hour);
    const hum = reading.ambient_humidity_pct;
    if (hum != null && hum >= threshold) {
      if (!highByDay.has(day)) highByDay.set(day, new Set());
      highByDay.get(day)!.add(hour);
    }
  }

  return [...hoursByDay.keys()]
    .sort()
    .map((day) => {
      const coverage = hoursByDay.get(day)!.size;
      return {
        day,
        high_humidity_hours: highByDay.get(day)?.size ?? 0,
        coverage_hours: coverage,
        incomplete: coverage < minCoverage,
      };
    });
}

export function gddDay(
  tMaxC: number | null | undefined,
  tMinC: number | null | undefined,
  baseC: number = DEFAULT_GDD_BASE_C,
): number | null {
  if (tMaxC == null || tMinC == null) return null;
  return Math.max(0, (tMaxC + tMinC) / 2 - baseC);
}

export interface CumulativeGdd {
  cumulative_gdd: number | null;
  days_elapsed: number | null;
  days_excluded: number;
  unavailable_reason: "no_season_start" | null;
}

export function cumulativeGdd(
  daily: { day: string; gdd_day: number | null; incomplete: boolean }[],
  seasonStartDate: string | null | undefined,
): CumulativeGdd {
  if (!seasonStartDate) {
    return {
      cumulative_gdd: null,
      days_elapsed: null,
      days_excluded: 0,
      unavailable_reason: "no_season_start",
    };
  }
  let total = 0;
  let elapsed = 0;
  let excluded = 0;
  for (const row of daily) {
    if (row.day < seasonStartDate) continue;
    elapsed += 1;
    if (row.incomplete || row.gdd_day == null) {
      excluded += 1;
      continue;
    }
    total += row.gdd_day;
  }
  return {
    cumulative_gdd: total,
    days_elapsed: elapsed,
    days_excluded: excluded,
    unavailable_reason: null,
  };
}
