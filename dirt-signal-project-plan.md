# Dirt Signal: project plan and Cursor prompt

Edge AI soil monitoring system. Raspberry Pi 4 B reads in-soil sensors, pushes readings to Supabase, and a Tauri desktop app on the laptop visualises, analyses, and runs ML inference against the data. Chemical test strips provide ground-truth N, P, and K labels for model calibration.

---

## 1. System architecture

```
┌─────────────────────────┐
│ Raspberry Pi 4 B (4GB)  │
│                         │
│  collector.py (systemd) │
│  ├─ Capacitive moisture ──> ADS1115 (I2C)
│  ├─ pH probe ────────────> ADS1115 (I2C)
│  ├─ DHT22 (GPIO)        │
│  ├─ DS18B20 (1-Wire)    │
│  └─ NPK RS485 (future,  │
│     via TTL-RS485 + 12V)│
│                         │
│  Writes every 15 min ───┼──> Supabase (Postgres)
└─────────────────────────┘         │
                                    │
┌─────────────────────────┐         │
│ Laptop (Dirt Signal app)│         │
│                         │         │
│  Tauri shell (Rust)     │         │
│  ├─ React frontend ─────┼─> localhost:8731 (FastAPI)
│  └─ Python sidecar      │         │
│     ├─ Supabase queries <─────────┘
│     ├─ ML inference     │
│     └─ Analysis engine  │
└─────────────────────────┘
```

Data flows one way: Pi to Supabase to desktop app. The Pi never needs to be reachable from the laptop, and the app works from anywhere with internet access.

## 2. Repository structure

One monorepo, three top-level packages:

```
dirt-signal/
├── README.md
├── pi-collector/              # Runs on the Raspberry Pi
│   ├── collector.py           # Main loop: read sensors, write to Supabase
│   ├── sensors/
│   │   ├── moisture.py        # ADS1115 channel read + calibration curve
│   │   ├── ph.py              # ADS1115 channel read + 2-point calibration
│   │   ├── dht22.py           # Ambient temp and humidity
│   │   ├── ds18b20.py         # Soil temperature (1-Wire)
│   │   └── mock.py            # Mock sensors for development without hardware
│   ├── config.yaml            # Pin mappings, read interval, device id
│   ├── requirements.txt
│   └── dirt-signal.service    # systemd unit file
├── desktop/                   # Tauri app
│   ├── src-tauri/             # Rust shell, sidecar lifecycle, window config
│   ├── src/                   # React frontend
│   │   ├── views/
│   │   │   ├── Dashboard.tsx  # Live readings, sparklines, status
│   │   │   ├── History.tsx    # Time-series charts, date range picker
│   │   │   ├── SoilTests.tsx  # Log chemical strip results (ground truth)
│   │   │   └── Model.tsx      # Predictions vs ground truth, accuracy
│   │   └── lib/api.ts         # Typed client for the FastAPI sidecar
│   └── package.json
├── ml-backend/                # Python sidecar (FastAPI)
│   ├── main.py                # App entry, CORS locked to Tauri origin
│   ├── routes/
│   │   ├── readings.py        # GET latest, GET range, aggregations
│   │   ├── soil_tests.py      # POST ground-truth strip results
│   │   └── model.py           # POST train, GET predict, GET metrics
│   ├── model/
│   │   ├── train.py           # Random Forest baseline (scikit-learn)
│   │   ├── predict.py
│   │   └── registry/          # Saved model artefacts, versioned
│   ├── db.py                  # supabase-py client
│   └── requirements.txt
└── docs/
    ├── wiring.md              # Pin map and breadboard layout
    ├── calibration.md         # pH buffer and moisture dry/wet procedure
    └── case-study-notes.md    # Running log for the writeup
```

## 3. Supabase schema

```sql
-- One row per physical device (future-proofs multi-node)
create table devices (
  id uuid primary key default gen_random_uuid(),
  name text not null,              -- 'pi-garden-01'
  location text,                   -- 'back bed, tomato row'
  created_at timestamptz default now()
);

-- Core telemetry, one row per reading cycle
create table sensor_readings (
  id bigint generated always as identity primary key,
  device_id uuid references devices(id),
  recorded_at timestamptz not null default now(),
  moisture_raw int,                -- raw ADC value
  moisture_pct numeric(5,2),       -- calibrated percentage
  soil_temp_c numeric(4,1),        -- DS18B20
  ambient_temp_c numeric(4,1),     -- DHT22
  ambient_humidity_pct numeric(5,2),
  ph numeric(4,2),
  ec_us_cm int,                    -- null until RS485 sensor arrives
  npk_n_est int,                   -- sensor estimate, mg/kg, null for now
  npk_p_est int,
  npk_k_est int
);

create index on sensor_readings (device_id, recorded_at desc);

-- Ground truth from chemical test strips
create table soil_tests (
  id bigint generated always as identity primary key,
  device_id uuid references devices(id),
  tested_at timestamptz not null,
  ph_strip numeric(3,1),
  n_level text check (n_level in ('depleted','low','medium','high','surplus')),
  p_level text check (p_level in ('depleted','low','medium','high','surplus')),
  k_level text check (k_level in ('depleted','low','medium','high','surplus')),
  notes text
);

-- Model outputs, so predictions are auditable over time
create table predictions (
  id bigint generated always as identity primary key,
  device_id uuid references devices(id),
  predicted_at timestamptz default now(),
  model_version text not null,
  n_pred text, p_pred text, k_pred text,
  confidence numeric(4,3),
  input_reading_id bigint references sensor_readings(id)
);
```

