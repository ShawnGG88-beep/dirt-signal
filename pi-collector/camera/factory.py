"""Camera factory: selects mock or real implementation from config."""

from __future__ import annotations

from typing import Literal

from camera.base import Camera
from camera.mock import build_mock_camera
from camera.picamera_capture import (
    DEFAULT_CAPTURE_HEIGHT,
    DEFAULT_CAPTURE_WIDTH,
    PiCameraCapture,
)

CameraMode = Literal["mock", "real"]


def build_camera(
    mode: CameraMode,
    *,
    width: int = DEFAULT_CAPTURE_WIDTH,
    height: int = DEFAULT_CAPTURE_HEIGHT,
    device_id: str = "unknown",
) -> Camera:
    if mode == "mock":
        return build_mock_camera()
    return PiCameraCapture(width=width, height=height, device_id=device_id)
