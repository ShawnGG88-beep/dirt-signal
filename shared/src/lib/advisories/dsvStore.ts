/**
 * DSV commit logic (pure, no I/O). Python mirror: dsv_store.py commit path.
 */

import { localDayKey } from "../dayNight";
import {
  DEFAULT_DSV_THRESHOLDS,
  type DiseaseKey,
} from "./constants";
import {
  buildDailyClimateSeries,
  daysToCommit,
  type DailyClimate,
} from "./climateMerge";
import { applyDailyDsv, type DsvState } from "./dsv";
import { scoreEarlyBlightDay } from "./tomatoEarlyBlight";
import { scoreLateBlightDay } from "./tomatoLateBlight";

export interface DeviceDsvRow {
  device_id: string;
  disease_key: DiseaseKey;
  accumulated_dsv: number;
  threshold: number;
  last_computed_day: string | null;
  spray_recommended: boolean;
  last_reset_at: string | null;
  updated_at?: string;
}

export function thresholdFor(
  diseaseKey: DiseaseKey,
  params?: Record<string, unknown> | null,
): number {
  if (params && params.dsv_threshold != null) {
    const v = Number(params.dsv_threshold);
    if (Number.isFinite(v)) return v;
  }
  return DEFAULT_DSV_THRESHOLDS[diseaseKey] ?? 15;
}

export function defaultDsvRow(
  deviceId: string,
  diseaseKey: DiseaseKey,
): DeviceDsvRow {
  return {
    device_id: deviceId,
    disease_key: diseaseKey,
    accumulated_dsv: 0,
    threshold: DEFAULT_DSV_THRESHOLDS[diseaseKey] ?? 15,
    last_computed_day: null,
    spray_recommended: false,
    last_reset_at: null,
  };
}

export function commitClosedDaysInMemory(
  row: DeviceDsvRow,
  dailySeries: DailyClimate[],
  options: {
    now: Date;
    tzName: string;
    params?: Record<string, unknown> | null;
  },
): { row: DeviceDsvRow; state: DsvState } {
  const { now, tzName, params } = options;
  const threshold = thresholdFor(row.disease_key, params);
  let accumulated = row.accumulated_dsv ?? 0;
  let lastDayStr = row.last_computed_day
    ? String(row.last_computed_day).slice(0, 10)
    : null;
  let daysSinceReset = 0;
  if (row.last_reset_at) {
    const resetDay = String(row.last_reset_at).slice(0, 10);
    const resetMs = Date.parse(`${resetDay}T00:00:00Z`);
    const nowMs = Date.parse(now.toISOString().slice(0, 10) + "T00:00:00Z");
    daysSinceReset = Math.max(
      0,
      Math.round((nowMs - resetMs) / 86_400_000),
    );
  }

  const today = localDayKey(now, tzName);
  const commitDays = daysToCommit(lastDayStr, today);
  const byDay = new Map(dailySeries.map((d) => [d.day, d]));
  const scorer =
    row.disease_key === "early_blight"
      ? scoreEarlyBlightDay
      : scoreLateBlightDay;

  let sprayRecommended = Boolean(row.spray_recommended);
  let crossedToday = false;
  for (const day of commitDays) {
    const daily = byDay.get(day);
    if (daily == null || daily.source !== "observed") continue;
    const score = scorer(daily);
    const state = applyDailyDsv({
      accumulated,
      threshold,
      dailyScore: score,
      daysSinceReset,
    });
    accumulated = state.accumulated;
    daysSinceReset = state.days_since_reset;
    if (state.spray_recommended) {
      sprayRecommended = true;
      crossedToday = true;
      row.last_reset_at = now.toISOString();
    }
    lastDayStr = day;
  }

  const updated: DeviceDsvRow = {
    ...row,
    accumulated_dsv: accumulated,
    threshold,
    last_computed_day: lastDayStr,
    spray_recommended: sprayRecommended,
    updated_at: now.toISOString(),
  };

  return {
    row: updated,
    state: {
      accumulated,
      threshold,
      days_since_reset: daysSinceReset,
      spray_recommended: sprayRecommended,
      crossed_today: crossedToday,
      last_computed_day: lastDayStr,
    },
  };
}

export { buildDailyClimateSeries, daysToCommit };
