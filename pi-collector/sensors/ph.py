"""Real pH probe via ADS1115 (stub until hardware is wired)."""

from __future__ import annotations

from sensors.base import PhReading


class Ads1115PhSensor:
    def read(self) -> PhReading:
        raise NotImplementedError(
            "ADS1115 pH sensor not yet wired. Set ph_mode: mock in config.yaml."
        )
