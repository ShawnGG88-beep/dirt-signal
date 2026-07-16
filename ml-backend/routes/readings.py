"""Sensor reading routes."""

from __future__ import annotations

import os
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query

from db import get_supabase, resolve_device
from models import LatestReadingResponse, ReadingsRangeResponse, SensorReading

router = APIRouter(prefix="/readings", tags=["readings"])

DEFAULT_DEVICE = os.environ.get("DEFAULT_DEVICE_NAME", "pi-garden-01")


def _parse_reading(row: dict) -> SensorReading:
    return SensorReading.model_validate(row)


@router.get("/latest", response_model=LatestReadingResponse)
def get_latest_reading(
    device_name: str = Query(default=DEFAULT_DEVICE),
) -> LatestReadingResponse:
    try:
        device = resolve_device(device_name)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    client = get_supabase()
    response = (
        client.table("sensor_readings")
        .select("*")
        .eq("device_id", device["id"])
        .order("recorded_at", desc=True)
        .limit(1)
        .execute()
    )
    rows = response.data or []
    reading = _parse_reading(rows[0]) if rows else None
    return LatestReadingResponse(
        device_name=device_name,
        reading=reading,
        crop_type=device["crop_type"],
        lifecycle_stage=device["lifecycle_stage"],
        device_id=device["id"],
    )


@router.get("/range", response_model=ReadingsRangeResponse)
def get_readings_range(
    from_at: datetime = Query(..., description="Range start (ISO 8601)"),
    to_at: datetime = Query(..., description="Range end (ISO 8601)"),
    device_name: str = Query(default=DEFAULT_DEVICE),
    limit: int = Query(default=500, ge=1, le=5000),
) -> ReadingsRangeResponse:
    if from_at.tzinfo is None:
        from_at = from_at.replace(tzinfo=timezone.utc)
    if to_at.tzinfo is None:
        to_at = to_at.replace(tzinfo=timezone.utc)

    if from_at >= to_at:
        raise HTTPException(status_code=400, detail="from_at must be before to_at")

    try:
        device = resolve_device(device_name)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    client = get_supabase()
    response = (
        client.table("sensor_readings")
        .select("*")
        .eq("device_id", device["id"])
        .gte("recorded_at", from_at.isoformat())
        .lte("recorded_at", to_at.isoformat())
        .order("recorded_at", desc=False)
        .limit(limit)
        .execute()
    )
    rows = response.data or []
    readings = [_parse_reading(row) for row in rows]
    return ReadingsRangeResponse(
        device_name=device_name,
        from_at=from_at,
        to_at=to_at,
        readings=readings,
        count=len(readings),
        crop_type=device["crop_type"],
        lifecycle_stage=device["lifecycle_stage"],
        device_id=device["id"],
    )
