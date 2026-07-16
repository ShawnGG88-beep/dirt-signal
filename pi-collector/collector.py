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
from sensors.factory import SensorMode, build_sensors

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger("dirt-signal.collector")

CONFIG_PATH = Path(__file__).parent / "config.yaml"
CAPTURES_DIR = Path(__file__).parent / "captures"
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


def resolve_device_id(client: Client, device_name: str) -> str:
    response = (
        client.table("devices")
        .select("id")
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
    return str(rows[0]["id"])


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
    device_id: str,
    payload: dict[str, Any],
) -> None:
    row = {
        "device_id": device_id,
        "recorded_at": datetime.now(timezone.utc).isoformat(),
        **payload,
    }
    client.table("sensor_readings").insert(row).execute()
    logger.info(
        "Inserted reading: moisture=%.1f%% pH=%.2f soil=%.1f°C",
        payload["moisture_pct"],
        payload["ph"],
        payload["soil_temp_c"],
    )


def _interval_sleep(interval: int) -> None:
    for _ in range(interval):
        if _shutdown:
            break
        time.sleep(1)


def run_sensor_loop(
    client: Client,
    device_id: str,
    moisture: Any,
    ph: Any,
    ambient: Any,
    soil_temp: Any,
    interval: int,
) -> None:
    while not _shutdown:
        try:
            payload = collect_reading(moisture, ph, ambient, soil_temp)
            write_reading(client, device_id, payload)
        except Exception:
            logger.exception("Failed to collect or write reading")
        _interval_sleep(interval)


def capture_and_record(
    client: Client,
    device_id: str,
    camera: Camera,
) -> None:
    """Save a JPEG under captures/ and insert a plant_observations row (no upload)."""
    result = camera.capture()
    captured_at = datetime.now(timezone.utc)
    filename = captured_at.strftime("%Y%m%d_%H%M%S.jpg")
    CAPTURES_DIR.mkdir(parents=True, exist_ok=True)
    local_path = CAPTURES_DIR / filename
    local_path.write_bytes(result.image_jpeg)

    # Store path relative to pi-collector so it is portable across machines.
    image_path = f"captures/{filename}"
    row = {
        "device_id": device_id,
        "captured_at": captured_at.isoformat(),
        "image_path": image_path,
        "ndvi_estimate": result.ndvi_estimate,
    }
    client.table("plant_observations").insert(row).execute()
    logger.info(
        "Inserted plant observation: path=%s ndvi=%.3f",
        image_path,
        result.ndvi_estimate,
    )


def run_camera_loop(
    client: Client,
    device_id: str,
    camera: Camera,
    interval: int,
) -> None:
    while not _shutdown:
        try:
            capture_and_record(client, device_id, camera)
        except Exception:
            logger.exception("Failed to capture or write plant observation")
        _interval_sleep(interval)


def run() -> None:
    load_dotenv()
    config = load_config()

    device_name: str = config["device_name"]
    sensor_mode: SensorMode = config.get("sensor_mode", "mock")
    interval: int = int(config.get("read_interval_seconds", 900))
    camera_mode: CameraMode = config.get("camera_mode", "mock")
    capture_interval: int = int(config.get("capture_interval_seconds", 900))

    signal.signal(signal.SIGINT, _handle_signal)
    signal.signal(signal.SIGTERM, _handle_signal)

    client = get_supabase()
    device_id = resolve_device_id(client, device_name)
    moisture, ph, ambient, soil_temp = build_sensors(sensor_mode)
    camera = build_camera(camera_mode)

    logger.info(
        "Collector started for device '%s' (%s), "
        "sensor interval %ds mode=%s, capture interval %ds mode=%s",
        device_name,
        device_id,
        interval,
        sensor_mode,
        capture_interval,
        camera_mode,
    )

    camera_thread = threading.Thread(
        target=run_camera_loop,
        args=(client, device_id, camera, capture_interval),
        name="camera-loop",
        daemon=True,
    )
    camera_thread.start()

    run_sensor_loop(client, device_id, moisture, ph, ambient, soil_temp, interval)

    camera_thread.join(timeout=capture_interval + 5)
    logger.info("Collector stopped.")


if __name__ == "__main__":
    try:
        run()
    except Exception:
        logger.exception("Collector failed to start")
        sys.exit(1)
