import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  buildDailyDigest,
  type DeviceDsvRow,
  type DiseaseKey,
} from "../_shared/advisories/digest.ts";
import { defaultDsvRow } from "../_shared/advisories/dsvStore.ts";
import { DISEASE_KEYS } from "../_shared/advisories/constants.ts";

const READINGS_LOOKBACK_HOURS = 36;
const FORECAST_HORIZON_HOURS = 48;

function requireEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing required secret: ${name}`);
  return value;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST" && req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const supabaseUrl = requireEnv("SUPABASE_URL");
    const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const computedAt = new Date().toISOString();
    const now = new Date(computedAt);

    const { data: devices, error: devicesError } = await supabase
      .from("devices")
      .select("id, crop_type, lifecycle_stage, timezone, soil_texture");
    if (devicesError) {
      throw new Error(`Failed to load devices: ${devicesError.message}`);
    }

    const deviceRows = devices ?? [];
    if (deviceRows.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, devices: 0, digests: 0, message: "No devices" }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    let digestCount = 0;
    let dsvUpdates = 0;

    for (const device of deviceRows) {
      const deviceId = String(device.id);
      const fromReadings = new Date(
        now.getTime() - READINGS_LOOKBACK_HOURS * 3600_000,
      ).toISOString();
      const fromForecast = new Date(now.getTime() - 3600_000).toISOString();
      const toForecast = new Date(
        now.getTime() + FORECAST_HORIZON_HOURS * 3600_000,
      ).toISOString();

      const [readingsRes, forecastRes, dsvRes] = await Promise.all([
        supabase
          .from("sensor_readings")
          .select("*")
          .eq("device_id", deviceId)
          .gte("recorded_at", fromReadings)
          .order("recorded_at", { ascending: true })
          .limit(5000),
        supabase
          .from("weather_forecast")
          .select("*")
          .eq("device_id", deviceId)
          .gte("forecast_time", fromForecast)
          .lte("forecast_time", toForecast)
          .order("forecast_time", { ascending: true })
          .limit(500),
        supabase
          .from("device_disease_dsv")
          .select("*")
          .eq("device_id", deviceId),
      ]);

      if (readingsRes.error) {
        throw new Error(
          `Failed to load readings for ${deviceId}: ${readingsRes.error.message}`,
        );
      }
      if (forecastRes.error) {
        throw new Error(
          `Failed to load forecast for ${deviceId}: ${forecastRes.error.message}`,
        );
      }
      if (dsvRes.error) {
        throw new Error(
          `Failed to load DSV for ${deviceId}: ${dsvRes.error.message}`,
        );
      }

      const dsvRows = new Map<DiseaseKey, DeviceDsvRow>();
      for (const key of DISEASE_KEYS) {
        const existing = (dsvRes.data ?? []).find(
          (r) => r.disease_key === key,
        ) as DeviceDsvRow | undefined;
        dsvRows.set(key, existing ?? defaultDsvRow(deviceId, key));
      }

      const { digest, updatedDsvRows } = buildDailyDigest({
        device: device as Record<string, unknown>,
        readings: (readingsRes.data ?? []) as Array<Record<string, unknown>>,
        forecastRows: (forecastRes.data ?? []) as Array<Record<string, unknown>>,
        dsvRows,
        now,
      });

      for (const row of updatedDsvRows) {
        const { error: upsertError } = await supabase
          .from("device_disease_dsv")
          .upsert(row);
        if (upsertError) {
          throw new Error(
            `Failed to upsert DSV ${row.disease_key} for ${deviceId}: ${upsertError.message}`,
          );
        }
        dsvUpdates += 1;
      }

      const { error: insertError } = await supabase
        .from("device_advisories_daily")
        .insert({
          device_id: deviceId,
          computed_at: computedAt,
          digest,
        });
      if (insertError) {
        throw new Error(
          `Failed to insert digest for ${deviceId}: ${insertError.message}`,
        );
      }
      digestCount += 1;
    }

    return new Response(
      JSON.stringify({
        ok: true,
        computed_at: computedAt,
        devices: deviceRows.length,
        digests: digestCount,
        dsv_updates: dsvUpdates,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
