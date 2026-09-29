# Phase 3 review: consequence lanes

Status: stop for review (post sign-off fixes). Screenshots under `docs/redesign/screenshots/`.

## Ambient 38 °C (flag only)

Latest greenhouse ambient in `sensor_readings` is **38.0 °C at 2026-09-12 13:31 Africa/Johannesburg**. Midday-aligned, but **stale by ~16 days**. No UI change.

## Sign-off fixes

1. **Storm outline glyph.** Removed the `.consequence-lane.is-outline .consequence-lane-segment::after` CSS pseudo-element (diagonal slash meant as a lightning hint). Markup is a plain outline segment only.
2. **Demo data reverted** (SQL only on live rows; no migration, seed, or repo file touched):
   - Spray window bounds restored to `2026-08-24T04:00:00.000Z`–`2026-08-24T20:00:00.000Z`.
   - Forced `wind_gusts_10m = 68` on 29 Sept 14:00 SAST restored to `24.1`.
3. **Digest freshness.** Header line `Advisories updated …` with Stale badge after 24 hours (`DIGEST_STALE_AFTER_MS`). Current digest `computed_at` 2026-08-23 shows stale.
4. **Accessible summary.** Region summary now includes each lane `summary` string plus “Nothing to act on” / digest-stale wording.

## Delivered (lanes)

- Generic `buildConsequenceLanes` + `ConsequenceLanes` (open `kind` for later grape disease).
- Spray (solid), frost (hatch, digest tomato nights only), water use ET0 sparkline, storm (outline + Provisional).
- Shadow mode on every lane. Nothing to act on when actionable lanes are clear.
- Digest via `fetchLatestAdvisoryDigest` on desktop and web DataClients.

## Screenshots

| File | What |
| --- | --- |
| `part-c-desktop-lanes-48h.png` | 48h with ET0 + Nothing to act on; advisories stale |
| `part-c-desktop-lanes-clear.png` | Clear actionable lanes (“Nothing to act on”) close-up |
| `part-c-web-lanes.png` | Web signed-in, same state |
