-- Migration 012: tomato weather advisories (DSV state, soil texture, alert rules).
-- Apply via Supabase SQL editor or MCP execute_sql after 011.
-- Idempotent: safe to re-run.

-- ---------------------------------------------------------------------------
-- device_disease_dsv (TOM-CAST / Wallin accumulator persistence)
-- ---------------------------------------------------------------------------
create table if not exists device_disease_dsv (
  device_id uuid not null references devices(id),
  disease_key text not null
    check (disease_key in ('early_blight', 'late_blight')),
  accumulated_dsv numeric not null default 0,
  threshold numeric not null default 15,
  last_computed_day date,
  spray_recommended boolean not null default false,
  last_reset_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (device_id, disease_key)
);

comment on table device_disease_dsv is
  'Persisted disease severity value accumulators for tomato blight rules. '
  'Written by the alert engine (service role). last_computed_day is the '
  'last committed closed local day; open days are never double-counted.';

alter table device_disease_dsv enable row level security;

revoke all on table device_disease_dsv from anon, authenticated;
grant select on device_disease_dsv to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'device_disease_dsv'
      and policyname = 'authenticated can read device disease dsv'
  ) then
    create policy "authenticated can read device disease dsv"
      on device_disease_dsv for select to authenticated
      using (true);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- devices.soil_texture (moisture stability / depletion bands)
-- ---------------------------------------------------------------------------
alter table devices
  add column if not exists soil_texture text
  check (
    soil_texture is null
    or soil_texture in ('sand', 'sandy_loam', 'loam', 'clay')
  );

comment on column devices.soil_texture is
  'Placeholder soil texture for depletion trigger bands. Needs translation '
  'to HW-390 calibration curve before field use.';

grant update (crop_type, lifecycle_stage, season_start_date, soil_texture)
  on devices to authenticated;

-- ---------------------------------------------------------------------------
-- Extend alert_rules.rule_type CHECK
-- ---------------------------------------------------------------------------
alter table alert_rules drop constraint if exists alert_rules_rule_type_check;

alter table alert_rules add constraint alert_rules_rule_type_check
  check (rule_type in (
    'frost_risk',
    'sustained_out_of_bounds',
    'approaching_bound',
    'collector_silence',
    'irrigation_due',
    'disease_pressure',
    'forecast_chill_risk',
    'tomato_early_blight',
    'tomato_late_blight',
    'tomato_powdery_mildew',
    'tomato_moisture_cracking'
  ));

-- Seed new global rules (shadow mode). Skip if already present.
insert into alert_rules (device_id, rule_type, enabled, notify, params)
select null, v.rule_type, true, false, v.params::jsonb
from (values
  (
    'forecast_chill_risk',
    '{"consecutive_n": 1, "clear_m": 1, "deadband_frac": 0.05, "refire_hours": 6}'
  ),
  (
    'tomato_early_blight',
    '{"dsv_threshold": 15, "consecutive_n": 1, "clear_m": 1, "deadband_frac": 0.05, "refire_hours": 24}'
  ),
  (
    'tomato_late_blight',
    '{"dsv_threshold": 15, "consecutive_n": 1, "clear_m": 1, "deadband_frac": 0.05, "refire_hours": 24}'
  ),
  (
    'tomato_powdery_mildew',
    '{"consecutive_n": 2, "clear_m": 2, "deadband_frac": 0.05, "refire_hours": 12}'
  ),
  (
    'tomato_moisture_cracking',
    '{"dry_streak_days": 3, "precip_prob_pct": 50, "precip_mm": 5, "consecutive_n": 1, "clear_m": 1, "deadband_frac": 0.05, "refire_hours": 12}'
  )
) as v(rule_type, params)
where not exists (
  select 1 from alert_rules ar
  where ar.device_id is null and ar.rule_type = v.rule_type
);
