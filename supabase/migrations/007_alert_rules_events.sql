-- Alerting layer: stateful rules and firing history.
-- Apply via Supabase SQL editor or CLI after 006.
--
-- Design notes:
--   enabled=true, notify=false is shadow mode (default). Rules evaluate and
--   record firings without producing desktop notifications until the user
--   promotes notify after observing behaviour against real data.
--   Alerts are stateful: one open row per (rule, device, metric) until clear.

create table alert_rules (
  id uuid primary key default gen_random_uuid(),
  device_id uuid null references devices(id),
  rule_type text not null
    check (rule_type in (
      'frost_risk',
      'sustained_out_of_bounds',
      'approaching_bound',
      'collector_silence',
      'irrigation_due',
      'disease_pressure'
    )),
  enabled boolean not null default true,
  notify boolean not null default false,
  params jsonb not null default '{}'::jsonb,
  snoozed_until timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table alert_rules is
  'Alert rule definitions. device_id null means the rule applies to all devices.';

comment on column alert_rules.enabled is
  'When true the rule is evaluated. Independent of notify (shadow mode).';

comment on column alert_rules.notify is
  'When false (shadow mode default) firings are recorded but not notified. '
  'Promote only after observing real-data behaviour.';

comment on column alert_rules.params is
  'Rule-specific thresholds plus shared hysteresis keys '
  '(consecutive_n, clear_m, deadband_frac, refire_hours).';

create table alert_events (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references alert_rules(id),
  device_id uuid not null references devices(id),
  opened_at timestamptz not null,
  closed_at timestamptz null,
  severity text not null
    check (severity in ('info', 'warning', 'critical')),
  metric_key text null,
  trigger_value numeric null,
  message text not null,
  notified boolean not null default false,
  acknowledged_at timestamptz null,
  ack_note text null
);

comment on table alert_events is
  'Stateful alert firings. Open while closed_at is null; acknowledge suppresses '
  'notification but does not close the alert.';

comment on column alert_events.notified is
  'True once a desktop OS notification has been delivered for this firing.';

create index alert_events_device_opened_at_idx
  on alert_events (device_id, opened_at desc);

create index alert_events_open_idx
  on alert_events (device_id, rule_id)
  where closed_at is null;

-- Idempotent opens: at most one open row per rule/device/metric.
create unique index alert_events_one_open_unique
  on alert_events (rule_id, device_id, coalesce(metric_key, ''))
  where closed_at is null;

create index alert_rules_device_id_idx
  on alert_rules (device_id);

create index alert_rules_rule_type_idx
  on alert_rules (rule_type);

-- Match sibling Dirt Signal tables: RLS on, no anon policies.
-- Sidecar uses the service role key, which bypasses RLS.
alter table alert_rules enable row level security;
alter table alert_events enable row level security;

-- Seed global rules (device_id null). All shadow mode except approaching_bound
-- which ships disabled entirely (most likely to be noisy).
insert into alert_rules (device_id, rule_type, enabled, notify, params) values
  (
    null,
    'frost_risk',
    true,
    false,
    '{
      "threshold_c": 2.0,
      "horizon_hours": 3,
      "consecutive_n": 3,
      "clear_m": 3,
      "deadband_frac": 0.05,
      "refire_hours": 6
    }'::jsonb
  ),
  (
    null,
    'sustained_out_of_bounds',
    true,
    false,
    '{
      "consecutive_n": 3,
      "clear_m": 3,
      "deadband_frac": 0.05,
      "refire_hours": 6
    }'::jsonb
  ),
  (
    null,
    'approaching_bound',
    false,
    false,
    '{
      "consecutive_n": 3,
      "clear_m": 3,
      "deadband_frac": 0.05,
      "refire_hours": 6
    }'::jsonb
  ),
  (
    null,
    'collector_silence',
    true,
    false,
    '{
      "refire_hours": 6
    }'::jsonb
  ),
  (
    null,
    'irrigation_due',
    true,
    false,
    '{
      "lead_hours": 12,
      "consecutive_n": 3,
      "clear_m": 3,
      "deadband_frac": 0.05,
      "refire_hours": 6
    }'::jsonb
  ),
  (
    null,
    'disease_pressure',
    true,
    false,
    '{
      "threshold_hours": 6,
      "humidity_threshold_pct": 85,
      "consecutive_n": 3,
      "clear_m": 3,
      "deadband_frac": 0.05,
      "refire_hours": 6
    }'::jsonb
  );
