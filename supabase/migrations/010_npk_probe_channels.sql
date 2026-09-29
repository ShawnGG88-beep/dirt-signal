-- 7-in-1 RS485 NPK probe also reports moisture, temperature, and pH.
-- Apply via Supabase SQL editor or CLI after 009, before deploying a
-- collector that inserts these columns.
--
-- Dedicated probes keep owning moisture_pct, soil_temp_c, and ph.
-- These columns store the NPK sensor's own copies so the two instruments
-- can be compared. Existing rows stay NULL; do not guess.

alter table sensor_readings
  add column if not exists npk_moisture_pct numeric(5,2),
  add column if not exists npk_temp_c numeric(4,1),
  add column if not exists npk_ph numeric(4,2);

comment on column sensor_readings.npk_moisture_pct is
  'Moisture % from the 7-in-1 RS485 NPK probe, distinct from moisture_pct (HW-390). Nullable for rows written before this sensor.';

comment on column sensor_readings.npk_temp_c is
  'Temperature °C from the 7-in-1 RS485 NPK probe, distinct from soil_temp_c (DS18B20). Nullable for rows written before this sensor.';

comment on column sensor_readings.npk_ph is
  'pH from the 7-in-1 RS485 NPK probe, distinct from ph (analog probe / uncalibrated voltage). Nullable for rows written before this sensor.';
