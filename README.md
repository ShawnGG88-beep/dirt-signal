# Dirt Signal

Edge AI soil monitoring system. A Raspberry Pi collects sensor readings into Supabase; a Tauri desktop app visualises the data and runs ML inference via a local FastAPI sidecar.

## Packages

| Package | Role |
|---------|------|
| `pi-collector/` | Python service on the Pi. Reads sensors, captures plant images, writes to Supabase. |
| `ml-backend/` | FastAPI sidecar on port 8731. Queries Supabase, serves the desktop app. |
| `desktop/` | Tauri 2 + React app. Dashboard, history, soil tests, model views. |

Pi camera setup (apt `python3-picamera2`, systemd, manual verification) lives in
[`pi-collector/README.md`](pi-collector/README.md).

## Prerequisites

- Python 3.11
- Node.js 20+ and pnpm (or npm)
- Rust toolchain (for Tauri)
- Supabase project with the Dirt Signal schema applied

## Step 0: Supabase schema

Project ref: `jrrrwukcasaqyqaidrme`  
URL: `https://jrrrwukcasaqyqaidrme.supabase.co`

Run the SQL in `supabase/migrations/001_dirt_signal_schema.sql` in your Supabase SQL editor. This creates `devices`, `sensor_readings`, `soil_tests`, and `predictions`, and seeds device `pi-garden-01`.

Confirm with:

```sql
select * from devices where name = 'pi-garden-01';
```

## Environment

Copy each package's `.env.example` to `.env` and fill in your Supabase URL and service role key.

## Quick start (development)

```bash
# Terminal 1: mock collector (writes fake readings every 60s by default)
cd pi-collector
python -m venv .venv
.venv\Scripts\activate        # Windows
pip install -r requirements.txt
python collector.py

# Terminal 2: FastAPI sidecar
cd ml-backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --port 8731 --reload

# Terminal 3: Tauri desktop (spawns sidecar automatically in dev)
cd desktop
pnpm install
pnpm tauri dev
```

## Milestone 1 scope

- [x] Supabase schema (SQL file)
- [x] `pi-collector` with mock sensors
- [x] `ml-backend` readings and soil-tests endpoints
- [x] `desktop` Dashboard view and sidecar lifecycle

Not yet built: ML endpoints, History, Soil Tests, and Model views.
