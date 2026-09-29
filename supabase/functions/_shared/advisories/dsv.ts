/** Generic disease severity value accumulator. Python mirror: dsv.py */

export interface DsvState {
  accumulated: number;
  threshold: number;
  days_since_reset: number;
  spray_recommended: boolean;
  crossed_today: boolean;
  last_computed_day: string | null;
}

export function applyDailyDsv(options: {
  accumulated: number;
  threshold: number;
  dailyScore: number;
  daysSinceReset: number;
}): DsvState {
  const { accumulated, threshold, dailyScore, daysSinceReset } = options;
  const total = accumulated + Math.max(0, dailyScore);
  const crossed = total >= threshold;
  if (crossed) {
    return {
      accumulated: 0,
      threshold,
      days_since_reset: 0,
      spray_recommended: true,
      crossed_today: true,
      last_computed_day: null,
    };
  }
  return {
    accumulated: total,
    threshold,
    days_since_reset: daysSinceReset + 1,
    spray_recommended: false,
    crossed_today: false,
    last_computed_day: null,
  };
}

export function provisionalTodayScore(options: {
  accumulated: number;
  threshold: number;
  todayScore: number;
}): [number, boolean] {
  const projected = options.accumulated + Math.max(0, options.todayScore);
  return [projected, projected >= options.threshold];
}
