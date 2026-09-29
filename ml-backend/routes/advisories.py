"""Daily weather advisory digest routes."""

from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Query

from advisories.digest import build_daily_digest
from db import get_supabase, resolve_device
from weather import load_forecast_rows

router = APIRouter(tags=["advisories"])

DEFAULT_DEVICE = os.environ.get("DEFAULT_DEVICE_NAME", "pi-garden-01")
READINGS_LOOKBACK_HOURS = 36


@router.get("/advisories/latest")
def get_latest_advisories(
    device_name: str = Query(default=DEFAULT_DEVICE),
) -> dict:
    """Read-only: latest precomputed digest from device_advisories_daily."""
    try:
        device = resolve_device(device_name)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    client = get_supabase()
    device_id = str(device["id"])
    response = (
        client.table("device_advisories_daily")
        .select("digest, computed_at")
        .eq("device_id", device_id)
        .order("computed_at", desc=True)
        .limit(1)
        .execute()
    )
    rows = response.data or []
    if not rows:
        return {
            "device_name": device_name,
            "computed_at": None,
            "digest": None,
        }
    row = rows[0]
    return {
        "device_name": device_name,
        "computed_at": row.get("computed_at"),
        "digest": row.get("digest"),
    }


@router.get("/advisories/daily")
def get_daily_advisories(
    device_name: str = Query(default=DEFAULT_DEVICE),
) -> dict:
    """Dev/live-compute fallback; not the primary UI path."""
    try:
        device = resolve_device(device_name)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    client = get_supabase()
    now = datetime.now(timezone.utc)
    device_id = str(device["id"])
    from_at = (now - timedelta(hours=READINGS_LOOKBACK_HOURS)).isoformat()
    readings = (
        client.table("sensor_readings")
        .select("*")
        .eq("device_id", device_id)
        .gte("recorded_at", from_at)
        .order("recorded_at", desc=False)
        .limit(5000)
        .execute()
        .data
        or []
    )
    forecast_rows = load_forecast_rows(client, device_id, now=now)
    digest = build_daily_digest(
        device,
        readings,
        forecast_rows,
        client,
        now=now,
    )
    return {
        "device_name": device_name,
        "digest": digest.__dict__,
    }
