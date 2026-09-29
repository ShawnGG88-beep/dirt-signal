"""Device profile routes (single planting per device)."""

from __future__ import annotations

import logging
import re
from datetime import date, datetime, timezone

from fastapi import APIRouter, HTTPException

from constants import CROP_PROFILES, grape_wine_cultivar_options, is_valid_grape_wine_cultivar
from db import get_supabase, resolve_device_by_id
from models import (
    DeviceProfileOptionsResponse,
    DeviceProfileUpdate,
    DeviceResponse,
    ProfileCropOption,
    ProfileCultivarOption,
    ProfileStageOption,
)

router = APIRouter(prefix="/devices", tags=["devices"])

logger = logging.getLogger(__name__)

_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def _stage_display_name(stage_key: str) -> str:
    return stage_key.replace("_", " ").capitalize()


def _profile_options() -> list[ProfileCropOption]:
    crops: list[ProfileCropOption] = []
    for crop_type, crop in CROP_PROFILES.items():
        display_name = str(crop.get("display_name") or crop_type)
        stages = [
            ProfileStageOption(
                lifecycle_stage=stage_key,
                display_name=_stage_display_name(stage_key),
            )
            for stage_key in crop.get("stages", {}).keys()
        ]
        cultivars = [
            ProfileCultivarOption(
                cultivar=str(entry["cultivar"]),
                display_name=str(entry["display_name"]),
            )
            for entry in grape_wine_cultivar_options()
        ] if crop_type == "grape_wine" else []
        crops.append(
            ProfileCropOption(
                crop_type=crop_type,
                display_name=display_name,
                lifecycle_stages=stages,
                cultivars=cultivars,
            )
        )
    return crops


def _insert_stage_change_event(
    device_id: str,
    old_crop: str,
    old_stage: str,
    new_crop: str,
    new_stage: str,
) -> None:
    """Best-effort system event so History markers match profile changeovers."""
    if old_crop == new_crop and old_stage == new_stage:
        return
    note = f"{old_crop}/{old_stage} → {new_crop}/{new_stage}"
    row = {
        "device_id": device_id,
        "occurred_at": datetime.now(timezone.utc).isoformat(),
        "event_type": "stage_change",
        "quantity": None,
        "quantity_unit": None,
        "note": note,
        "source": "system",
        "crop_type_at_event": new_crop,
        "lifecycle_stage_at_event": new_stage,
    }
    try:
        client = get_supabase()
        client.table("plant_events").insert(row).execute()
    except Exception:
        logger.exception(
            "Failed to insert stage_change event for device %s (%s); "
            "profile update still succeeded",
            device_id,
            note,
        )


def _device_response(row: dict) -> DeviceResponse:
    season = row.get("season_start_date")
    return DeviceResponse(
        id=str(row["id"]),
        name=str(row.get("name") or ""),
        crop_type=str(row.get("crop_type") or "tomato"),
        lifecycle_stage=str(row.get("lifecycle_stage") or "mature"),
        timezone=str(row.get("timezone") or "Africa/Johannesburg"),
        season_start_date=str(season)[:10] if season else None,
        soil_texture=row.get("soil_texture"),
        cultivar=row.get("cultivar"),
        soil_field_capacity_raw=row.get("soil_field_capacity_raw"),
        soil_refill_point_raw=row.get("soil_refill_point_raw"),
        moisture_mode=row.get("moisture_mode"),
        ph_mode=row.get("ph_mode"),
        ds18b20_mode=row.get("ds18b20_mode"),
        dht22_mode=row.get("dht22_mode"),
        npk_mode=row.get("npk_mode"),
    )


