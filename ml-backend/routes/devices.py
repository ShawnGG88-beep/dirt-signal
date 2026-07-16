"""Device profile routes (single planting per device)."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from constants import CROP_PROFILES
from db import get_supabase, resolve_device_by_id
from models import (
    DeviceProfileOptionsResponse,
    DeviceProfileUpdate,
    DeviceResponse,
    ProfileCropOption,
    ProfileStageOption,
)

router = APIRouter(prefix="/devices", tags=["devices"])


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
        crops.append(
            ProfileCropOption(
                crop_type=crop_type,
                display_name=display_name,
                lifecycle_stages=stages,
            )
        )
    return crops


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
    """Reassign this device's single planting profile (Case A replant)."""
    try:
        resolve_device_by_id(device_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    crop = CROP_PROFILES.get(body.crop_type)
    if crop is None:
        valid = ", ".join(sorted(CROP_PROFILES.keys()))
        raise HTTPException(
            status_code=400,
            detail=(
                f"Unknown crop_type '{body.crop_type}'. "
                f"Valid values: {valid}."
            ),
        )

    stages = crop.get("stages") or {}
    if body.lifecycle_stage not in stages:
        valid = ", ".join(sorted(stages.keys())) or "(none)"
        raise HTTPException(
            status_code=400,
            detail=(
                f"Unknown lifecycle_stage '{body.lifecycle_stage}' for "
                f"crop_type '{body.crop_type}'. Valid values: {valid}."
            ),
        )

    client = get_supabase()
    response = (
        client.table("devices")
        .update(
            {
                "crop_type": body.crop_type,
                "lifecycle_stage": body.lifecycle_stage,
            }
        )
        .eq("id", device_id)
        .execute()
    )
    rows = response.data or []
    if not rows:
        raise HTTPException(
            status_code=500,
            detail="Failed to update device profile",
        )

    updated = rows[0]
    return DeviceResponse(
        id=str(updated["id"]),
        name=str(updated.get("name") or ""),
        crop_type=str(updated.get("crop_type") or body.crop_type),
        lifecycle_stage=str(
            updated.get("lifecycle_stage") or body.lifecycle_stage
        ),
    )
