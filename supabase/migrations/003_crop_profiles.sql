-- Crop profiles and probe-depth comparability
-- Apply via Supabase SQL editor or CLI after 001 and 002.

-- devices: which crop profile and lifecycle stage drive scoring
alter table devices
  add column if not exists crop_type text not null default 'tomato',
  add column if not exists lifecycle_stage text not null default 'mature';

comment on column devices.crop_type is
  'Crop profile key: tomato | grape_table | grape_wine. Split by production goal and lifecycle stage, never by cultivar.';

comment on column devices.lifecycle_stage is
  'Lifecycle stage within the crop profile, e.g. mature | establishment. Lookups fall back to (tomato, mature).';

-- sensor_readings: probe depth required for cross-time / cross-site comparison
-- Rosen 2014 reports soil K of 250 ppm at 0-3 inches falling to 95 ppm at 3-8 inches,
-- a 2.6x change over five inches. Gonzalez-Maldonado et al. 2026 found every soil
-- indicator higher at 0-10 cm than 10-20 cm. Readings without a recorded probe depth
-- are not comparable across time or sites. Existing rows stay NULL; do not guess.
alter table sensor_readings
  add column if not exists probe_depth_cm numeric;

comment on column sensor_readings.probe_depth_cm is
  'Probe insertion depth in centimetres. Nullable by design: backfill existing rows as NULL rather than guessing. Depth stratification can change nutrient readings by more than 2x over a few inches (Rosen 2014; Gonzalez-Maldonado et al. 2026).';
