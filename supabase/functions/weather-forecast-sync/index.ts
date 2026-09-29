import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast";
const HOURLY_VARS = [
  "temperature_2m",
  "relative_humidity_2m",
  "precipitation",
  "precipitation_probability",
  "wind_speed_10m",
  "wind_gusts_10m",
  "cloud_cover",
  "weather_code",
  "cape",
  "et0_fao_evapotranspiration",
  "soil_temperature_0cm",
  "soil_moisture_0_to_1cm",
].join(",");
const DAILY_VARS = ["sunrise", "sunset"].join(",");

interface OpenMeteoHourly {
  time: string[];
  temperature_2m?: (number | null)[];
  relative_humidity_2m?: (number | null)[];
  precipitation?: (number | null)[];
  precipitation_probability?: (number | null)[];
  wind_speed_10m?: (number | null)[];
  wind_gusts_10m?: (number | null)[];
  cloud_cover?: (number | null)[];
  weather_code?: (number | null)[];
  cape?: (number | null)[];
  et0_fao_evapotranspiration?: (number | null)[];
  soil_temperature_0cm?: (number | null)[];
  soil_moisture_0_to_1cm?: (number | null)[];
}

interface OpenMeteoDaily {
  time: string[];
  sunrise?: (string | null)[];
  sunset?: (string | null)[];
}

interface OpenMeteoPayload {
  utc_offset_seconds?: number;
  hourly: OpenMeteoHourly;
  daily?: OpenMeteoDaily;
}

interface ForecastRow {
  device_id: string;
  fetched_at: string;
  forecast_time: string;
  temperature_2m: number | null;
  relative_humidity_2m: number | null;
  precipitation: number | null;
  precipitation_probability: number | null;
  wind_speed_10m: number | null;
  wind_gusts_10m: number | null;
  cloud_cover: number | null;
  weather_code: number | null;
  cape: number | null;
  et0_fao_evapotranspiration: number | null;
  soil_temperature_0cm: number | null;
  soil_moisture_0_1cm: number | null;
  source: "open-meteo" | "mock";
}

interface DailyRow {
  device_id: string;
  fetched_at: string;
  forecast_date: string;
  sunrise_at: string | null;
  sunset_at: string | null;
  source: "open-meteo" | "mock";
}

function num(value: number | null | undefined): number | null {
  return value == null || Number.isNaN(value) ? null : value;
}

function intOrNull(value: number | null | undefined): number | null {
  const n = num(value);
  return n == null ? null : Math.round(n);
}

/**
 * Open-Meteo returns local wall times without an offset when `timezone` is set.
 * Convert to UTC ISO using the response utc_offset_seconds.
 */
function localWallTimeToUtcIso(
  localIso: string | null | undefined,
  utcOffsetSeconds: number,
): string | null {
  if (localIso == null || localIso.trim() === "") return null;
  const trimmed = localIso.trim();
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(trimmed)) {
    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  const match = trimmed.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?$/,
  );
  if (!match) {
    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const day = Number.parseInt(match[3], 10);
  const hour = Number.parseInt(match[4] ?? "0", 10);
  const minute = Number.parseInt(match[5] ?? "0", 10);
  const second = Number.parseInt(match[6] ?? "0", 10);
  const asUtcMs = Date.UTC(year, month - 1, day, hour, minute, second);
  return new Date(asUtcMs - utcOffsetSeconds * 1000).toISOString();
}

function requireEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) {
    throw new Error(`Missing required secret: ${name}`);
  }
  return value;
}

function parseCoord(name: string): number {
  const raw = requireEnv(name);
  const value = Number.parseFloat(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`${name} must be a finite number, got: ${raw}`);
  }
  return value;
}

