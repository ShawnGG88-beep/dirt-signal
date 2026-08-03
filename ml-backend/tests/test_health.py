"""GET /health collector interval source-of-truth and fallback chain.

Order: devices.collector_interval_seconds, then COLLECTOR_INTERVAL_SECONDS,
then the default of 30. A Supabase outage must never turn the health probe
into an error response.
"""

from __future__ import annotations

import pytest

import db
import main


def _device_row(interval: int | None) -> dict:
    return {
        "id": "00000000-0000-0000-0000-000000000000",
        "name": "pi-garden-01",
        "crop_type": "tomato",
        "lifecycle_stage": "mature",
        "timezone": "Africa/Johannesburg",
        "season_start_date": None,
        "collector_interval_seconds": interval,
    }


def test_health_prefers_device_row(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("COLLECTOR_INTERVAL_SECONDS", "77")
    monkeypatch.setattr(db, "resolve_device", lambda name: _device_row(900))
    result = main.health(device_name="pi-garden-01")
    assert result == {"status": "ok", "collector_interval_seconds": 900}


def test_health_falls_back_to_env_when_column_missing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Pre-009 rows normalise to None and defer to the env var."""
    monkeypatch.setenv("COLLECTOR_INTERVAL_SECONDS", "77")
    monkeypatch.setattr(db, "resolve_device", lambda name: _device_row(None))
    result = main.health(device_name="pi-garden-01")
    assert result == {"status": "ok", "collector_interval_seconds": 77}


def test_health_falls_back_to_env_when_supabase_unreachable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def boom(name: str) -> dict:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")

    monkeypatch.setenv("COLLECTOR_INTERVAL_SECONDS", "77")
    monkeypatch.setattr(db, "resolve_device", boom)
    result = main.health(device_name="pi-garden-01")
    assert result == {"status": "ok", "collector_interval_seconds": 77}


def test_health_defaults_to_30_without_env(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("COLLECTOR_INTERVAL_SECONDS", raising=False)
    monkeypatch.setattr(
        db, "resolve_device", lambda name: (_ for _ in ()).throw(RuntimeError())
    )
    result = main.health(device_name="pi-garden-01")
    assert result == {"status": "ok", "collector_interval_seconds": 30}


def test_device_row_normalises_invalid_interval() -> None:
    row = db._device_from_row(
        {"id": "x", "collector_interval_seconds": "not-a-number"}
    )
    assert row["collector_interval_seconds"] is None
    row = db._device_from_row({"id": "x", "collector_interval_seconds": 0})
    assert row["collector_interval_seconds"] is None
    row = db._device_from_row({"id": "x", "collector_interval_seconds": 900})
    assert row["collector_interval_seconds"] == 900
