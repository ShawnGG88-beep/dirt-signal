"""Dirt Signal FastAPI sidecar."""

from __future__ import annotations

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from alerts.engine import start_alert_engine, stop_alert_engine
from routes.alerts import router as alerts_router
from routes.devices import router as devices_router
from routes.events import router as events_router
from routes.readings import router as readings_router
from routes.soil_tests import router as soil_tests_router


@asynccontextmanager
async def lifespan(_app: FastAPI):
    await start_alert_engine()
    try:
        yield
    finally:
        await stop_alert_engine()


app = FastAPI(
    title="Dirt Signal ML Backend",
    description="Local sidecar for the Dirt Signal desktop app",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:1420",
        "http://127.0.0.1:1420",
        "tauri://localhost",
        "https://tauri.localhost",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(devices_router)
app.include_router(events_router)
app.include_router(readings_router)
app.include_router(soil_tests_router)
app.include_router(alerts_router)

# Mirror of pi-collector read_interval_seconds. Desktop derives STALE_AFTER_MS
# as 2x this value. Override via COLLECTOR_INTERVAL_SECONDS when the Pi
# interval changes; do not hardcode the Pi path here.
_DEFAULT_COLLECTOR_INTERVAL_SECONDS = 30


@app.get("/health")
def health() -> dict[str, str | int]:
    raw = os.environ.get("COLLECTOR_INTERVAL_SECONDS")
    try:
        interval = (
            int(raw) if raw is not None else _DEFAULT_COLLECTOR_INTERVAL_SECONDS
        )
    except ValueError:
        interval = _DEFAULT_COLLECTOR_INTERVAL_SECONDS
    if interval < 1:
        interval = _DEFAULT_COLLECTOR_INTERVAL_SECONDS
    return {
        "status": "ok",
        "collector_interval_seconds": interval,
    }
