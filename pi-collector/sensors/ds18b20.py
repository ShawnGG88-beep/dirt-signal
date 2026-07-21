"""DS18B20 soil temperature via 1-Wire (w1thermsensor)."""

from __future__ import annotations

import logging
import time

from w1thermsensor import W1ThermSensor

from sensors.base import SoilTempReading

logger = logging.getLogger("dirt-signal.collector.ds18b20")

_RETRY_DELAY_S = 1.0


class Ds18b20Sensor:
    def __init__(self) -> None:
        # Uses the first detected DS18B20 on the 1-Wire bus (typically GPIO4).
        self._sensor = W1ThermSensor()

    def read(self) -> SoilTempReading:
        try:
            return self._read_once()
        except Exception as first_exc:
            logger.warning(
                "DS18B20 read failed (%s); retrying once",
                first_exc,
            )
            time.sleep(_RETRY_DELAY_S)
            try:
                return self._read_once()
            except Exception as exc:
                logger.warning(
                    "DS18B20 read failed after retry: %s",
                    exc,
                )
                raise

    def _read_once(self) -> SoilTempReading:
        temperature = self._sensor.get_temperature()
        if temperature is None:
            raise RuntimeError("DS18B20 returned None temperature")
        return SoilTempReading(temp_c=round(float(temperature), 1))
