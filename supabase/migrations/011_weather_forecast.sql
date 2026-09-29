-- Migration 011: Open-Meteo hourly weather forecast storage.
-- Apply via Supabase SQL editor or MCP execute_sql after 010.
--
-- Written by the weather-forecast-sync Edge Function (service role).
-- The web dashboard reads via authenticated select policy (single-user).
--
-- Idempotent: safe to re-run. If you see "relation already exists" on an
-- older copy of this file, migration 011 is already applied — run the
-- verification query at the bottom instead of create table.

create table if not exists weather_forecast (
  id bigint generated always as identity primary key,
  device_id uuid not null references devices(id),
  fetched_at timestamptz not null default now(),
  forecast_time timestamptz not null,
  temperature_2m numeric,
  relative_humidity_2m numeric,
  precipitation numeric,
  precipitation_probability numeric,
  wind_speed_10m numeric,
  cloud_cover numeric,
  et0_fao_evapotranspiration numeric,
  soil_temperature_0cm numeric,
  soil_moisture_0_1cm numeric,
  source text not null default 'open-meteo'
    check (source in ('open-meteo', 'mock')),
  unique (device_id, forecast_time)
);

create index if not exists weather_forecast_device_forecast_time_idx
  on weather_forecast (device_id, forecast_time desc);

comment on table weather_forecast is
  'Hourly Open-Meteo forecast rows per device. Upserted by weather-forecast-sync.';

comment on column weather_forecast.fetched_at is
  'When this row was last written by the sync function.';

comment on column weather_forecast.forecast_time is
  'UTC timestamp of the forecast hour this row applies to.';

comment on column weather_forecast.temperature_2m is
  'Air temperature at 2 m (°C).';

comment on column weather_forecast.relative_humidity_2m is
  'Relative humidity at 2 m (%).';

comment on column weather_forecast.precipitation is
  'Preceding hour precipitation sum (mm).';

comment on column weather_forecast.precipitation_probability is
  'Precipitation probability (%).';

comment on column weather_forecast.wind_speed_10m is
  'Wind speed at 10 m (km/h).';

comment on column weather_forecast.cloud_cover is
  'Total cloud cover (%).';

comment on column weather_forecast.et0_fao_evapotranspiration is
  'FAO-56 reference evapotranspiration, preceding hour sum (mm).';

comment on column weather_forecast.soil_temperature_0cm is
  'Soil temperature at 0 cm depth (°C).';

comment on column weather_forecast.soil_moisture_0_1cm is
  'Volumetric soil moisture 0-1 cm (m³/m³). Mapped from Open-Meteo soil_moisture_0_to_1cm.';

comment on column weather_forecast.source is
  'open-meteo = live API; mock = synthetic data from weather-forecast-sync.';

alter table weather_forecast enable row level security;

revoke all on table weather_forecast from anon, authenticated;

grant select on weather_forecast to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'weather_forecast'
      and policyname = 'authenticated can read weather forecast'
  ) then
    create policy "authenticated can read weather forecast"
      on weather_forecast for select to authenticated
      using (true);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Verification (run after applying; expect one table, one index, one policy)
-- ---------------------------------------------------------------------------
-- select relname, relrowsecurity from pg_class
-- where relnamespace = 'public'::regnamespace and relname = 'weather_forecast';
--
-- select indexname from pg_indexes
-- where schemaname = 'public' and tablename = 'weather_forecast';
--
-- select policyname, cmd, roles from pg_policies
-- where schemaname = 'public' and tablename = 'weather_forecast';

-- ---------------------------------------------------------------------------
-- pg_cron schedule (manual — do not run automatically)
-- ---------------------------------------------------------------------------
-- Enable pg_cron and pg_net in the Supabase Dashboard first.
-- Set Edge Function secrets: WEATHER_MODE, WEATHER_LATITUDE, WEATHER_LONGITUDE.
-- Invoke the function once manually and confirm rows before scheduling.
--
-- Replace YOUR_SERVICE_ROLE_KEY after a successful manual invoke.
--
-- select cron.schedule(
--   'weather-forecast-sync-hourly',
--   '0 * * * *',
--   $$ select net.http_post(
--        url := 'https://jrrrwukcasaqyqaidrme.supabase.co/functions/v1/weather-forecast-sync',
--        headers := jsonb_build_object(
--          'Content-Type', 'application/json',
--          'Authorization', 'Bearer ' || 'YOUR_SERVICE_ROLE_KEY'
--        ),
--        body := '{}'::jsonb
--      ); $$
-- );
