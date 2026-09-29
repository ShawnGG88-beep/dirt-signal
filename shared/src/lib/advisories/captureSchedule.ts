/** NDVI capture scheduling suggestion. Python mirror: capture_schedule.py */

import { localDayKey, localHour } from "../dayNight";
import { num, parseAt } from "./utils";

export interface CaptureSuggestion {
  suggested_at: string | null;
  cloud_cover: number | null;
  stability_label: string;
  note: string;
}

export function suggestCaptureTime(
  forecastRows: Array<Record<string, unknown>>,
  tzName: string,
  options: { lightCondition?: string; now?: Date } = {},
): CaptureSuggestion {
  const { lightCondition = "unknown", now = new Date() } = options;
  const today = localDayKey(now, tzName);
  const candidates: Array<{ at: Date; cloud: number; variance: number }> = [];

  for (const row of forecastRows) {
    const ft = parseAt(row.forecast_time);
    const cloud = num(row.cloud_cover);
    if (ft == null || cloud == null) continue;
    if (localDayKey(ft, tzName) !== today) continue;
    const hour = localHour(ft, tzName);
    if (hour < 10 || hour > 15) continue;

    const window = forecastRows
      .map((r) => ({ at: parseAt(r.forecast_time), cloud: num(r.cloud_cover) }))
      .filter(
        (r): r is { at: Date; cloud: number } =>
          r.at != null &&
          r.cloud != null &&
          Math.abs(r.at.getTime() - ft.getTime()) <= 7200_000,
      );
    if (window.length < 2) continue;
    const mean = window.reduce((s, w) => s + w.cloud, 0) / window.length;
    const variance =
      window.reduce((s, w) => s + (w.cloud - mean) ** 2, 0) / window.length;
    candidates.push({ at: ft, cloud, variance });
  }

  if (candidates.length === 0) {
    return {
      suggested_at: null,
      cloud_cover: null,
      stability_label: "unavailable",
      note: `No stable capture window near solar noon in today's forecast. Light condition: ${lightCondition}.`,
    };
  }

  candidates.sort(
    (a, b) => a.variance - b.variance || Math.abs(a.cloud - 50) - Math.abs(b.cloud - 50),
  );
  const best = candidates[0];
  const label =
    best.cloud < 30
      ? "reliably clear"
      : best.cloud > 70
        ? "reliably overcast"
        : "mixed but stable";

  return {
    suggested_at: best.at.toISOString(),
    cloud_cover: best.cloud,
    stability_label: label,
    note: `Suggested capture near solar noon (${label}, variance ${best.variance.toFixed(1)}). Light condition: ${lightCondition}. Does not change the Pi schedule.`,
  };
}
