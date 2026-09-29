# Phase 0 decisions (approved)

Recorded before Phase 1. Supersedes provisional notes in `00-audit.md` where they conflict.

1. **Advisory lanes:** Digest-backed on both desktop and `web/`, reading `device_advisories_daily`. Render hourly windows only where the data supports them; otherwise day-level tags. No "desktop only" fallback line. Shadow mode badge on every lane.
2. **Water use:** Stored FAO ET0, labelled "Water use (ET0)". Do not describe it as feeding irrigation.
3. **Grape disease:** Omit lanes. Build lane components generically for later modules. No placeholder risk data.
4. **Derived climate:** VPD and dew point via existing shared functions. Do not store them.
5. **Migration (propose later, do not apply yet):** Limited to `weather_code`, `wind_gusts`, CAPE only if storm lane is kept, and daily sunrise/sunset. Derive `is_day` from sunrise/sunset. Drop UV. Await approval before applying.
6. **Sunrise/sunset:** Store in UTC; render through the shared timezone helper. Do not touch the existing timezone band bug beyond that helper discipline.
7. **Paths:** Use `web/` everywhere the brief said `pwa/`.
8. **Fonts:** Bundle Recursive via Fontsource in `@dirt-signal/shared`.
