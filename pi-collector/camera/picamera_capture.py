"""Real camera via Pi Camera Module (stub until hardware is wired)."""

from __future__ import annotations

from camera.base import CaptureResult


class PiCameraCapture:
    def capture(self) -> CaptureResult:
        raise NotImplementedError(
            "Pi Camera not yet wired. Set camera_mode: mock in config.yaml."
        )
