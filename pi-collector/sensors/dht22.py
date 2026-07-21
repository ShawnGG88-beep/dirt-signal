"""DHT22 ambient temperature and humidity via GPIO27 (physical pin 13)."""

from __future__ import annotations

import logging
import time

import adafruit_dht
import board

from sensors.base import AmbientReading

logger = logging.getLogger("dirt-signal.collector.dht22")

# BCM GPIO27 = physical pin 13 on the 40-pin header.
_DHT22_PIN = board.D27
# DHT22 needs ~2s between reads; short pause before the single retry.
_RETRY_DELAY_S = 2.0


class Dht22Sensor:
    def __init__(self) -> None:
        # use_pulseio=False is required on Raspberry Pi (pulseio is unreliable).
        self._device = adafruit_dht.DHT22(_DHT22_PIN, use_pulseio=False)

    def read(self) -> AmbientReading:
        try:
            return self._read_once()
        except Exception as first_exc:
            logger.warning(
                "DHT22 read failed (%s); retrying once",
                first_exc,
            )
            time.sleep(_RETRY_DELAY_S)
            try:
                return self._read_once()
            except Exception as exc:
                logger.warning(
                    "DHT22 read failed after retry: %s",
                    exc,
                )
                raise

    def _read_once(self) -> AmbientReading:
        temperature = self._device.temperature
        humidity = self._device.humidity
        if temperature is None or humidity is None:
            raise RuntimeError(
                f"DHT22 returned None (temp={temperature}, humidity={humidity})"
            )
        return AmbientReading(
            temp_c=round(float(temperature), 1),
            humidity_pct=round(float(humidity), 2),
        )
