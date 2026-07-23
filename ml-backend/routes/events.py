"""Plant event (annotation) routes."""

from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Query, Response

from constants import is_valid_event_type
from db import get_supabase, resolve_device
from models import (
    PlantEvent,
    PlantEventCreate,
    PlantEventResponse,
    PlantEventUpdate,
    PlantEventsListResponse,
)

router = APIRouter(prefix="/events", tags=["events"])

DEFAULT_DEVICE = os.environ.get("DEFAULT_DEVICE_NAME", "pi-garden-01")
MAX_FUTURE_SKEW = timedelta(hours=24)


def _ensure_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _validate_occurred_at(occurred_at: datetime) -> datetime:
    occurred_at = _ensure_utc(occurred_at)
    now = datetime.now(timezone.utc)
    if occurred_at > now + MAX_FUTURE_SKEW:
        raise HTTPException(
            status_code=400,
            detail=(
                "occurred_at must not be more than 24 hours in the future "
                "(check timezone and date picker)."
            ),
        )
    return occurred_at


def _validate_quantity(quantity: float | None) -> float | None:
    if quantity is None:
        return None
    if quantity < 0:
        raise HTTPException(
            status_code=400,
            detail="quantity must be null or non-negative",
        )
    return quantity


def _validate_event_type(event_type: str) -> str:
    if not is_valid_event_type(event_type):
        raise HTTPException(
            status_code=400,
            detail=f"Unknown event_type '{event_type}'.",
        )
    return event_type


def _parse_event(row: dict) -> PlantEvent:
    return PlantEvent.model_validate(row)


@router.post("", response_model=PlantEventResponse, status_code=201)
def create_event(body: PlantEventCreate) -> PlantEventResponse:
    event_type = _validate_event_type(body.event_type)
    occurred_at = _validate_occurred_at(body.occurred_at)
    quantity = _validate_quantity(body.quantity)

    try:
        device = resolve_device(body.device_name)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    # POST is always manual. System rows (e.g. stage_change) are inserted
    # by the profile handler, not through this endpoint.
    row = {
        "device_id": device["id"],
        "occurred_at": occurred_at.isoformat(),
        "event_type": event_type,
        "quantity": quantity,
        "quantity_unit": body.quantity_unit,
        "note": body.note,
        "source": "manual",
        "crop_type_at_event": device["crop_type"],
        "lifecycle_stage_at_event": device["lifecycle_stage"],
    }

    client = get_supabase()
    response = client.table("plant_events").insert(row).execute()
    inserted = response.data or []
    if not inserted:
        raise HTTPException(status_code=500, detail="Failed to insert event")

    return PlantEventResponse(event=_parse_event(inserted[0]))


@router.get("", response_model=PlantEventsListResponse)
def list_events(
    device_name: str = Query(default=DEFAULT_DEVICE),
    from_at: datetime | None = Query(default=None),
    to_at: datetime | None = Query(default=None),
    types: str | None = Query(
        default=None,
        description="Comma-separated event_type keys to include",
    ),
    limit: int = Query(default=200, ge=1, le=2000),
) -> PlantEventsListResponse:
    try:
        device = resolve_device(device_name)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    if from_at is not None:
        from_at = _ensure_utc(from_at)
    if to_at is not None:
        to_at = _ensure_utc(to_at)
    if from_at is not None and to_at is not None and from_at >= to_at:
        raise HTTPException(status_code=400, detail="from_at must be before to_at")

    type_list: list[str] | None = None
    if types:
        type_list = [t.strip() for t in types.split(",") if t.strip()]
        for t in type_list:
            _validate_event_type(t)

    client = get_supabase()
    query = (
        client.table("plant_events")
        .select("*")
        .eq("device_id", device["id"])
        .order("occurred_at", desc=True)
        .limit(limit)
    )
    if from_at is not None:
        query = query.gte("occurred_at", from_at.isoformat())
    if to_at is not None:
        query = query.lte("occurred_at", to_at.isoformat())
    if type_list:
        query = query.in_("event_type", type_list)

    response = query.execute()
    rows = response.data or []
    events = [_parse_event(row) for row in rows]
    return PlantEventsListResponse(
        device_name=device_name,
        events=events,
        count=len(events),
    )


@router.patch("/{event_id}", response_model=PlantEventResponse)
def update_event(event_id: str, body: PlantEventUpdate) -> PlantEventResponse:
    patch: dict = {}

    if body.occurred_at is not None:
        patch["occurred_at"] = _validate_occurred_at(body.occurred_at).isoformat()
    if body.event_type is not None:
        patch["event_type"] = _validate_event_type(body.event_type)
    if body.clear_quantity:
        patch["quantity"] = None
        patch["quantity_unit"] = None
    elif body.quantity is not None:
        patch["quantity"] = _validate_quantity(body.quantity)
        if body.quantity_unit is not None:
            patch["quantity_unit"] = body.quantity_unit
    elif body.quantity_unit is not None:
        patch["quantity_unit"] = body.quantity_unit

    if body.note is not None or "note" in body.model_fields_set:
        patch["note"] = body.note

    if not patch:
        raise HTTPException(status_code=400, detail="No fields to update")

    client = get_supabase()
    response = (
        client.table("plant_events")
        .update(patch)
        .eq("id", event_id)
        .execute()
    )
    rows = response.data or []
    if not rows:
        raise HTTPException(status_code=404, detail="Event not found")

    return PlantEventResponse(event=_parse_event(rows[0]))


@router.delete("/{event_id}", status_code=204)
def delete_event(event_id: str) -> Response:
    client = get_supabase()
    existing = (
        client.table("plant_events")
        .select("id")
        .eq("id", event_id)
        .limit(1)
        .execute()
    )
    if not (existing.data or []):
        raise HTTPException(status_code=404, detail="Event not found")

    client.table("plant_events").delete().eq("id", event_id).execute()
    return Response(status_code=204)
