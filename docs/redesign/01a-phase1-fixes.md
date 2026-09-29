# Phase 1 Part A fixes

## Typography
- Cause: `font-variation-settings: var(--…)` is unreliable; MONO stayed at the wrong axis value and UI looked monospaced.
- Fix: literal `"MONO" 0, "CASL" 0, "CRSV" 0` on `html/body` and `.font-ui`. Telemetry uses `"MONO" 1`.
- Font files: dropped `full.css` (all subsets). Now Latin + Latin Ext full-axis woff2 only.

### Bundle size (web production assets)
| Build | Recursive assets |
| --- | --- |
| Before (full.css) | latin 305 kB + latin-ext 310 kB + vietnamese 62 kB + cyrillic-ext 6 kB ≈ **683 kB** |
| After (latin + latin-ext) | latin 305 kB + latin-ext 310 kB ≈ **615 kB** |
| Change | **about −68 kB** (−10%) |

Same font files are shared into the Tauri webview bundle via the desktop Vite build.

## Backdrop
- `position: fixed; inset: 0; z-index: -1`
- `html/body/#root` backgrounds transparent so the fixed layer is not clipped behind an opaque body fill.

## Glass demo
- L1/L2/L3 sit on a terracotta/heather contrast stage.
- L2 has stronger warm shadow and brighter apricot rim.

## Hero
- Hero sample uses parchment, not terracotta.

## Toggles
- `aria-pressed`, `title`, `aria-label` on theme / transparency / motion.
- In-page word labels on `#/design`.
- Visible pressed style for `aria-pressed="true"`.

## Nav pills
- Applied (low risk): nav buttons and toggles use `border-radius: 999px`.
