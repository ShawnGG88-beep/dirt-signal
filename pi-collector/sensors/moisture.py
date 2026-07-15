"""Real moisture sensor via ADS1115 (stub until hardware is wired)."""

from __future__ import annotations

from sensors.base import MoistureReading


class Ads1115MoistureSensor:
    def read(self) -> MoistureReading:
        raise NotImplementedError(
            "ADS1115 moisture sensor not yet wired. Set sensor_mode: mock in config.yaml."
        )
