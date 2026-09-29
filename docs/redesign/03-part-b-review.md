# Part B review: weather horizon

Status: fixes and outstanding checks closed against live Open-Meteo data.
Screenshots under `docs/redesign/screenshots/`.

## Data confirmed

- Edge sync on project `jrrrwukcasaqyqaidrme` returns `source: open-meteo` (real mode).
- Latest hourly fetch: 2026-09-28 19:47 UTC, 168 hours.
- One rainy hour (`2026-09-29 11:00` SAST) has `wind_gusts_10m` nulled for the missing-field demo.
- Cron job `weather-forecast-sync-hourly` active (`0 * * * *`).

## Fixes

1. **Sky band.** Was a continuous `linear-gradient` already, but heavy cloud cover (overcast pull ×0.45 toward a cool heather/cellar mix) made daytime look blue-grey and plateaued. Day token raised to apricot 68% / heather, overcast token warmed with apricot, overcast pull capped at ×0.22, twilight widened to 90 minutes so adjacent hours blend through dawn/dusk.
2. **7-day duplication.** Mock path used a day-invariant formula; live Open-Meteo days now vary (e.g. 29 Sept rain 100% / ET0 1.5 mm vs 02 Oct rain 4% / ET0 3.4 mm).
3. **Inside vs outside delta.** Not a UI bug. Outside is forecast air temp (≈13.7°); inside is the greenhouse DHT22 ambient (`ambient_temp_c` ≈38°). Delta is `inside − outside` (+24.3° on the recapture). Sensor also shows Ambient temp 38 °C on the metric strip.
4. **Hour drawer.** Real `Close` button, focus trap (Tab cycles, Escape closes, restore focus), WMO codes mapped to plain labels (`Slight rain showers`, `Mainly clear`, …). Null gusts render as `—`.

## Outstanding checks

5. **Real mode recapture.** Done. Hero, 48h continuous sky, 7d, rainy hour drawer, and null-gust hour drawer against Open-Meteo.
6. **Web `:5173` signed-in.** Done: `part-b-web-signed-in.png` (magic-link session; same shared horizon, real Open-Meteo).
7. **Reduced motion.** Confirmed: `data-reduce-motion="true"` stops `.sky-backdrop` ambient drift (`animation: none`), and scrub readouts / hero use `.is-instant` (no cross-fade).
8. **Arrow scrubbing.** Confirmed end to end: focus hour → ArrowRight moves focus, hero temp, and readouts (22:00 13.7° → 23:00 13.4°, rain 31%).

## Screenshots

| File | What |
| --- | --- |
| `part-b-desktop-hero.png` | Hero + readouts + 48h sky (real Open-Meteo) |
| `part-b-desktop-48h-sky.png` | Continuous warm sky blend, scrub active |
| `part-b-desktop-7d.png` | Varied day cards 28 Sept – 04 Oct |
| `part-b-desktop-hour-drawer.png` | Rainy 11:00, null gusts `—`, label `Slight rain showers`, Close |
| `part-b-fix-drawer-rain.png` | Earlier rainy 18:00 drawer (`Moderate rain showers`) |
| `part-b-web-signed-in.png` | Web dashboard signed in on `:5173` |

## Sidecar

Desktop forecast needs the FastAPI sidecar on `:8731` (`ml-backend/routes/weather.py`).