async function fetchOpenMeteo(
  latitude: number,
  longitude: number,
  timezone: string,
): Promise<OpenMeteoPayload> {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    hourly: HOURLY_VARS,
    daily: DAILY_VARS,
    forecast_days: "7",
    timezone,
  });
  const response = await fetch(`${OPEN_METEO_URL}?${params.toString()}`);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Open-Meteo HTTP ${response.status}: ${body.slice(0, 200)}`);
  }
  const payload = (await response.json()) as OpenMeteoPayload;
  if (!payload?.hourly?.time?.length) {
    throw new Error("Open-Meteo response missing hourly.time");
  }
  return payload;
}

function buildRowsFromHourly(
  hourly: OpenMeteoHourly,
  deviceIds: string[],
  fetchedAt: string,
  source: "open-meteo" | "mock",
  utcOffsetSeconds: number,
): ForecastRow[] {
  const rows: ForecastRow[] = [];
  for (const deviceId of deviceIds) {
    for (let i = 0; i < hourly.time.length; i += 1) {
      const forecastTime = localWallTimeToUtcIso(
        hourly.time[i],
        utcOffsetSeconds,
      );
      if (forecastTime == null) continue;
      rows.push({
        device_id: deviceId,
        fetched_at: fetchedAt,
        forecast_time: forecastTime,
        temperature_2m: num(hourly.temperature_2m?.[i]),
        relative_humidity_2m: num(hourly.relative_humidity_2m?.[i]),
        precipitation: num(hourly.precipitation?.[i]),
        precipitation_probability: num(hourly.precipitation_probability?.[i]),
        wind_speed_10m: num(hourly.wind_speed_10m?.[i]),
        wind_gusts_10m: num(hourly.wind_gusts_10m?.[i]),
        cloud_cover: num(hourly.cloud_cover?.[i]),
        weather_code: intOrNull(hourly.weather_code?.[i]),
        cape: num(hourly.cape?.[i]),
        et0_fao_evapotranspiration: num(hourly.et0_fao_evapotranspiration?.[i]),
        soil_temperature_0cm: num(hourly.soil_temperature_0cm?.[i]),
        soil_moisture_0_1cm: num(hourly.soil_moisture_0_to_1cm?.[i]),
        source,
      });
    }
  }
  return rows;
}

function buildDailyRows(
  daily: OpenMeteoDaily | undefined,
  deviceIds: string[],
  fetchedAt: string,
  source: "open-meteo" | "mock",
  utcOffsetSeconds: number,
): DailyRow[] {
  if (!daily?.time?.length) return [];
  const rows: DailyRow[] = [];
  for (const deviceId of deviceIds) {
    for (let i = 0; i < daily.time.length; i += 1) {
      const forecastDate = daily.time[i]?.slice(0, 10);
      if (!forecastDate) continue;
      rows.push({
        device_id: deviceId,
        fetched_at: fetchedAt,
        forecast_date: forecastDate,
        sunrise_at: localWallTimeToUtcIso(daily.sunrise?.[i], utcOffsetSeconds),
        sunset_at: localWallTimeToUtcIso(daily.sunset?.[i], utcOffsetSeconds),
        source,
      });
    }
  }
  return rows;
}

function generateMockPayload(timezone: string): OpenMeteoPayload {
  void timezone;
  const times: string[] = [];
  const temperature_2m: number[] = [];
  const relative_humidity_2m: number[] = [];
  const precipitation: number[] = [];
  const precipitation_probability: number[] = [];
  const wind_speed_10m: number[] = [];
  const wind_gusts_10m: (number | null)[] = [];
  const cloud_cover: number[] = [];
  const weather_code: number[] = [];
  const cape: number[] = [];
  const et0_fao_evapotranspiration: number[] = [];
  const soil_temperature_0cm: number[] = [];
  const soil_moisture_0_to_1cm: number[] = [];

  const start = new Date();
  start.setUTCMinutes(0, 0, 0);

  const dailyDates: string[] = [];
  const sunrise: string[] = [];
  const sunset: string[] = [];

  for (let h = 0; h < 7 * 24; h += 1) {
    const at = new Date(start.getTime() + h * 3600_000);
    const y = at.getUTCFullYear();
    const mo = String(at.getUTCMonth() + 1).padStart(2, "0");
    const d = String(at.getUTCDate()).padStart(2, "0");
    const hh = String(at.getUTCHours()).padStart(2, "0");
    times.push(`${y}-${mo}-${d}T${hh}:00`);
    const dayIndex = Math.floor(h / 24);
    const dayPhase = (h % 24) / 24;
    // Day-to-day variation so 7-day aggregates are not identical.
    const dayBias = dayIndex * 1.4 - 2.5 * Math.sin(dayIndex * 0.9);
    const amplitude = 7 + (dayIndex % 3);
    const t =
      13 + dayBias + amplitude * Math.sin((dayPhase - 0.25) * 2 * Math.PI);
    temperature_2m.push(Math.round(t * 10) / 10);
    relative_humidity_2m.push(
      Math.round(
        50 +
          dayIndex * 2 +
          25 * Math.cos(dayPhase * 2 * Math.PI) -
          dayBias,
      ),
    );
    const rainy = (h + dayIndex * 5) % 17 === 0;
    const stormy = (h + dayIndex * 3) % 41 === 0;
    precipitation.push(rainy ? 0.4 + dayIndex * 0.15 : 0);
    precipitation_probability.push(
      rainy ? 30 + dayIndex * 5 : 4 + (dayIndex % 4),
    );
    wind_speed_10m.push(
      Math.round((5 + dayIndex + 4 * Math.sin(h / 5)) * 10) / 10,
    );
    // Leave a few null gust hours so the UI can show missing fields.
    wind_gusts_10m.push(
      h % 23 === 0
        ? null
        : Math.round((9 + dayIndex + 8 * Math.sin(h / 5)) * 10) / 10,
    );
    cloud_cover.push(
      Math.round(
        20 + dayIndex * 6 + 35 * Math.abs(Math.sin((h + dayIndex) / 12)),
      ),
    );
    weather_code.push(stormy ? 95 : rainy ? 61 : dayIndex % 2 === 0 ? 1 : 2);
    cape.push(stormy ? 1200 : 80 + dayIndex * 20);
    et0_fao_evapotranspiration.push(
      Math.max(0, Math.round((t * 0.05 + dayIndex * 0.08) * 10) / 10),
    );
    soil_temperature_0cm.push(Math.round((t - 2) * 10) / 10);
    soil_moisture_0_to_1cm.push(
      Math.round((0.2 + 0.02 * dayIndex + 0.03 * Math.sin(h / 48)) * 1000) /
        1000,
    );

    if (h % 24 === 0) {
      dailyDates.push(`${y}-${mo}-${d}`);
      const riseHour = 5 + (dayIndex % 3);
      const setHour = 17 + (dayIndex % 2);
      sunrise.push(
        `${y}-${mo}-${d}T${String(riseHour).padStart(2, "0")}:15`,
      );
      sunset.push(
        `${y}-${mo}-${d}T${String(setHour).padStart(2, "0")}:05`,
      );
    }
  }

  return {
    utc_offset_seconds: 0,
    hourly: {
      time: times,
      temperature_2m,
      relative_humidity_2m,
      precipitation,
      precipitation_probability,
      wind_speed_10m,
      wind_gusts_10m,
      cloud_cover,
      weather_code,
      cape,
      et0_fao_evapotranspiration,
      soil_temperature_0cm,
      soil_moisture_0_to_1cm,
    },
    daily: {
      time: dailyDates,
      sunrise,
      sunset,
    },
  };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST" && req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const mode = (Deno.env.get("WEATHER_MODE") ?? "real").trim().toLowerCase();
    const timezone =
      Deno.env.get("WEATHER_TIMEZONE")?.trim() || "Africa/Johannesburg";

    const supabaseUrl = requireEnv("SUPABASE_URL");
    const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: devices, error: devicesError } = await supabase
      .from("devices")
      .select("id");
    if (devicesError) {
      throw new Error(`Failed to load devices: ${devicesError.message}`);
    }
    const deviceIds = (devices ?? []).map((d) => String(d.id));
    if (deviceIds.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, mode, upserted: 0, message: "No devices" }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    let payload: OpenMeteoPayload;
    let source: "open-meteo" | "mock";

    if (mode === "real") {
      // Defaults: Roodepoort greenhouse. Override with WEATHER_LATITUDE / LONGITUDE.
      const latitude = Number.parseFloat(
        Deno.env.get("WEATHER_LATITUDE")?.trim() || "-26.1625",
      );
      const longitude = Number.parseFloat(
        Deno.env.get("WEATHER_LONGITUDE")?.trim() || "27.8725",
      );
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        throw new Error("WEATHER_LATITUDE and WEATHER_LONGITUDE must be finite");
      }
      payload = await fetchOpenMeteo(latitude, longitude, timezone);
      source = "open-meteo";
    } else if (mode === "mock") {
      payload = generateMockPayload(timezone);
      source = "mock";
    } else {
      throw new Error(`WEATHER_MODE must be mock or real, got: ${mode}`);
    }

    const utcOffsetSeconds = payload.utc_offset_seconds ?? 0;
    const fetchedAt = new Date().toISOString();
    const rows = buildRowsFromHourly(
      payload.hourly,
      deviceIds,
      fetchedAt,
      source,
      utcOffsetSeconds,
    );
    const dailyRows = buildDailyRows(
      payload.daily,
      deviceIds,
      fetchedAt,
      source,
      utcOffsetSeconds,
    );

    const { error: upsertError } = await supabase
      .from("weather_forecast")
      .upsert(rows, { onConflict: "device_id,forecast_time" });

    if (upsertError) {
      throw new Error(`Hourly upsert failed: ${upsertError.message}`);
    }

    if (dailyRows.length > 0) {
      const { error: dailyError } = await supabase
        .from("weather_forecast_daily")
        .upsert(dailyRows, { onConflict: "device_id,forecast_date" });
      if (dailyError) {
        throw new Error(`Daily upsert failed: ${dailyError.message}`);
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        mode,
        source,
        devices: deviceIds.length,
        hours: payload.hourly.time.length,
        upserted: rows.length,
        daily_upserted: dailyRows.length,
        utc_offset_seconds: utcOffsetSeconds,
        fetched_at: fetchedAt,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      JSON.stringify({ event: "weather_forecast_sync_error", message }),
    );
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
