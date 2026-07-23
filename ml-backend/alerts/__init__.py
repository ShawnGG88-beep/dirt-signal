"""Alerting layer: rule evaluation, hysteresis, and firing history."""

from __future__ import annotations

__all__ = [
    "AlertEngine",
    "get_alert_engine",
    "start_alert_engine",
    "stop_alert_engine",
]


def __getattr__(name: str):
    if name in __all__:
        from alerts import engine as _engine

        return getattr(_engine, name)
    raise AttributeError(f"module {__name!r} has no attribute {name!r}")
