/** TOM-CAST-style early blight daily DSV score. Python mirror: tomato_early_blight.py */

import type { DailyClimate } from "./climateMerge";

export function scoreEarlyBlightDay(daily: DailyClimate): number {
  if (daily.source !== "observed") return 0;
  const { t_max_c: tMax, t_min_c: tMin } = daily;
  if (tMax == null || tMin == null) return 0;
  const tMean = (tMax + tMin) / 2;
  const moist =
    daily.precip_sum_mm > 0 ||
    (daily.rh_mean_pct != null && daily.rh_mean_pct >= 90) ||
    daily.wet_hours >= 6;
  if (tMean >= 25 && tMean <= 30 && moist) return 4;
  if (tMean >= 5 && tMean < 25 && moist) return 1;
  if (moist && tMean > 30) return 0.5;
  return 0;
}
