# Phase 0 audit: Dirt Signal dashboard redesign

Status: awaiting approval before Phase 1.

Scope: read-only survey of the live monorepo as of this audit. No redesign code, tokens, or migrations were applied.

Naming note: the brief refers to a `pwa/` surface. In this repo the React PWA is `web/` (Vercel). Desktop is `desktop/` (Tauri). Shared UI lives in `shared/` (`@dirt-signal/shared`).

---

## 1. Dashboard component tree and routes

### Architecture

Both shells mount the same shared views. Each registers a `DataClient` at startup:

| Shell | Entry | Data client | Notifications |
| --- | --- | --- | --- |
| Desktop | `desktop/src/main.tsx` → `App.tsx` | `sidecarDataClient` → FastAPI `:8731` | Tauri plugin |
| Web (PWA) | `web/src/main.tsx` → `App.tsx` | `supabaseDataClient` → Supabase Auth + RLS | Web Notifications |

Shared styles: `@dirt-signal/shared/styles/global.css` (imports `tokens.css`). Web adds `web/src/styles/web.css` for mobile chrome.

### Hash routes

Desktop (`shared/src/lib/hashRoute.ts`):

| Hash | View |
| --- | --- |
| `#/dashboard` | Live dashboard |
| `#/history?range=…` | History |
| `#/reports?range=…` | Reports |
| `#/alerts` | Alerts |
| `#/metric/{slug}?range=…` | Metric detail overlay on dashboard chrome |

Web (`web/src/lib/webRoute.ts`) adds:

| Hash | View |
| --- | --- |
| `#/soil-tests` | Soil tests (web only) |
| `#/observations` | Observations gallery (web only) |

There is no `#/settings` route. Theme cycling is a nav control (`ThemeToggle`). Plant profile is a drawer opened from the status line, not a settings page.

### Shell chrome (outside Dashboard)

**Desktop** (`desktop/src/App.tsx`):

- Horizontal nav: Dashboard, History, Reports, Alerts, ThemeToggle
- No device picker (fixed selected-device store, default `pi-garden-01`)
- No auth gate

**Web** (`web/src/App.tsx`):

- Auth gate (`LoginScreen` / config notice)
- `OfflineBanner`
- Mobile drawer nav + desktop horizontal nav
- `DevicePicker`, ThemeToggle, Sign out
- Extra nav items: Soil tests, Observations

### Shared Dashboard tree

Root: `shared/src/views/Dashboard.tsx`

```
Dashboard
├── header
│   ├── h1 "Dirt Signal" + GDD / phenology line
│   └── SystemStatusLine (live / degraded / offline + crop/stage + alert badge)
├── actions: Log event button
├── fetch-progress bar
├── error banner (latest reading)
├── content
│   ├── PrimaryMetricCard[] (moisture, pH, soil temp)
│   │     ├── BandPositionBar
│   │     ├── STATUS_GLYPH + STATUS_TEXT
│   │     └── Sparkline (6h)
│   ├── ContextMetricCard[] (ambient temp, humidity, VPD, dew point)
│   ├── Recent events (last 5 → History)
│   └── DiagnosticsStrip (raw ADC, EC, N/P/K estimates)
├── footer: poll hint + Refresh now
├── Plant profile drawer → PlantProfileSection
├── LogEventForm (modal)
└── MetricDetailModal (when route is #/metric/…)
      ├── TimeSeriesChart
      ├── EventMarkerRail / EventDetailPopover
      ├── RangePicker, ExportButton
```

Data hooks / clients used by Dashboard:

- `fetchHealth`, `fetchLatestReading`, `fetchReadingsRange`, `fetchEvents`, `fetchDailyAggregates`
- `useAlertPoll` (open notify count for status line)
- `useSelectedDeviceName`
- Derived: `dewPointC`, `vapourPressureDeficitKpa`, `projectDrydown`
- Scoring: `scoreMetricForProfile`, crop profile constants, phenology formatters

