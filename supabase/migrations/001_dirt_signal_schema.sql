-- Dirt Signal initial schema (apply via Supabase SQL editor or CLI)
create table devices (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  location text,
  created_at timestamptz default now()
);

create table sensor_readings (
  id bigint generated always as identity primary key,
  device_id uuid references devices(id),
  recorded_at timestamptz not null default now(),
  moisture_raw int,
  moisture_pct numeric(5,2),
  soil_temp_c numeric(4,1),
  ambient_temp_c numeric(4,1),
  ambient_humidity_pct numeric(5,2),
  ph numeric(4,2),
  ec_us_cm int,
  npk_n_est int,
  npk_p_est int,
  npk_k_est int
);

create index on sensor_readings (device_id, recorded_at desc);

create table soil_tests (
  id bigint generated always as identity primary key,
  device_id uuid references devices(id),
  tested_at timestamptz not null,
  ph_strip numeric(3,1),
  n_level text check (n_level in ('depleted','low','medium','high','surplus')),
  p_level text check (p_level in ('depleted','low','medium','high','surplus')),
  k_level text check (k_level in ('depleted','low','medium','high','surplus')),
  notes text
);

create table predictions (
  id bigint generated always as identity primary key,
  device_id uuid references devices(id),
  predicted_at timestamptz default now(),
  model_version text not null,
  n_pred text, p_pred text, k_pred text,
  confidence numeric(4,3),
  input_reading_id bigint references sensor_readings(id)
);

insert into devices (name, location) values ('pi-garden-01', 'back bed, tomato row');
