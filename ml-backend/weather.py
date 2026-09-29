"""Load weather_forecast rows for advisory and alert evaluation."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any


def load_forecast_rows(
    client: Any,
    device_id: str,
    *,
    horizon_hours: int = 48,
    now: datetime | None = None,
) -> list[dict[str, Any]]:
    """Return hourly forecast rows for device, oldest first."""
    at = now or datetime.now(timezone.utc)
    if at.tzinfo is None:
        at = at.replace(tzinfo=timezone.utc)
    from_at = (at - timedelta(hours=1)).isoformat()
    to_at = (at + timedelta(hours=horizon_hours)).isoformat()
    response = (
        client.table("weather_forecast")
        .select("*")
        .eq("device_id", device_id)
        .gte("forecast_time", from_at)
        .lte("forecast_time", to_at)
        .order("forecast_time", desc=False)
        .limit(500)
        .execute()
    )
    return list(response.data or [])
