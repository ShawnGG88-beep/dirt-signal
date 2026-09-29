/**
 * Storm risk derivation for the weather horizon.
 *
 * Client-side only: storm risk is not an advisory digest module.
 * CAPE is never used to trigger the lane (shown in hour detail only).
 */

export const THUNDERSTORM_WEATHER_CODES = [95, 96, 99] as const;

/**
 * Provisional gust threshold (km/h). Open-Meteo wind_gusts_10m.
 * Marked provisional until a vineyard-sourced threshold exists.
 */
export const STORM_GUST_THRESHOLD_KMH = 60;

export interface StormRiskHourInput {
  forecast_time: string;
  weather_code?: number | null;
  wind_gusts_10m?: number | null;
}

export type StormRiskReason = "thunderstorm_code" | "gust_threshold";

export interface StormRiskHit {
  forecast_time: string;
  reason: StormRiskReason;
  weather_code: number | null;
  wind_gusts_10m: number | null;
}

export interface StormRiskResult {
  /** True when any hour in the window triggers storm risk. */
  active: boolean;
  hits: StormRiskHit[];
  /** Always true: lane must show ProvisionalBadge. */
  provisional: true;
  gust_threshold_kmh: number;
  thunderstorm_codes: readonly number[];
}

export function isThunderstormCode(
  code: number | null | undefined,
): boolean {
  if (code == null || !Number.isFinite(code)) return false;
  return (THUNDERSTORM_WEATHER_CODES as readonly number[]).includes(
    Math.round(code),
  );
}

export function hourTriggersStormRisk(
  hour: StormRiskHourInput,
  gustThresholdKmh: number = STORM_GUST_THRESHOLD_KMH,
): StormRiskHit | null {
  const code =
    hour.weather_code == null || !Number.isFinite(hour.weather_code)
      ? null
      : Math.round(hour.weather_code);
  const gusts =
    hour.wind_gusts_10m == null || !Number.isFinite(hour.wind_gusts_10m)
      ? null
      : hour.wind_gusts_10m;

  if (isThunderstormCode(code)) {
    return {
      forecast_time: hour.forecast_time,
      reason: "thunderstorm_code",
      weather_code: code,
      wind_gusts_10m: gusts,
    };
  }
  if (gusts != null && gusts >= gustThresholdKmh) {
    return {
      forecast_time: hour.forecast_time,
      reason: "gust_threshold",
      weather_code: code,
      wind_gusts_10m: gusts,
    };
  }
  return null;
}

/**
 * Evaluate storm risk across forecast hours.
 * CAPE is ignored for triggering.
 */
export function evaluateStormRisk(
  hours: StormRiskHourInput[],
  options?: {
    gustThresholdKmh?: number;
    /** Inclusive window start (ISO). Defaults to all hours. */
    fromAt?: string | Date | null;
    /** Inclusive window end (ISO). Defaults to all hours. */
    toAt?: string | Date | null;
  },
): StormRiskResult {
  const gustThreshold =
    options?.gustThresholdKmh ?? STORM_GUST_THRESHOLD_KMH;
  const fromMs =
    options?.fromAt != null ? new Date(options.fromAt).getTime() : null;
  const toMs =
    options?.toAt != null ? new Date(options.toAt).getTime() : null;

  const hits: StormRiskHit[] = [];
  for (const hour of hours) {
    const t = new Date(hour.forecast_time).getTime();
    if (!Number.isFinite(t)) continue;
    if (fromMs != null && Number.isFinite(fromMs) && t < fromMs) continue;
    if (toMs != null && Number.isFinite(toMs) && t > toMs) continue;
    const hit = hourTriggersStormRisk(hour, gustThreshold);
    if (hit) hits.push(hit);
  }

  return {
    active: hits.length > 0,
    hits,
    provisional: true,
    gust_threshold_kmh: gustThreshold,
    thunderstorm_codes: THUNDERSTORM_WEATHER_CODES,
  };
}
