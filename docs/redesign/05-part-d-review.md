# Phase 4 review: dashboard information architecture

Status: **signed off pending your confirmation of the config-sync proof below**. Screenshots under `docs/redesign/screenshots/`.

## Sign-off fixes

### 1. Needs attention states staleness inline

When the underlying reading is past the collector stale threshold, the entry keeps the act/cold reason but rewrites the detail, e.g. `was out of bounds, last reading 16 d ago`, and uses the **Stale** semantic badge. Fresh act/cold entries stay live-worded. Lane items (storm, spray) are unchanged.

### 2. Shared-element tile → drawer

Tile open/close uses the View Transitions API with shared name `sensor-detail` (350ms, ease-out in / ease-in out). Reduced-motion / `data-reduce-motion` skips the transition. Recording: `part-d-tile-drawer-transition.gif`.

### 3. Simulated badge via config-driven collector sync

Migration `017_device_sensor_modes.sql` adds the `*_mode` columns. On startup the collector PATCHes them from `config.yaml` before building sensors. Sidecar/web expose the fields; tiles show **Simulated** when mode is `mock`.

**Config-path proof (not seeded):**

1. Cleared all mode columns to `null` in Postgres.
2. Set `moisture_mode: mock` in `config.yaml` only.
3. Restarted `python collector.py`.
4. Collector log (excerpt):

```
Synced sensor modes for device 13be9296-…: {'moisture_mode': 'mock', 'ph_mode': 'real', 'ds18b20_mode': 'real', 'dht22_mode': 'real', 'npk_mode': 'real'}
```

5. `/readings/latest` then returned `moisture_mode: "mock"` (see `part-d-api-modes-after-sync.json`).
6. Dashboard showed Moisture **Simulated** (`part-d-config-sync-simulated.png`).

`config.yaml` was restored to `moisture_mode: real` and collector re-run so the devices row matches production config again. Real Pi sensor imports are lazy so sync still runs on a laptop without Adafruit packages (hardware init may fail after sync; that is expected off-Pi).

## Screenshots / recording

| File | What |
| --- | --- |
| `part-d-signoff-status.png` | Status sentence + horizon |
| `part-d-signoff-attention-simulated.png` | Earlier seeded-mode UI proof |
| `part-d-config-sync-simulated.png` | Badge after **collector** wrote mock from config |
| `part-d-collector-mode-sync-excerpt.log` | Collector sync log excerpt |
| `part-d-api-modes-after-sync.json` | API modes after that sync |
| `part-d-tile-drawer-transition.gif` | Shared-element open/close |

## Core redesign complete (Phases 0–4)

Tokens/glass, weather horizon, consequence lanes, dashboard IA. Phase 5 next: motion pass, Linux Tauri ambient backdrop performance, accessibility pass.
