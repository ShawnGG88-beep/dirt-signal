"""Analog pH probe via ADS1115 channel A1 (I2C).

Buffer calibration has not been done yet. Reads are uncalibrated voltage,
stored in PhReading.value (the collector's "ph" field) rather than a
calibrated pH number.
"""

from __future__ import annotations

import logging
import time

import board
from adafruit_ads1x15 import ADS1115, AnalogIn, ads1x15

from sensors.base import PhReading

logger = logging.getLogger("dirt-signal.collector.ph")

_RETRY_DELAY_S = 1.0
_UNCALIBRATED_WARNING = (
    "pH probe is uncalibrated; storing raw voltage in the ph field, "
    "not a calibrated pH value"
)


class Ads1115PhSensor:
    def __init__(self) -> None:
        i2c = board.I2C()
        ads = ADS1115(i2c)
        self._channel = AnalogIn(ads, ads1x15.Pin.A1)
        logger.warning(_UNCALIBRATED_WARNING)

    def read(self) -> PhReading:
        try:
            return self._read_once()
        except Exception as first_exc:
            logger.warning(
                "ADS1115 pH read failed (%s); retrying once",
                first_exc,
            )
            time.sleep(_RETRY_DELAY_S)
            try:
                return self._read_once()
            except Exception as exc:
                logger.warning(
                    "ADS1115 pH read failed after retry: %s",
                    exc,
                )
                raise

    def _read_once(self) -> PhReading:
        raw = int(self._channel.value)
        voltage = float(self._channel.voltage)
        logger.warning(
            "%s (voltage=%.3f V, ADC=%s)",
            _UNCALIBRATED_WARNING,
            voltage,
            raw,
        )
        return PhReading(value=round(voltage, 2))