Row-level security stays off for now (single user, service key on the Pi and laptop only). Revisit if this ever becomes multi-user.

## 4. Build phases

**Phase 0: before the hardware arrives (now)**
- Install Raspberry Pi Imager, pre-stage the SD card with Pi OS Lite (64-bit), WiFi credentials, SSH enabled, hostname `dirt-signal-pi`
- Create the Supabase project and run the schema above
- Scaffold the monorepo with Cursor using the prompt below
- Build and test everything against `sensors/mock.py` so the whole pipeline works end to end with fake data before a single wire is connected

**Phase 1: Pi bring-up (Pi arrives, ~2 days)**
- Boot, SSH in, enable I2C and 1-Wire in raspi-config
- Deploy `pi-collector` with mock sensors, confirm rows land in Supabase on the 15-minute cycle, enable the systemd service

**Phase 2: sensor integration (Temu parts arrive, ~2 weeks)**
- Wire one sensor at a time, replacing its mock: DS18B20 first (simplest), then DHT22, then ADS1115 with moisture, then pH last (needs calibration)
- Calibrate: moisture with a dry-air and submerged-in-water two-point curve, pH with buffer solutions (4.0 and 7.0)
- Cross-check the two DHT22s against each other to catch a counterfeit

**Phase 3: desktop app MVP**
- Dashboard view live against real Supabase data
- History view with time-series charts
- Soil tests view for logging strip results

**Phase 4: ML layer**
- Collect at least 3 to 4 weeks of readings plus weekly strip tests before training anything
- Baseline: Random Forest classifier predicting N, P, and K level categories from moisture, pH, soil temp, and (later) EC
- Show predictions against ground truth in the Model view with honest accuracy metrics

**Phase 5: NPK RS485 sensor (when ordered and arrived)**
- 12V supply, TTL-RS485 module, Modbus RTU polling via pymodbus
- Treat its N, P, and K outputs as additional input features, never as ground truth

**Phase 6: case study writeup**
- docs/case-study-notes.md feeds the final article for shawngreyling.com

## 5. Cursor prompt

Paste this as the opening prompt in a fresh Cursor workspace. It establishes context, conventions, and the first milestone. Work in small steps after this rather than asking Cursor to generate everything at once.

---

You are helping me build Dirt Signal, an edge AI soil monitoring system. I am an AI engineer comfortable with Python, Supabase, and n8n, newer to Rust and Tauri.

**System overview**

Three packages in one monorepo:

1. `pi-collector/`: Python service that runs on a Raspberry Pi 4 B. It reads soil sensors on a 15-minute cycle and inserts rows into Supabase. Sensors: capacitive moisture and an analog pH probe (both via an ADS1115 ADC over I2C), a DHT22 (ambient temp and humidity), and a DS18B20 (soil temperature, 1-Wire). An RS485 Modbus NPK sensor will be added later via pymodbus. Every sensor must sit behind a common interface so a mock implementation can stand in when hardware is absent. Select mock or real via config.yaml.

2. `ml-backend/`: FastAPI app that runs on my laptop as a Tauri sidecar on port 8731. It queries Supabase (supabase-py), serves reading history and aggregations, accepts ground-truth soil test entries, and exposes train and predict endpoints for a scikit-learn Random Forest that classifies N, P, and K levels (five categories: depleted, low, medium, high, surplus) from sensor features. Persist trained models to ml-backend/model/registry with a version string.

3. `desktop/`: Tauri 2.x app, React and TypeScript frontend, that talks only to the FastAPI sidecar over localhost. Four views: Dashboard (latest readings, status indicators, small sparklines), History (time-series charts with a date range picker, use Recharts), Soil Tests (form to log chemical strip results), Model (predictions vs ground truth, accuracy metrics). Dark theme: background #000000, monospace type, primary accent #2DB500, secondary accents #107EEC and #FF8A00. Terminal-inspired, minimal, data-dense.

**Conventions**

- Python 3.11, type hints throughout, pydantic v2 models for all API request and response bodies
- British English in all copy, comments, and docs. Never use em dashes anywhere
- Environment variables via .env files, never hardcode Supabase credentials. The Pi and the backend each get their own .env.example
- Supabase schema already exists (tables: devices, sensor_readings, soil_tests, predictions). I will paste the SQL when you need column detail
- Keep the Rust layer thin: window config and sidecar lifecycle only. All logic lives in Python or React

**First milestone**

Scaffold the full monorepo structure, then implement:
1. pi-collector with mock sensors only, writing plausible fake readings to Supabase on an interval set in config.yaml
2. ml-backend with GET /readings/latest, GET /readings/range, and POST /soil-tests working against Supabase
3. desktop with the Dashboard view rendering live data from the sidecar, plus working Tauri sidecar startup and shutdown of the FastAPI process in dev mode

Do not build the ML endpoints, History, Soil Tests, or Model views yet. Stop after the milestone and wait for my review.

---

## 6. Prompting strategy for the rest of the build

- One phase per Cursor session, referencing this plan
- After the first milestone, feed Cursor the real sensor library names one at a time (adafruit-circuitpython-ads1x15, adafruit-circuitpython-dht, w1thermsensor) as each physical sensor gets wired
- Keep docs/case-study-notes.md open and log decisions as you go; the writeup writes itself if the notes are honest
- When the RS485 sensor lands, start that session by pasting the sensor's Modbus register map from its manual, since generic NPK sensors vary
