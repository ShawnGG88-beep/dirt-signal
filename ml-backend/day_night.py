"""Device-local day/night and calendar-day helpers.

Day is [DAY_START_HOUR, DAY_END_HOUR) in the *device* IANA timezone — never
UTC wall-clock and never the host or browser local zone. Desktop mirrors this
in dayNight.ts; cross-boundary tests assert identical verdicts.
"""

from __future__ import annotations

import os
from datetime import datetime, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

# Inclusive start, exclusive end — matches docs/dashboard.md and CROP_PROFILES.
DAY_START_HOUR = 6
DAY_END_HOUR = 18

DEFAULT_FALLBACK_TZ = "Africa/Johannesburg"


def default_device_timezone() -> str:
    """Configurable default for backfill / missing device.timezone.

    Prefer DIRT_SIGNAL_DEFAULT_TZ, else the host local zone name, else
    Africa/Johannesburg (UTC+2 deployment).
    """
    env = os.environ.get("DIRT_SIGNAL_DEFAULT_TZ", "").strip()
    if env:
        try:
            ZoneInfo(env)
            return env
        except ZoneInfoNotFoundError:
            pass
    try:
        local = datetime.now().astimezone().tzinfo
        if local is not None:
            key = getattr(local, "key", None)
            if isinstance(key, str) and key:
                ZoneInfo(key)
                return key
    except (ZoneInfoNotFoundError, Exception):
        pass
    return DEFAULT_FALLBACK_TZ


def ensure_aware_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def resolve_zone(tz_name: str | None) -> ZoneInfo:
    name = (tz_name or "").strip() or default_device_timezone()
    try:
        return ZoneInfo(name)
    except ZoneInfoNotFoundError:
        return ZoneInfo(default_device_timezone())


def local_hour(recorded_at: datetime, tz_name: str | None) -> int:
    """Hour 0–23 in the device timezone."""
    at = ensure_aware_utc(recorded_at)
    return at.astimezone(resolve_zone(tz_name)).hour


def local_day_key(recorded_at: datetime, tz_name: str | None) -> str:
    """YYYY-MM-DD in the device timezone."""
    at = ensure_aware_utc(recorded_at)
    local = at.astimezone(resolve_zone(tz_name))
    return local.strftime("%Y-%m-%d")


def is_day_period(recorded_at: datetime, tz_name: str | None) -> bool:
    """True when device-local hour is in [DAY_START_HOUR, DAY_END_HOUR)."""
    hour = local_hour(recorded_at, tz_name)
    return DAY_START_HOUR <= hour < DAY_END_HOUR


def is_night_period(recorded_at: datetime, tz_name: str | None) -> bool:
    """Complement of is_day_period (device-local)."""
    return not is_day_period(recorded_at, tz_name)
