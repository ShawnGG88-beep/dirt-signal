"""Common sensor interfaces for Dirt Signal."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class MoistureReading:
    raw: int
    pct: float


@dataclass(frozen=True)
class PhReading:
    value: float


@dataclass(frozen=True)
class AmbientReading:
    temp_c: float
    humidity_pct: float


@dataclass(frozen=True)
class SoilTempReading:
    temp_c: float


class MoistureSensor(Protocol):
    def read(self) -> MoistureReading: ...


class PhSensor(Protocol):
    def read(self) -> PhReading: ...


class AmbientSensor(Protocol):
    def read(self) -> AmbientReading: ...


class SoilTempSensor(Protocol):
    def read(self) -> SoilTempReading: ...
