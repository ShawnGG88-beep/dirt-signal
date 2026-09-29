"""Analog pH probe via ADS1115 channel A1 (I2C).

Converts raw ADC counts to pH with piecewise linear interpolation between
three buffer calibration points (4.01, 6.86, 9.18). Raw endpoints come from
config.yaml; the buffer pH values are the standard Chinese buffer set.
"""

from __future__ import annotations

import logging
import time

import board
from adafruit_ads1x15 import ADS1115, AnalogIn, ads1x15

from sensors.base import PhReading

logger = logging.getLogger("dirt-signal.collector.ph")

_RETRY_DELAY_S = 1.0
_PH_401 = 4.01
_PH_686 = 6.86
_PH_918 = 9.18


class Ads1115PhSensor:
    def __init__(
        self,
        *,
        cal_401_raw: int,
        cal_686_raw: int,
        cal_918_raw: int,
    ) -> None:
        if not (cal_401_raw > cal_686_raw > cal_918_raw):
            raise ValueError(
                "pH calibration raw values must be strictly decreasing "
                f"(acidic reads higher): ph_cal_401_raw ({cal_401_raw}) > "
                f"ph_cal_686_raw ({cal_686_raw}) > "
                f"ph_cal_918_raw ({cal_918_raw})"
            )
        self._cal_401_raw = cal_401_raw
        self._cal_686_raw = cal_686_raw
        self._cal_918_raw = cal_918_raw
        i2c = board.I2C()
        ads = ADS1115(i2c)
        self._channel = AnalogIn(ads, ads1x15.Pin.A1)

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
        return PhReading(value=self._raw_to_ph(raw))

    def _raw_to_ph(self, raw: int) -> float:
        # Acidic buffers read higher raw. Calibrated range is
        # [_cal_918_raw, _cal_401_raw]. Use the 4.01–6.86 segment at and
        # above the 6.86 point; use 6.86–9.18 below it. Outside the full
        # range, extrapolate from the nearest segment and warn.
        if raw >= self._cal_686_raw:
            ph = _lerp(
                raw,
                self._cal_401_raw,
                _PH_401,
                self._cal_686_raw,
                _PH_686,
            )
            out_of_range = raw > self._cal_401_raw
        else:
            ph = _lerp(
                raw,
                self._cal_686_raw,
                _PH_686,
                self._cal_918_raw,
                _PH_918,
            )
            out_of_range = raw < self._cal_918_raw
        value = round(ph, 2)
        if out_of_range:
            logger.warning(
                "pH reading is outside the calibrated range "
                "(raw=%s → pH %.2f; calibrated raw range %s–%s); "
                "extrapolating from the nearest two points",
                raw,
                value,
                self._cal_918_raw,
                self._cal_401_raw,
            )
        return value


def _lerp(
    raw: int,
    raw_a: int,
    ph_a: float,
    raw_b: int,
    ph_b: float,
) -> float:
    return ph_a + (raw - raw_a) * (ph_b - ph_a) / (raw_b - raw_a)
