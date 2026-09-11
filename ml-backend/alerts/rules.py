"""Pure alert rule evaluators.

Each evaluator takes a readings window (oldest → newest), profile context,
and params, and returns fire / clear / no_change. Unit-testable without I/O.

Frost risk note: extrapolation from a single indoor-capable ambient sensor
with no external weather forecast. For the current indoor tomato deployment
it will effectively never fire, and that is expected. Trailing indicator with
a short projection, not a forecast.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Literal

from alerts.drydown import DryDownResult, project_drydown
from alerts.hysteresis import (
    DEFAULT_CLEAR_M,
    DEFAULT_CONSECUTIVE_N,
    DEFAULT_DEADBAND_FRAC,
    SamplePoint,
    deadband_bounds,
    is_night_hour,
    param_float,
    param_int,
    streak_ok,
)
from alerts.scoring import (
    SCORED_KEYS,
    MetricKey,
    SoilMoistureAnchors,
    get_metric_bounds,
    reading_profile,
    score_reading_metric,
)
from constants import SAMPLING_LIMITATIONS, ScoringSemantic, get_scoring_semantic
from day_night import default_device_timezone

Severity = Literal["info", "warning", "critical"]


class Verdict(str, Enum):
    FIRE = "fire"
    CLEAR = "clear"
    NO_CHANGE = "no_change"


@dataclass(frozen=True)
class RuleDecision:
    verdict: Verdict
    severity: Severity | None = None
    metric_key: str | None = None
    trigger_value: float | None = None
    message: str = ""


@dataclass(frozen=True)
class EvalContext:
    """Shared context passed to every evaluator."""

    readings: list[dict[str, Any]]  # oldest → newest
    crop_type: str
    lifecycle_stage: str
    params: dict[str, Any]
    max_gap_seconds: float
    collector_interval_seconds: float
    now: datetime
    # IANA timezone for device-local day/night (never host/browser local).
    timezone: str = ""
    # Optional extras used by specific rules
    events: list[dict[str, Any]] | None = None
    alert_is_open: bool = False
    open_metric_key: str | None = None
    forecast_rows: list[dict[str, Any]] | None = None
    daily_climate: list[Any] | None = None
    advisory_digest: dict[str, Any] | None = None
    dsv_rows: dict[str, dict[str, Any]] | None = None
    soil_texture: str | None = None
    # HW-390 relative-saturation anchors for grape depletion scoring.
    soil_field_capacity_raw: float | None = None
    soil_refill_point_raw: float | None = None

    def tz(self) -> str:
        return self.timezone or default_device_timezone()

    def moisture_anchors(self) -> SoilMoistureAnchors:
        return SoilMoistureAnchors(
            field_capacity_pct=self.soil_field_capacity_raw,
            refill_point_pct=self.soil_refill_point_raw,
        )


FROST_NOTE = (
    "Trailing indicator from a single ambient sensor with no external weather "
    "forecast; not a frost forecast. Indoor tomato deployments will rarely fire."
)

DISEASE_NOTE = (
    "Leaf-wetness proxy from ambient humidity hours, not a disease risk score. "
    f"Sampling limitation: {SAMPLING_LIMITATIONS[0]}"
)


def _parse_at(raw: Any) -> datetime | None:
    if isinstance(raw, datetime):
        if raw.tzinfo is None:
            return raw.replace(tzinfo=timezone.utc)
        return raw.astimezone(timezone.utc)
    if isinstance(raw, str):
        return datetime.fromisoformat(raw.replace("Z", "+00:00")).astimezone(
            timezone.utc
        )
    return None


def _points_for(
    readings: list[dict[str, Any]],
    key: str | None = None,
) -> list[SamplePoint]:
    out: list[SamplePoint] = []
    for reading in readings:
        at = _parse_at(reading.get("recorded_at"))
        if at is None:
            continue
        value: float | None = None
        if key is not None:
            raw = reading.get(key)
            value = float(raw) if raw is not None else None
        out.append(SamplePoint(recorded_at=at, value=value))
    return out


def _hysteresis_params(params: dict[str, Any]) -> tuple[int, int, float]:
    n = param_int(params, "consecutive_n", DEFAULT_CONSECUTIVE_N)
    m = param_int(params, "clear_m", DEFAULT_CLEAR_M)
    db = param_float(params, "deadband_frac", DEFAULT_DEADBAND_FRAC)
    return n, m, db


# ---------------------------------------------------------------------------
# frost_risk
# ---------------------------------------------------------------------------


def evaluate_frost_risk(ctx: EvalContext) -> RuleDecision:
    """Ambient below threshold at night, or projecting below 0°C soon.

    Cultivar tissue-damage tables (Chardonnay / Pinot Noir / Cabernet
    Sauvignon) live in advisories.grape_frost and are reference data. This
    rule stays a 2°C ambient trailing indicator and does not read those
    tables: the HW-390/ambient probe is not a cultivar hardiness model.
    """
    params = ctx.params
    n, m, db_frac = _hysteresis_params(params)
    threshold = param_float(params, "threshold_c", 2.0)
    horizon = param_float(params, "horizon_hours", 3.0)
    clear_threshold = threshold + abs(threshold) * db_frac + 0.5  # deadband above fire

    readings = ctx.readings
    if len(readings) < 1:
        return RuleDecision(Verdict.NO_CHANGE)

    def fire_qualify(point: SamplePoint) -> bool | None:
        # Match reading by timestamp
        reading = _reading_at(readings, point.recorded_at)
        if reading is None:
            return None
        at = point.recorded_at
        temp = reading.get("ambient_temp_c")
        if temp is None:
            return None
        temp_f = float(temp)
        if is_night_hour(at, ctx.tz()) and temp_f < threshold:
            return True
        # Rate projection uses whole window; single-sample rate is handled below
        projected = _projects_below_zero(readings, at, horizon)
        return True if projected else False

    def clear_qualify(point: SamplePoint) -> bool | None:
        reading = _reading_at(readings, point.recorded_at)
        if reading is None:
            return None
        temp = reading.get("ambient_temp_c")
        if temp is None:
            return None
        temp_f = float(temp)
        # Clear when comfortably above threshold and not projecting frost
        if temp_f < clear_threshold:
            return False
        if _projects_below_zero(readings, point.recorded_at, horizon):
            return False
        return True

    points = _points_for(readings, "ambient_temp_c")
    latest = readings[-1]
    latest_temp = latest.get("ambient_temp_c")
    trigger = float(latest_temp) if latest_temp is not None else None

    if ctx.alert_is_open:
        if streak_ok(points, clear_qualify, needed=m, max_gap_seconds=ctx.max_gap_seconds):
            return RuleDecision(
                Verdict.CLEAR,
                message="Ambient temperature no longer indicates frost risk.",
            )
        return RuleDecision(Verdict.NO_CHANGE)

    # Also treat pure rate projection on the latest window as fire-eligible
    # when N consecutive samples each project or are below threshold.
    if streak_ok(points, fire_qualify, needed=n, max_gap_seconds=ctx.max_gap_seconds):
        return RuleDecision(
            Verdict.FIRE,
            severity="critical",
            metric_key="ambient_temp_c",
            trigger_value=trigger,
            message=(
                f"Frost risk: ambient {trigger:.1f}°C qualifies "
                f"(threshold {threshold:.1f}°C at night or projecting ≤0°C "
                f"within {horizon:.0f}h). {FROST_NOTE}"
            ),
        )
    return RuleDecision(Verdict.NO_CHANGE)


def _reading_at(
    readings: list[dict[str, Any]], at: datetime
) -> dict[str, Any] | None:
    for reading in readings:
        rat = _parse_at(reading.get("recorded_at"))
        if rat == at:
            return reading
    return None


def _projects_below_zero(
    readings: list[dict[str, Any]],
    as_of: datetime,
    horizon_hours: float,
    lookback: int = 6,
) -> bool:
    """Linear fit of recent ambient decline; True if crosses 0 within horizon."""
    temps: list[tuple[float, float]] = []
    for reading in readings:
        at = _parse_at(reading.get("recorded_at"))
        temp = reading.get("ambient_temp_c")
        if at is None or temp is None or at > as_of:
            continue
        hours = (at - as_of).total_seconds() / 3600.0  # ≤ 0
        temps.append((hours, float(temp)))
    temps = temps[-lookback:]
    if len(temps) < 3:
        return False
    n = len(temps)
    mean_x = sum(t[0] for t in temps) / n
    mean_y = sum(t[1] for t in temps) / n
    ss_xx = sum((t[0] - mean_x) ** 2 for t in temps)
    if ss_xx <= 0:
        return False
    ss_xy = sum((t[0] - mean_x) * (t[1] - mean_y) for t in temps)
    slope = ss_xy / ss_xx  # °C per hour (negative when falling)
    if slope >= 0:
        return False
    intercept = mean_y - slope * mean_x  # temp at as_of (hours=0)
    # intercept + slope * h = 0 → h = -intercept / slope
    if intercept <= 0:
        return True
    hours_to_zero = -intercept / slope
    return 0 < hours_to_zero <= horizon_hours


# ---------------------------------------------------------------------------
# sustained_out_of_bounds
# ---------------------------------------------------------------------------


def _oob_for_metric(
    ctx: EvalContext,
    key: MetricKey,
    n: int,
    m: int,
    db_frac: float,
) -> RuleDecision:
    semantic = get_scoring_semantic(ctx.crop_type, ctx.lifecycle_stage)
    restraint = semantic == ScoringSemantic.RESTRAINT.value

    def fire_qualify(point: SamplePoint) -> bool | None:
        reading = _reading_at(ctx.readings, point.recorded_at)
        if reading is None:
            return None
        crop, stage = reading_profile(reading, ctx.crop_type, ctx.lifecycle_stage)
        score = score_reading_metric(
            reading, key, crop, stage, ctx.tz(), ctx.moisture_anchors()
        )
        if score.status == "unknown":
            return None
        if restraint:
            return score.status == "elevated"
        return score.status == "warn"

    def clear_qualify(point: SamplePoint) -> bool | None:
        reading = _reading_at(ctx.readings, point.recorded_at)
        if reading is None:
            return None
        crop, stage = reading_profile(reading, ctx.crop_type, ctx.lifecycle_stage)
        score = score_reading_metric(
            reading, key, crop, stage, ctx.tz(), ctx.moisture_anchors()
        )
        if score.status == "unknown" or score.bounds is None or point.value is None:
            return None
        clear_lo, clear_hi = deadband_bounds(
            score.bounds.min, score.bounds.max, db_frac
        )
        if restraint:
            # Clear once back below upper clear threshold (not implying low is bad)
            return point.value <= clear_hi
        return clear_lo <= point.value <= clear_hi

    points = _points_for(ctx.readings, key)
    open_for_this = ctx.alert_is_open and ctx.open_metric_key == key

    if open_for_this:
        if streak_ok(points, clear_qualify, needed=m, max_gap_seconds=ctx.max_gap_seconds):
            return RuleDecision(
                Verdict.CLEAR,
                metric_key=key,
                message=f"{key} returned inside the clear band.",
            )
        return RuleDecision(Verdict.NO_CHANGE, metric_key=key)

    if ctx.alert_is_open and ctx.open_metric_key and ctx.open_metric_key != key:
        # Engine opens per metric; other metrics evaluated separately.
        pass

    if streak_ok(points, fire_qualify, needed=n, max_gap_seconds=ctx.max_gap_seconds):
        latest = ctx.readings[-1] if ctx.readings else {}
        raw = latest.get(key)
        trigger = float(raw) if raw is not None else None
        if restraint:
            msg = (
                f"{key} sustained above the upper reference band "
                f"(excess vigour watch under restraint scoring). "
                f"Value {trigger}."
            )
        else:
            msg = f"{key} sustained outside its reference band. Value {trigger}."
        return RuleDecision(
            Verdict.FIRE,
            severity="warning",
            metric_key=key,
            trigger_value=trigger,
            message=msg,
        )
    return RuleDecision(Verdict.NO_CHANGE, metric_key=key)


# ---------------------------------------------------------------------------
# approaching_bound
# ---------------------------------------------------------------------------


def evaluate_approaching_bound(ctx: EvalContext) -> list[RuleDecision]:
    """Watch proximity for N samples with trend toward the bound."""
    params = ctx.params
    n, m, db_frac = _hysteresis_params(params)
    return [_approach_for_metric(ctx, key, n, m, db_frac) for key in SCORED_KEYS]


def _approach_for_metric(
    ctx: EvalContext,
    key: MetricKey,
    n: int,
    m: int,
    db_frac: float,
) -> RuleDecision:
    semantic = get_scoring_semantic(ctx.crop_type, ctx.lifecycle_stage)
    restraint = semantic == ScoringSemantic.RESTRAINT.value

    def fire_qualify(point: SamplePoint) -> bool | None:
        reading = _reading_at(ctx.readings, point.recorded_at)
        if reading is None:
            return None
        crop, stage = reading_profile(reading, ctx.crop_type, ctx.lifecycle_stage)
        score = score_reading_metric(
            reading, key, crop, stage, ctx.tz(), ctx.moisture_anchors()
        )
        if score.status != "watch":
            return False if score.status != "unknown" else None
        if restraint and score.toward_bound != "high":
            return False
        return True

    def clear_qualify(point: SamplePoint) -> bool | None:
        reading = _reading_at(ctx.readings, point.recorded_at)
        if reading is None:
            return None
        crop, stage = reading_profile(reading, ctx.crop_type, ctx.lifecycle_stage)
        score = score_reading_metric(
            reading, key, crop, stage, ctx.tz(), ctx.moisture_anchors()
        )
        if score.status == "unknown":
            return None
        # Clear when no longer in watch (ok, or already out-of-band handled elsewhere)
        return score.status == "ok"

    points = _points_for(ctx.readings, key)
    open_for_this = ctx.alert_is_open and ctx.open_metric_key == key

    if open_for_this:
        if streak_ok(points, clear_qualify, needed=m, max_gap_seconds=ctx.max_gap_seconds):
            return RuleDecision(
                Verdict.CLEAR,
                metric_key=key,
                message=f"{key} moved away from the watch band.",
            )
        return RuleDecision(Verdict.NO_CHANGE, metric_key=key)

    if not streak_ok(points, fire_qualify, needed=n, max_gap_seconds=ctx.max_gap_seconds):
        return RuleDecision(Verdict.NO_CHANGE, metric_key=key)

    # Confirm trend toward the bound across the qualifying window
    if not _trend_toward_bound(ctx, key, n):
        return RuleDecision(Verdict.NO_CHANGE, metric_key=key)

    latest = ctx.readings[-1] if ctx.readings else {}
    raw = latest.get(key)
    trigger = float(raw) if raw is not None else None
    return RuleDecision(
        Verdict.FIRE,
        severity="info",
        metric_key=key,
        trigger_value=trigger,
        message=(
            f"{key} approaching a reference bound (watch proximity) "
            f"with trend toward the bound. Value {trigger}."
        ),
    )


def _trend_toward_bound(ctx: EvalContext, key: MetricKey, n: int) -> bool:
    window = ctx.readings[-n:]
    if len(window) < 2:
        return False
    values: list[float] = []
    toward: str | None = None
    for reading in window:
        crop, stage = reading_profile(reading, ctx.crop_type, ctx.lifecycle_stage)
        score = score_reading_metric(
            reading, key, crop, stage, ctx.tz(), ctx.moisture_anchors()
        )
        raw = reading.get(key)
        if raw is None or score.toward_bound is None:
            return False
        values.append(float(raw))
        toward = score.toward_bound
    if toward == "high":
        return values[-1] > values[0]
    if toward == "low":
        return values[-1] < values[0]
    return False


# ---------------------------------------------------------------------------
# collector_silence
# ---------------------------------------------------------------------------


def evaluate_collector_silence(ctx: EvalContext) -> RuleDecision:
    """No consecutive-sample requirement: absence of samples is the condition."""
    stale_after = ctx.collector_interval_seconds * 2.0
    critical_after = ctx.collector_interval_seconds * 4.0

    if not ctx.readings:
        age = None
        silence = True
    else:
        last_at = _parse_at(ctx.readings[-1].get("recorded_at"))
        if last_at is None:
            age = None
            silence = True
        else:
            age = (ctx.now - last_at).total_seconds()
            silence = age > stale_after

    if ctx.alert_is_open:
        if not silence:
            return RuleDecision(
                Verdict.CLEAR,
                message="Collector readings have resumed.",
            )
        return RuleDecision(Verdict.NO_CHANGE)

    if not silence:
        return RuleDecision(Verdict.NO_CHANGE)

    severity: Severity = "critical" if (age is not None and age > critical_after) else "warning"
    age_txt = f"{age:.0f}s" if age is not None else "unknown"
    return RuleDecision(
        Verdict.FIRE,
        severity=severity,
        trigger_value=age,
        message=(
            f"Collector silence: no reading newer than the staleness threshold "
            f"({stale_after:.0f}s = 2× collector interval). Age {age_txt}."
        ),
    )


# ---------------------------------------------------------------------------
# irrigation_due
# ---------------------------------------------------------------------------


def evaluate_irrigation_due(ctx: EvalContext) -> RuleDecision:
    """Fire when an available dry-down projection reaches the lower bound soon.

    Never constructs a projection the derived layer declined to produce.

    Grape cultivar water-stress tables (Psi_gs50 / Psi_stem) are reference
    data only and are not read here. Hardware measures soil moisture, not
    water potential; see GRAPE_WINE_WATER_STRESS_DRIVES_IRRIGATION.
    """
    params = ctx.params
    lead = param_float(params, "lead_hours", 12.0)
    n, m, _db = _hysteresis_params(params)

    bounds = get_metric_bounds(
        "moisture_pct", ctx.crop_type, ctx.lifecycle_stage, ctx.now
    )
    anchors = ctx.moisture_anchors()
    # Grape has no moisture band; use grower refill point when both anchors set.
    if bounds is not None:
        lower = bounds.min
    elif (
        anchors.field_capacity_pct is not None
        and anchors.refill_point_pct is not None
        and anchors.field_capacity_pct > anchors.refill_point_pct
    ):
        lower = float(anchors.refill_point_pct)
    else:
        lower = None
    dry: DryDownResult = project_drydown(
        ctx.readings,
        ctx.events or [],
        moisture_lower_bound=lower,
        now=ctx.now,
    )

    def due_now() -> bool:
        if dry.projection is None:
            return False
        return 0 <= dry.projection.hours_to_lower_bound <= lead

    if ctx.alert_is_open:
        # Clear when projection unavailable or hours-to-bound beyond lead + deadband
        if dry.projection is None:
            return RuleDecision(
                Verdict.CLEAR,
                message=(
                    f"Irrigation projection suppressed ({dry.suppressed_reason}); "
                    "clearing irrigation_due."
                ),
            )
        clear_lead = lead * (1.0 + param_float(params, "deadband_frac", DEFAULT_DEADBAND_FRAC))
        if dry.projection.hours_to_lower_bound > clear_lead:
            return RuleDecision(
                Verdict.CLEAR,
                message="Moisture dry-down no longer reaches the lower bound within lead time.",
            )
        return RuleDecision(Verdict.NO_CHANGE)

    if dry.projection is None:
        return RuleDecision(Verdict.NO_CHANGE)

    # Require the due condition to hold across N evaluation-sized checks by
    # treating the latest N moisture samples as the consecutive window while
    # the projection itself remains due.
    if not due_now():
        return RuleDecision(Verdict.NO_CHANGE)

    points = _points_for(ctx.readings, "moisture_pct")

    def fire_qualify(point: SamplePoint) -> bool | None:
        if point.value is None:
            return None
        # Projection is window-level; consecutive samples must have moisture present
        return due_now()

    if not streak_ok(points, fire_qualify, needed=n, max_gap_seconds=ctx.max_gap_seconds):
        return RuleDecision(Verdict.NO_CHANGE)

    hours = dry.projection.hours_to_lower_bound
    return RuleDecision(
        Verdict.FIRE,
        severity="info",
        metric_key="moisture_pct",
        trigger_value=hours,
        message=(
            f"Irrigation due: dry-down projection reaches moisture lower bound "
            f"({dry.projection.moisture_lower_bound:.0f}%) in {hours:.1f}h "
            f"(lead {lead:.0f}h, r²={dry.projection.r_squared:.2f})."
        ),
    )


# ---------------------------------------------------------------------------
# disease_pressure
# ---------------------------------------------------------------------------


def evaluate_disease_pressure(ctx: EvalContext) -> RuleDecision:
    """High-humidity hours in a rolling 24h window (leaf-wetness proxy)."""
    params = ctx.params
    threshold_hours = param_float(params, "threshold_hours", 6.0)
    humidity_threshold = param_float(params, "humidity_threshold_pct", 85.0)
    n, m, db_frac = _hysteresis_params(params)
    clear_hours = threshold_hours * (1.0 - db_frac)

    window_start = ctx.now.timestamp() - 24 * 3600
    high_seconds = 0.0
    prev_at: datetime | None = None
    prev_high = False

    for reading in ctx.readings:
        at = _parse_at(reading.get("recorded_at"))
        hum = reading.get("ambient_humidity_pct")
        if at is None or hum is None:
            prev_at = at
            prev_high = False
            continue
        if at.timestamp() < window_start:
            prev_at = at
            prev_high = float(hum) >= humidity_threshold
            continue
        is_high = float(hum) >= humidity_threshold
        if prev_at is not None and prev_high:
            gap = (at - prev_at).total_seconds()
            if gap <= ctx.max_gap_seconds:
                high_seconds += gap
            # gaps break continuity but do not invent humidity
        prev_at = at
        prev_high = is_high

    # Attribute dwell from last high sample to now if still high
    if prev_at is not None and prev_high:
        gap = (ctx.now - prev_at).total_seconds()
        if 0 < gap <= ctx.max_gap_seconds:
            high_seconds += gap

    high_hours = high_seconds / 3600.0

    if ctx.alert_is_open:
        if high_hours < clear_hours:
            return RuleDecision(
                Verdict.CLEAR,
                message="High-humidity hours fell below the clear threshold.",
            )
        return RuleDecision(Verdict.NO_CHANGE)

    if high_hours < threshold_hours:
        return RuleDecision(Verdict.NO_CHANGE)

    # Debounce: require N recent samples still high
    points = _points_for(ctx.readings, "ambient_humidity_pct")

    def fire_qualify(point: SamplePoint) -> bool | None:
        if point.value is None:
            return None
        return point.value >= humidity_threshold

    if not streak_ok(points, fire_qualify, needed=n, max_gap_seconds=ctx.max_gap_seconds):
        return RuleDecision(Verdict.NO_CHANGE)

    return RuleDecision(
        Verdict.FIRE,
        severity="info",
        metric_key="ambient_humidity_pct",
        trigger_value=high_hours,
        message=(
            f"Disease pressure proxy: {high_hours:.1f} high-humidity hours "
            f"(≥{humidity_threshold:.0f}% RH) in the last 24h "
            f"(threshold {threshold_hours:.0f}h). {DISEASE_NOTE}"
        ),
    )


# ---------------------------------------------------------------------------
# Tomato weather advisories (forecast + DSV + stability)
# ---------------------------------------------------------------------------

TOMATO_ADVISORY_RULES = frozenset(
    {
        "forecast_chill_risk",
        "tomato_early_blight",
        "tomato_late_blight",
        "tomato_powdery_mildew",
        "tomato_moisture_cracking",
    }
)


def _tomato_only(ctx: EvalContext) -> bool:
    return ctx.crop_type == "tomato"


def evaluate_forecast_chill_risk(ctx: EvalContext) -> RuleDecision:
    """Open-Meteo forecast nights below chill/frost/blossom-drop thresholds."""
    if not _tomato_only(ctx):
        return RuleDecision(Verdict.NO_CHANGE)
    rows = ctx.forecast_rows or []
    if not rows:
        return RuleDecision(Verdict.NO_CHANGE)

    from advisories.tomato_chill import assess_tomato_chill

    assessment = assess_tomato_chill(
        rows,
        ctx.tz(),
        lifecycle_stage=ctx.lifecycle_stage,
        now=ctx.now,
    )
    at_risk = assessment.highest_tier in (
        "frost",
        "chilling",
        "blossom_drop",
        "slow_growth",
    )

    if ctx.alert_is_open:
        if not at_risk:
            return RuleDecision(
                Verdict.CLEAR,
                message="Forecast no longer indicates chill, frost or blossom-drop risk.",
            )
        return RuleDecision(Verdict.NO_CHANGE)

    if not at_risk:
        return RuleDecision(Verdict.NO_CHANGE)

    severity: Severity = "critical" if assessment.highest_tier == "frost" else "warning"
    low = assessment.nights[0].low_c if assessment.nights else None
    return RuleDecision(
        Verdict.FIRE,
        severity=severity,
        metric_key="ambient_temp_c",
        trigger_value=low,
        message=assessment.message,
    )


def evaluate_tomato_early_blight(ctx: EvalContext) -> RuleDecision:
    if not _tomato_only(ctx):
        return RuleDecision(Verdict.NO_CHANGE)
    row = (ctx.dsv_rows or {}).get("early_blight")
    if row is None:
        return RuleDecision(Verdict.NO_CHANGE)

    spray = bool(row.get("spray_recommended"))
    accumulated = float(row.get("accumulated_dsv") or 0.0)
    threshold = float(row.get("threshold") or 15.0)

    if ctx.alert_is_open:
        if not spray and accumulated < threshold * 0.5:
            return RuleDecision(
                Verdict.CLEAR,
                message="Early blight DSV reset; spray window passed.",
            )
        return RuleDecision(Verdict.NO_CHANGE)

    if not spray:
        return RuleDecision(Verdict.NO_CHANGE)

    return RuleDecision(
        Verdict.FIRE,
        severity="warning",
        metric_key="early_blight_dsv",
        trigger_value=accumulated,
        message=(
            f"Tomato early blight (TOM-CAST): accumulated DSV reached "
            f"{threshold:.0f}; fungicide spray recommended."
        ),
    )


def evaluate_tomato_late_blight(ctx: EvalContext) -> RuleDecision:
    if not _tomato_only(ctx):
        return RuleDecision(Verdict.NO_CHANGE)
    row = (ctx.dsv_rows or {}).get("late_blight")
    if row is None:
        return RuleDecision(Verdict.NO_CHANGE)

    spray = bool(row.get("spray_recommended"))
    accumulated = float(row.get("accumulated_dsv") or 0.0)
    threshold = float(row.get("threshold") or 15.0)

    if ctx.alert_is_open:
        if not spray and accumulated < threshold * 0.5:
            return RuleDecision(
                Verdict.CLEAR,
                message="Late blight DSV reset; spray window passed.",
            )
        return RuleDecision(Verdict.NO_CHANGE)

    if not spray:
        return RuleDecision(Verdict.NO_CHANGE)

    return RuleDecision(
        Verdict.FIRE,
        severity="warning",
        metric_key="late_blight_dsv",
        trigger_value=accumulated,
        message=(
            f"Tomato late blight (Wallin simplified): accumulated DSV reached "
            f"{threshold:.0f}; protectant spray recommended."
        ),
    )


def evaluate_tomato_powdery_mildew(ctx: EvalContext) -> RuleDecision:
    if not _tomato_only(ctx):
        return RuleDecision(Verdict.NO_CHANGE)
    digest = ctx.advisory_digest
    if digest is None or digest.get("_computed_at") is None:
        return RuleDecision(Verdict.NO_CHANGE)

    tomato = digest.get("tomato")
    if not isinstance(tomato, dict):
        return RuleDecision(Verdict.NO_CHANGE)
    mildew = tomato.get("powdery_mildew")
    if not isinstance(mildew, dict):
        return RuleDecision(Verdict.NO_CHANGE)

    elevated = bool(mildew.get("leveillula_elevated"))
    message = str(
        mildew.get("leveillula_message")
        or "Leveillula taurica powdery mildew risk assessment unavailable."
    )

    if ctx.alert_is_open:
        if not elevated:
            return RuleDecision(
                Verdict.CLEAR,
                message="Leveillula taurica powdery mildew risk no longer elevated.",
            )
        return RuleDecision(Verdict.NO_CHANGE)

    n = param_int(ctx.params, "consecutive_n", DEFAULT_CONSECUTIVE_N)
    if not elevated:
        return RuleDecision(Verdict.NO_CHANGE)

    points = _points_for(ctx.readings, "ambient_humidity_pct")
    if not streak_ok(
        points[-max(n, 1) :],
        lambda p: p.value is not None,
        needed=min(n, len(points)) if points else n,
        max_gap_seconds=ctx.max_gap_seconds,
    ):
        return RuleDecision(Verdict.NO_CHANGE)

    return RuleDecision(
        Verdict.FIRE,
        severity="info",
        metric_key="powdery_mildew",
        trigger_value=None,
        message=message,
    )


def evaluate_tomato_moisture_cracking(ctx: EvalContext) -> RuleDecision:
    if not _tomato_only(ctx):
        return RuleDecision(Verdict.NO_CHANGE)

    digest = ctx.advisory_digest
    if digest is None or digest.get("_computed_at") is None:
        return RuleDecision(Verdict.NO_CHANGE)

    tomato = digest.get("tomato")
    if not isinstance(tomato, dict):
        return RuleDecision(Verdict.NO_CHANGE)
    moisture = tomato.get("moisture")
    if not isinstance(moisture, dict):
        return RuleDecision(Verdict.NO_CHANGE)

    cracking = bool(moisture.get("cracking_risk"))
    headline = str(moisture.get("headline") or "")
    weekly = str(moisture.get("weekly_context") or "")
    consecutive_dry = moisture.get("consecutive_dry_days")
    trigger = float(consecutive_dry) if consecutive_dry is not None else None

    if ctx.alert_is_open:
        if not cracking:
            return RuleDecision(
                Verdict.CLEAR,
                message="Moisture influx risk after dry spell no longer forecast.",
            )
        return RuleDecision(Verdict.NO_CHANGE)

    if not cracking:
        return RuleDecision(Verdict.NO_CHANGE)

    return RuleDecision(
        Verdict.FIRE,
        severity="warning",
        metric_key="moisture_pct",
        trigger_value=trigger,
        message=f"{headline} {weekly}".strip(),
    )


# ---------------------------------------------------------------------------
# dispatch
# ---------------------------------------------------------------------------

RULE_TYPES = (
    "frost_risk",
    "sustained_out_of_bounds",
    "approaching_bound",
    "collector_silence",
    "irrigation_due",
    "disease_pressure",
    "forecast_chill_risk",
    "tomato_early_blight",
    "tomato_late_blight",
    "tomato_powdery_mildew",
    "tomato_moisture_cracking",
)

# Multi-metric rules return a list; others a single decision.
MULTI_METRIC_RULES = frozenset({"sustained_out_of_bounds", "approaching_bound"})


def evaluate_rule(rule_type: str, ctx: EvalContext) -> list[RuleDecision]:
    if rule_type == "frost_risk":
        return [evaluate_frost_risk(ctx)]
    if rule_type == "sustained_out_of_bounds":
        return [
            _oob_for_metric(
                ctx,
                key,
                param_int(ctx.params, "consecutive_n", DEFAULT_CONSECUTIVE_N),
                param_int(ctx.params, "clear_m", DEFAULT_CLEAR_M),
                param_float(ctx.params, "deadband_frac", DEFAULT_DEADBAND_FRAC),
            )
            for key in SCORED_KEYS
        ]
    if rule_type == "approaching_bound":
        return [
            _approach_for_metric(
                ctx,
                key,
                param_int(ctx.params, "consecutive_n", DEFAULT_CONSECUTIVE_N),
                param_int(ctx.params, "clear_m", DEFAULT_CLEAR_M),
                param_float(ctx.params, "deadband_frac", DEFAULT_DEADBAND_FRAC),
            )
            for key in SCORED_KEYS
        ]
    if rule_type == "collector_silence":
        return [evaluate_collector_silence(ctx)]
    if rule_type == "irrigation_due":
        return [evaluate_irrigation_due(ctx)]
    if rule_type == "disease_pressure":
        return [evaluate_disease_pressure(ctx)]
    if rule_type == "forecast_chill_risk":
        return [evaluate_forecast_chill_risk(ctx)]
    if rule_type == "tomato_early_blight":
        return [evaluate_tomato_early_blight(ctx)]
    if rule_type == "tomato_late_blight":
        return [evaluate_tomato_late_blight(ctx)]
    if rule_type == "tomato_powdery_mildew":
        return [evaluate_tomato_powdery_mildew(ctx)]
    if rule_type == "tomato_moisture_cracking":
        return [evaluate_tomato_moisture_cracking(ctx)]
    return [RuleDecision(Verdict.NO_CHANGE, message=f"Unknown rule_type {rule_type}")]