What Dashboard does **not** include today:

- Weather horizon or any `weather_forecast` fetch
- Advisory digest or consequence lanes
- Status sentence
- Ambient L0 backdrop
- Alerts-while-open notice (that copy lives on the Alerts view)
- Camera tile
- Explicit "Simulated" badges from `config.yaml` mock flags (collector config is not exposed to the UI)

### Where weather appears today

Only on **Reports** (`shared/src/views/Reports.tsx`), as a text block titled "Weather advisories", fed by `fetchLatestAdvisoryDigest`. It prints `spray_window.message`, `capture_suggestion.note`, and (for tomato) chill / moisture headlines. There is no sky band, chart, or raw hourly forecast UI anywhere.

---

## 2. Tokens and hard-coded colours

### Where tokens live

| Path | Role |
| --- | --- |
| `shared/src/styles/tokens.css` | Sole allowed hex/rgba colour literals under app source. Dark default ("night soil") and `[data-theme="light"]` ("field"). |
| `shared/src/styles/global.css` | Consumes `var(--…)` tokens; layout, type, components. |
| `shared/src/lib/theme.ts` | Preference store (`dirt-signal-theme`), `getToken` / `useToken` for Recharts and other non-CSS APIs. |

Current semantic map (dark): `--canvas`, `--surface-1/2`, `--text-primary/secondary/disabled`, `--status-ok/watch/warn/critical/unknown`, `--accent-info`, band/chart/event tokens, muted overlays.

This is **not** the Cellar at dusk palette. Redesign Phase 1 replaces or extends these tokens (`terracotta`, `apricot`, `heather`, `oxblood`, `cellar`, `parchment`, `vine`, etc.).

### Hard-coded colour bypasses

`rg` for `#RRGGBB` under `shared/src`, `desktop/src`, `web/src`:

- Matches **only** `shared/src/styles/tokens.css` (as intended by the file header invariant).
- Exception outside those trees: `web/index.html` meta `theme-color` content `#14140f` (current canvas).

Components do not embed hex. Charts use `getToken` / `useToken`. Event colours go through CSS variables.

### Other style debt relevant to the brief

- **All-caps labels:** `global.css` has many `text-transform: uppercase` rules (nav, metric labels, section eyebrows). Phase 1/4 must remove these for sentence case.
- **No glass / depth layers:** panels are flat `--surface-1` cards, not frosted glass over an L0 sky.
- **No reduce-transparency setting** and no `prefers-reduced-transparency` handling.
- **No `prefers-reduced-motion` rules** found in shared/desktop/web styles.
- Neutral black shadow token (`--shadow: rgba(0, 0, 0, 0.45)`) conflicts with the warm oxblood shadow rule in the brief.

---

## 3. Weather: schema, ingestion, UI, gaps

### Schema (`supabase/migrations/011_weather_forecast.sql`)

Table `weather_forecast`, unique `(device_id, forecast_time)`:

| Column | Notes |
| --- | --- |
| `device_id` | FK → `devices` |
| `fetched_at` | Last upsert time |
| `forecast_time` | Hour this row applies to (UTC) |
| `temperature_2m` | °C |
| `relative_humidity_2m` | % |
| `precipitation` | mm, preceding hour |
| `precipitation_probability` | % |
| `wind_speed_10m` | km/h |
| `cloud_cover` | % |
| `et0_fao_evapotranspiration` | mm, preceding hour (FAO-56) |
| `soil_temperature_0cm` | °C |
| `soil_moisture_0_1cm` | m³/m³ (Open-Meteo `soil_moisture_0_to_1cm`) |
| `source` | `open-meteo` \| `mock` |

RLS: authenticated SELECT only. Written by service role via Edge Function.

No later migration alters this table. Related: `013_advisories_daily.sql` adds `device_advisories_daily`; `012` adds tomato DSV / soil texture / alert rule types.

### What is ingested

`supabase/functions/weather-forecast-sync/index.ts` requests hourly:

