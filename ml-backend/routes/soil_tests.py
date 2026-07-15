"""Soil test (ground truth) routes."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from db import get_supabase, resolve_device_id
from models import SoilTest, SoilTestCreate, SoilTestResponse

router = APIRouter(prefix="/soil-tests", tags=["soil-tests"])


@router.post("", response_model=SoilTestResponse, status_code=201)
def create_soil_test(body: SoilTestCreate) -> SoilTestResponse:
    try:
        device_id = resolve_device_id(body.device_name)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    row = {
        "device_id": device_id,
        "tested_at": body.tested_at.isoformat(),
        "ph_strip": body.ph_strip,
        "n_level": body.n_level,
        "p_level": body.p_level,
        "k_level": body.k_level,
        "notes": body.notes,
    }

    client = get_supabase()
    response = client.table("soil_tests").insert(row).execute()
    inserted = response.data
    if not inserted:
        raise HTTPException(status_code=500, detail="Failed to insert soil test")

    record = inserted[0]
    soil_test = SoilTest(
        id=record["id"],
        device_id=str(record["device_id"]),
        device_name=body.device_name,
        tested_at=body.tested_at,
        ph_strip=body.ph_strip,
        n_level=body.n_level,
        p_level=body.p_level,
        k_level=body.k_level,
        notes=body.notes,
    )
    return SoilTestResponse(soil_test=soil_test)
