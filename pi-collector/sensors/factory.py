"""Sensor factory: selects mock or real implementations from config."""

from __future__ import annotations

from typing import Literal

from sensors.base import AmbientSensor, MoistureSensor, PhSensor, SoilTempSensor
from sensors.dht22 import Dht22Sensor
from sensors.ds18b20 import Ds18b20Sensor
from sensors.mock import build_mock_sensors
from sensors.moisture import Ads1115MoistureSensor
from sensors.ph import Ads1115PhSensor

SensorMode = Literal["mock", "real"]


def build_sensors(
    mode: SensorMode,
) -> tuple[MoistureSensor, PhSensor, AmbientSensor, SoilTempSensor]:
    if mode == "mock":
        return build_mock_sensors()
    return (
        Ads1115MoistureSensor(),
        Ads1115PhSensor(),
        Dht22Sensor(),
        Ds18b20Sensor(),
    )