```
temperature_2m, relative_humidity_2m, precipitation, precipitation_probability,
wind_speed_10m, cloud_cover, et0_fao_evapotranspiration,
soil_temperature_0cm, soil_moisture_0_to_1cm
```

- `forecast_days: 7`
- Timezone secret default `Africa/Johannesburg`
- Mode: `WEATHER_MODE` = `mock` \| `real`
- Upserts into `weather_forecast` for every device

`ml-backend/weather.py` only **reads** rows for advisory/alert evaluation (`load_forecast_rows`). It does not fetch Open-Meteo.

### DataClient gap

There is **no** `fetchWeatherForecast` (or similar) on `DataClient`. Neither `desktop/src/lib/api.ts` nor `web/src/lib/dataClient.ts` queries `weather_forecast` for the UI. Advisories read forecast server-side; the UI only sees the digest.

### Horizon need vs stored (Open-Meteo names verified against [Open-Meteo forecast docs](https://open-meteo.com/en/docs))

| Horizon need | Open-Meteo name | Stored today? |
| --- | --- | --- |
| Temperature | `temperature_2m` | Yes |
| Relative humidity | `relative_humidity_2m` | Yes |
| Dew point | `dew_point_2m` | **No** |
| Precipitation probability | `precipitation_probability` | Yes |
| Precipitation | `precipitation` | Yes |
| Weather code | `weather_code` | **No** |
| Wind speed | `wind_speed_10m` | Yes |
| Wind gusts | `wind_gusts_10m` | **No** |
| ET0 (FAO) | `et0_fao_evapotranspiration` | Yes |
| VPD | `vapour_pressure_deficit` | **No** (UI VPD today is derived from DHT22 ambient, not forecast) |
| UV index | Daily: `uv_index_max` (not in hourly list) | **No** |
| Is day | `is_day` | **No** |
| CAPE | `cape` | **No** |
| Cloud cover | `cloud_cover` | Yes (useful for sky band) |
| Daily sunrise / sunset | `sunrise`, `sunset` | **No** (need `daily=` request + storage) |
| Daily min / max temp | `temperature_2m_min` / `_max` | **No** (can also aggregate from hourly) |
| Daily precip sum | `precipitation_sum` | **No** (can aggregate from hourly) |

Proposed schema work (list only; **do not apply without approval**): a new migration adding the missing hourly columns (and either daily columns or a companion daily table), keeping `(device_id, forecast_time)` unique for hourly rows. Edge Function `HOURLY_VARS` / optional `daily` params must be updated in lockstep. UV should be treated as **daily max**, not hourly (Open-Meteo free forecast exposes `uv_index_max` under daily).

Storm risk: weather codes for thunderstorm exist; hail-specific codes are regional. Agree with the brief: label the lane "Storm risk" and mark it **provisional**.

---

## 4. Advisories: desktop (sidecar) vs web (Supabase)

### Module inventory

Mirrored across Python (`ml-backend/advisories/`), TypeScript (`shared/src/lib/advisories/`), and Edge (`supabase/functions/_shared/advisories/`):

| Module | Crop scope | In daily digest today? |
| --- | --- | --- |
| `sprayWindow` | Crop-agnostic | Yes (`spray_window`) |
| `captureSchedule` | Crop-agnostic | Yes (`capture_suggestion`) |
| `tomatoChill` | Tomato | Yes, inside `tomato` |
| `tomatoEarlyBlight` / `tomatoLateBlight` (DSV) | Tomato | Yes (disease list) |
| `tomatoPowderyMildew` | Tomato | Yes |
| `tomatoMoistureStability` | Tomato | Yes |
| `climateMerge` / `dsv` / `dsvStore` | Tomato disease plumbing | Supporting |
| `grapeFrost` | Grape cultivar frost **reference tables** | **No** (lookup only; not evaluated into digest windows) |

There are **no** grape downy mildew, grape powdery mildew, or Botrytis advisory modules in the repo. Tomato powdery mildew is Leveillula/Oidium oriented, not vine canopy disease.

