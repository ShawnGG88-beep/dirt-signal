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
    timezone: str = "Africa/Johannesburg"
    season_start_date: str | None = None


class ReadingsRangeResponse(BaseModel):
    device_name: str
    from_at: datetime
    to_at: datetime
    readings: list[SensorReading] = Field(default_factory=list)
    count: int = 0
    crop_type: str = "tomato"
    lifecycle_stage: str = "mature"
    device_id: str | None = None
    timezone: str = "Africa/Johannesburg"
    season_start_date: str | None = None


class DeviceProfileUpdate(BaseModel):
    crop_type: str | None = None
    lifecycle_stage: str | None = None
    season_start_date: str | None = None
    clear_season_start: bool = False


class DeviceResponse(BaseModel):
    id: str
    name: str
    crop_type: str
    lifecycle_stage: str
    timezone: str = "Africa/Johannesburg"
    season_start_date: str | None = None


class DailyAggregateRow(BaseModel):
    day: str
    sample_count: int
    coverage_hours: int
    moisture_pct_min: float | None = None
    moisture_pct_max: float | None = None
    moisture_pct_mean: float | None = None
    moisture_pct_count: int = 0
    ph_min: float | None = None
    ph_max: float | None = None
    ph_mean: float | None = None
    ph_count: int = 0
    soil_temp_c_min: float | None = None
    soil_temp_c_max: float | None = None
    soil_temp_c_mean: float | None = None
    soil_temp_c_count: int = 0
    ambient_temp_c_min: float | None = None
    ambient_temp_c_max: float | None = None
    ambient_temp_c_mean: float | None = None
    ambient_temp_c_count: int = 0
    ambient_humidity_pct_min: float | None = None
    ambient_humidity_pct_max: float | None = None
    ambient_humidity_pct_mean: float | None = None
    ambient_humidity_pct_count: int = 0
    vpd_kpa_mean: float | None = None
    vpd_kpa_count: int = 0
    gdd_day: float | None = None
    high_humidity_hours: int = 0
    incomplete: bool = False


class DailyAggregatesResponse(BaseModel):
    device_name: str
    device_id: str
    timezone: str
    season_start_date: str | None = None
    crop_type: str
    lifecycle_stage: str
    gdd_base_c: float
    from_at: datetime
    to_at: datetime
    days: list[DailyAggregateRow] = Field(default_factory=list)
    count: int = 0
    cumulative_gdd: float | None = None
    days_elapsed: int | None = None
    days_excluded: int = 0
    cumulative_gdd_unavailable_reason: str | None = None


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


class PlantEventCreate(BaseModel):
    device_name: str = "pi-garden-01"
    occurred_at: datetime
    event_type: str
    quantity: float | None = None
    quantity_unit: str | None = None
    note: str | None = None
    source: Literal["manual", "system"] = "manual"


class PlantEventUpdate(BaseModel):
    occurred_at: datetime | None = None
    event_type: str | None = None
    quantity: float | None = None
    quantity_unit: str | None = None
    note: str | None = None
    # True clears quantity/unit (PATCH cannot distinguish omit vs null otherwise).
    clear_quantity: bool = False


class PlantEvent(BaseModel):
    id: str
    device_id: str
    occurred_at: datetime
    created_at: datetime
    event_type: str
    quantity: float | None = None
    quantity_unit: str | None = None
    note: str | None = None
    source: str
    crop_type_at_event: str | None = None
    lifecycle_stage_at_event: str | None = None


class PlantEventResponse(BaseModel):
    event: PlantEvent


class PlantEventsListResponse(BaseModel):
    device_name: str
    events: list[PlantEvent] = Field(default_factory=list)
    count: int = 0


AlertSeverity = Literal["info", "warning", "critical"]
AlertRuleType = Literal[
    "frost_risk",
    "sustained_out_of_bounds",
    "approaching_bound",
    "collector_silence",
    "irrigation_due",
    "disease_pressure",
]


class AlertEvent(BaseModel):
    id: str
    rule_id: str
    device_id: str
    opened_at: datetime
    closed_at: datetime | None = None
    severity: AlertSeverity
    metric_key: str | None = None
    trigger_value: float | None = None
    message: str
    notified: bool = False
    acknowledged_at: datetime | None = None
    ack_note: str | None = None
    # Joined from alert_rules for UI convenience
    rule_type: AlertRuleType | None = None
    rule_notify: bool | None = None
    rule_enabled: bool | None = None


class AlertEventsListResponse(BaseModel):
    device_name: str
    alerts: list[AlertEvent] = Field(default_factory=list)
    count: int = 0


class AlertAcknowledgeBody(BaseModel):
    note: str | None = None


class AlertEventResponse(BaseModel):
    alert: AlertEvent


class AlertRule(BaseModel):
    id: str
    device_id: str | None = None
    rule_type: AlertRuleType
    enabled: bool
    notify: bool
    params: dict = Field(default_factory=dict)
    snoozed_until: datetime | None = None
    created_at: datetime
    updated_at: datetime
    fired_7d: int = 0
    fired_30d: int = 0
    last_fired_at: datetime | None = None


class AlertRulesListResponse(BaseModel):
    device_name: str
    rules: list[AlertRule] = Field(default_factory=list)
    count: int = 0


class AlertRuleUpdate(BaseModel):
    enabled: bool | None = None
    notify: bool | None = None
    params: dict | None = None
    snoozed_until: datetime | None = None
    clear_snooze: bool = False


class AlertRuleResponse(BaseModel):
    rule: AlertRule


class AlertEvaluateResponse(BaseModel):
    evaluated_at: datetime
    devices: int
    rules: int
    evaluated: int
    opened: int
    closed: int
