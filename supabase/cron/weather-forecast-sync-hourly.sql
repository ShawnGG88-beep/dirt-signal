-- Manual setup: hourly weather-forecast-sync via pg_cron + pg_net + Vault.
-- Run these yourself in the Supabase SQL editor after enabling extensions.
-- Do not paste the service role key into git or chat logs.

-- ---------------------------------------------------------------------------
-- 0. Extensions (once per project)
-- ---------------------------------------------------------------------------
-- create extension if not exists pg_cron with schema pg_catalog;
-- create extension if not exists pg_net with schema extensions;
-- create extension if not exists supabase_vault with schema vault;

-- ---------------------------------------------------------------------------
-- 1. Store the service role key in Vault (once)
--    Replace YOUR_SERVICE_ROLE_KEY with the project service_role secret.
-- ---------------------------------------------------------------------------
-- select vault.create_secret(
--   'YOUR_SERVICE_ROLE_KEY',
--   'service_role_key',
--   'Supabase service role JWT for Edge Function cron invokes'
-- );

-- If the named secret already exists, update instead:
-- select vault.update_secret(
--   (select id from vault.secrets where name = 'service_role_key'),
--   'YOUR_SERVICE_ROLE_KEY',
--   'service_role_key',
--   'Supabase service role JWT for Edge Function cron invokes'
-- );

-- ---------------------------------------------------------------------------
-- 2. Schedule hourly invoke (top of each hour, UTC)
-- ---------------------------------------------------------------------------
-- select cron.unschedule('weather-forecast-sync-hourly'); -- optional reset

select cron.schedule(
  'weather-forecast-sync-hourly',
  '0 * * * *',
  $$
  select net.http_post(
    url := 'https://jrrrwukcasaqyqaidrme.supabase.co/functions/v1/weather-forecast-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization',
        'Bearer ' || (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'service_role_key'
          limit 1
        )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  ) as request_id;
  $$
);

-- ---------------------------------------------------------------------------
-- 3. Confirm the job is registered
-- ---------------------------------------------------------------------------
-- select jobid, jobname, schedule, active, command
-- from cron.job
-- where jobname = 'weather-forecast-sync-hourly';

-- ---------------------------------------------------------------------------
-- 4. Check recent runs (cron.job_run_details)
-- ---------------------------------------------------------------------------
-- select
--   d.jobid,
--   j.jobname,
--   d.runid,
--   d.job_pid,
--   d.database,
--   d.username,
--   d.command,
--   d.status,
--   d.return_message,
--   d.start_time,
--   d.end_time
-- from cron.job_run_details d
-- left join cron.job j on j.jobid = d.jobid
-- where j.jobname = 'weather-forecast-sync-hourly'
--    or d.command ilike '%weather-forecast-sync%'
-- order by d.start_time desc
-- limit 20;

-- ---------------------------------------------------------------------------
-- 5. After a successful sync, confirm fresh forecast rows
-- ---------------------------------------------------------------------------
-- select
--   count(*)::int as hourly_rows,
--   max(fetched_at) as latest_fetched,
--   count(*) filter (where weather_code is not null)::int as with_weather_code,
--   count(*) filter (where wind_gusts_10m is not null)::int as with_gusts,
--   count(*) filter (where cape is not null)::int as with_cape
-- from weather_forecast;
--
-- select count(*)::int as daily_rows, max(fetched_at) as latest_daily_fetched
-- from weather_forecast_daily;
