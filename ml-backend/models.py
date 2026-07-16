"""Pydantic models for API request and response bodies."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

NutrientLevel = Literal["depleted", "low", "medium", "high", "surplus"]


class SensorReading(BaseModel):
    id: int
    device_id: str
    recorded_at: datetime
    moisture_raw: int | None = None
    moisture_pct: float | None = None
    soil_temp_c: float | None = None
    ambient_temp_c: float | None = None
    ambient_humidity_pct: float | None = None
    ph: float | None = None
    ec_us_cm: int | None = None
    npk_n_est: int | None = None
    npk_p_est: int | None = None
    npk_k_est: int | None = None
    probe_depth_cm: float | None = None
    # Provenance: profile in effect at insert. NULL on pre-migration rows.
    crop_type_at_reading: str | None = None
    lifecycle_stage_at_reading: str | None = None


class LatestReadingResponse(BaseModel):
    device_name: str
    reading: SensorReading | None = None
    crop_type: str = "tomato"
    lifecycle_stage: str = "mature"
    device_id: str | None = None


class ReadingsRangeResponse(BaseModel):
    device_name: str
    from_at: datetime
    to_at: datetime
    readings: list[SensorReading] = Field(default_factory=list)
    count: int = 0
    crop_type: str = "tomato"
    lifecycle_stage: str = "mature"
    device_id: str | None = None


class DeviceProfileUpdate(BaseModel):
    crop_type: str
    lifecycle_stage: str


class DeviceResponse(BaseModel):
    id: str
    name: str
    crop_type: str
    lifecycle_stage: str


class ProfileStageOption(BaseModel):
    lifecycle_stage: str
    display_name: str


class ProfileCropOption(BaseModel):
    crop_type: str
    display_name: str
    lifecycle_stages: list[ProfileStageOption] = Field(default_factory=list)


class DeviceProfileOptionsResponse(BaseModel):
    crops: list[ProfileCropOption] = Field(default_factory=list)


class SoilTestCreate(BaseModel):
    device_name: str = "pi-garden-01"
    tested_at: datetime
    ph_strip: float | None = None
    n_level: NutrientLevel
    p_level: NutrientLevel
    k_level: NutrientLevel
    notes: str | None = None


class SoilTest(SoilTestCreate):
    id: int
    device_id: str


class SoilTestResponse(BaseModel):
    soil_test: SoilTest
