"""Main collector loop: read sensors and write readings to Supabase.

Camera captures run on a separate loop with the same interval-scheduling
pattern, independent of the sensor collection cycle.
"""

from __future__ import annotations

import logging
import os
import signal
import sys
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import yaml
from dotenv import load_dotenv
from supabase import Client, create_client

from camera.base import Camera
from camera.factory import CameraMode, build_camera
from camera.picamera_capture import (
    DEFAULT_CAPTURE_HEIGHT,
    DEFAULT_CAPTURE_WIDTH,
)
from sensors.factory import SensorMode, build_sensors

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger("dirt-signal.collector")

CONFIG_PATH = Path(__file__).parent / "config.yaml"
CAPTURES_DIR = Path(__file__).parent / "captures"
_VALID_LIGHT_CONDITIONS = frozenset(
    {"natural", "grow_light", "mixed", "unknown"}
)
_shutdown = False


def _handle_signal(_signum: int, _frame: Any) -> None:
    global _shutdown
    _shutdown = True
    logger.info("Shutdown requested, finishing current cycle...")


def load_config() -> dict[str, Any]:
    with CONFIG_PATH.open(encoding="utf-8") as fh:
        return yaml.safe_load(fh)


def get_supabase() -> Client:
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise RuntimeError(
            "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env"
        )
    return create_client(url, key)


def resolve_light_condition(config: dict[str, Any]) -> str:
    """Return the manual light_condition tag from env or config.

    light_condition is not auto-detected from the image. The grow light emits
    narrowband red/blue LEDs with negligible near-infrared output, so images
    captured under it will have a near-empty NIR channel, meaningfully
    different from images captured under natural daylight. Any future
    NDVI-style proxy must either restrict itself to same-light-condition
    comparisons or exclude grow-light images entirely. Untagged historical
    images cannot be corrected after the fact, so tagging must start now,
    not retrofitted later.
    """
    raw = os.environ.get("LIGHT_CONDITION") or config.get(
        "light_condition", "unknown"
    )
    value = str(raw).strip().lower()
    if value not in _VALID_LIGHT_CONDITIONS:
        logger.warning(
            "Invalid light_condition %r; falling back to 'unknown'. "
            "Expected one of: %s",
            raw,
            ", ".join(sorted(_VALID_LIGHT_CONDITIONS)),
        )
        return "unknown"
    return value


def resolve_device(client: Client, device_name: str) -> dict[str, str]:
    """Return id plus current crop_type / lifecycle_stage for provenance stamps."""
    response = (
        client.table("devices")
        .select("id, crop_type, lifecycle_stage")
        .eq("name", device_name)
        .limit(1)
        .execute()
    )
    rows = response.data or []
    if not rows:
        raise RuntimeError(
            f"No device named '{device_name}' in Supabase. "
            "Run supabase/migrations/001_dirt_signal_schema.sql first."
        )
    row = rows[0]
    return {
        "id": str(row["id"]),
        "crop_type": str(row.get("crop_type") or "tomato"),
        "lifecycle_stage": str(row.get("lifecycle_stage") or "mature"),
    }


def resolve_device_id(client: Client, device_name: str) -> str:
    return resolve_device(client, device_name)["id"]


def collect_reading(
    moisture: Any,
    ph: Any,
    ambient: Any,
    soil_temp: Any,
) -> dict[str, Any]:
    m = moisture.read()
    p = ph.read()
    a = ambient.read()
    s = soil_temp.read()
    return {
        "moisture_raw": m.raw,
        "moisture_pct": m.pct,
        "ph": p.value,
        "ambient_temp_c": a.temp_c,
        "ambient_humidity_pct": a.humidity_pct,
        "soil_temp_c": s.temp_c,
        "ec_us_cm": None,
        "npk_n_est": None,
        "npk_p_est": None,
        "npk_k_est": None,
    }


def write_reading(
    client: Client,
    device: dict[str, str],
    payload: dict[str, Any],
) -> None:
    # Stamp the profile in effect now so History never re-scores old
    # readings against a later crop assignment (Case A replant).
    row = {
        "device_id": device["id"],
        "recorded_at": datetime.now(timezone.utc).isoformat(),
        "crop_type_at_reading": device["crop_type"],
        "lifecycle_stage_at_reading": device["lifecycle_stage"],
        **payload,
    }
    client.table("sensor_readings").insert(row).execute()
    logger.info(
        "Inserted reading: moisture=%.1f%% pH=%.2f soil=%.1f°C "
        "profile=%s/%s",
        payload["moisture_pct"],
        payload["ph"],
        payload["soil_temp_c"],
        device["crop_type"],
        device["lifecycle_stage"],
    )


def _interval_sleep(interval: int) -> None:
    for _ in range(interval):
        if _shutdown:
            break
        time.sleep(1)


def run_sensor_loop(
    client: Client,
    device_name: str,
    moisture: Any,
    ph: Any,
    ambient: Any,
    soil_temp: Any,
    interval: int,
) -> None:
    while not _shutdown:
        try:
            # Re-resolve each cycle so a mid-run profile switch is stamped
            # on subsequent inserts without restarting the collector.
            device = resolve_device(client, device_name)
            payload = collect_reading(moisture, ph, ambient, soil_temp)
            write_reading(client, device, payload)
        except Exception:
            logger.exception("Failed to collect or write reading")
        _interval_sleep(interval)


