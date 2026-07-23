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


def _device_from_row(row: dict) -> dict[str, str | None]:
    """Normalise a devices row; default crop/stage/timezone when absent."""
    from day_night import default_device_timezone

    tz = row.get("timezone")
    tz_str = str(tz).strip() if tz else ""
    season = row.get("season_start_date")
    return {
        "id": str(row["id"]),
        "name": str(row.get("name") or ""),
        "crop_type": str(row.get("crop_type") or "tomato"),
        "lifecycle_stage": str(row.get("lifecycle_stage") or "mature"),
        "timezone": tz_str or default_device_timezone(),
        "season_start_date": str(season) if season else None,
    }


def resolve_device(device_name: str) -> dict[str, str | None]:
    """Return id, name, crop_type, lifecycle_stage, timezone, season_start_date."""
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


def resolve_device_by_id(device_id: str) -> dict[str, str | None]:
    """Return id, name, crop_type, lifecycle_stage, timezone, season_start_date."""
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
