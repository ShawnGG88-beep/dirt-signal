"""Persist DSV state in device_disease_dsv."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from advisories.climate_merge import DailyClimate, days_to_commit
from advisories.constants import EARLY_BLIGHT_DSV_THRESHOLD, LATE_BLIGHT_DSV_THRESHOLD
from advisories.dsv import DsvState, apply_daily_dsv
from advisories.tomato_early_blight import score_early_blight_day
from advisories.tomato_late_blight import score_late_blight_day
from day_night import local_day_key


DISEASE_KEYS = ("early_blight", "late_blight")
DEFAULT_THRESHOLDS = {
    "early_blight": EARLY_BLIGHT_DSV_THRESHOLD,
    "late_blight": LATE_BLIGHT_DSV_THRESHOLD,
}


def _threshold_for(disease_key: str, params: dict[str, Any] | None) -> float:
    if params and "dsv_threshold" in params:
        try:
            return float(params["dsv_threshold"])
        except (TypeError, ValueError):
            pass
    return DEFAULT_THRESHOLDS.get(disease_key, 15.0)


def load_dsv_row(client: Any, device_id: str, disease_key: str) -> dict[str, Any]:
    response = (
        client.table("device_disease_dsv")
        .select("*")
        .eq("device_id", device_id)
        .eq("disease_key", disease_key)
        .limit(1)
        .execute()
    )
    rows = response.data or []
    if rows:
        return rows[0]
    threshold = DEFAULT_THRESHOLDS.get(disease_key, 15.0)
    row = {
        "device_id": device_id,
        "disease_key": disease_key,
        "accumulated_dsv": 0.0,
        "threshold": threshold,
        "last_computed_day": None,
        "spray_recommended": False,
        "last_reset_at": None,
    }
    client.table("device_disease_dsv").upsert(row).execute()
    return row


def save_dsv_row(client: Any, row: dict[str, Any]) -> None:
    row["updated_at"] = datetime.now(timezone.utc).isoformat()
    client.table("device_disease_dsv").upsert(row).execute()


def load_latest_advisory_digest(
    client: Any, device_id: str
) -> dict[str, Any] | None:
    """Read-only: latest precomputed digest from device_advisories_daily."""
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
        return None
    row = rows[0]
    digest = row.get("digest")
    if not isinstance(digest, dict):
        return None
    computed_at = row.get("computed_at")
    if computed_at is not None:
        digest = {**digest, "_computed_at": computed_at}
    return digest


def commit_closed_days(
    client: Any,
    device_id: str,
    disease_key: str,
    daily_series: list[DailyClimate],
    *,
    now: datetime,
    tz_name: str,
    params: dict[str, Any] | None = None,
) -> DsvState:
    """Commit DSV for closed days only (skip open day idempotency)."""
    row = load_dsv_row(client, device_id, disease_key)
    threshold = _threshold_for(disease_key, params)
    accumulated = float(row.get("accumulated_dsv") or 0.0)
    last_computed = row.get("last_computed_day")
    last_day_str = str(last_computed)[:10] if last_computed else None
    days_since_reset = 0
    if row.get("last_reset_at"):
        days_since_reset = max(0, (now.date() - datetime.fromisoformat(str(row["last_reset_at"])[:10]).date()).days)

    today = local_day_key(now, tz_name)
    commit_days = days_to_commit(last_day_str, today)
    by_day = {d.day: d for d in daily_series}
    scorer = score_early_blight_day if disease_key == "early_blight" else score_late_blight_day

    spray_recommended = bool(row.get("spray_recommended"))
    crossed_today = False
    for day in commit_days:
        daily = by_day.get(day)
        if daily is None or daily.source != "observed":
            continue
        score = scorer(daily)
        state = apply_daily_dsv(
            accumulated=accumulated,
            threshold=threshold,
            daily_score=score,
            days_since_reset=days_since_reset,
        )
        accumulated = state.accumulated
        days_since_reset = state.days_since_reset
        if state.spray_recommended:
            spray_recommended = True
            crossed_today = True
            row["last_reset_at"] = datetime.now(timezone.utc).isoformat()
        last_day_str = day

    row.update(
        {
            "accumulated_dsv": accumulated,
            "threshold": threshold,
            "last_computed_day": last_day_str,
            "spray_recommended": spray_recommended,
        }
    )
    save_dsv_row(client, row)
    return DsvState(
        accumulated=accumulated,
        threshold=threshold,
        days_since_reset=days_since_reset,
        spray_recommended=spray_recommended,
        crossed_today=crossed_today,
        last_computed_day=last_day_str,
    )
