"""Alert event and rule routes."""

from __future__ import annotations

import os
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query

from alerts.engine import get_alert_engine
from db import get_supabase, resolve_device
from models import (
    AlertAcknowledgeBody,
    AlertEvaluateResponse,
    AlertEvent,
    AlertEventResponse,
    AlertEventsListResponse,
    AlertRule,
    AlertRuleResponse,
    AlertRulesListResponse,
    AlertRuleUpdate,
)

router = APIRouter(tags=["alerts"])

DEFAULT_DEVICE = os.environ.get("DEFAULT_DEVICE_NAME", "pi-garden-01")


def _ensure_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _parse_alert(row: dict, rule: dict | None = None) -> AlertEvent:
    payload = dict(row)
    if rule:
        payload["rule_type"] = rule.get("rule_type")
        payload["rule_notify"] = rule.get("notify")
        payload["rule_enabled"] = rule.get("enabled")
    return AlertEvent.model_validate(payload)


def _parse_rule(row: dict) -> AlertRule:
    return AlertRule.model_validate(row)


def _rules_by_id(client) -> dict[str, dict]:
    rows = client.table("alert_rules").select("*").execute().data or []
    return {str(r["id"]): r for r in rows}


@router.get("/alerts", response_model=AlertEventsListResponse)
def list_alerts(
    device_name: str = Query(default=DEFAULT_DEVICE),
    status: str = Query(default="open", pattern="^(open|all)$"),
    from_at: datetime | None = Query(default=None),
    to_at: datetime | None = Query(default=None),
    limit: int = Query(default=200, ge=1, le=2000),
) -> AlertEventsListResponse:
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

    client = get_supabase()
    query = (
        client.table("alert_events")
        .select("*")
        .eq("device_id", device["id"])
        .order("opened_at", desc=True)
        .limit(limit)
    )
    if status == "open":
        query = query.is_("closed_at", "null")
    if from_at is not None:
        query = query.gte("opened_at", from_at.isoformat())
    if to_at is not None:
        query = query.lte("opened_at", to_at.isoformat())

    rows = query.execute().data or []
    rules = _rules_by_id(client)
    alerts = [
        _parse_alert(row, rules.get(str(row.get("rule_id")))) for row in rows
    ]
    return AlertEventsListResponse(
        device_name=device_name,
        alerts=alerts,
        count=len(alerts),
    )


@router.post("/alerts/evaluate", response_model=AlertEvaluateResponse)
def evaluate_alerts() -> AlertEvaluateResponse:
    """Manual evaluation trigger for testing."""
    result = get_alert_engine().evaluate_once()
    return AlertEvaluateResponse(
        evaluated_at=datetime.fromisoformat(result["evaluated_at"]),
        devices=result["devices"],
        rules=result["rules"],
        evaluated=result["evaluated"],
        opened=result["opened"],
        closed=result["closed"],
    )


@router.post("/alerts/{alert_id}/acknowledge", response_model=AlertEventResponse)
def acknowledge_alert(
    alert_id: str, body: AlertAcknowledgeBody | None = None
) -> AlertEventResponse:
    """Acknowledge suppresses notification but does not close the alert.

    The condition stays open until the clear condition is met.
    """
    client = get_supabase()
    existing = (
        client.table("alert_events")
        .select("*")
        .eq("id", alert_id)
        .limit(1)
        .execute()
    )
    rows = existing.data or []
    if not rows:
        raise HTTPException(status_code=404, detail="Alert not found")

    note = body.note if body else None
    now = datetime.now(timezone.utc).isoformat()
    patch = {
        "acknowledged_at": now,
        "ack_note": note,
    }
    updated = (
        client.table("alert_events")
        .update(patch)
        .eq("id", alert_id)
        .execute()
    )
    out = (updated.data or rows)[0]
    rule = _rules_by_id(client).get(str(out.get("rule_id")))
    return AlertEventResponse(alert=_parse_alert(out, rule))


@router.post("/alerts/{alert_id}/mark-notified", response_model=AlertEventResponse)
def mark_alert_notified(alert_id: str) -> AlertEventResponse:
    """Record that the desktop OS notification was delivered."""
    client = get_supabase()
    existing = (
        client.table("alert_events")
        .select("*")
        .eq("id", alert_id)
        .limit(1)
        .execute()
    )
    rows = existing.data or []
    if not rows:
        raise HTTPException(status_code=404, detail="Alert not found")

    updated = (
        client.table("alert_events")
        .update({"notified": True})
        .eq("id", alert_id)
        .execute()
    )
    out = (updated.data or rows)[0]
    rule = _rules_by_id(client).get(str(out.get("rule_id")))
    return AlertEventResponse(alert=_parse_alert(out, rule))


@router.get("/alert-rules", response_model=AlertRulesListResponse)
def list_alert_rules(
    device_name: str = Query(default=DEFAULT_DEVICE),
) -> AlertRulesListResponse:
    try:
        device = resolve_device(device_name)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    client = get_supabase()
    rows = client.table("alert_rules").select("*").execute().data or []
    # Global rules (device_id null) plus any device-specific
    filtered = [
        r
        for r in rows
        if r.get("device_id") is None or str(r.get("device_id")) == device["id"]
    ]
    filtered.sort(key=lambda r: str(r.get("rule_type") or ""))
    rules = [_parse_rule(r) for r in filtered]
    return AlertRulesListResponse(
        device_name=device_name,
        rules=rules,
        count=len(rules),
    )


@router.patch("/alert-rules/{rule_id}", response_model=AlertRuleResponse)
def update_alert_rule(rule_id: str, body: AlertRuleUpdate) -> AlertRuleResponse:
    patch: dict = {}
    if body.enabled is not None:
        patch["enabled"] = body.enabled
    if body.notify is not None:
        patch["notify"] = body.notify
    if body.params is not None:
        if not isinstance(body.params, dict):
            raise HTTPException(status_code=400, detail="params must be an object")
        patch["params"] = body.params
    if body.clear_snooze:
        patch["snoozed_until"] = None
    elif body.snoozed_until is not None:
        patch["snoozed_until"] = _ensure_utc(body.snoozed_until).isoformat()

    if not patch:
        raise HTTPException(status_code=400, detail="No fields to update")

    patch["updated_at"] = datetime.now(timezone.utc).isoformat()

    client = get_supabase()
    existing = (
        client.table("alert_rules")
        .select("id")
        .eq("id", rule_id)
        .limit(1)
        .execute()
    )
    if not (existing.data or []):
        raise HTTPException(status_code=404, detail="Alert rule not found")

    updated = (
        client.table("alert_rules").update(patch).eq("id", rule_id).execute()
    )
    rows = updated.data or []
    if not rows:
        raise HTTPException(status_code=500, detail="Failed to update alert rule")
    return AlertRuleResponse(rule=_parse_rule(rows[0]))
