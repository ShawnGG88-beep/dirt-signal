export type TrendDirection = "rising" | "falling" | "stable";

export interface SeriesStats {
  min: number;
  max: number;
  mean: number;
  std: number;
  count: number;
  trend: TrendDirection;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Compare first-half mean vs second-half mean.
 * Stable when the shift is under 2% of |first half| (floor 0.05 absolute).
 */
export function computeTrend(values: number[]): TrendDirection {
  if (values.length < 4) return "stable";
  const mid = Math.floor(values.length / 2);
  const first = mean(values.slice(0, mid));
  const second = mean(values.slice(mid));
  const delta = second - first;
  const threshold = Math.max(Math.abs(first) * 0.02, 0.05);
  if (delta > threshold) return "rising";
  if (delta < -threshold) return "falling";
  return "stable";
}

export function computeStats(values: number[]): SeriesStats | null {
  if (values.length === 0) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const avg = mean(values);
  const variance =
    values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / values.length;
  return {
    min,
    max,
    mean: avg,
    std: Math.sqrt(variance),
    count: values.length,
    trend: computeTrend(values),
  };
}

export function isOutOfBounds(
  value: number,
  bounds: { min: number; max: number },
): boolean {
  return value < bounds.min || value > bounds.max;
}
