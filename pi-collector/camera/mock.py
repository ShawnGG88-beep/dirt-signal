"""Mock camera: placeholder JPEG + fabricated NDVI estimate."""

from __future__ import annotations

import random
from pathlib import Path

from camera.base import CaptureResult

_PLACEHOLDER_PATH = Path(__file__).parent / "placeholder.jpg"


class MockCamera:
    """Returns a bundled placeholder JPEG and a plausible NDVI estimate."""

    available: bool = True

    def __init__(self) -> None:
        self._base_ndvi = random.uniform(0.35, 0.65)
        self._jpeg = _PLACEHOLDER_PATH.read_bytes()

    def capture(self) -> CaptureResult:
        ndvi = max(0.05, min(0.95, self._base_ndvi + random.uniform(-0.08, 0.08)))
        return CaptureResult(
            image_jpeg=self._jpeg,
            ndvi_estimate=round(ndvi, 3),
        )


def build_mock_camera() -> MockCamera:
    return MockCamera()