@router.get(
    "/{device_id}/profile-options",
    response_model=DeviceProfileOptionsResponse,
)
def get_profile_options(device_id: str) -> DeviceProfileOptionsResponse:
    """Valid crop_type / lifecycle_stage pairs from CROP_PROFILES.

    device_id is required so the UI ties options to a real device; options
    themselves are the same for every device.
    """
    try:
        resolve_device_by_id(device_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    return DeviceProfileOptionsResponse(crops=_profile_options())


@router.patch("/{device_id}/profile", response_model=DeviceResponse)
def patch_device_profile(
    device_id: str,
    body: DeviceProfileUpdate,
) -> DeviceResponse:
    """Update crop/stage and/or season_start_date for this device."""
    try:
        existing = resolve_device_by_id(device_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    patch: dict = {}
    new_crop = body.crop_type if body.crop_type is not None else existing["crop_type"]
    new_stage = (
        body.lifecycle_stage
        if body.lifecycle_stage is not None
        else existing["lifecycle_stage"]
    )
    assert new_crop is not None and new_stage is not None

    if body.crop_type is not None or body.lifecycle_stage is not None:
        crop = CROP_PROFILES.get(str(new_crop))
        if crop is None:
            valid = ", ".join(sorted(CROP_PROFILES.keys()))
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Unknown crop_type '{new_crop}'. "
                    f"Valid values: {valid}."
                ),
            )
        stages = crop.get("stages") or {}
        if new_stage not in stages:
            valid = ", ".join(sorted(stages.keys())) or "(none)"
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Unknown lifecycle_stage '{new_stage}' for "
                    f"crop_type '{new_crop}'. Valid values: {valid}."
                ),
            )
        patch["crop_type"] = new_crop
        patch["lifecycle_stage"] = new_stage

    if body.clear_season_start:
        patch["season_start_date"] = None
    elif body.season_start_date is not None:
        raw = body.season_start_date.strip()
        if not _DATE_RE.match(raw):
            raise HTTPException(
                status_code=400,
                detail="season_start_date must be YYYY-MM-DD",
            )
        try:
            date.fromisoformat(raw)
        except ValueError as exc:
            raise HTTPException(
                status_code=400,
                detail="season_start_date must be a valid calendar date",
            ) from exc
        patch["season_start_date"] = raw

    if body.soil_texture is not None:
        texture = body.soil_texture.strip().lower() if body.soil_texture else None
        if texture == "":
            patch["soil_texture"] = None
        elif texture not in ("sand", "sandy_loam", "loam", "clay"):
            raise HTTPException(
                status_code=400,
                detail=(
                    "soil_texture must be one of: sand, sandy_loam, loam, clay"
                ),
            )
        else:
            patch["soil_texture"] = texture

    if body.cultivar is not None:
        raw_cultivar = body.cultivar.strip().lower() if body.cultivar else ""
        if raw_cultivar == "":
            patch["cultivar"] = None
        elif not is_valid_grape_wine_cultivar(raw_cultivar):
            valid = ", ".join(
                str(entry["cultivar"]) for entry in grape_wine_cultivar_options()
            )
            raise HTTPException(
                status_code=400,
                detail=f"Unknown cultivar '{body.cultivar}'. Valid values: {valid}.",
            )
        else:
            if str(new_crop) != "grape_wine":
                raise HTTPException(
                    status_code=400,
                    detail="cultivar is only valid when crop_type is grape_wine",
                )
            patch["cultivar"] = raw_cultivar

    if str(new_crop) != "grape_wine" and (
        body.crop_type is not None or body.cultivar is not None
    ):
        patch["cultivar"] = None

    def _validate_anchor_pct(name: str, value: float | None) -> float | None:
        if value is None:
            return None
        if not (0.0 <= float(value) <= 100.0):
            raise HTTPException(
                status_code=400,
                detail=f"{name} must be between 0 and 100 (HW-390 relative saturation %)",
            )
        return float(value)

    if (
        "soil_field_capacity_raw" in body.model_fields_set
        or "soil_refill_point_raw" in body.model_fields_set
    ):
        # Explicit null clears; otherwise validate range. Ordering checked against
        # the resulting pair (patch + existing) so partial updates stay safe.
        if "soil_field_capacity_raw" in body.model_fields_set:
            patch["soil_field_capacity_raw"] = _validate_anchor_pct(
                "soil_field_capacity_raw", body.soil_field_capacity_raw
            )
        if "soil_refill_point_raw" in body.model_fields_set:
            patch["soil_refill_point_raw"] = _validate_anchor_pct(
                "soil_refill_point_raw", body.soil_refill_point_raw
            )
        fc = patch.get(
            "soil_field_capacity_raw",
            existing.get("soil_field_capacity_raw"),
        )
        rp = patch.get(
            "soil_refill_point_raw",
            existing.get("soil_refill_point_raw"),
        )
        if fc is not None and rp is not None and float(fc) <= float(rp):
            raise HTTPException(
                status_code=400,
                detail=(
                    "soil_field_capacity_raw must be greater than "
                    "soil_refill_point_raw"
                ),
            )

    if not patch:
        raise HTTPException(status_code=400, detail="No fields to update")

    client = get_supabase()
    response = (
        client.table("devices").update(patch).eq("id", device_id).execute()
    )
    rows = response.data or []
    if not rows:
        raise HTTPException(
            status_code=500,
            detail="Failed to update device profile",
        )

    updated = rows[0]
    crop_type = str(updated.get("crop_type") or new_crop)
    lifecycle_stage = str(updated.get("lifecycle_stage") or new_stage)

    if "crop_type" in patch or "lifecycle_stage" in patch:
        _insert_stage_change_event(
            device_id=device_id,
            old_crop=str(existing["crop_type"]),
            old_stage=str(existing["lifecycle_stage"]),
            new_crop=crop_type,
            new_stage=lifecycle_stage,
        )

    return _device_response(updated)
