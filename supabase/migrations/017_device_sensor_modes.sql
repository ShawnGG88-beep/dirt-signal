-- Migration 017: expose collector sensor *_mode flags on devices.
-- Source of truth remains pi-collector/config.yaml; the collector writes
-- these columns on startup so desktop/web can mark Simulated tiles.
-- Idempotent: safe to re-run.

alter table devices
  add column if not exists moisture_mode text
  check (moisture_mode is null or moisture_mode in ('mock', 'real'));

alter table devices
  add column if not exists ph_mode text
  check (ph_mode is null or ph_mode in ('mock', 'real'));

alter table devices
  add column if not exists ds18b20_mode text
  check (ds18b20_mode is null or ds18b20_mode in ('mock', 'real'));

alter table devices
  add column if not exists dht22_mode text
  check (dht22_mode is null or dht22_mode in ('mock', 'real'));

alter table devices
  add column if not exists npk_mode text
  check (npk_mode is null or npk_mode in ('mock', 'real'));

comment on column devices.moisture_mode is
  'Collector config moisture_mode (mock|real). Null until collector reports.';
comment on column devices.ph_mode is
  'Collector config ph_mode (mock|real). Null until collector reports.';
comment on column devices.ds18b20_mode is
  'Collector config ds18b20_mode (mock|real). Null until collector reports.';
comment on column devices.dht22_mode is
  'Collector config dht22_mode (mock|real). Null until collector reports.';
comment on column devices.npk_mode is
  'Collector config npk_mode (mock|real). Null until collector reports.';

-- Authenticated clients already SELECT * / selected columns on devices.
-- Grant explicit column access for the profile update grant pattern.
grant select (
  moisture_mode,
  ph_mode,
  ds18b20_mode,
  dht22_mode,
  npk_mode
) on devices to authenticated;
