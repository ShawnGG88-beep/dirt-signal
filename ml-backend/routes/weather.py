"""Weather forecast routes for the desktop weather horizon."""

from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, HTTPException, Query

from db import get_supabase, resolve_device

router = APIRouter(tags=["weather"])

DEFAULT_DEVICE = os.environ.get("DEFAULT_DEVICE_NAME", "pi-garden-01")


def _num(value: Any) -> float | None:
    if value is None:
        return None
    try:
        n = float(value)
    except (TypeError, ValueError):
        return None
    if n != n:  # NaN
        return None
    return n


def _int(value: Any) -> int | None:
    n = _num(value)
    return None if n is None else int(round(n))


def _map_hour(row: dict[str, Any]) -> dict[str, Any]:
    source = row.get("source") or "open-meteo"
    return {
        "forecast_time": row.get("forecast_time"),
        "fetched_at": row.get("fetched_at"),
        "temperature_2m": _num(row.get("temperature_2m")),
        "relative_humidity_2m": _num(row.get("relative_humidity_2m")),
        "precipitation": _num(row.get("precipitation")),
        "precipitation_probability": _num(row.get("precipitation_probability")),
        "wind_speed_10m": _num(row.get("wind_speed_10m")),
        "wind_gusts_10m": _num(row.get("wind_gusts_10m")),
        "cloud_cover": _num(row.get("cloud_cover")),
        "weather_code": _int(row.get("weather_code")),
        "cape": _num(row.get("cape")),
        "et0_fao_evapotranspiration": _num(
            row.get("et0_fao_evapotranspiration")
        ),
        "soil_temperature_0cm": _num(row.get("soil_temperature_0cm")),
        "soil_moisture_0_1cm": _num(row.get("soil_moisture_0_1cm")),
        "source": source,
    }


def _map_day(row: dict[str, Any]) -> dict[str, Any]:
    source = row.get("source") or "open-meteo"
    forecast_date = row.get("forecast_date")
    if forecast_date is not None:
        forecast_date = str(forecast_date)[:10]
    return {
        "forecast_date": forecast_date,
        "fetched_at": row.get("fetched_at"),
        "sunrise_at": row.get("sunrise_at"),
        "sunset_at": row.get("sunset_at"),
        "source": source,
    }


@router.get("/weather/forecast")
def get_weather_forecast(
    device_name: str = Query(default=DEFAULT_DEVICE),
    horizon_hours: int = Query(default=168, ge=1, le=240),
) -> dict:
    """Hourly + daily forecast rows for the shared weather horizon."""
    try:
        device = resolve_device(device_name)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    client = get_supabase()
    device_id = str(device["id"])
    now = datetime.now(timezone.utc)
    from_at = (now - timedelta(hours=1)).isoformat()
    to_at = (now + timedelta(hours=horizon_hours)).isoformat()

    hourly_resp = (
        client.table("weather_forecast")
        .select("*")
        .eq("device_id", device_id)
        .gte("forecast_time", from_at)
        .lte("forecast_time", to_at)
        .order("forecast_time", desc=False)
        .limit(500)
        .execute()
    )
    hours = [_map_hour(row) for row in (hourly_resp.data or [])]

    daily_from = (now - timedelta(days=1)).date().isoformat()
    daily_to = (now + timedelta(days=8)).date().isoformat()
    daily_resp = (
        client.table("weather_forecast_daily")
        .select("*")
        .eq("device_id", device_id)
        .gte("forecast_date", daily_from)
        .lte("forecast_date", daily_to)
        .order("forecast_date", desc=False)
        .limit(16)
        .execute()
    )
    days = [_map_day(row) for row in (daily_resp.data or [])]

    fetched_candidates = [
        h.get("fetched_at") for h in hours if h.get("fetched_at")
    ] + [d.get("fetched_at") for d in days if d.get("fetched_at")]
    fetched_at = max(fetched_candidates) if fetched_candidates else None

    return {
        "device_name": device_name,
        "device_id": device_id,
        "timezone": device.get("timezone") or "Africa/Johannesburg",
        "fetched_at": fetched_at,
        "hours": hours,
        "days": days,
    }
