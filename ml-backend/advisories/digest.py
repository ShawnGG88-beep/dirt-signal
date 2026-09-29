"""Daily weather advisory digest."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from typing import Any

from advisories.capture_schedule import suggest_capture_time
from advisories.climate_merge import build_daily_climate_series
from advisories.dsv_store import load_dsv_row
from advisories.spray_window import find_spray_window
from advisories.tomato_chill import assess_tomato_chill
from advisories.tomato_moisture_stability import assess_moisture_stability
from advisories.tomato_powdery_mildew import assess_powdery_mildew


@dataclass
class DailyAdvisoryDigest:
    device_id: str
    crop_type: str
    lifecycle_stage: str
    evaluated_at: str
    spray_window: dict[str, Any]
    capture_suggestion: dict[str, Any]
    tomato: dict[str, Any] | None


def build_daily_digest(
    device: dict[str, Any],
    readings: list[dict[str, Any]],
    forecast_rows: list[dict[str, Any]],
    client: Any,
    *,
    light_condition: str = "unknown",
    now: datetime | None = None,
) -> DailyAdvisoryDigest:
    at = now or datetime.now(timezone.utc)
    if at.tzinfo is None:
        at = at.replace(tzinfo=timezone.utc)
    device_id = str(device["id"])
    crop = str(device.get("crop_type") or "tomato")
    stage = str(device.get("lifecycle_stage") or "mature")
    tz_name = str(device.get("timezone") or "Africa/Johannesburg")

    spray = find_spray_window(forecast_rows, now=at)
    capture = suggest_capture_time(
        forecast_rows, tz_name, light_condition=light_condition, now=at
    )

    tomato_block: dict[str, Any] | None = None
    if crop == "tomato":
        daily = build_daily_climate_series(readings, forecast_rows, tz_name, now=at)
        chill = assess_tomato_chill(forecast_rows, tz_name, lifecycle_stage=stage, now=at)
        mildew = assess_powdery_mildew(daily)
        moisture = assess_moisture_stability(
            readings,
            daily,
            forecast_rows,
            crop_type=crop,
            lifecycle_stage=stage,
            soil_texture=device.get("soil_texture"),
            now=at,
        )
        diseases = []
        for key in ("early_blight", "late_blight"):
            row = load_dsv_row(client, device_id, key)
            diseases.append(
                {
                    "key": key,
                    "accumulated_dsv": float(row.get("accumulated_dsv") or 0),
                    "threshold": float(row.get("threshold") or 15),
                    "spray_recommended": bool(row.get("spray_recommended")),
                    "last_computed_day": row.get("last_computed_day"),
                }
            )
        tomato_block = {
            "chill": asdict(chill),
            "diseases": diseases,
            "powdery_mildew": asdict(mildew),
            "moisture": asdict(moisture),
        }

    return DailyAdvisoryDigest(
        device_id=device_id,
        crop_type=crop,
        lifecycle_stage=stage,
        evaluated_at=at.isoformat(),
        spray_window=asdict(spray),
        capture_suggestion=asdict(capture),
        tomato=tomato_block,
    )