def capture_and_record(
    client: Client,
    device_id: str,
    camera: Camera,
    light_condition: str,
) -> None:
    """Save a JPEG under captures/ and insert a plant_observations row (no upload).

    On capture failure the observation row is skipped entirely so we never
    insert a row with a missing or broken image_path. Images stay on the Pi.
    """
    try:
        result = camera.capture()
    except Exception as exc:
        logger.error(
            "Camera capture failed; skipping plant_observations insert. "
            "device_id=%s timestamp=%s error=%s",
            device_id,
            datetime.now(timezone.utc).isoformat(),
            exc,
        )
        return

    captured_at = datetime.now(timezone.utc)
    stamp = captured_at.strftime("%Y%m%d_%H%M%S")
    filename = f"plant_obs_{device_id}_{stamp}.jpg"
    CAPTURES_DIR.mkdir(parents=True, exist_ok=True)
    local_path = CAPTURES_DIR / filename
    local_path.write_bytes(result.image_jpeg)

    # Store path relative to pi-collector so it is portable across machines.
    # Images are never uploaded to Supabase; only this local path is stored.
    image_path = f"captures/{filename}"
    row = {
        "device_id": device_id,
        "captured_at": captured_at.isoformat(),
        "image_path": image_path,
        "ndvi_estimate": result.ndvi_estimate,
        "light_condition": light_condition,
    }
    client.table("plant_observations").insert(row).execute()
    logger.info(
        "Inserted plant observation: path=%s ndvi=%s light_condition=%s",
        image_path,
        result.ndvi_estimate,
        light_condition,
    )


def run_camera_loop(
    client: Client,
    device_id: str,
    camera: Camera,
    interval: int,
    light_condition: str,
) -> None:
    while not _shutdown:
        if not getattr(camera, "available", True):
            logger.warning(
                "Degraded mode: skipping camera capture "
                "(camera unavailable; sensor loop unaffected)"
            )
            _interval_sleep(interval)
            continue
        try:
            capture_and_record(client, device_id, camera, light_condition)
        except Exception:
            logger.exception(
                "Failed to write plant observation "
                "(sensor loop unaffected)"
            )
        _interval_sleep(interval)


def run() -> None:
    load_dotenv()
    config = load_config()

    device_name: str = config["device_name"]
    ds18b20_mode: SensorMode = config.get("ds18b20_mode", "mock")
    dht22_mode: SensorMode = config.get("dht22_mode", "mock")
    moisture_mode: SensorMode = config.get("moisture_mode", "mock")
    ph_mode: SensorMode = config.get("ph_mode", "mock")
    interval: int = int(config.get("read_interval_seconds", 900))
    camera_mode: CameraMode = config.get("camera_mode", "mock")
    capture_interval: int = int(config.get("capture_interval_seconds", 900))
    capture_width: int = int(
        config.get("capture_width", DEFAULT_CAPTURE_WIDTH)
    )
    capture_height: int = int(
        config.get("capture_height", DEFAULT_CAPTURE_HEIGHT)
    )
    light_condition = resolve_light_condition(config)

    signal.signal(signal.SIGINT, _handle_signal)
    signal.signal(signal.SIGTERM, _handle_signal)

    client = get_supabase()
    device = resolve_device(client, device_name)
    device_id = device["id"]
    moisture, ph, ambient, soil_temp = build_sensors(
        ds18b20_mode=ds18b20_mode,
        dht22_mode=dht22_mode,
        moisture_mode=moisture_mode,
        ph_mode=ph_mode,
    )
    camera = build_camera(
        camera_mode,
        width=capture_width,
        height=capture_height,
        device_id=device_id,
    )

    if camera_mode == "real" and not getattr(camera, "available", False):
        logger.error(
            "Camera not detected at startup; continuing in degraded mode. "
            "Sensors keep running; camera captures are skipped until the "
            "service is restarted with a working camera. init_error=%s",
            getattr(camera, "init_error", "unknown"),
        )

    logger.info(
        "Collector started for device '%s' (%s) profile=%s/%s, "
        "sensor interval %ds "
        "(ds18b20=%s dht22=%s moisture=%s ph=%s), "
        "capture interval %ds mode=%s "
        "resolution=%dx%d light_condition=%s camera_available=%s",
        device_name,
        device_id,
        device["crop_type"],
        device["lifecycle_stage"],
        interval,
        ds18b20_mode,
        dht22_mode,
        moisture_mode,
        ph_mode,
        capture_interval,
        camera_mode,
        capture_width,
        capture_height,
        light_condition,
        getattr(camera, "available", True),
    )

    camera_thread = threading.Thread(
        target=run_camera_loop,
        args=(client, device_id, camera, capture_interval, light_condition),
        name="camera-loop",
        daemon=True,
    )
    camera_thread.start()

    run_sensor_loop(
        client, device_name, moisture, ph, ambient, soil_temp, interval
    )

    camera_thread.join(timeout=capture_interval + 5)
    close = getattr(camera, "close", None)
    if callable(close):
        close()
    logger.info("Collector stopped.")


if __name__ == "__main__":
    try:
        run()
    except Exception:
        logger.exception("Collector failed to start")
        sys.exit(1)
