-- Reading provenance for honest History after a device crop/stage change.
-- Apply via Supabase SQL editor or CLI after 003.
--
-- Without these columns, changing a device from tomato to grape retroactively
-- re-scores all historical tomato readings against grape bounds, which is
-- misleading. We score each reading against the profile that was actually in
-- effect when it was taken.
--
-- Existing rows stay NULL. When NULL, the app falls back to the device's
-- current crop_type for scoring and shows a "profile unknown for this period"
-- note rather than pretending the reading was always the current crop.

alter table sensor_readings
  add column if not exists crop_type_at_reading text,
  add column if not exists lifecycle_stage_at_reading text;

comment on column sensor_readings.crop_type_at_reading is
  'Crop profile key in effect when this reading was taken. Nullable for rows written before provenance stamping; NULL means profile unknown for that period.';

comment on column sensor_readings.lifecycle_stage_at_reading is
  'Lifecycle stage in effect when this reading was taken. Nullable for the same reason as crop_type_at_reading.';
