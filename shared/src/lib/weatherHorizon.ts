/**
 * Pure helpers for the weather horizon panel.
 * Colours resolve through CSS custom properties (no hex here).
 */

import type {
  WeatherForecastDay,
  WeatherForecastHour,
} from "../data/types";
import { dewPointC, vapourPressureDeficitKpa } from "./derived";
import { localDayKey } from "./dayNight";

export const FORECAST_STALE_AFTER_MS = 6 * 60 * 60 * 1000;

/** Advisory digest is daily; treat as stale after one day. */
export const DIGEST_STALE_AFTER_MS = 24 * 60 * 60 * 1000;

/** Dawn / day / dusk / night from sun times (not a fixed three-band map). */
export type SkyPhase = "night" | "dawn" | "day" | "dusk";

export interface HourSkyInput {
  forecast_time: string;
  cloud_cover?: number | null;
  sunrise_at?: string | null;
  sunset_at?: string | null;
}

/** Whether the forecast instant falls in daylight for that day's sun times. */
export function isDaylightAt(
  atIso: string,
  sunriseAt: string | null | undefined,
  sunsetAt: string | null | undefined,
): boolean {
  if (!sunriseAt || !sunsetAt) return false;
  const t = new Date(atIso).getTime();
  const rise = new Date(sunriseAt).getTime();
  const set = new Date(sunsetAt).getTime();
  if (![t, rise, set].every(Number.isFinite)) return false;
  return t >= rise && t < set;
}

/**
 * Sky phase for colouring. Dawn and dusk are each a 90-minute window
 * around sunrise and sunset so adjacent hours blend through twilight.
 */
export function skyPhaseAt(
  atIso: string,
  sunriseAt: string | null | undefined,
  sunsetAt: string | null | undefined,
): SkyPhase {
  if (!sunriseAt || !sunsetAt) return "night";
  const t = new Date(atIso).getTime();
  const rise = new Date(sunriseAt).getTime();
  const set = new Date(sunsetAt).getTime();
  if (![t, rise, set].every(Number.isFinite)) return "night";
  const twilightMs = 90 * 60 * 1000;
  if (Math.abs(t - rise) <= twilightMs) return "dawn";
  if (Math.abs(t - set) <= twilightMs) return "dusk";
  if (t >= rise && t < set) return "day";
  return "night";
}

/**
 * CSS colour for one hour. Cloud cover gently shifts toward overcast;
 * clear day stays a lifted apricot/heather mix (not blue-grey).
 * Overcast pull is capped so a rainy day still reads warm, not slate.
 */
export function skyCssColour(input: HourSkyInput): string {
  const phase = skyPhaseAt(
    input.forecast_time,
    input.sunrise_at,
    input.sunset_at,
  );
  const cloud = Math.max(0, Math.min(100, input.cloud_cover ?? 0));
  // Cap overcast pull so heavy cloud does not flatten the warm day tint.
  const overcastFrac = (cloud / 100) * 0.22;

  const base =
    phase === "night"
      ? "var(--sky-night)"
      : phase === "dawn"
        ? "var(--sky-dawn)"
        : phase === "dusk"
          ? "var(--sky-dusk)"
          : "var(--sky-day)";

  if (overcastFrac < 0.02) return base;
  const clearPct = Math.round((1 - overcastFrac) * 100);
  return `color-mix(in srgb, ${base} ${clearPct}%, var(--sky-overcast))`;
}

/**
 * Continuous left-to-right sky: one linear-gradient with a stop per hour
 * so the browser interpolates adjacent colours (no hard cell edges).
 */
export function skyBandGradient(
  hours: HourSkyInput[],
): string {
  if (hours.length === 0) return "var(--sky-night)";
  if (hours.length === 1) return skyCssColour(hours[0]);
  const stops = hours.map((hour, i) => {
    const pct = (i / (hours.length - 1)) * 100;
    return `${skyCssColour(hour)} ${pct.toFixed(3)}%`;
  });
  return `linear-gradient(to right, ${stops.join(", ")})`;
}

export function findSunForHour(
  hourIso: string,
  days: WeatherForecastDay[],
  timeZone: string,
): { sunrise_at: string | null; sunset_at: string | null } {
  const dayKey = localDayKey(new Date(hourIso), timeZone);
  const match = days.find((d) => d.forecast_date === dayKey);
  return {
    sunrise_at: match?.sunrise_at ?? null,
    sunset_at: match?.sunset_at ?? null,
  };
}

export function forecastIsStale(
  fetchedAt: string | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  if (!fetchedAt) return true;
  const t = new Date(fetchedAt).getTime();
  if (!Number.isFinite(t)) return true;
  return nowMs - t > FORECAST_STALE_AFTER_MS;
}

export function digestIsStale(
  computedAt: string | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  if (!computedAt) return true;
  const t = new Date(computedAt).getTime();
  if (!Number.isFinite(t)) return true;
  return nowMs - t > DIGEST_STALE_AFTER_MS;
}

export function pickCurrentHourIndex(
  hours: WeatherForecastHour[],
  nowMs: number = Date.now(),
): number {
  if (hours.length === 0) return -1;
  let best = 0;
  let bestDelta = Number.POSITIVE_INFINITY;
  for (let i = 0; i < hours.length; i += 1) {
    const t = new Date(hours[i].forecast_time).getTime();
    if (!Number.isFinite(t)) continue;
    const delta = Math.abs(t - nowMs);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = i;
    }
  }
  return best;
}

