"""Background alert evaluation engine.

Runs on a configurable interval (default 60s). Idempotent: re-running over the
same window does not create duplicate open alerts (enforced in logic and by a
partial unique index on open rows).
"""

from __future__ import annotations

import asyncio
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any

from alerts.hysteresis import DEFAULT_REFIRE_HOURS, ensure_utc, param_float
from alerts.rules import EvalContext, Verdict, evaluate_rule
from db import get_supabase

logger = logging.getLogger("dirt_signal.alerts")

DEFAULT_EVAL_INTERVAL_SECONDS = 60
READINGS_LOOKBACK_HOURS = 36
EVENTS_LOOKBACK_HOURS = 72


def _collector_interval() -> float:
    raw = os.environ.get("COLLECTOR_INTERVAL_SECONDS")
    try:
        value = int(raw) if raw is not None else 30
    except ValueError:
        value = 30
    return float(max(1, value))


def _eval_interval() -> float:
    raw = os.environ.get("ALERT_EVAL_INTERVAL_SECONDS")
    try:
        value = int(raw) if raw is not None else DEFAULT_EVAL_INTERVAL_SECONDS
    except ValueError:
        value = DEFAULT_EVAL_INTERVAL_SECONDS
    return float(max(5, value))


def _parse_dt(raw: Any) -> datetime | None:
    if isinstance(raw, datetime):
        return ensure_utc(raw)
    if isinstance(raw, str):
        return ensure_utc(datetime.fromisoformat(raw.replace("Z", "+00:00")))
    return None


