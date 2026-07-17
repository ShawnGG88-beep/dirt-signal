"""Common camera interfaces for Dirt Signal."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class CaptureResult:
    """JPEG image bytes plus an optional vegetation-index estimate.

    ndvi_estimate stays None for real camera captures until a true
    band-separated (or carefully constrained proxy) calculation exists.
    """

    image_jpeg: bytes
    ndvi_estimate: float | None = None


class Camera(Protocol):
    available: bool

    def capture(self) -> CaptureResult: ...
