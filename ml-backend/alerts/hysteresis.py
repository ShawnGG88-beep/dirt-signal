"""Shared hysteresis helpers for alert rule evaluation.

FIRE requires N consecutive qualifying samples.
CLEAR requires M consecutive clear samples beyond a deadband.
A gap longer than max_gap_seconds breaks the consecutive count; missing
data is evidence neither for nor against the condition.
"""

from __future__ import annotations

from collections.abc import Callable, Sequence
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import TypeVar

T = TypeVar("T")

DEFAULT_CONSECUTIVE_N = 3
DEFAULT_CLEAR_M = 3
DEFAULT_DEADBAND_FRAC = 0.05
DEFAULT_REFIRE_HOURS = 6.0


def ensure_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def param_int(params: dict, key: str, default: int) -> int:
    raw = params.get(key, default)
    try:
        return max(1, int(raw))
    except (TypeError, ValueError):
        return default


def param_float(params: dict, key: str, default: float) -> float:
    raw = params.get(key, default)
    try:
        return float(raw)
    except (TypeError, ValueError):
        return default


@dataclass(frozen=True)
class SamplePoint:
    """One evaluated sample with a timestamp for gap detection."""

    recorded_at: datetime
    value: float | None = None


def streak_ok(
    points: Sequence[SamplePoint],
    qualify: Callable[[SamplePoint], bool | None],
    *,
    needed: int,
    max_gap_seconds: float,
) -> bool:
    """True when the newest `needed` contiguous samples all qualify.

    `qualify` returns True (counts), False (breaks), or None (gap/skip break).
    Points must be sorted oldest → newest. Evaluates from the newest end.
    """
    if needed < 1 or len(points) < needed:
        return False

    count = 0
    prev_at: datetime | None = None
    for point in reversed(points):
        at = ensure_utc(point.recorded_at)
        if prev_at is not None:
            gap = (prev_at - at).total_seconds()
            if gap > max_gap_seconds:
                return False
        verdict = qualify(point)
        if verdict is None:
            return False
        if not verdict:
            return False
        count += 1
        prev_at = at
        if count >= needed:
            return True
    return False


def deadband_bounds(
    low: float,
    high: float,
    deadband_frac: float = DEFAULT_DEADBAND_FRAC,
) -> tuple[float, float]:
    """Return clear thresholds inset from the fire band by a deadband.

    Fire outside [low, high]; clear only once inside [low+db, high-db].
    """
    width = abs(high - low)
    db = width * deadband_frac
    return (low + db, high - db)


def is_night_hour(recorded_at: datetime, *, night_start: int = 18, night_end: int = 6) -> bool:
    """Local-clock night using the reading's timezone (UTC if naive)."""
    at = ensure_utc(recorded_at)
    hour = at.hour
    if night_start > night_end:
        return hour >= night_start or hour < night_end
    return night_start <= hour < night_end
