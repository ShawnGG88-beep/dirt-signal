-- Migration 015: per-device soil moisture depletion anchors (HW-390 relative
-- saturation percent, not ADC counts and not volumetric water content).
-- Apply via Supabase SQL editor or MCP after 014.
-- Idempotent: safe to re-run.
--
-- Grape moisture scoring has no fixed percentage band (tension guidance is
-- soil-texture dependent). Depletion is scored against these two user-
-- measured anchors instead. Until both are populated, moisture stays
-- unscored (unknown / needs field calibration). Tomato keeps its existing
-- moisture band and does not use these columns for scoring.

alter table devices
  add column if not exists soil_field_capacity_raw numeric(5,2)
  check (
    soil_field_capacity_raw is null
    or (
      soil_field_capacity_raw >= 0
      and soil_field_capacity_raw <= 100
    )
  );

alter table devices
  add column if not exists soil_refill_point_raw numeric(5,2)
  check (
    soil_refill_point_raw is null
    or (
      soil_refill_point_raw >= 0
      and soil_refill_point_raw <= 100
    )
  );

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'devices_soil_anchors_ordered'
  ) then
    alter table devices
      add constraint devices_soil_anchors_ordered
      check (
        soil_field_capacity_raw is null
        or soil_refill_point_raw is null
        or soil_field_capacity_raw > soil_refill_point_raw
      );
  end if;
end $$;

comment on column devices.soil_field_capacity_raw is
  'HW-390 relative saturation percent (0-100) measured at field capacity '
  'for this device and soil, via the three-day post-irrigation plateau '
  'method. Not ADC raw counts and not volumetric water content (VWC). '
  'See docs/soil-moisture-calibration.md. Re-measure if the probe moves '
  'to different soil.';

comment on column devices.soil_refill_point_raw is
  'HW-390 relative saturation percent (0-100) at which irrigation should '
  'be triggered for this device and soil. Grower-chosen; published grape '
  'guidance is in soil water tension (-30 to -50 centibars by soil type) '
  'and cannot be derived by the code. Must be strictly less than '
  'soil_field_capacity_raw when both are set.';

grant update (
  crop_type,
  lifecycle_stage,
  season_start_date,
  soil_texture,
  cultivar,
  soil_field_capacity_raw,
  soil_refill_point_raw
) on devices to authenticated;
