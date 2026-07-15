"""DHT22 ambient sensor (stub until hardware is wired)."""

from __future__ import annotations

from sensors.base import AmbientReading


class Dht22Sensor:
    def read(self) -> AmbientReading:
        raise NotImplementedError(
            "DHT22 not yet wired. Set sensor_mode: mock in config.yaml."
        )
