-- Migration 014: grape_wine cultivar (nullable sibling of crop_type).
-- Apply via Supabase SQL editor or MCP after 013.
-- Idempotent: safe to re-run.
--
-- Nutrient scoring stays on crop_type (Zhao et al. 2019: no significant
-- variety differences in soil OM / available nutrients). Cultivar selects
-- phenology, frost and water-stress *reference* data only. Null keeps the
-- shared GDD bands used before this column existed.

alter table devices
  add column if not exists cultivar text
  check (
    cultivar is null
    or cultivar in ('chardonnay', 'pinot_noir', 'cabernet_sauvignon')
  );

comment on column devices.cultivar is
  'Wine-grape cultivar for phenology, frost and water-stress reference data. '
  'Nullable: grape_wine devices with null keep the shared GDD bands. '
  'Not used for tomato or grape_table. Distinct from crop_type.';

grant update (
  crop_type,
  lifecycle_stage,
  season_start_date,
  soil_texture,
  cultivar
) on devices to authenticated;
