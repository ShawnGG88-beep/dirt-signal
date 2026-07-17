"""Real camera capture via Picamera2 (Camera Module 3 NoIR).

python3-picamera2 must be installed from apt on Raspberry Pi OS, not pip:
  sudo apt install -y python3-picamera2
"""

from __future__ import annotations

import logging
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from camera.base import CaptureResult

logger = logging.getLogger("dirt-signal.camera")

# Default still size: Camera Module 3 "56.03 fps" mode (2304x1296), not full
# 4608x2592. Keeps file size and capture time reasonable for a monitoring loop.
DEFAULT_CAPTURE_WIDTH = 2304
DEFAULT_CAPTURE_HEIGHT = 1296


class PiCameraCapture:
    """Picamera2-backed capture. Initialises the sensor once at construction."""

    available: bool = False

    def __init__(
        self,
        width: int = DEFAULT_CAPTURE_WIDTH,
        height: int = DEFAULT_CAPTURE_HEIGHT,
        device_id: str = "unknown",
    ) -> None:
        self._width = width
        self._height = height
        self._device_id = device_id
        self._picam: Any = None
        self.init_error: str | None = None
        self.available = False
        self._initialise()

    def _initialise(self) -> None:
        try:
            from picamera2 import Picamera2
        except ImportError as exc:
            self.init_error = (
                "picamera2 is not importable. On Raspberry Pi OS install with "
                "`sudo apt install -y python3-picamera2` (apt, not pip). "
                f"Detail: {exc}"
            )
            logger.error("Camera startup check failed: %s", self.init_error)
            return

        try:
            picam = Picamera2()
            still_config = picam.create_still_configuration(
                main={"size": (self._width, self._height)}
            )
            picam.configure(still_config)
            picam.start()
            # Allow auto-exposure / white-balance to settle after start.
            time.sleep(1.0)
            self._picam = picam
            self.available = True
            logger.info(
                "Camera initialised: Picamera2 still mode %dx%d",
                self._width,
                self._height,
            )
        except Exception as exc:
            self.init_error = str(exc)
            logger.error(
                "Camera startup check failed; continuing in degraded mode "
                "(sensors keep running, captures skipped). device_id=%s error=%s",
                self._device_id,
                self.init_error,
            )
            self._safe_close()

    def capture(self) -> CaptureResult:
        if not self.available or self._picam is None:
            raise RuntimeError(
                self.init_error
                or "Camera is not available (degraded mode)"
            )

        captured_at = datetime.now(timezone.utc).isoformat()
        tmp_path: Path | None = None
        try:
            # capture_file is most reliable with a real .jpg path across
            # picamera2 versions; we read the bytes and remove the temp file.
            with tempfile.NamedTemporaryFile(
                suffix=".jpg", delete=False
            ) as handle:
                tmp_path = Path(handle.name)
            self._picam.capture_file(str(tmp_path))
            jpeg = tmp_path.read_bytes()
            if not jpeg:
                raise RuntimeError("Picamera2 returned an empty JPEG file")
            logger.info(
                "Camera capture succeeded: device_id=%s bytes=%d timestamp=%s",
                self._device_id,
                len(jpeg),
                captured_at,
            )
            # ndvi_estimate stays None: a single NoIR sensor yields a blended
            # visible/NIR image, not true band-separated NDVI. Proxy math is
            # separate future work.
            return CaptureResult(image_jpeg=jpeg, ndvi_estimate=None)
        except Exception as exc:
            logger.error(
                "Camera capture failed; skipping this observation cycle. "
                "device_id=%s timestamp=%s error=%s",
                self._device_id,
                captured_at,
                exc,
            )
            raise
        finally:
            if tmp_path is not None:
                tmp_path.unlink(missing_ok=True)

    def close(self) -> None:
        self._safe_close()
        self.available = False

    def _safe_close(self) -> None:
        picam = self._picam
        self._picam = None
        if picam is None:
            return
        try:
            picam.stop()
        except Exception:
            logger.exception("Error while stopping Picamera2")
        try:
            picam.close()
        except Exception:
            logger.exception("Error while closing Picamera2")