There is **no** Hargreaves-Samani module by that name. Water-use related pieces today:

- Forecast `et0_fao_evapotranspiration` (already stored)
- Soil dry-down projection `projectDrydown` in `shared/src/lib/derived.ts` (readings + irrigation events)
- Alert rule `irrigation_due` (sidecar alert engine)

Storm risk is not an advisory module; it would be a UI/derived overlay from `weather_code` + CAPE + gusts once those columns exist.

### Digest shape (`device_advisories_daily.digest`)

```
device_id, crop_type, lifecycle_stage, evaluated_at,
spray_window { found, window_start, window_end, message, provenance },
capture_suggestion { … },
tomato: null | { chill, diseases[], powdery_mildew, moisture }
```

For `grape_wine` devices, digest is spray + capture only (`tomato: null`). Grape frost reference data is not emitted as timed lanes.

### How each surface gets advisories

| Capability | Desktop (sidecar) | Web (PWA / Supabase) |
| --- | --- | --- |
| Read latest precomputed digest | `GET /advisories/latest` → `device_advisories_daily` | Direct select on `device_advisories_daily` via `fetchLatestAdvisoryDigest` |
| Live-compute digest (dev fallback) | `GET /advisories/daily` (`fetchDailyAdvisories`, optional on client) | **Not available** (no sidecar) |
| Compute advisories in the browser | Shared TS modules exist for parity/tests; **UI does not call `buildDailyDigest`** | Same: modules ship in shared, PWA does not run them for the UI |
| Alert rule evaluation (shadow/notify) | Sidecar alert engine (~60s) | Read/ack/manage only; no evaluate |
| Weather forecast rows for overlays | Via Supabase inside sidecar / Edge; not exposed to React yet | Readable under RLS once a DataClient method exists; not used in UI today |

Brief rule for Phase 3: "PWA shows sky band and raw weather; lanes show a single line that advisory overlays are desktop-only." That is a **product choice**, not a hard data limitation: the PWA can already read the same precomputed digest that Reports shows. Recommend clarifying at Phase 3 whether to:

1. Follow the brief strictly (no lanes on web even if digest exists), or
2. Show digest-backed lanes on web when `device_advisories_daily` has a row, and reserve live recompute for desktop.

### Shadow mode and provisional labels

- Alert rules: shadow = `enabled=true`, `notify=false` (documented in Alerts UI and `docs/dashboard.md`).
- Advisory digest UI on Reports does **not** currently show a "Shadow mode" badge.
- Provisional copy exists in advisory constants (e.g. `SPRAY_WIND_DRIFT_PROVENANCE`) and phenology/GDD strings; spray window result includes a `provenance` field that Reports does not surface.
- Northern Hemisphere provisional tags in `growingConstants` / phenology must be preserved in the redesign.

### Alerts-while-open notice

Lives on **Alerts** (`shared/src/views/Alerts.tsx`), not Dashboard. Desktop wording: evaluation only while app + sidecar run. Web wording: no evaluation here. Redesign requires a restyled persistent notice on the **dashboard** IA as well; keep Alerts honesty copy or converge carefully so the non-negotiable is not dropped.

---

## 5. Font loading (Tauri offline)

| Finding | Detail |
| --- | --- |
| Declared family | `global.css`: `"JetBrains Mono", "Consolas", "Courier New", monospace` |
| Bundling | **None.** No Fontsource package, no `@font-face`, no font files under the repo for UI fonts. |
| Desktop offline | Relies on the OS having JetBrains Mono installed; otherwise falls back to Consolas / Courier. |
| Recursive | **Not present.** Phase 1 must add `@fontsource-variable/recursive` (or equivalent) and import it from shared so both Vite builds embed the files. |
| HTML | `desktop/index.html` and `web/index.html` set theme boot script only; no Google Fonts links (good for offline). |

Phase 1 should:

