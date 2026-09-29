"""Supabase client for the ml-backend sidecar."""

from __future__ import annotations

import os

from dotenv import load_dotenv
from supabase import Client, create_client

load_dotenv()

_client: Client | None = None


def get_supabase() -> Client:
    global _client
    if _client is not None:
        return _client

    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise RuntimeError(
            "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env"
        )
    _client = create_client(url, key)
    return _client


def _device_from_row(row: dict) -> dict[str, str | int | float | None]:
    """Normalise a devices row; default crop/stage/timezone when absent."""
    from day_night import default_device_timezone

    tz = row.get("timezone")
    tz_str = str(tz).strip() if tz else ""
    season = row.get("season_start_date")
    interval_raw = row.get("collector_interval_seconds")
    try:
        interval = int(interval_raw) if interval_raw is not None else None
    except (TypeError, ValueError):
        interval = None
    if interval is not None and interval < 1:
        interval = None

    def _optional_pct(key: str) -> float | None:
        raw = row.get(key)
        if raw is None:
            return None
        try:
            value = float(raw)
        except (TypeError, ValueError):
            return None
        return value

    return {
        "id": str(row["id"]),
        "name": str(row.get("name") or ""),
        "crop_type": str(row.get("crop_type") or "tomato"),
        "lifecycle_stage": str(row.get("lifecycle_stage") or "mature"),
        "timezone": tz_str or default_device_timezone(),
        "season_start_date": str(season)[:10] if season else None,
        "collector_interval_seconds": interval,
        "soil_texture": row.get("soil_texture"),
        "cultivar": row.get("cultivar"),
        "soil_field_capacity_raw": _optional_pct("soil_field_capacity_raw"),
        "soil_refill_point_raw": _optional_pct("soil_refill_point_raw"),
        "moisture_mode": _optional_mode(row.get("moisture_mode")),
        "ph_mode": _optional_mode(row.get("ph_mode")),
        "ds18b20_mode": _optional_mode(row.get("ds18b20_mode")),
        "dht22_mode": _optional_mode(row.get("dht22_mode")),
        "npk_mode": _optional_mode(row.get("npk_mode")),
    }


def _optional_mode(raw: object) -> str | None:
    if raw is None:
        return None
    value = str(raw).strip().lower()
    if value in ("mock", "real"):
        return value
    return None


def resolve_device(device_name: str) -> dict[str, str | int | None]:
    """Return id, name, crop/stage, timezone, season start and collector interval."""
    client = get_supabase()
    response = (
        client.table("devices")
        .select("*")
        .eq("name", device_name)
        .limit(1)
        .execute()
    )
    rows = response.data or []
    if not rows:
        raise ValueError(f"No device named '{device_name}' found")
    return _device_from_row(rows[0])


def resolve_device_by_id(device_id: str) -> dict[str, str | int | None]:
    """Return id, name, crop/stage, timezone, season start and collector interval."""
    client = get_supabase()
    response = (
        client.table("devices")
        .select("*")
        .eq("id", device_id)
        .limit(1)
        .execute()
    )
    rows = response.data or []
    if not rows:
        raise ValueError(f"No device with id '{device_id}' found")
    return _device_from_row(rows[0])


def resolve_device_id(device_name: str) -> str:
    return resolve_device(device_name)["id"]
