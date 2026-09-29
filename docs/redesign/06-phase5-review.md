# Phase 5 review: motion, performance, accessibility

Status: **signed off** (Linux WebKitGTK + 30fps questions resolved below). Screenshots under `docs/redesign/screenshots/`.

## Motion table (brief vs implementation)

| Moment | Spec | Implementation | Reduced motion |
| --- | --- | --- | --- |
| New reading arrives | 400ms tween + 800ms apricot rim glow, ease-out | `useAnimatedNumber` (`motion` animate, 400ms, ease `[0.22,1,0.36,1]`); `.sensor-tile.is-updated` glow 800ms | Instant value swap; static apricot rim for 3s (`.is-updated-static`) |
| Reading goes stale | 300ms desaturate, ease-in-out | `.sensor-tile.is-stale { filter: saturate(0.55) }` with `--motion-short` / `--ease-in-out` | Transitions capped at 100ms |
| Advisory → act | 350ms spring (300/30), L1→L2 lift, one icon pulse | `NeedsAttention` `motion.li` spring; `.is-act-enter` icon pulse once | Static act rim, no icon animation |
| Tile / hour → detail | 350ms shared-element VT | Tile: `sensor-detail` (Phase 4). Hour: `hour-detail` via `runViewTransition` | VT skipped; instant open |
| Scrubbing | 120ms cross-fade | `.weather-scrub-fade` / `--motion-fast` (unchanged) | `.is-instant` / global 100ms |
| Toggle 48h / 7d | 400ms morph, ease-in-out | `motion.div` band keyed by range, 0.4s, ease `[0.45,0,0.55,1]` | 100ms opacity only |
| Initial load | Backdrop → horizon → tiles, 60ms stagger, &lt;900ms, once | `data-dashboard-enter` + `.is-entering` stagger; sessionStorage so nav does not repeat | Instant (no enter classes) |
| Loading | Skeletons, shimmer 1.6s, no spinners | Horizon + dashboard skeletons; **removed** `.fetch-progress` infinite bar | Skeleton animation none |
| Ambient backdrop | 60s+ drift, pause when tab hidden | 90s `sky-ambient-drift`; `data-tab-hidden` pauses | `animation: none` |

No decorative tile/lane hover beyond rim highlight. No storm pulse animation (static badge only). Nothing flashes &gt;3 Hz.

## Linux / WebKitGTK performance

### Chromium baseline: the ~30fps question

Re-ran the upgraded probe on the Cursor/Electron Chromium surface (dashboard glass + backdrop). It now reports display refresh and whether rAF is vsync-capped, plus an uncapped **sync paint cost** (forced backdrop-filter invalidate + layout).

| Mode | L1 blur | rAF avg | rAF p95 | ~fps | refresh Hz | rAF vsync-capped | sync paint avg | sync paint p95 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Default | 20px | 33.33 ms | 33.5 ms | 30.0 | **30.03** (bucket 30) | **yes** | 0.06 ms | 0.20 ms |
| Low L1 | 12px | 33.33 ms | 33.4 ms | 30.0 | **30.03** (bucket 30) | **yes** | 0.07 ms | 0.20 ms |

**Conclusion on the earlier 30fps table:** the Cursor embedded browser presents at **30 Hz**. rAF deltas of ~33.3 ms are the vsync presentation interval, not uncapped render cost. Default and low-blur matching at 30fps was expected under that cap and does **not** prove blur is free or expensive. Sync paint cost (not vsync-bucketed) is near-zero and unchanged when lowering L1 blur on Chromium.

### Linux WebKitGTK (brief-named check)

Ran on Ubuntu 24.04 with **libwebkit2gtk-4.1-0 2.52.6**, Xvfb `1280x800x24`, fixture matching ambient backdrop + L1/L2/L3 glass (same blur tokens). Harness: `scripts/linux-webkit-perf/`. Artifact: `part-e-webkitgtk-perf.json`.

userAgent (WebKitGTK):** `Mozilla/5.0 (X11; Ubuntu; Linux x86_64) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/60.5 Safari/605.1.15`

