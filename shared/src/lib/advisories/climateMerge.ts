/**
 * Observed vs forecast climate merge. Python mirror: climate_merge.py
 */

import { localDayKey, localHour } from "../dayNight";
import { MIN_OBSERVED_COVERAGE_HOURS } from "./constants";
import { num, parseAt } from "./utils";

export type ClimateSource = "observed" | "forecast" | "unavailable";

export interface DailyClimate {
  day: string;
  t_max_c: number | null;
  t_min_c: number | null;
  rh_mean_pct: number | null;
  wet_hours: number;
  precip_sum_mm: number;
  source: ClimateSource;
  coverage_hours: number;
}

export function lastObservedDay(
  readings: Array<Record<string, unknown>>,
  tzName: string,
): string | null {
  const hoursByDay = new Map<string, Set<number>>();
  for (const row of readings) {
    const at = parseAt(row.recorded_at);
    if (at == null) continue;
    if (row.ambient_temp_c == null && row.ambient_humidity_pct == null) continue;
    const day = localDayKey(at, tzName);
    const hour = localHour(at, tzName);
    if (!hoursByDay.has(day)) hoursByDay.set(day, new Set());
    hoursByDay.get(day)!.add(hour);
  }
  const eligible = [...hoursByDay.entries()]
    .filter(([, hours]) => hours.size >= MIN_OBSERVED_COVERAGE_HOURS)
    .map(([day]) => day);
  return eligible.length === 0 ? null : eligible.sort()[eligible.length - 1]!;
}

export function buildDailyClimateSeries(
  readings: Array<Record<string, unknown>>,
  forecastRows: Array<Record<string, unknown>>,
  tzName: string,
  options: { now: Date; rhWetThreshold?: number } = { now: new Date() },
): DailyClimate[] {
  const { now, rhWetThreshold = 88.0 } = options;
  const today = localDayKey(now, tzName);
  const lastObs = lastObservedDay(readings, tzName);

  const observedByDay = new Map<string, Array<Record<string, unknown>>>();
  for (const row of readings) {
    const recorded = parseAt(row.recorded_at);
    if (recorded == null) continue;
    const day = localDayKey(recorded, tzName);
    if (!observedByDay.has(day)) observedByDay.set(day, []);
    observedByDay.get(day)!.push(row);
  }

  const forecastByDay = new Map<string, Array<Record<string, unknown>>>();
  for (const row of forecastRows) {
    const ft = parseAt(row.forecast_time);
    if (ft == null) continue;
    const day = localDayKey(ft, tzName);
    if (!forecastByDay.has(day)) forecastByDay.set(day, []);
    forecastByDay.get(day)!.push(row);
  }

  const allDays = [
    ...new Set([...observedByDay.keys(), ...forecastByDay.keys()]),
  ].sort();
  if (allDays.length === 0) return [];

  const series: DailyClimate[] = [];
  for (const day of allDays) {
    let useObserved = lastObs != null && day <= lastObs;
    let useForecast = lastObs != null && day > lastObs;
    if (lastObs == null && day >= today) {
      useForecast = true;
      useObserved = false;
    }
    if (lastObs == null && day < today) {
      useObserved = true;
      useForecast = false;
    }

    if (useObserved) {
      const rows = observedByDay.get(day) ?? [];
      const temps = rows
        .map((r) => num(r.ambient_temp_c))
        .filter((t): t is number => t != null);
      const rhsClean = rows
        .map((r) => num(r.ambient_humidity_pct))
        .filter((r): r is number => r != null);
      const hours = rows
        .map((r) => parseAt(r.recorded_at))
        .filter((h): h is Date => h != null);
      const coverage = new Set(
        hours.map((h) => localDayKey(h, tzName) + String(h.getUTCHours())),
      ).size;
      const wet = rhsClean.filter((r) => r >= rhWetThreshold).length;
      if (coverage < MIN_OBSERVED_COVERAGE_HOURS) {
        series.push({
          day,
          t_max_c: null,
          t_min_c: null,
          rh_mean_pct: null,
          wet_hours: 0,
          precip_sum_mm: 0,
          source: "unavailable",
          coverage_hours: coverage,
        });
        continue;
      }
      series.push({
        day,
        t_max_c: temps.length ? Math.max(...temps) : null,
        t_min_c: temps.length ? Math.min(...temps) : null,
        rh_mean_pct: rhsClean.length
          ? rhsClean.reduce((a, b) => a + b, 0) / rhsClean.length
          : null,
        wet_hours: wet,
        precip_sum_mm: 0,
        source: "observed",
        coverage_hours: coverage,
      });
    } else if (useForecast) {
      const rows = forecastByDay.get(day) ?? [];
      const temps = rows
        .map((r) => num(r.temperature_2m))
        .filter((t): t is number => t != null);
      const rhsClean = rows
        .map((r) => num(r.relative_humidity_2m))
        .filter((r): r is number => r != null);
      const precips = rows.map((r) => num(r.precipitation) ?? 0);
      const wet = rows.filter(
        (r) => (num(r.relative_humidity_2m) ?? 0) >= rhWetThreshold,
      ).length;
      series.push({
        day,
        t_max_c: temps.length ? Math.max(...temps) : null,
        t_min_c: temps.length ? Math.min(...temps) : null,
        rh_mean_pct: rhsClean.length
          ? rhsClean.reduce((a, b) => a + b, 0) / rhsClean.length
          : null,
        wet_hours: wet,
        precip_sum_mm: precips.reduce((a, b) => a + b, 0),
        source: "forecast",
        coverage_hours: rows.length,
      });
    } else {
      series.push({
        day,
        t_max_c: null,
        t_min_c: null,
        rh_mean_pct: null,
        wet_hours: 0,
        precip_sum_mm: 0,
        source: "unavailable",
        coverage_hours: 0,
      });
    }
  }
  return series;
}

export function daysToCommit(
  lastComputedDay: string | null,
  todayLocal: string,
): string[] {
  if (todayLocal <= "1970-01-01") return [];
  const start = lastComputedDay
    ? addDays(lastComputedDay, 1)
    : "1970-01-01";
  const end = addDays(todayLocal, -1);
  if (start > end) return [];
  const days: string[] = [];
  let cur = start;
  while (cur <= end) {
    days.push(cur);
    cur = addDays(cur, 1);
  }
  return days;
}

function addDays(isoDay: string, delta: number): string {
  const [y, m, d] = isoDay.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return dt.toISOString().slice(0, 10);
}
