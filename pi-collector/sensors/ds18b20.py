"""DS18B20 soil temperature sensor (stub until hardware is wired)."""

from __future__ import annotations

from sensors.base import SoilTempReading


class Ds18b20Sensor:
    def read(self) -> SoilTempReading:
        raise NotImplementedError(
            "DS18B20 not yet wired. Set sensor_mode: mock in config.yaml."
        )