| Mode | L1 blur | rAF avg | rAF p95 | rAF max | ~fps | refresh Hz | rAF vsync-capped | sync paint avg | sync paint p95 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Default | 20px | 27.33 ms | 30.00 ms | 33.00 ms | 36.6 | 34.5 | no | **0.188 ms** | **1.000 ms** |
| Low L1 | 12px | 27.80 ms | 30.00 ms | 34.00 ms | 36.0 | 37.0 | no | **0.188 ms** | **1.000 ms** |

Lowering L1 blur does **not** help on this WebKitGTK/Xvfb run: sync paint avg/p95 are identical. No need to enable `data-perf-blur=low` by default. The `--glass-blur-l1-low` / `data-perf-blur=low` fallback remains available if a real display/Pi Tauri build later shows cost.

Workflow (for re-runs): `.github/workflows/webkitgtk-perf.yml` + `scripts/linux-webkit-perf/`. Design page: `?autoperf=1#/design` or `await __dirtPerfProbePair()`.

## Accessibility

### Contrast (opaque glass / reduce-transparency fills)

Vitest `contrast.test.ts` + Design page. Ratios on token hex pairs:

| Pair | Ratio | AA |
| --- | --- | --- |
| parchment on cellar-raised | 13.27 | pass body |
| heather-text on cellar-raised | 6.17 | pass body |
| parchment on cellar | 16.88 | pass |
| light primary / secondary on opaque | 15.02 / 6.24 | pass |
| apricot focus on cellar | 13.21 | pass UI |

Reduce transparency uses `--glass-fill-opaque` (`#3a2426` dark / `#f7e6d6` light). Screenshot: `part-e-reduce-transparency.png`.

### Keyboard

Tiles (`role=button` + Enter/Space), horizon hours, 7-day cells (`tabIndex=0`), lane tracks (`tabIndex=0`), Needs attention buttons. Focus ring token `--focus-ring` → apricot (`#ffd3ac`) via `:focus-visible`.

### Screen reader reading order

Document order: status sentence → Weather horizon (summary) → Needs attention → Sensor tiles (per-tile `aria-label`) → Recent events. Horizon hours expose clock/temp/rain labels. Confirmed via accessibility tree on live dashboard.

### Flashing

No infinite pulse &lt;333ms. Skeleton 1.6s. Ambient 90s. Act icon pulse once.

## Acceptance greps

| Check | Result |
| --- | --- |
| Em dash (`U+2014`) in Phase 5 touched UI strings | Cleared in `WeatherHorizon` / `Dashboard` placeholders (`n/a` / `-`). Older comment/copy elsewhere still has em dashes outside this phase’s edits. |
| Hex outside `tokens.css` | Clean for `shared/src`, `desktop/src`, `web/src` (contrast helpers use hex only in `contrast.ts` / tests for AA math). |
| `text-transform: uppercase` | None |
| Shadow / Provisional / alerts-while-open | Present on lanes + status; Alerts coverage notice confirmed (`part-e-alerts-honesty.png`) |

## Screenshots

| File | What |
| --- | --- |
| `part-e-dashboard-motion.png` | Dashboard with horizon + tiles (motion path) |
| `part-e-reduced-motion-drawer.png` | Reduce motion on; tile drawer opens without VT morph |
| `part-e-tiles-shadow-provisional.png` | Lanes with Shadow mode + Provisional; stale tiles; Needs attention |
| `part-e-reduce-transparency.png` | Opaque glass fallback |
| `part-e-alerts-honesty.png` | Alerts-while-open coverage notice |
| `part-e-webkitgtk-perf.json` | Linux WebKitGTK default vs low-L1 probe |

## Changed (this phase)

- Motion: reading tween/glow, stale desaturate, act escalate spring + pulse, 48h/7d morph, enter stagger, hour VT, skeletons; removed fetch spinner.
- Perf: probe reports refresh Hz + vsync-cap flag + sync paint cost; WebKitGTK fixture/harness; low-L1 blur token kept as optional fallback.
- A11y: lane/day keyboard reach, contrast tests, reduced-motion mappings for every motion moment.
- Dep: `motion` on shared (+ desktop/web).

## Not changed

- Repo-wide historical em dashes in comments / unrelated views (out of Phase 5 scope).
- Defaulting to low L1 blur (not warranted by WebKitGTK sync-paint results).