class AlertEngine:
    """Evaluate enabled rules for every device and open/close alert_events."""

    def __init__(self) -> None:
        self._task: asyncio.Task[None] | None = None
        self._stop = asyncio.Event()

    async def start(self) -> None:
        if self._task is not None and not self._task.done():
            return
        self._stop.clear()
        self._task = asyncio.create_task(self._loop(), name="alert-engine")
        logger.info(
            "Alert engine started (interval=%ss)", _eval_interval()
        )

    async def stop(self) -> None:
        self._stop.set()
        if self._task is not None:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None
        logger.info("Alert engine stopped")

    async def _loop(self) -> None:
        # Short delay so the app finishes booting before first eval
        try:
            await asyncio.wait_for(self._stop.wait(), timeout=2.0)
            return
        except asyncio.TimeoutError:
            pass
        while not self._stop.is_set():
            try:
                await asyncio.to_thread(self.evaluate_once)
            except Exception:
                logger.exception("Alert evaluation failed")
            try:
                await asyncio.wait_for(self._stop.wait(), timeout=_eval_interval())
                return
            except asyncio.TimeoutError:
                continue

    def evaluate_once(self) -> dict[str, Any]:
        """Run one evaluation pass. Safe to call from POST /alerts/evaluate."""
        client = get_supabase()
        now = datetime.now(timezone.utc)
        collector_interval = _collector_interval()
        # Gap threshold: 2.5× collector cadence. Spec says gaps longer than the
        # evaluation interval break streaks; with a 15-min collector that would
        # make consecutive-N impossible, so we use collector cadence.
        max_gap = max(_eval_interval(), collector_interval) * 2.5

        devices = client.table("devices").select("*").execute().data or []
        rules = (
            client.table("alert_rules")
            .select("*")
            .execute()
            .data
            or []
        )

        opened = 0
        closed = 0
        evaluated = 0

        for device in devices:
            device_id = str(device["id"])
            crop = str(device.get("crop_type") or "tomato")
            stage = str(device.get("lifecycle_stage") or "mature")
            from day_night import default_device_timezone

            device_tz = str(device.get("timezone") or "").strip() or default_device_timezone()
            applicable = [
                r
                for r in rules
                if r.get("device_id") is None or str(r.get("device_id")) == device_id
            ]

            readings = self._load_readings(client, device_id, now)
            events = self._load_events(client, device_id, now)
            open_events = self._load_open_events(client, device_id)

            for rule in applicable:
                if not rule.get("enabled", True):
                    continue
                snoozed_until = _parse_dt(rule.get("snoozed_until"))
                if snoozed_until is not None and snoozed_until > now:
                    continue

                rule_id = str(rule["id"])
                rule_type = str(rule["rule_type"])
                params = rule.get("params") or {}
                if not isinstance(params, dict):
                    params = {}

                open_for_rule = [
                    e for e in open_events if str(e.get("rule_id")) == rule_id
                ]

                if rule_type in ("sustained_out_of_bounds", "approaching_bound"):
                    from alerts.scoring import SCORED_KEYS

                    open_by_metric = {
                        e.get("metric_key"): e for e in open_for_rule
                    }
                    for metric_key in SCORED_KEYS:
                        open_row = open_by_metric.get(metric_key)
                        ctx = EvalContext(
                            readings=readings,
                            crop_type=crop,
                            lifecycle_stage=stage,
                            params=params,
                            max_gap_seconds=max_gap,
                            collector_interval_seconds=collector_interval,
                            now=now,
                            timezone=device_tz,
                            events=events,
                            alert_is_open=open_row is not None,
                            open_metric_key=metric_key if open_row else None,
                        )
                        decisions = evaluate_rule(rule_type, ctx)
                        evaluated += 1
                        for decision in decisions:
                            if decision.metric_key != metric_key:
                                continue
                            if decision.verdict == Verdict.FIRE:
                                if open_row is not None:
                                    continue
                                if not self._refire_allowed(
                                    client,
                                    rule_id,
                                    device_id,
                                    metric_key,
                                    params,
                                    now,
                                ):
                                    continue
                                self._open_alert(
                                    client, rule, device_id, decision, now
                                )
                                opened += 1
                            elif (
                                decision.verdict == Verdict.CLEAR
                                and open_row is not None
                            ):
                                self._close_alert(
                                    client, str(open_row["id"]), now
                                )
                                closed += 1
                    continue

                # Single-decision rules
                open_row = open_for_rule[0] if open_for_rule else None
                ctx = EvalContext(
                    readings=readings,
                    crop_type=crop,
                    lifecycle_stage=stage,
                    params=params,
                    max_gap_seconds=max_gap,
                    collector_interval_seconds=collector_interval,
                    now=now,
                    timezone=device_tz,
                    events=events,
                    alert_is_open=open_row is not None,
                    open_metric_key=(
                        open_row.get("metric_key") if open_row else None
                    ),
                )
                decisions = evaluate_rule(rule_type, ctx)
                evaluated += 1
                for decision in decisions:
                    if decision.verdict == Verdict.FIRE:
                        if open_row is not None:
                            if (
                                rule_type == "collector_silence"
                                and decision.severity
                                and open_row.get("severity") != decision.severity
                            ):
                                client.table("alert_events").update(
                                    {
                                        "severity": decision.severity,
                                        "message": decision.message,
                                        "trigger_value": decision.trigger_value,
                                    }
                                ).eq("id", open_row["id"]).execute()
                            continue
                        if not self._refire_allowed(
                            client,
                            rule_id,
                            device_id,
                            decision.metric_key,
                            params,
                            now,
                        ):
                            continue
                        self._open_alert(client, rule, device_id, decision, now)
                        opened += 1
                    elif decision.verdict == Verdict.CLEAR and open_row is not None:
                        self._close_alert(client, str(open_row["id"]), now)
                        closed += 1

        return {
            "evaluated_at": now.isoformat(),
            "devices": len(devices),
            "rules": len(rules),
            "evaluated": evaluated,
            "opened": opened,
            "closed": closed,
        }

    def _load_readings(
        self, client: Any, device_id: str, now: datetime
    ) -> list[dict[str, Any]]:
        from_at = (now - timedelta(hours=READINGS_LOOKBACK_HOURS)).isoformat()
        response = (
            client.table("sensor_readings")
            .select("*")
            .eq("device_id", device_id)
            .gte("recorded_at", from_at)
            .order("recorded_at", desc=False)
            .limit(5000)
            .execute()
        )
        rows = list(response.data or [])
        if rows:
            return rows
        # Window empty (long outage): still need the absolute latest row so
        # collector_silence can report age instead of "unknown".
        latest = (
            client.table("sensor_readings")
            .select("*")
            .eq("device_id", device_id)
            .order("recorded_at", desc=True)
            .limit(1)
            .execute()
        )
        return list(latest.data or [])

    def _load_events(
        self, client: Any, device_id: str, now: datetime
    ) -> list[dict[str, Any]]:
        from_at = (now - timedelta(hours=EVENTS_LOOKBACK_HOURS)).isoformat()
        response = (
            client.table("plant_events")
            .select("*")
            .eq("device_id", device_id)
            .gte("occurred_at", from_at)
            .order("occurred_at", desc=False)
            .limit(1000)
            .execute()
        )
        return list(response.data or [])

    def _load_open_events(
        self, client: Any, device_id: str
    ) -> list[dict[str, Any]]:
        response = (
            client.table("alert_events")
            .select("*")
            .eq("device_id", device_id)
            .is_("closed_at", "null")
            .execute()
        )
        return list(response.data or [])

    def _refire_allowed(
        self,
        client: Any,
        rule_id: str,
        device_id: str,
        metric_key: str | None,
        params: dict[str, Any],
        now: datetime,
    ) -> bool:
        refire_hours = param_float(params, "refire_hours", DEFAULT_REFIRE_HOURS)
        query = (
            client.table("alert_events")
            .select("closed_at")
            .eq("rule_id", rule_id)
            .eq("device_id", device_id)
            .not_.is_("closed_at", "null")
            .order("closed_at", desc=True)
            .limit(1)
        )
        if metric_key is None:
            query = query.is_("metric_key", "null")
        else:
            query = query.eq("metric_key", metric_key)
        rows = query.execute().data or []
        if not rows:
            return True
        closed_at = _parse_dt(rows[0].get("closed_at"))
        if closed_at is None:
            return True
        return (now - closed_at) >= timedelta(hours=refire_hours)

    def _open_alert(
        self,
        client: Any,
        rule: dict[str, Any],
        device_id: str,
        decision: Any,
        now: datetime,
    ) -> None:
        row = {
            "rule_id": rule["id"],
            "device_id": device_id,
            "opened_at": now.isoformat(),
            "closed_at": None,
            "severity": decision.severity or "warning",
            "metric_key": decision.metric_key,
            "trigger_value": decision.trigger_value,
            "message": decision.message,
            "notified": False,
            "acknowledged_at": None,
            "ack_note": None,
        }
        try:
            client.table("alert_events").insert(row).execute()
        except Exception:
            # Unique open index: concurrent/idempotent double-eval
            logger.info(
                "Skipped duplicate open alert rule=%s device=%s metric=%s",
                rule.get("rule_type"),
                device_id,
                decision.metric_key,
            )

    def _close_alert(self, client: Any, event_id: str, now: datetime) -> None:
        client.table("alert_events").update(
            {"closed_at": now.isoformat()}
        ).eq("id", event_id).is_("closed_at", "null").execute()


_engine: AlertEngine | None = None


def get_alert_engine() -> AlertEngine:
    global _engine
    if _engine is None:
        _engine = AlertEngine()
    return _engine


async def start_alert_engine() -> None:
    await get_alert_engine().start()


async def stop_alert_engine() -> None:
    await get_alert_engine().stop()
