"""Grape-wine cultivar frost reference lookup.

Selects the correct tissue-damage table by devices.cultivar. Coverage is
tagged (single_point vs el_staged_table) so callers do not imply more
precision than the source data has.

These tables are reference data for comparison against a forecast or a
pressure-chamber/thermometer reading. evaluate_frost_risk remains a 2°C
ambient trailing indicator and does not read this module: that rule is a
sensor heuristic, not a cultivar tissue-damage model.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from constants import get_grape_wine_cultivar_profile


@dataclass(frozen=True)
class GrapeFrostThreshold:
    cultivar: str
    display_name: str
    coverage: str
    threshold_c: float
    stage_label: str
    el_min: int | None
    el_max: int | None
    note: str
    deacclimation_note: str | None


def get_grape_frost_profile(cultivar: str | None) -> dict[str, Any] | None:
    """Return the cultivar frost table, or None when cultivar is unset."""
    profile = get_grape_wine_cultivar_profile(cultivar)
    if profile is None:
        return None
    frost = profile.get("frost")
    if not isinstance(frost, dict):
        return None
    return frost


def grape_frost_threshold_c(
    cultivar: str | None,
    el_number: int | None = None,
) -> GrapeFrostThreshold | None:
    """Resolve one numeric threshold from the cultivar's tagged table.

    Chardonnay / Cabernet Sauvignon: single-point budswell figures; el_number
    is ignored because no staged table was sourced.
    Pinot Noir: E-L-staged table. When el_number is omitted, the earliest
    row (E-L 2-3) is used and the coverage tag stays el_staged_table.
    """
    profile = get_grape_wine_cultivar_profile(cultivar)
    if profile is None:
        return None
    frost = profile.get("frost")
    if not isinstance(frost, dict):
        return None
    coverage = str(frost.get("coverage") or "")
    cultivar_id = str(profile["id"])
    display_name = str(profile["display_name"])
    deacclimation = frost.get("deacclimation_note")
    deacclimation_note = str(deacclimation) if deacclimation else None

    if coverage == "el_staged_table":
        rows = frost.get("el_rows") or []
        if not rows:
            return None
        chosen = _pick_el_row(rows, el_number)
        if chosen is None:
            return None
        return GrapeFrostThreshold(
            cultivar=cultivar_id,
            display_name=display_name,
            coverage=coverage,
            threshold_c=float(chosen["threshold_c"]),
            stage_label=str(chosen["label"]),
            el_min=int(chosen["el_min"]),
            el_max=int(chosen["el_max"]),
            note=str(frost.get("note") or ""),
            deacclimation_note=deacclimation_note,
        )

    raw = frost.get("slight_damage_c")
    if raw is None:
        return None
    return GrapeFrostThreshold(
        cultivar=cultivar_id,
        display_name=display_name,
        coverage=coverage or "single_point",
        threshold_c=float(raw),
        stage_label=str(frost.get("stage_label") or ""),
        el_min=None,
        el_max=None,
        note=str(frost.get("note") or ""),
        deacclimation_note=deacclimation_note,
    )


def _pick_el_row(
    rows: list[dict[str, Any]], el_number: int | None
) -> dict[str, Any] | None:
    ordered = sorted(rows, key=lambda row: int(row["el_min"]))
    if el_number is None:
        return ordered[0]
    last_at_or_below: dict[str, Any] | None = None
    for row in ordered:
        if int(row["el_min"]) <= el_number <= int(row["el_max"]):
            return row
        if int(row["el_min"]) <= el_number:
            last_at_or_below = row
    return last_at_or_below or ordered[0]
