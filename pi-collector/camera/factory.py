"""Camera factory: selects mock or real implementation from config."""

from __future__ import annotations

from typing import Literal

from camera.base import Camera
from camera.mock import build_mock_camera
from camera.picamera_capture import PiCameraCapture

CameraMode = Literal["mock", "real"]


def build_camera(mode: CameraMode) -> Camera:
    if mode == "mock":
        return build_mock_camera()
    return PiCameraCapture()
