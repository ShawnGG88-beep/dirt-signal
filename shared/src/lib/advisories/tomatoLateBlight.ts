/** Wallin-style simplified late blight daily DSV score. Python mirror: tomato_late_blight.py */

import { LATE_BLIGHT_MIN_MEAN_TEMP_C, LATE_BLIGHT_WET_HOURS_MIN } from "./constants";
import type { DailyClimate } from "./climateMerge";

export function scoreLateBlightDay(daily: DailyClimate): number {
  if (daily.source !== "observed") return 0;
  if (daily.t_max_c == null || daily.t_min_c == null) return 0;
  const tMean = (daily.t_max_c + daily.t_min_c) / 2;
  if (tMean < LATE_BLIGHT_MIN_MEAN_TEMP_C) return 0;
  if (daily.wet_hours < LATE_BLIGHT_WET_HOURS_MIN) return 0;
  if (daily.wet_hours >= 14 && tMean >= 18) return 5;
  if (daily.wet_hours >= 12 && tMean >= 15) return 3;
  if (daily.wet_hours >= LATE_BLIGHT_WET_HOURS_MIN) return 2;
  return 0;
}

export function lateBlightWetHours(daily: DailyClimate): number {
  return daily.rh_mean_pct != null ? daily.wet_hours : 0;
}
