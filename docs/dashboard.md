# Dirt Signal — Desktop dashboard

Reference for the in-app telemetry UI: live Dashboard, History, Reports, Alerts,
readings, plant events, alert rules, plant profile, and how status scoring works.

The desktop app is a Tauri shell with a React frontend. Navigation uses **hash
routes** (shareable, deep-linkable):

| Hash | View |
|------|------|
| `#/dashboard` | Live Dashboard |
| `#/history?range=24h` | History (range query) |
| `#/reports?range=30d` | Reports |
| `#/alerts` | Alerts |
| `#/metric/{slug}?range=6h` | Metric detail modal (Dashboard chrome) |

Implementation: `desktop/src/lib/hashRoute.ts`, wired in `desktop/src/App.tsx`.

```
Pi collector  →  Supabase (Postgres)
                      ↑
Tauri + React  ←  FastAPI sidecar (:8731)
                     ├─ readings / devices / events
                     └─ alert engine (background eval ~60s)
```

Default device: `pi-garden-01` (hardcoded in the views today). API base:
`http://127.0.0.1:8731`.

---

## Views at a glance

| View | Purpose | Default window | Source |
|------|---------|----------------|--------|
| **Dashboard** | Live snapshot, band bars, recent events, diagnostics, profile drawer | Latest + last 6h | `desktop/src/views/Dashboard.tsx` |
| **History** | Multi-metric time series + event marker rails | 24h (picker: 6h / 24h / 7d / 30d) | `desktop/src/views/History.tsx` |
| **Reports** | Daily digest: mean, range, flags, day events | 30d | `desktop/src/views/Reports.tsx` |
| **Alerts** | Open firings, rule shadow/notify, history, OS notifications | — | `desktop/src/views/Alerts.tsx` |

Changing the plant profile bumps `profileEpoch` so History and Reports reload.
Logging or editing events bumps `eventsEpoch` for the same reason. Metric detail
is a hash route (`#/metric/…`) overlaid on Dashboard, not a separate nav tab.

---

## Dashboard (live)

### Header / system status

`SystemStatusLine` replaces the old Sidecar + Collector dots:

| State | Meaning |
|-------|---------|
| **Live** | Sidecar healthy and latest reading fresher than the staleness threshold |
| **Degraded** | Health ok but reading stale/missing, or health failing while a recent reading is still in hand |
| **Offline** | Sidecar unreachable |

Also shows device name, reading age, last poll age, and crop/stage (opens the
profile drawer).

**Staleness:** derived from `GET /health` → `collector_interval_seconds` as
**2× interval**. Falls back to **30 minutes** when the field is absent
(`staleAfterMsFromInterval` in `desktop/src/lib/api.ts`).

### Log event

Persistent **Log event** control opens `LogEventForm`: icon-grid type picker,
`occurred_at` defaulting to now (back-datable), optional quantity for irrigation /
fertiliser / harvest, optional note. Submit closes, or submit-and-log-another
keeps the form open. No confirmation dialog — PATCH/DELETE correct mistakes.

### Metric layout (primary / context / diagnostics)

Metrics are tiered in `METRICS` (`desktop/src/lib/metrics.ts`):

| Tier | Metrics | Card behaviour |
|------|---------|----------------|
| **Primary** | Moisture, pH, Soil temp | Large cards: value, **BandPositionBar**, status glyph + text, 6h sparkline, window delta (`↑ / ↓ / →` over 6h) |
| **Context** | Ambient temp, Humidity | Compact cards: value + status |
| **Diagnostic** | Raw ADC (+ EC / N / P / K when present) | Collapsible **Diagnostics** strip — display only, not scored |

Null values render as `n/a` / `—` with status `unknown`.

Primary cards are keyboard-activable (`Enter` / `Space`) with aria labels.
Sparkline fetch failures show an inline **retry** without failing the whole
dashboard. A thin fetch-progress bar indicates in-flight refresh.

### Band position bar

`BandPositionBar` shows where the current value sits relative to the profile band:

- **optimal-band** — in-bounds centre shaded; out-of-bounds either side
- **restraint** — acceptable-below / elevated-above split at the upper watch bound

Position comes from `MetricScore.position` (0 at min, 1 at max) via
`scoreMetricValue`.

### Recent events

Below the metric grid, above Diagnostics: last **5** events with relative ages
(“irrigation, 6h ago”). Each entry opens History on a range that includes that
timestamp (`onOpenHistory`).

### Polling

- Auto-refresh every **30 seconds**
- Manual **Refresh now** in the footer
- Each refresh loads in parallel: health, latest reading, 6h range (limit 120),
  and recent events (limit 5)
- Latest and range errors are separated so a sparkline failure does not blank
  the live values

