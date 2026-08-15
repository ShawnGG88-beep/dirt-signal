"""Mock sensor implementations for development without hardware."""

from __future__ import annotations

import random
from datetime import datetime, timezone

from sensors.base import (
    AmbientReading,
    AmbientSensor,
    MoistureReading,
    MoistureSensor,
    NpkReading,
    NpkSensor,
    PhReading,
    PhSensor,
    SoilTempReading,
    SoilTempSensor,
)


def _diurnal_offset(hours_amplitude: float) -> float:
    """Small sine-like drift based on time of day."""
    hour = datetime.now(timezone.utc).hour
    return hours_amplitude * ((hour - 12) / 12)


class MockMoistureSensor:
    def __init__(self) -> None:
        self._base_pct = random.uniform(35.0, 55.0)

    def read(self) -> MoistureReading:
        drift = random.uniform(-2.0, 2.0)
        pct = max(5.0, min(95.0, self._base_pct + drift))
        raw = int(18000 + (pct / 100.0) * 14000)
        return MoistureReading(raw=raw, pct=round(pct, 2))


class MockPhSensor:
    def __init__(self) -> None:
        self._base = random.uniform(6.2, 7.4)

    def read(self) -> PhReading:
        value = max(4.5, min(8.5, self._base + random.uniform(-0.15, 0.15)))
        return PhReading(value=round(value, 2))


class MockAmbientSensor:
    def read(self) -> AmbientReading:
        temp = 18.0 + _diurnal_offset(6.0) + random.uniform(-1.5, 1.5)
        humidity = max(
            25.0,
            min(95.0, 55.0 - _diurnal_offset(10.0) + random.uniform(-5.0, 5.0)),
        )
        return AmbientReading(
            temp_c=round(temp, 1),
            humidity_pct=round(humidity, 2),
        )


class MockSoilTempSensor:
    def read(self) -> SoilTempReading:
        temp = 16.0 + _diurnal_offset(4.0) + random.uniform(-0.8, 0.8)
        return SoilTempReading(temp_c=round(temp, 1))


class MockNpkSensor:
    def __init__(self) -> None:
        self._n = random.uniform(25.0, 70.0)
        self._p = random.uniform(15.0, 45.0)
        self._k = random.uniform(40.0, 110.0)
        self._ec = random.uniform(250.0, 700.0)

    def read(self) -> NpkReading:
        return NpkReading(
            moisture_pct=round(
                max(5.0, min(95.0, 45.0 + random.uniform(-4.0, 4.0))), 2
            ),
            temp_c=round(16.0 + _diurnal_offset(4.0) + random.uniform(-0.8, 0.8), 1),
            ec_us_cm=int(max(0.0, self._ec + random.uniform(-40.0, 40.0))),
            ph=round(max(4.5, min(8.5, 6.8 + random.uniform(-0.15, 0.15))), 2),
            n_est=int(max(0.0, self._n + random.uniform(-5.0, 5.0))),
            p_est=int(max(0.0, self._p + random.uniform(-4.0, 4.0))),
            k_est=int(max(0.0, self._k + random.uniform(-6.0, 6.0))),
        )


def build_mock_sensors() -> tuple[
    MoistureSensor, PhSensor, AmbientSensor, SoilTempSensor, NpkSensor
]:
    return (
        MockMoistureSensor(),
        MockPhSensor(),
        MockAmbientSensor(),
        MockSoilTempSensor(),
        MockNpkSensor(),
    )
