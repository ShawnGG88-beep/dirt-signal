"""Common camera interfaces for Dirt Signal."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class CaptureResult:
    """JPEG image bytes plus a vegetation-index estimate."""

    image_jpeg: bytes
    ndvi_estimate: float


class Camera(Protocol):
    def capture(self) -> CaptureResult: ...
