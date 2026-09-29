"""Camera factory: selects mock or real implementation from config."""

from __future__ import annotations

from typing import Literal

from camera.base import Camera
from camera.mock import build_mock_camera

CameraMode = Literal["mock", "real"]

DEFAULT_CAPTURE_WIDTH = 2304
DEFAULT_CAPTURE_HEIGHT = 1296


def build_camera(
    mode: CameraMode,
    *,
    width: int = DEFAULT_CAPTURE_WIDTH,
    height: int = DEFAULT_CAPTURE_HEIGHT,
    device_id: str = "unknown",
) -> Camera:
    if mode == "mock":
        return build_mock_camera()
    from camera.picamera_capture import PiCameraCapture

    return PiCameraCapture(width=width, height=height, device_id=device_id)
