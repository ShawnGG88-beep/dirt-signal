/** Crop-agnostic spray/treatment window. Python mirror: spray_window.py */

import {
  SPRAY_HORIZON_HOURS,
  SPRAY_PRECIP_PROB_MAX,
  SPRAY_WIND_DRIFT_MAX_KMH,
  SPRAY_WIND_DRIFT_PROVENANCE,
} from "./constants";
import { num, parseAt } from "./utils";

export interface SprayWindowResult {
  found: boolean;
  window_start: string | null;
  window_end: string | null;
  message: string;
  provenance: string;
}

export function findSprayWindow(
  forecastRows: Array<Record<string, unknown>>,
  options: { now?: Date; horizonHours?: number } = {},
): SprayWindowResult {
  const now = options.now ?? new Date();
  const horizonHours = options.horizonHours ?? SPRAY_HORIZON_HOURS;
  const end = now.getTime() + horizonHours * 3600_000;
  const hours: Array<{ at: Date; ok: boolean }> = [];

  for (const row of forecastRows) {
    const ft = parseAt(row.forecast_time);
    if (ft == null || ft.getTime() < now.getTime() || ft.getTime() > end)
      continue;
    const precipProb = num(row.precipitation_probability) ?? 100;
    const wind = num(row.wind_speed_10m) ?? 999;
    hours.push({
      at: ft,
      ok: precipProb < SPRAY_PRECIP_PROB_MAX && wind < SPRAY_WIND_DRIFT_MAX_KMH,
    });
  }

  hours.sort((a, b) => a.at.getTime() - b.at.getTime());
  if (hours.length === 0) {
    return {
      found: false,
      window_start: null,
      window_end: null,
      message:
        "No suitable spray window in the next 48 hours (no forecast data).",
      provenance: SPRAY_WIND_DRIFT_PROVENANCE,
    };
  }

  let bestStart: Date | null = null;
  let bestEnd: Date | null = null;
  let bestLen = 0;
  let curStart: Date | null = null;
  let curEnd: Date | null = null;
  let curLen = 0;

  for (const { at, ok } of hours) {
    if (ok) {
      if (curStart == null) curStart = at;
      curEnd = at;
      curLen += 1;
    } else {
      if (curLen > bestLen && curStart && curEnd) {
        bestStart = curStart;
        bestEnd = curEnd;
        bestLen = curLen;
      }
      curStart = curEnd = null;
      curLen = 0;
    }
  }
  if (curLen > bestLen && curStart && curEnd) {
    bestStart = curStart;
    bestEnd = curEnd;
  }

  if (bestStart == null || bestEnd == null || bestLen === 0) {
    return {
      found: false,
      window_start: null,
      window_end: null,
      message: "No suitable spray window in the next 48 hours.",
      provenance: SPRAY_WIND_DRIFT_PROVENANCE,
    };
  }

  const windowEnd = new Date(bestEnd.getTime() + 3600_000);
  return {
    found: true,
    window_start: bestStart.toISOString(),
    window_end: windowEnd.toISOString(),
    message:
      `Next suitable spray window: ${bestStart.toISOString()} to ${windowEnd.toISOString()} ` +
      `(precipitation probability <${SPRAY_PRECIP_PROB_MAX.toFixed(0)}%, ` +
      `wind <${SPRAY_WIND_DRIFT_MAX_KMH.toFixed(0)} km/h).`,
    provenance: SPRAY_WIND_DRIFT_PROVENANCE,
  };
}
