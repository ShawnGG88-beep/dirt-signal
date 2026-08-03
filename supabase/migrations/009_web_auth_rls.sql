-- Migration 009: web dashboard access security and collector interval.
-- Apply via Supabase SQL editor or CLI after 008.
--
-- The web dashboard talks to Supabase directly using the publishable (anon)
-- key plus Supabase Auth with a single email/password user. Policies target
-- the authenticated role with no ownership predicate: this is a single-user
-- deployment, so every signed-in session is the owner. Add per-user
-- predicates before this ever becomes multi-user.
--
-- The Pi collector and the FastAPI sidecar authenticate with the service
-- role key, which bypasses RLS and is untouched by the revokes below (they
-- target only anon and authenticated). Their behaviour must not change.
--
-- Verification queries live at the bottom of this file as comments.

-- ---------------------------------------------------------------------------
-- devices.collector_interval_seconds
-- ---------------------------------------------------------------------------
-- Single source of truth for the collector cadence, replacing the
-- COLLECTOR_INTERVAL_SECONDS env var as the primary source. The sidecar's
-- GET /health and the web dashboard both read this row and derive staleness
-- as 2x interval. Default 30 matches pi-collector/config.yaml.
alter table devices
  add column if not exists collector_interval_seconds integer not null default 30
  check (collector_interval_seconds >= 1);

comment on column devices.collector_interval_seconds is
  'Collector read cadence in seconds (mirror pi-collector read_interval_seconds). '
  'Desktop and web derive reading staleness as 2x this value.';

-- ---------------------------------------------------------------------------
-- Enable RLS on the tables created before the RLS-on pattern was adopted
-- ---------------------------------------------------------------------------
-- 001 predates the convention used by 002/006/007. Service role bypasses RLS,
-- so the collector and sidecar are unaffected.
alter table devices enable row level security;
alter table sensor_readings enable row level security;
alter table soil_tests enable row level security;
alter table predictions enable row level security;

-- predictions intentionally gets no policies and no grants: the ML endpoints
-- are stubs and nothing reads or writes it with the publishable key.

-- ---------------------------------------------------------------------------
-- Privileges: strip the defaults, then grant exactly what the web views need
-- ---------------------------------------------------------------------------
-- Supabase grants broad privileges to anon and authenticated by default.
-- The web app signs in, so anon needs no table access at all (auth endpoints
-- do not require table grants). Column-level update grants keep writes
-- scoped even though RLS predicates are permissive for the single user.
revoke all on table
  devices,
  sensor_readings,
  soil_tests,
  predictions,
  plant_events,
  plant_observations,
  alert_rules,
  alert_events
from anon, authenticated;

-- devices: selector + profile drawer. Profile editing touches only crop,
-- stage and season start; name, timezone and interval stay service-role only.
grant select on devices to authenticated;
grant update (crop_type, lifecycle_stage, season_start_date)
  on devices to authenticated;

-- sensor_readings: charts and live cards. Read only; the Pi writes.
grant select on sensor_readings to authenticated;

-- soil_tests: soil tests view plus the strip-result entry form.
grant select, insert on soil_tests to authenticated;

-- plant_events: annotation layer with log, edit and delete. Inserts stamp
-- device_id, source and profile provenance; edits touch only the fields the
-- edit form exposes, so device_id, source and the provenance stamps are
-- immutable once written.
grant select, insert, delete on plant_events to authenticated;
grant update (occurred_at, event_type, quantity, quantity_unit, note)
  on plant_events to authenticated;

-- plant_observations: gallery is read only; the Pi writes.
grant select on plant_observations to authenticated;

-- alert_rules: enable/disable, promote/demote notify, snooze. params stays
-- service-role only because no view edits it.
grant select on alert_rules to authenticated;
grant update (enabled, notify, snoozed_until, updated_at)
  on alert_rules to authenticated;

-- alert_events: acknowledge and mark-notified. Opening and closing alerts
-- belongs to the engine (service role).
grant select on alert_events to authenticated;
grant update (acknowledged_at, ack_note, notified)
  on alert_events to authenticated;

-- ---------------------------------------------------------------------------
-- Policies (authenticated only; single-user deployment, see header)
-- ---------------------------------------------------------------------------
create policy "authenticated can read devices"
  on devices for select to authenticated
  using (true);

create policy "authenticated can update device profile"
  on devices for update to authenticated
  using (true) with check (true);

create policy "authenticated can read sensor readings"
  on sensor_readings for select to authenticated
  using (true);

create policy "authenticated can read soil tests"
  on soil_tests for select to authenticated
  using (true);

create policy "authenticated can log soil tests"
  on soil_tests for insert to authenticated
  with check (true);

create policy "authenticated can read plant events"
  on plant_events for select to authenticated
  using (true);

create policy "authenticated can log plant events"
  on plant_events for insert to authenticated
  with check (true);

create policy "authenticated can edit plant events"
  on plant_events for update to authenticated
  using (true) with check (true);

create policy "authenticated can delete plant events"
  on plant_events for delete to authenticated
  using (true);

create policy "authenticated can read plant observations"
  on plant_observations for select to authenticated
  using (true);

create policy "authenticated can read alert rules"
  on alert_rules for select to authenticated
  using (true);

create policy "authenticated can update alert rules"
  on alert_rules for update to authenticated
  using (true) with check (true);

create policy "authenticated can read alert events"
  on alert_events for select to authenticated
  using (true);

create policy "authenticated can acknowledge alert events"
  on alert_events for update to authenticated
  using (true) with check (true);

-- ---------------------------------------------------------------------------
-- Daily aggregates function
-- ---------------------------------------------------------------------------
-- 008 revoked execute from public and granted it to service_role only. The
-- function is security invoker (language sql, no definer), so it reads
-- devices and sensor_readings as the caller and the select policies above
-- gate the rows.
grant execute on function device_daily_aggregates(uuid, timestamptz, timestamptz, numeric, numeric)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Verification (run manually after applying; expected results in comments)
-- ---------------------------------------------------------------------------
-- 1. Every application table has RLS enabled:
--    select relname, relrowsecurity from pg_class
--    where relnamespace = 'public'::regnamespace and relkind = 'r'
--    order by relname;
--    Expect relrowsecurity = true for all eight tables.
--
-- 2. Policies match this file:
--    select tablename, policyname, cmd, roles from pg_policies
--    where schemaname = 'public' order by tablename, policyname;
--    Expect 14 rows, all with roles = {authenticated}.
--
-- 3. anon holds no table privileges:
--    select table_name, privilege_type from information_schema.role_table_grants
--    where grantee = 'anon' and table_schema = 'public';
--    Expect zero rows.
--
-- 4. Column-scoped updates:
--    select table_name, column_name from information_schema.column_privileges
--    where grantee = 'authenticated' and privilege_type = 'UPDATE'
--      and table_schema = 'public'
--    order by table_name, column_name;
--    Expect exactly: alert_events (ack_note, acknowledged_at, notified),
--    alert_rules (enabled, notify, snoozed_until, updated_at),
--    devices (crop_type, lifecycle_stage, season_start_date),
--    plant_events (event_type, note, occurred_at, quantity, quantity_unit).
--
-- 5. Service role paths still work: insert a sensor reading with the service
--    key (or wait one collector cycle) and confirm the sidecar's
--    GET /readings/latest returns it.
