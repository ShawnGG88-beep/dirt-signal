# Phase 1: tokens, fonts, glass, accessibility

Status: complete, awaiting review before Phase 2.

## Delivered

- Cellar at dusk tokens in `shared/src/styles/tokens.css` (legacy aliases remapped so existing views keep working).
- Recursive variable font via `@fontsource-variable/recursive` (`full.css` for MONO/CASL), imported from `shared/src/styles/fonts.css`.
- Glass L1/L2/L3, reading zones, `@supports` fallback, reduce-transparency and reduced-motion CSS in `shared/src/styles/layers.css`.
- Preference plumbing: `shared/src/lib/accessibility.ts` plus nav toggles.
- Shared device-timezone display helpers: `shared/src/lib/formatTime.ts`.
- Primitives: `GlassPanel`, `SemanticStatusBadge`, `ShadowModeBadge`, `ProvisionalBadge`.
- Design showcase at `#/design` on desktop and `web/`.
- Sentence-case: removed `text-transform: uppercase` from `global.css`.
- Ambient `sky-backdrop` behind both shells so glass has something to frost over.

## How to review

1. Desktop: open the app, go to Design.
2. Web: same, `#/design` after sign-in.
3. Toggle reduce transparency (opaque panels) and reduce motion.
4. Confirm Recursive loads offline (no network font requests).

## Not in this phase

- Weather horizon, migrations, advisory lanes, dashboard IA rebuild (Phases 2 to 4).
- Migrating every existing `toLocaleString` call site onto `formatTime` (SystemStatusLine absolute stamp now uses it; remaining call sites follow in later phases without touching the timezone band bug).

## Proposed migration (Phase 2, not applied)

Await approval before writing or applying SQL. Intended columns only:

- Hourly on `weather_forecast`: `weather_code`, `wind_gusts_10m`, and `cape` only if the storm lane is kept.
- Daily sunrise/sunset storage (companion table or daily columns), values stored in UTC, rendered via `formatTime`.
- Derive `is_day` in app code from sunrise/sunset. Do not store VPD, dew point, or UV.
