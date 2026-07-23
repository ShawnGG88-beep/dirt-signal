"""Sensor reading routes."""

from __future__ import annotations

import os
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query

from db import get_supabase, resolve_device
from models import (
    DailyAggregateRow,
    DailyAggregatesResponse,
    LatestReadingResponse,
    ReadingsRangeResponse,
    SensorReading,
)
from constants import get_gdd_base_c
from derived import cumulative_gdd as sum_cumulative_gdd

router = APIRouter(prefix="/readings", tags=["readings"])

DEFAULT_DEVICE = os.environ.get("DEFAULT_DEVICE_NAME", "pi-garden-01")


def _parse_reading(row: dict) -> SensorReading:
    return SensorReading.model_validate(row)


def _device_profile_fields(device: dict) -> dict:
    return {
        "crop_type": device["crop_type"],
        "lifecycle_stage": device["lifecycle_stage"],
        "device_id": device["id"],
        "timezone": device["timezone"],
        "season_start_date": device.get("season_start_date"),
    }


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
        **_device_profile_fields(device),
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
        **_device_profile_fields(device),
    )


@router.get("/daily-aggregates", response_model=DailyAggregatesResponse)
def get_daily_aggregates(
    from_at: datetime = Query(..., description="Range start (ISO 8601)"),
    to_at: datetime = Query(..., description="Range end (ISO 8601)"),
    device_name: str = Query(default=DEFAULT_DEVICE),
) -> DailyAggregatesResponse:
    """Postgres-side daily aggregates in the device timezone."""
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

    gdd_base = get_gdd_base_c(str(device["crop_type"]))
    client = get_supabase()
    response = client.rpc(
        "device_daily_aggregates",
        {
            "p_device_id": device["id"],
            "p_from_at": from_at.isoformat(),
            "p_to_at": to_at.isoformat(),
            "p_humidity_threshold": 85,
            "p_gdd_base_c": gdd_base,
        },
    ).execute()
    rows = response.data or []
    days: list[DailyAggregateRow] = []
    for row in rows:
        day_raw = row.get("day")
        day = str(day_raw)[:10] if day_raw is not None else ""
        days.append(
            DailyAggregateRow(
                day=day,
                sample_count=int(row.get("sample_count") or 0),
                coverage_hours=int(row.get("coverage_hours") or 0),
                moisture_pct_min=_num(row.get("moisture_pct_min")),
                moisture_pct_max=_num(row.get("moisture_pct_max")),
                moisture_pct_mean=_num(row.get("moisture_pct_mean")),
                moisture_pct_count=int(row.get("moisture_pct_count") or 0),
                ph_min=_num(row.get("ph_min")),
                ph_max=_num(row.get("ph_max")),
                ph_mean=_num(row.get("ph_mean")),
                ph_count=int(row.get("ph_count") or 0),
                soil_temp_c_min=_num(row.get("soil_temp_c_min")),
                soil_temp_c_max=_num(row.get("soil_temp_c_max")),
                soil_temp_c_mean=_num(row.get("soil_temp_c_mean")),
                soil_temp_c_count=int(row.get("soil_temp_c_count") or 0),
                ambient_temp_c_min=_num(row.get("ambient_temp_c_min")),
                ambient_temp_c_max=_num(row.get("ambient_temp_c_max")),
                ambient_temp_c_mean=_num(row.get("ambient_temp_c_mean")),
                ambient_temp_c_count=int(row.get("ambient_temp_c_count") or 0),
                ambient_humidity_pct_min=_num(row.get("ambient_humidity_pct_min")),
                ambient_humidity_pct_max=_num(row.get("ambient_humidity_pct_max")),
                ambient_humidity_pct_mean=_num(row.get("ambient_humidity_pct_mean")),
                ambient_humidity_pct_count=int(
                    row.get("ambient_humidity_pct_count") or 0
                ),
                vpd_kpa_mean=_num(row.get("vpd_kpa_mean")),
                vpd_kpa_count=int(row.get("vpd_kpa_count") or 0),
                gdd_day=_num(row.get("gdd_day")),
                high_humidity_hours=int(row.get("high_humidity_hours") or 0),
                incomplete=bool(row.get("incomplete")),
            )
        )

    cum = sum_cumulative_gdd(
        [(d.day, d.gdd_day, d.incomplete) for d in days],
        season_start_date=device.get("season_start_date"),
    )
    return DailyAggregatesResponse(
        device_name=device_name,
        device_id=str(device["id"]),
        timezone=str(device["timezone"]),
        season_start_date=device.get("season_start_date"),
        crop_type=str(device["crop_type"]),
        lifecycle_stage=str(device["lifecycle_stage"]),
        gdd_base_c=gdd_base,
        from_at=from_at,
        to_at=to_at,
        days=days,
        count=len(days),
        cumulative_gdd=cum.cumulative_gdd,
        days_elapsed=cum.days_elapsed,
        days_excluded=cum.days_excluded,
        cumulative_gdd_unavailable_reason=cum.unavailable_reason,
    )


def _num(value: object) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None

