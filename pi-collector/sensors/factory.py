"""Sensor factory: selects mock or real implementations per sensor from config."""

from __future__ import annotations

from typing import Literal

from sensors.base import (
    AmbientSensor,
    MoistureSensor,
    NpkSensor,
    PhSensor,
    SoilTempSensor,
)
from sensors.mock import (
    MockAmbientSensor,
    MockMoistureSensor,
    MockNpkSensor,
    MockPhSensor,
    MockSoilTempSensor,
)

SensorMode = Literal["mock", "real"]


def build_sensors(
    *,
    ds18b20_mode: SensorMode = "mock",
    dht22_mode: SensorMode = "mock",
    moisture_mode: SensorMode = "mock",
    ph_mode: SensorMode = "mock",
    npk_mode: SensorMode = "mock",
    moisture_dry_raw: int | None = None,
    moisture_wet_raw: int | None = None,
    ph_cal_401_raw: int | None = None,
    ph_cal_686_raw: int | None = None,
    ph_cal_918_raw: int | None = None,
) -> tuple[MoistureSensor, PhSensor, AmbientSensor, SoilTempSensor, NpkSensor]:
    # Real drivers are imported only when selected so collector startup
    # (including sync_sensor_modes) works on hosts without Pi packages.
    if moisture_mode == "real":
        if moisture_dry_raw is None or moisture_wet_raw is None:
            raise RuntimeError(
                "moisture_mode: real requires moisture_dry_raw and "
                "moisture_wet_raw in config.yaml"
            )
        from sensors.moisture import Ads1115MoistureSensor

        moisture: MoistureSensor = Ads1115MoistureSensor(
            dry_raw=moisture_dry_raw,
            wet_raw=moisture_wet_raw,
        )
    else:
        moisture = MockMoistureSensor()
    if ph_mode == "real":
        if (
            ph_cal_401_raw is None
            or ph_cal_686_raw is None
            or ph_cal_918_raw is None
        ):
            raise RuntimeError(
                "ph_mode: real requires ph_cal_401_raw, ph_cal_686_raw, "
                "and ph_cal_918_raw in config.yaml"
            )
        from sensors.ph import Ads1115PhSensor

        ph: PhSensor = Ads1115PhSensor(
            cal_401_raw=ph_cal_401_raw,
            cal_686_raw=ph_cal_686_raw,
            cal_918_raw=ph_cal_918_raw,
        )
    else:
        ph = MockPhSensor()
    if dht22_mode == "real":
        from sensors.dht22 import Dht22Sensor

        ambient: AmbientSensor = Dht22Sensor()
    else:
        ambient = MockAmbientSensor()
    if ds18b20_mode == "real":
        from sensors.ds18b20 import Ds18b20Sensor

        soil_temp: SoilTempSensor = Ds18b20Sensor()
    else:
        soil_temp = MockSoilTempSensor()
    if npk_mode == "real":
        from sensors.npk import Rs485NpkSensor

        npk: NpkSensor = Rs485NpkSensor()
    else:
        npk = MockNpkSensor()
    return moisture, ph, ambient, soil_temp, npk