1. Bundle Recursive variable font via Fontsource in `@dirt-signal/shared`.
2. Map CSS axes: UI `MONO 0` / `CASL 0`; telemetry `MONO 1` + tabular nums; hero numerals `CASL 0.5`, weight 300-400.
3. Verify Tauri production build serves fonts from the app bundle with no network.

---

## 6. Timezone and time rendering (non-negotiable 7)

Device timezone helpers live in `shared/src/lib/dayNight.ts` (`localHour`, `localDayKey`, `isDayPeriod`, default `Africa/Johannesburg`). Scoring and daily bucketing use the device timezone from API payloads.

Absolute display formatting is **not** centralised. Several call sites use `toLocaleString("en-GB", …)` **without** a `timeZone` option (`SystemStatusLine`, Alerts, Reports advisory stamp, EventDetailPopover, EventMarkerRail, TimeSeriesChart). Those follow the **browser** locale zone, not necessarily `devices.timezone`.

Phase 1 or early Phase 2 should introduce one shared formatter (device timezone + en-GB) and route all new horizon/dashboard times through it. Do not "fix" the known timezone band bug beyond that shared helper discipline.

---

## 7. Sensor / mock / camera notes for Phase 4

| Stream | Dashboard today |
| --- | --- |
| Soil moisture | Primary card |
| Soil temperature | Primary card |
| pH | Primary card |
| Greenhouse air (ambient temp + humidity) | Context cards (separate) |
| VPD / dew point | Context cards, derived from ambient |
| EC / NPK | Diagnostics strip only |
| Camera | Not on dashboard (web Observations gallery) |
| Mock flags | In `pi-collector/config.yaml` (`*_mode: mock \| real`); not surfaced to UI |

Sparkline window is **6h**, not 24h as in the brief. Freshness uses relative age from `formatRelativeAge`.

---

## 8. Gap summary for later phases

| Area | Current state | Redesign impact |
| --- | --- | --- |
| Tokens / glass / layers | Night-soil flat surfaces | Phase 1 full replace + primitives + `/design` or Storybook |
| Fonts | Unbundled JetBrains Mono name | Phase 1 Recursive via Fontsource |
| Weather UI | Reports text only | Phase 2 horizon; need DataClient + likely migration |
| Forecast columns | Partial hourly set | Migration proposal before Phase 2 lanes that need code/CAPE/gusts/is_day |
| Advisory lanes | Digest: spray (+ tomato block); no grape disease / storm modules | Phase 3: wire what exists; stub or omit missing grape disease until modules exist |
| PWA lanes | Can read digest; brief says desktop-only overlays | Confirm product rule at Phase 3 |
| Shadow / provisional badges | Alerts + constants; not on dashboard advisories | Phase 3/4 UI |
| Alerts-while-open | Alerts view only | Phase 4 restyle onto dashboard |
| Motion / backdrop | None of the brief system | Phase 5 |
| Sentence case | Many uppercase CSS transforms | Phase 1+ cleanup |
| Settings / reduce transparency | Theme toggle only | Phase 1 plumbing + Phase 4/5 settings surface |

---

## 9. Recommended Phase 1 entry points (for approval, not started)

1. Extend `shared/src/styles/tokens.css` with Cellar at dusk core + derived + semantic status tokens; keep light theme decision explicit (brief is dusk-first; light may become a constrained fallback).
2. Add Recursive Fontsource dependency and CSS axis utilities in shared.
3. Glass L1/L2/L3 primitives, reading zones, `@supports` and reduce-transparency fallbacks.
4. Shared timezone display helper.
5. `/design` route (or minimal Storybook) showing tokens, glass, status pairs, type scale.

**Migrations:** none in Phase 1. Weather column additions wait for Phase 2 approval.

---

## 10. Checkpoint

Phase 0 complete. No application code changed beyond this document.

Please approve Phase 0 (and any clarifications on PWA lane policy, UV-as-daily, and missing grape disease modules) before Phase 1 work begins.
