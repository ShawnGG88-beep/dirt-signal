"""HW-390 capacitive moisture via ADS1115 channel A0 (I2C)."""

from __future__ import annotations

import logging
import time

import board
from adafruit_ads1x15 import ADS1115, AnalogIn, ads1x15

from sensors.base import MoistureReading

logger = logging.getLogger("dirt-signal.collector.moisture")

_RETRY_DELAY_S = 1.0


class Ads1115MoistureSensor:
    def __init__(self, *, dry_raw: int, wet_raw: int) -> None:
        if dry_raw <= wet_raw:
            raise ValueError(
                f"moisture_dry_raw ({dry_raw}) must be greater than "
                f"moisture_wet_raw ({wet_raw}) for this capacitive sensor"
            )
        self._dry_raw = dry_raw
        self._wet_raw = wet_raw
        i2c = board.I2C()
        ads = ADS1115(i2c)
        self._channel = AnalogIn(ads, ads1x15.Pin.A0)

    def read(self) -> MoistureReading:
        try:
            return self._read_once()
        except Exception as first_exc:
            logger.warning(
                "ADS1115 moisture read failed (%s); retrying once",
                first_exc,
            )
            time.sleep(_RETRY_DELAY_S)
            try:
                return self._read_once()
            except Exception as exc:
                logger.warning(
                    "ADS1115 moisture read failed after retry: %s",
                    exc,
                )
                raise

    def _read_once(self) -> MoistureReading:
        raw = int(self._channel.value)
        return MoistureReading(raw=raw, pct=self._raw_to_pct(raw))

    def _raw_to_pct(self, raw: int) -> float:
        # Dry reads higher than wet; invert so lower raw → higher %.
        span = self._dry_raw - self._wet_raw
        pct = (self._dry_raw - raw) / span * 100.0
        return round(max(0.0, min(100.0, pct)), 2)