### Metric detail modal

Open via card click or hash `#/metric/{slug}?range=…`.

- Range presets: **6h / 24h / 7d / 30d** (synced into the hash)
- Time-series chart with profile bands and event marker rail
- Event type filter (persisted per view in `localStorage`)
- Stats: min / max / mean / trend (rising · falling · stable)
- CSV export for the selected window (readings + events section)
- Focus returns to the card that opened the modal on close

Implementation: `desktop/src/components/MetricDetailModal.tsx`

### Plant profile (drawer)

Crop/stage editing lives in a modal drawer opened from the status line (not an
always-visible section).

- Options from `GET /devices/{id}/profile-options`
- Save via `PATCH /devices/{id}/profile`
- Confirm dialog before apply
- Successful profile change also inserts a `stage_change` plant event
  (`source=system`). Event insert failure is logged and does not block the
  profile update.
- Escape / backdrop click closes the drawer
- After save, Dashboard reloads and History/Reports refetch

Crop/stage bounds come from `ml-backend/constants.py` `CROP_PROFILES`, mirrored
in `desktop/src/lib/growingConstants.ts`.

---

## Plant events (annotation layer)

Events are cheap, moment-of-action annotations so sensor traces can be interpreted
against interventions. Readings can be analysed later; events cannot be
reconstructed after the fact.

### Schema (`plant_events`)

| Column | Notes |
|--------|-------|
| `occurred_at` | User-settable (UTC). Distinct from `created_at` for late entries. |
| `event_type` | From shared constant list |
| `quantity` / `quantity_unit` | Optional; only for irrigation, fertiliser, harvest |
| `note` | Optional free text |
| `source` | `manual` or `system` |
| `crop_type_at_event` / `lifecycle_stage_at_event` | Stamped from device profile at insert |

Index: `(device_id, occurred_at desc)`. Migration:
`supabase/migrations/006_plant_events.sql`.

### Event types

Source of truth: `ml-backend/constants.py` `PLANT_EVENT_TYPES`.
Mirror: `desktop/src/lib/eventTypes.ts`.

Notable separations:

- `pest_disease_observation` vs `pest_disease_treatment` — noticing ≠ acting;
  the gap is meaningful.
- `sensor_maintenance` — probe reseat/relocate produces a step change
  indistinguishable from soil change unless annotated.
- `stage_change` — emitted automatically when the device profile is saved.

### API

| Endpoint | Purpose |
|----------|---------|
| `POST /events` | Create (always `source=manual`; stamps crop/stage) |
| `GET /events?device_name=&from_at=&to_at=&types=` | List, newest first |
| `PATCH /events/{id}` | Edit occurred_at, type, quantity, note |
| `DELETE /events/{id}` | Hard delete |

Validation: known `event_type`; `occurred_at` not more than 24h in the future;
quantity null or non-negative.

### Chart markers

`EventMarkerRail` under `TimeSeriesChart` (History + metric detail). One glyph
per event, coloured by type. Markers within ~12px collapse into a count cluster;
click opens `EventDetailPopover` with edit/delete. Type filter persists in
`localStorage` per view key.

Do **not** draw full-height vertical lines — at 30d with regular irrigation they
make the plot unreadable.

### Reports

Each daily row shows that day’s events as compact type glyphs with counts.
CSV export appends a `# --- plant_events ---` section after readings, retaining
the `dirt-signal-report` filename prefix. Events are additive context only —
`dailySummary.ts` scoring/flagging is unchanged.

---

## Alerts

In-app alerting layer (not a 24/7 monitoring service). Rules evaluate while the
desktop app and FastAPI sidecar are running. A frost overnight with the laptop
shut is recorded on next launch but will not notify in time to act.

### Coverage honesty

The Alerts view shows an explicit note: evaluation only while the app/sidecar
runs; continuous coverage (sidecar-as-service or collector-side eval) is future
work.

### Rule types

| Type | Intent | Default mode |
|------|--------|--------------|
| `frost_risk` | Trailing ambient indicator (not a weather forecast) | Shadow |
| `sustained_out_of_bounds` | Consecutive samples outside profile band | Shadow |
| `approaching_bound` | Early-warning near band edge (noisy) | **Disabled** |
| `collector_silence` | No fresh readings beyond expected interval | Shadow |
| `irrigation_due` | Dry-down projection when available | Shadow |
| `disease_pressure` | Leaf-wetness proxy from high-humidity hours | Shadow |

**Shadow mode** = `enabled=true`, `notify=false`: evaluate and record firings
without OS toasts until the user promotes notify after watching real traces.

### Schema

Migration: `supabase/migrations/007_alert_rules_events.sql`.

