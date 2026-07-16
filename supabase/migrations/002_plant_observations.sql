-- Plant camera observations (local image path + NDVI estimate; image stays on device)
create table plant_observations (
  id bigint generated always as identity primary key,
  device_id uuid references devices(id),
  captured_at timestamptz not null default now(),
  image_path text,
  ndvi_estimate numeric(4,3),
  health_label text,
  notes text
);

create index on plant_observations (device_id, captured_at desc);

alter table plant_observations enable row level security;
