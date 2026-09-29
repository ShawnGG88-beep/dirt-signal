-- Migration 013: precomputed daily weather advisories digest.
-- Apply via Supabase SQL editor or MCP execute_sql after 012.
-- Idempotent: safe to re-run.

-- ---------------------------------------------------------------------------
-- device_advisories_daily (written by advisories-daily-sync Edge Function)
-- ---------------------------------------------------------------------------
create table if not exists device_advisories_daily (
  id bigint generated always as identity primary key,
  device_id uuid not null references devices(id),
  computed_at timestamptz not null default now(),
  digest jsonb not null,
  unique (device_id, computed_at)
);

create index if not exists device_advisories_daily_device_computed_idx
  on device_advisories_daily (device_id, computed_at desc);

comment on table device_advisories_daily is
  'Precomputed daily weather advisory digest (Parts A-F). Written by '
  'advisories-daily-sync; read by desktop and web Reports.';

comment on column device_advisories_daily.computed_at is
  'When the Edge Function finished computing this digest row.';

comment on column device_advisories_daily.digest is
  'Full digest JSON: spray_window, capture_suggestion, tomato block, etc.';

alter table device_advisories_daily enable row level security;

revoke all on table device_advisories_daily from anon, authenticated;

grant select on device_advisories_daily to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'device_advisories_daily'
      and policyname = 'authenticated can read device advisories daily'
  ) then
    create policy "authenticated can read device advisories daily"
      on device_advisories_daily for select to authenticated
      using (true);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Verification (run after applying)
-- ---------------------------------------------------------------------------
-- select relname, relrowsecurity from pg_class
-- where relnamespace = 'public'::regnamespace
--   and relname = 'device_advisories_daily';
--
-- select indexname from pg_indexes
-- where schemaname = 'public' and tablename = 'device_advisories_daily';
--
-- select policyname, cmd, roles from pg_policies
-- where schemaname = 'public' and tablename = 'device_advisories_daily';

-- ---------------------------------------------------------------------------
-- pg_cron schedule (manual — do not run automatically)
-- ---------------------------------------------------------------------------
-- Enable pg_cron and pg_net in the Supabase Dashboard first.
-- Invoke advisories-daily-sync once manually and confirm rows before scheduling.
--
-- select cron.schedule(
--   'advisories-daily-sync-hourly',
--   '15 * * * *',
--   $$
--   select net.http_post(
--     url := 'https://jrrrwukcasaqyqaidrme.supabase.co/functions/v1/advisories-daily-sync',
--     headers := jsonb_build_object(
--       'Content-Type', 'application/json',
--       'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
--     ),
--     body := '{}'::jsonb
--   );
--   $$
-- );
