"""Generic disease severity value accumulator."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timezone


@dataclass
class DsvState:
    accumulated: float
    threshold: float
    days_since_reset: int
    spray_recommended: bool
    crossed_today: bool
    last_computed_day: str | None


def apply_daily_dsv(
    *,
    accumulated: float,
    threshold: float,
    daily_score: float,
    days_since_reset: int,
) -> DsvState:
    """Add one closed day's score; reset when threshold crossed (TOM-CAST)."""
    total = accumulated + max(0.0, daily_score)
    crossed = total >= threshold
    if crossed:
        return DsvState(
            accumulated=0.0,
            threshold=threshold,
            days_since_reset=0,
            spray_recommended=True,
            crossed_today=True,
            last_computed_day=None,
        )
    return DsvState(
        accumulated=total,
        threshold=threshold,
        days_since_reset=days_since_reset + 1,
        spray_recommended=False,
        crossed_today=False,
        last_computed_day=None,
    )


def provisional_today_score(
    *,
    accumulated: float,
    threshold: float,
    today_score: float,
) -> tuple[float, bool]:
    """In-memory only; never persisted until day closes."""
    projected = accumulated + max(0.0, today_score)
    return projected, projected >= threshold