- `alert_rules` — per-device (or global) rule defs, params JSON, snooze
- `alert_events` — stateful firings; open while `closed_at` is null; at most one
  open row per `(rule, device, metric)`

Acknowledge suppresses notification but does **not** close the alert. It closes
only when the clear condition is met (hysteresis / clear streak).

### Backend engine

- Package: `ml-backend/alerts/` (`engine.py`, `rules.py`, `hysteresis.py`,
  `drydown.py`, `scoring.py`)
- Starts with the FastAPI app lifespan; evaluates on an interval (default ~60s)
- Manual trigger: `POST /alerts/evaluate`
- Unit tests: `ml-backend/tests/test_alert_rules.py`

### API

| Endpoint | Purpose |
|----------|---------|
| `GET /alerts?device_name=&status=open\|all` | List firings |
| `POST /alerts/{id}/acknowledge` | Ack (+ optional note) |
| `POST /alerts/{id}/notified` | Mark OS notification delivered |
| `GET /alerts/rules?device_name=` | List rules |
| `PATCH /alerts/rules/{id}` | Enable/disable, promote notify, snooze |
| `POST /alerts/evaluate` | Run one evaluation pass now |

### Desktop Alerts view

- Open firings with severity, message, ack UI
- Rules list: enable/disable, promote/demote notify, snooze 6h / clear snooze
- History of recent firings
- Poll every 30s; delivers OS notifications for promoted, unacked, not-yet-notified
  alerts via `desktop/src/lib/notifications.ts` (requests permission on load)

---

## Readings

A **sensor reading** is one timestamped sample from the Pi, stored in Supabase
and served by the sidecar.

### Fields (`SensorReading`)

| Field | Meaning |
|-------|---------|
| `recorded_at` | Sample time (ISO) |
| `moisture_raw` | ADC raw value (diagnostics tier) |
| `moisture_pct` | Calibrated moisture % |
| `soil_temp_c` | In-soil temperature |
| `ambient_temp_c` | Air temperature (e.g. DHT) |
| `ambient_humidity_pct` | Air humidity |
| `ph` | Soil pH |
| `ec_us_cm` | Electrical conductivity (diagnostics; often null) |
| `npk_n_est` / `npk_p_est` / `npk_k_est` | Estimated N/P/K (diagnostics; often null) |
| `crop_type_at_reading` | Profile stamped at insert (may be null on older rows) |
| `lifecycle_stage_at_reading` | Stage stamped at insert |

### API endpoints used by the UI

| Endpoint | Used for |
|----------|----------|
| `GET /health` | Sidecar status + `collector_interval_seconds` |
| `GET /readings/latest?device_name=…` | Live card values + current device profile |
| `GET /readings/range?device_name=&from_at=&to_at=&limit=` | Sparklines, History, Reports, detail modal |
| `GET /events?…` | Annotation list for the same window |
| `POST/PATCH/DELETE /events` | Log / correct / remove annotations |
| `GET/PATCH /alerts…` | Alerts view + notifications |
| `GET /devices/{id}/profile-options` | Crop/stage dropdowns |
| `PATCH /devices/{id}/profile` | Save plant profile (+ auto `stage_change` event) |

Client: `desktop/src/lib/api.ts`

- Dashboard range limit: **120**
- History / Reports / detail modal: up to **5000** (`HISTORY_FETCH_LIMIT`)
- Events / alerts list max: **2000**

### Provenance

Newer readings store the crop/stage active at insert time. Older rows may lack
provenance; History shows a note that those samples are scored against the
device’s **current** profile. Charts can segment by profile when provenance is
present. Profile changes also emit `stage_change` events so the annotation rail
marks the same changeover.

---

## History

Small-multiples layout: one panel per metric for the same time window.

- Default range: **24h** (stored in `#/history?range=…`)
- Shared range picker, event type filter, and CSV export
- Charts via `TimeSeriesChart` (Recharts), with optional profile-band overlays,
  profile segmentation, and event marker rails
- Metrics list from `METRICS` in `desktop/src/lib/metrics.ts`

Use History when you want trend shape across metrics, not a single live snapshot.

---

## Reports

Daily digests built client-side from the fetched range (`buildDailySummaries` in
`desktop/src/lib/dailySummary.ts`).

### What each day shows

For each local calendar day in the window:

| Column | Content |
|--------|---------|
| Events | Compact type glyphs + counts for that local day |
| Metric | Label |
| Mean | Average of samples that day |
| Range | Min–max |
| n | Sample count |
| Reference | Profile band or “watch above …” under restraint |
| Flag | ok / out of bounds / elevated (restraint) / n/a |

Day-level badge:

