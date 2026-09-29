# Migration 016: weather horizon fields

Status: ready to apply in Supabase (numbered 016 because 015 is soil moisture anchors).

File: `supabase/migrations/016_weather_horizon_fields.sql`

Adds nullable hourly `weather_code`, `wind_gusts_10m`, `cape` on `weather_forecast`,
plus `weather_forecast_daily` for sunrise/sunset as UTC `timestamptz`. No backfill.
