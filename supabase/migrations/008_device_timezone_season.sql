-- Migration 008: device timezone, season start, clear contaminated alert
-- history, and Postgres daily aggregates for derived metrics.
-- Apply via Supabase SQL editor or CLI after 007.

-- ---------------------------------------------------------------------------
-- Contaminated alert history
-- ---------------------------------------------------------------------------
-- Day/night band boundaries were evaluated in UTC on the alert engine while
-- the desktop used browser-local hours. For a UTC+2 deployment, readings near
-- the 06:00 and 18:00 local boundaries could be scored against the wrong band
-- for up to two hours twice daily. Shadow-mode firing counts drive promotion
-- decisions; contaminated history is actively misleading. There is no
-- production data to preserve — counts must start clean after the timezone fix.
delete from alert_events;

-- ---------------------------------------------------------------------------
-- Device timezone + season start
-- ---------------------------------------------------------------------------
alter table devices
  add column if not exists timezone text,
  add column if not exists season_start_date date;

-- Backfill timezone. Default Africa/Johannesburg matches the UTC+2 deployment.
-- Application code uses DIRT_SIGNAL_DEFAULT_TZ (falling back to the host
-- machine's local timezone) for any insert path that omits timezone; keep this
-- SQL default aligned with that env when deploying elsewhere.
update devices
set timezone = 'Africa/Johannesburg'
where timezone is null or btrim(timezone) = '';

alter table devices
  alter column timezone set default 'Africa/Johannesburg';

alter table devices
  alter column timezone set not null;

comment on column devices.timezone is
  'IANA timezone for device-local day/night and calendar-day bucketing '
  '(e.g. Africa/Johannesburg). Single source of truth — not the browser or '
  'sidecar host timezone at evaluation time.';

comment on column devices.season_start_date is
  'Device-local calendar date when the current growing season started. '
  'Null means cumulative GDD is unavailable until set.';

-- ---------------------------------------------------------------------------
-- Daily aggregates (Postgres-side; device timezone day buckets)
-- ---------------------------------------------------------------------------
-- One row per device-local calendar day in [p_from_at, p_to_at].
-- VPD mean is the mean of per-sample VPD (null samples excluded), never
-- interpolated. High-humidity hours count distinct local hours where any
-- sample exceeded the threshold; coverage_hours is distinct local hours with
-- at least one sample.
create or replace function device_daily_aggregates(
  p_device_id uuid,
  p_from_at timestamptz,
  p_to_at timestamptz,
  p_humidity_threshold numeric default 85,
  p_gdd_base_c numeric default 10
)
returns table (
  day date,
  sample_count bigint,
  coverage_hours bigint,
  moisture_pct_min numeric,
  moisture_pct_max numeric,
  moisture_pct_mean numeric,
  moisture_pct_count bigint,
  ph_min numeric,
  ph_max numeric,
  ph_mean numeric,
  ph_count bigint,
  soil_temp_c_min numeric,
  soil_temp_c_max numeric,
  soil_temp_c_mean numeric,
  soil_temp_c_count bigint,
  ambient_temp_c_min numeric,
  ambient_temp_c_max numeric,
  ambient_temp_c_mean numeric,
  ambient_temp_c_count bigint,
  ambient_humidity_pct_min numeric,
  ambient_humidity_pct_max numeric,
  ambient_humidity_pct_mean numeric,
  ambient_humidity_pct_count bigint,
  vpd_kpa_mean numeric,
  vpd_kpa_count bigint,
  gdd_day numeric,
  high_humidity_hours bigint,
  incomplete boolean
)
language sql
stable
as $$
  with device as (
    select timezone
    from devices
    where id = p_device_id
  ),
  samples as (
    select
      sr.*,
      (sr.recorded_at at time zone d.timezone)::date as local_day,
      date_trunc(
        'hour',
        sr.recorded_at at time zone d.timezone
      ) as local_hour,
      case
        when sr.ambient_temp_c is not null
          and sr.ambient_humidity_pct is not null
        then
          0.6108
          * exp(
            17.27 * sr.ambient_temp_c::float8
            / (sr.ambient_temp_c::float8 + 237.3)
          )
          * (1.0 - sr.ambient_humidity_pct::float8 / 100.0)
        else null
      end as vpd_kpa
    from sensor_readings sr
    cross join device d
    where sr.device_id = p_device_id
      and sr.recorded_at >= p_from_at
      and sr.recorded_at <= p_to_at
  ),
  day_base as (
    select
      local_day as day,
      count(*)::bigint as sample_count,
      count(distinct local_hour)::bigint as coverage_hours,
      min(moisture_pct) as moisture_pct_min,
      max(moisture_pct) as moisture_pct_max,
      avg(moisture_pct) as moisture_pct_mean,
      count(moisture_pct)::bigint as moisture_pct_count,
      min(ph) as ph_min,
      max(ph) as ph_max,
      avg(ph) as ph_mean,
      count(ph)::bigint as ph_count,
      min(soil_temp_c) as soil_temp_c_min,
      max(soil_temp_c) as soil_temp_c_max,
      avg(soil_temp_c) as soil_temp_c_mean,
      count(soil_temp_c)::bigint as soil_temp_c_count,
      min(ambient_temp_c) as ambient_temp_c_min,
      max(ambient_temp_c) as ambient_temp_c_max,
      avg(ambient_temp_c) as ambient_temp_c_mean,
      count(ambient_temp_c)::bigint as ambient_temp_c_count,
      min(ambient_humidity_pct) as ambient_humidity_pct_min,
      max(ambient_humidity_pct) as ambient_humidity_pct_max,
      avg(ambient_humidity_pct) as ambient_humidity_pct_mean,
      count(ambient_humidity_pct)::bigint as ambient_humidity_pct_count,
      avg(vpd_kpa) as vpd_kpa_mean,
      count(vpd_kpa)::bigint as vpd_kpa_count
    from samples
    group by local_day
  ),
  high_hum as (
    select
      local_day as day,
      count(distinct local_hour)::bigint as high_humidity_hours
    from samples
    where ambient_humidity_pct is not null
      and ambient_humidity_pct >= p_humidity_threshold
    group by local_day
  )
  select
    b.day,
    b.sample_count,
    b.coverage_hours,
    b.moisture_pct_min,
    b.moisture_pct_max,
    b.moisture_pct_mean,
    b.moisture_pct_count,
    b.ph_min,
    b.ph_max,
    b.ph_mean,
    b.ph_count,
    b.soil_temp_c_min,
    b.soil_temp_c_max,
    b.soil_temp_c_mean,
    b.soil_temp_c_count,
    b.ambient_temp_c_min,
    b.ambient_temp_c_max,
    b.ambient_temp_c_mean,
    b.ambient_temp_c_count,
    b.ambient_humidity_pct_min,
    b.ambient_humidity_pct_max,
    b.ambient_humidity_pct_mean,
    b.ambient_humidity_pct_count,
    b.vpd_kpa_mean,
    b.vpd_kpa_count,
    case
      when b.ambient_temp_c_min is null or b.ambient_temp_c_max is null
      then null
      else greatest(
        0::numeric,
        ((b.ambient_temp_c_max + b.ambient_temp_c_min) / 2.0) - p_gdd_base_c
      )
    end as gdd_day,
    coalesce(h.high_humidity_hours, 0)::bigint as high_humidity_hours,
    (b.coverage_hours < 18) as incomplete
  from day_base b
  left join high_hum h on h.day = b.day
  order by b.day asc;
$$;

comment on function device_daily_aggregates(uuid, timestamptz, timestamptz, numeric, numeric) is
  'Per device-local calendar day aggregates for Reports and cumulative GDD. '
  'incomplete=true when coverage_hours < 18. Pass crop gdd_base_c from '
  'CROP_PROFILES via p_gdd_base_c.';

revoke all on function device_daily_aggregates(uuid, timestamptz, timestamptz, numeric, numeric)
  from public;
grant execute on function device_daily_aggregates(uuid, timestamptz, timestamptz, numeric, numeric)
  to service_role;
