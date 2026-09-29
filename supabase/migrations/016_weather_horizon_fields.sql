-- Migration 016: weather horizon fields (Open-Meteo codes, gusts, CAPE, sun).
-- Apply via Supabase SQL editor after 015.
-- Idempotent: safe to re-run. Does not backfill existing hourly rows.
--
-- Hourly Open-Meteo names (verified against https://open-meteo.com/en/docs):
--   weather_code, wind_gusts_10m, cape
-- Daily:
--   sunrise, sunset (requested in device timezone; stored as timestamptz UTC)
--
-- Do not store: dew point, VPD, UV, is_day (derived in the client).

-- ---------------------------------------------------------------------------
-- A. Nullable hourly columns on weather_forecast
-- ---------------------------------------------------------------------------
alter table weather_forecast
  add column if not exists weather_code smallint;

alter table weather_forecast
  add column if not exists wind_gusts_10m numeric;

alter table weather_forecast
  add column if not exists cape numeric;

comment on column weather_forecast.weather_code is
  'WMO weather interpretation code (Open-Meteo weather_code).';

comment on column weather_forecast.wind_gusts_10m is
  'Wind gusts at 10 m, preceding hour max (km/h). Open-Meteo wind_gusts_10m.';

comment on column weather_forecast.cape is
  'Convective available potential energy (J/kg). Stored for hour detail only; '
  'does not trigger the Storm risk lane until a sourced threshold exists.';

-- ---------------------------------------------------------------------------
-- B. Daily sunrise / sunset (UTC timestamptz)
-- ---------------------------------------------------------------------------
create table if not exists weather_forecast_daily (
  id bigint generated always as identity primary key,
  device_id uuid not null references devices(id),
  fetched_at timestamptz not null default now(),
  -- Calendar date in the forecast request timezone (WEATHER_TIMEZONE /
  -- device local), not a UTC day key. Sunrise/sunset instants are UTC.
  forecast_date date not null,
  sunrise_at timestamptz,
  sunset_at timestamptz,
  source text not null default 'open-meteo'
    check (source in ('open-meteo', 'mock')),
  unique (device_id, forecast_date)
);

create index if not exists weather_forecast_daily_device_date_idx
  on weather_forecast_daily (device_id, forecast_date desc);

comment on table weather_forecast_daily is
  'Daily Open-Meteo sun times per device. Upserted by weather-forecast-sync.';

comment on column weather_forecast_daily.forecast_date is
  'Local calendar date from the Open-Meteo daily response (request timezone).';

comment on column weather_forecast_daily.sunrise_at is
  'Sunrise instant stored as timestamptz (UTC). Render via shared time helper.';

comment on column weather_forecast_daily.sunset_at is
  'Sunset instant stored as timestamptz (UTC). Render via shared time helper.';

comment on column weather_forecast_daily.source is
  'open-meteo = live API; mock = synthetic data from weather-forecast-sync.';

alter table weather_forecast_daily enable row level security;

revoke all on table weather_forecast_daily from anon, authenticated;

grant select on weather_forecast_daily to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'weather_forecast_daily'
      and policyname = 'authenticated can read weather forecast daily'
  ) then
    create policy "authenticated can read weather forecast daily"
      on weather_forecast_daily for select to authenticated
      using (true);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Verification (run after applying)
-- ---------------------------------------------------------------------------
-- select column_name, data_type
-- from information_schema.columns
-- where table_schema = 'public'
--   and table_name = 'weather_forecast'
--   and column_name in ('weather_code', 'wind_gusts_10m', 'cape')
-- order by column_name;
--
-- select relname, relrowsecurity from pg_class
-- where relnamespace = 'public'::regnamespace
--   and relname = 'weather_forecast_daily';
--
-- select policyname, cmd from pg_policies
-- where schemaname = 'public' and tablename = 'weather_forecast_daily';