- **within bounds** / **within watch band** — no flags
- **out of bounds** — optimal-band scoring
- **elevated** — restraint scoring (excess vigour risk, not deficiency)

Default range: **30d** (`#/reports?range=…`). CSV export uses prefix
`dirt-signal-report` and includes an events section when any events fall in
range.

### Scoring semantics

| Semantic | Typical crops | Meaning |
|----------|---------------|---------|
| **optimal-band** | e.g. tomato | Values outside min–max are flagged |
| **restraint** | grape stages | Values above the watch band are **elevated** (excess vigour); never treat as “add more N” |

Ambient temperature uses separate **day** (06:00–18:00 local) and **night**
bands when the stage defines them.

N/P/K estimates may appear in summaries without pass/fail until calibrated
against soil-test ground truth. Raw ADC is display-only (not flaggable). Events
never feed scoring. Alert rules use the same profile scoring helpers on the
backend (`ml-backend/alerts/scoring.py`).

### Grape limitations

For grape crops, Reports appends sampling-limitation notes from
`SAMPLING_LIMITATIONS` and any stage-specific warnings (unmeasurable dominant
factors, scale incompatibility, restraint nitrogen advice).

---

## Status colours / glyphs (metric cards)

| Status | Glyph sense | Meaning |
|--------|-------------|---------|
| `ok` | ● | Inside reference / watch band |
| `watch` | ◎ | Near edge / soft warning |
| `warn` / `elevated` | ▲ | Outside band or elevated under restraint |
| `unknown` | — | Missing value, or not yet loaded |

System-level header states (Live / Degraded / Offline) are separate from
per-metric status.

Scoring helpers: `scoreMetricValue`, `getMetricBoundsForProfile`,
`getAmbientBoundsForProfile` in `desktop/src/lib/metrics.ts`.

---

## CSV export

`ExportButton` downloads readings for the active window (History, Reports, and
metric detail modal). When events are present, a delimited `# --- plant_events ---`
section is appended. Useful for offline spreadsheet review or calibration notes.

---

## Not on the dashboard yet

These exist in the plan, collector, or API but are **not** fully productised in
the desktop UI today:

- **Soil Tests** view (API `POST /soil-tests` exists)
- **Model** view (ML train/predict still stubs)
- Camera / plant observation images on the Dashboard
- Multi-device picker (still hardcoded `pi-garden-01`)
- Auth / multi-user
- Configurable API base URL (still `127.0.0.1:8731`)
- Always-on alert evaluation when the desktop app is closed

---

## Key source map

| Concern | Path |
|---------|------|
| App shell / hash nav | `desktop/src/App.tsx`, `desktop/src/lib/hashRoute.ts` |
| Live Dashboard | `desktop/src/views/Dashboard.tsx` |
| History | `desktop/src/views/History.tsx` |
| Reports | `desktop/src/views/Reports.tsx` |
| Alerts | `desktop/src/views/Alerts.tsx` |
| API client + reading/event/alert types | `desktop/src/lib/api.ts` |
| Event type constants (frontend) | `desktop/src/lib/eventTypes.ts` |
| Bounds / metrics / tiers / ranges | `desktop/src/lib/metrics.ts` |
| Crop profiles (frontend) | `desktop/src/lib/growingConstants.ts` |
| Daily report aggregation | `desktop/src/lib/dailySummary.ts` |
| OS notifications | `desktop/src/lib/notifications.ts` |
| System status line | `desktop/src/components/SystemStatusLine.tsx` |
| Band position bar | `desktop/src/components/BandPositionBar.tsx` |
| Log event form | `desktop/src/components/LogEventForm.tsx` |
| Event marker rail / filter | `desktop/src/components/EventMarkerRail.tsx` |
| Event detail / edit | `desktop/src/components/EventDetailPopover.tsx` |
| Plant profile UI | `desktop/src/components/PlantProfileSection.tsx` |
| Detail modal | `desktop/src/components/MetricDetailModal.tsx` |
| Readings API | `ml-backend/routes/readings.py` |
| Events API | `ml-backend/routes/events.py` |
| Alerts API | `ml-backend/routes/alerts.py` |
| Alert engine / rules | `ml-backend/alerts/` |
| Alert rule unit tests | `ml-backend/tests/test_alert_rules.py` |
| Devices / profile API | `ml-backend/routes/devices.py` |
| Crop + event type constants | `ml-backend/constants.py` |
| Schema | `supabase/migrations/006_plant_events.sql`, `007_alert_rules_events.sql` |

---

## Related docs

- Project plan: [`dirt-signal-project-plan.md`](../dirt-signal-project-plan.md)
- Pi collector: [`pi-collector/README.md`](../pi-collector/README.md)
- Root setup: [`README.md`](../README.md)