/** Hours from now through +horizonHours (inclusive of current hour). */
export function sliceHorizonHours(
  hours: WeatherForecastHour[],
  horizonHours: number,
  nowMs: number = Date.now(),
): WeatherForecastHour[] {
  const start = nowMs - 30 * 60 * 1000;
  const end = nowMs + horizonHours * 3600_000;
  return hours.filter((h) => {
    const t = new Date(h.forecast_time).getTime();
    return Number.isFinite(t) && t >= start && t <= end;
  });
}

export interface DayAggregate {
  forecast_date: string;
  high_c: number | null;
  low_c: number | null;
  rain_chance_max: number | null;
  et0_sum: number | null;
  cloud_cover_mean: number | null;
  sunrise_at: string | null;
  sunset_at: string | null;
  sky_css: string;
  hour_count: number;
}

export function aggregateForecastDays(
  hours: WeatherForecastHour[],
  days: WeatherForecastDay[],
  timeZone: string,
): DayAggregate[] {
  const byDay = new Map<string, WeatherForecastHour[]>();
  for (const hour of hours) {
    const key = localDayKey(new Date(hour.forecast_time), timeZone);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(hour);
  }

  return [...byDay.keys()]
    .sort()
    .map((forecast_date) => {
      const rows = byDay.get(forecast_date)!;
      const temps = rows
        .map((r) => r.temperature_2m)
        .filter((v): v is number => v != null && Number.isFinite(v));
      const rains = rows
        .map((r) => r.precipitation_probability)
        .filter((v): v is number => v != null && Number.isFinite(v));
      const et0s = rows
        .map((r) => r.et0_fao_evapotranspiration)
        .filter((v): v is number => v != null && Number.isFinite(v));
      const clouds = rows
        .map((r) => r.cloud_cover)
        .filter((v): v is number => v != null && Number.isFinite(v));
      const sun = days.find((d) => d.forecast_date === forecast_date);
      const midday = rows[Math.floor(rows.length / 2)] ?? rows[0];
      const sky_css = skyCssColour({
        forecast_time: midday.forecast_time,
        cloud_cover:
          clouds.length > 0
            ? clouds.reduce((a, b) => a + b, 0) / clouds.length
            : null,
        sunrise_at: sun?.sunrise_at,
        sunset_at: sun?.sunset_at,
      });
      return {
        forecast_date,
        high_c: temps.length ? Math.max(...temps) : null,
        low_c: temps.length ? Math.min(...temps) : null,
        rain_chance_max: rains.length ? Math.max(...rains) : null,
        et0_sum: et0s.length
          ? Math.round(et0s.reduce((a, b) => a + b, 0) * 100) / 100
          : null,
        cloud_cover_mean: clouds.length
          ? clouds.reduce((a, b) => a + b, 0) / clouds.length
          : null,
        sunrise_at: sun?.sunrise_at ?? null,
        sunset_at: sun?.sunset_at ?? null,
        sky_css,
        hour_count: rows.length,
      };
    });
}

export interface HourReadouts {
  temperature_2m: number | null;
  precipitation_probability: number | null;
  wind_speed_10m: number | null;
  wind_gusts_10m: number | null;
  relative_humidity_2m: number | null;
  dew_point_c: number | null;
  vpd_kpa: number | null;
  et0_fao_evapotranspiration: number | null;
  cloud_cover: number | null;
  weather_code: number | null;
  cape: number | null;
  precipitation: number | null;
  is_day: boolean;
}

export function hourReadouts(
  hour: WeatherForecastHour | null | undefined,
  sun: { sunrise_at: string | null; sunset_at: string | null },
): HourReadouts | null {
  if (!hour) return null;
  return {
    temperature_2m: hour.temperature_2m,
    precipitation_probability: hour.precipitation_probability,
    wind_speed_10m: hour.wind_speed_10m,
    wind_gusts_10m: hour.wind_gusts_10m,
    relative_humidity_2m: hour.relative_humidity_2m,
    dew_point_c: dewPointC(
      hour.temperature_2m,
      hour.relative_humidity_2m,
    ),
    vpd_kpa: vapourPressureDeficitKpa(
      hour.temperature_2m,
      hour.relative_humidity_2m,
    ),
    et0_fao_evapotranspiration: hour.et0_fao_evapotranspiration,
    cloud_cover: hour.cloud_cover,
    weather_code: hour.weather_code,
    cape: hour.cape,
    precipitation: hour.precipitation,
    is_day: isDaylightAt(hour.forecast_time, sun.sunrise_at, sun.sunset_at),
  };
}

/**
 * Plain-language WMO weather interpretation codes (Open-Meteo).
 * https://open-meteo.com/en/docs
 */
export function weatherCodeLabel(
  code: number | null | undefined,
): string {
  if (code == null || !Number.isFinite(code)) return "—";
  const c = Math.round(code);
  const labels: Record<number, string> = {
    0: "Clear sky",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Depositing rime fog",
    51: "Light drizzle",
    53: "Moderate drizzle",
    55: "Dense drizzle",
    56: "Light freezing drizzle",
    57: "Dense freezing drizzle",
    61: "Slight rain",
    63: "Moderate rain",
    65: "Heavy rain",
    66: "Light freezing rain",
    67: "Heavy freezing rain",
    71: "Slight snow",
    73: "Moderate snow",
    75: "Heavy snow",
    77: "Snow grains",
    80: "Slight rain showers",
    81: "Moderate rain showers",
    82: "Violent rain showers",
    85: "Slight snow showers",
    86: "Heavy snow showers",
    95: "Thunderstorm",
    96: "Thunderstorm with slight hail",
    99: "Thunderstorm with heavy hail",
  };
  return labels[c] ?? `Code ${c}`;
}
