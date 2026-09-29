"""Dirt Signal FastAPI sidecar."""

from __future__ import annotations

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware

from alerts.engine import start_alert_engine, stop_alert_engine
from routes.advisories import router as advisories_router
from routes.alerts import router as alerts_router
from routes.devices import router as devices_router
from routes.events import router as events_router
from routes.readings import router as readings_router
from routes.soil_tests import router as soil_tests_router
from routes.weather import router as weather_router


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
app.include_router(advisories_router)
app.include_router(weather_router)

# Collector cadence: devices.collector_interval_seconds is the source of
# truth (migration 009) so desktop and web derive staleness from the same
# row. COLLECTOR_INTERVAL_SECONDS remains a fallback for environments where
# the column is absent or Supabase is unreachable; the final default is 30,
# matching pi-collector/config.yaml. Desktop derives STALE_AFTER_MS as
# 2x this value.
_DEFAULT_COLLECTOR_INTERVAL_SECONDS = 30

_DEFAULT_DEVICE = os.environ.get("DEFAULT_DEVICE_NAME", "pi-garden-01")


def _env_collector_interval() -> int:
    raw = os.environ.get("COLLECTOR_INTERVAL_SECONDS")
    try:
        interval = (
            int(raw) if raw is not None else _DEFAULT_COLLECTOR_INTERVAL_SECONDS
        )
    except ValueError:
        interval = _DEFAULT_COLLECTOR_INTERVAL_SECONDS
    if interval < 1:
        interval = _DEFAULT_COLLECTOR_INTERVAL_SECONDS
    return interval


def _device_collector_interval(device_name: str) -> int | None:
    """Interval from the devices row, or None so callers fall back to env.

    /health doubles as the sidecar reachability probe, so a Supabase outage
    must degrade to the fallback rather than turning the probe into a 500.
    """
    try:
        from db import resolve_device

        device = resolve_device(device_name)
    except Exception:
        return None
    interval = device.get("collector_interval_seconds")
    return interval if isinstance(interval, int) else None


@app.get("/health")
def health(
    device_name: str = Query(default=_DEFAULT_DEVICE),
) -> dict[str, str | int]:
    interval = _device_collector_interval(device_name)
    if interval is None:
        interval = _env_collector_interval()
    return {
        "status": "ok",
        "collector_interval_seconds": interval,
    }
