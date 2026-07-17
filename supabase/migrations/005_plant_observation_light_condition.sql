-- Tag each plant observation with the lighting context at capture time.
-- Required for any future NDVI-style proxy: grow lights emit negligible NIR,
-- so grow-light and daylight images are not comparable. Untagged history
-- cannot be corrected later.
alter table plant_observations
  add column light_condition text not null default 'unknown'
  check (light_condition in ('natural', 'grow_light', 'mixed', 'unknown'));

comment on column plant_observations.light_condition is
  'Lighting at capture: natural, grow_light, mixed, or unknown. Manual tag for now.';
