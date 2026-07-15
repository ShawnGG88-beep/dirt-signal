"""Main collector loop: read sensors and write readings to Supabase."""

from __future__ import annotations

import logging
import os
import signal
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import yaml
from dotenv import load_dotenv
from supabase import Client, create_client

from sensors.factory import SensorMode, build_sensors

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger("dirt-signal.collector")

CONFIG_PATH = Path(__file__).parent / "config.yaml"
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


def run() -> None:
    load_dotenv()
    config = load_config()

    device_name: str = config["device_name"]
    sensor_mode: SensorMode = config.get("sensor_mode", "mock")
    interval: int = int(config.get("read_interval_seconds", 900))

    signal.signal(signal.SIGINT, _handle_signal)
    signal.signal(signal.SIGTERM, _handle_signal)

    client = get_supabase()
    device_id = resolve_device_id(client, device_name)
    moisture, ph, ambient, soil_temp = build_sensors(sensor_mode)

    logger.info(
        "Collector started for device '%s' (%s), interval %ds, mode=%s",
        device_name,
        device_id,
        interval,
        sensor_mode,
    )

    while not _shutdown:
        try:
            payload = collect_reading(moisture, ph, ambient, soil_temp)
            write_reading(client, device_id, payload)
        except Exception:
            logger.exception("Failed to collect or write reading")

        for _ in range(interval):
            if _shutdown:
                break
            time.sleep(1)

    logger.info("Collector stopped.")


if __name__ == "__main__":
    try:
        run()
    except Exception:
        logger.exception("Collector failed to start")
        sys.exit(1)
