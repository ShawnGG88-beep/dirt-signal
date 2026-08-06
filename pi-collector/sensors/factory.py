"""Sensor factory: selects mock or real implementations per sensor from config."""

from __future__ import annotations

from typing import Literal

from sensors.base import AmbientSensor, MoistureSensor, PhSensor, SoilTempSensor
from sensors.dht22 import Dht22Sensor
from sensors.ds18b20 import Ds18b20Sensor
from sensors.mock import (
    MockAmbientSensor,
    MockMoistureSensor,
    MockPhSensor,
    MockSoilTempSensor,
)
from sensors.moisture import Ads1115MoistureSensor
from sensors.ph import Ads1115PhSensor

SensorMode = Literal["mock", "real"]


def build_sensors(
    *,
    ds18b20_mode: SensorMode = "mock",
    dht22_mode: SensorMode = "mock",
    moisture_mode: SensorMode = "mock",
    ph_mode: SensorMode = "mock",
    moisture_dry_raw: int | None = None,
    moisture_wet_raw: int | None = None,
) -> tuple[MoistureSensor, PhSensor, AmbientSensor, SoilTempSensor]:
    if moisture_mode == "real":
        if moisture_dry_raw is None or moisture_wet_raw is None:
            raise RuntimeError(
                "moisture_mode: real requires moisture_dry_raw and "
                "moisture_wet_raw in config.yaml"
            )
        moisture: MoistureSensor = Ads1115MoistureSensor(
            dry_raw=moisture_dry_raw,
            wet_raw=moisture_wet_raw,
        )
    else:
        moisture = MockMoistureSensor()
    ph: PhSensor = (
        Ads1115PhSensor() if ph_mode == "real" else MockPhSensor()
    )
    ambient: AmbientSensor = (
        Dht22Sensor() if dht22_mode == "real" else MockAmbientSensor()
    )
    soil_temp: SoilTempSensor = (
        Ds18b20Sensor() if ds18b20_mode == "real" else MockSoilTempSensor()
    )
    return moisture, ph, ambient, soil_temp
