"""Grape-wine cultivar frost tables and water-stress reference data."""

from __future__ import annotations

import inspect

from advisories.grape_frost import grape_frost_threshold_c, get_grape_frost_profile
from alerts.rules import evaluate_irrigation_due
from constants import (
    GRAPE_WINE_WATER_STRESS_DRIVES_IRRIGATION,
    get_grape_wine_cultivar_profile,
)
from derived import project_drydown


def test_frost_module_selects_cabernet_table_not_pinot() -> None:
    cabernet = grape_frost_threshold_c("cabernet_sauvignon")
    pinot = grape_frost_threshold_c("pinot_noir")
    assert cabernet is not None
    assert pinot is not None
    assert cabernet.threshold_c == -3.9
    assert cabernet.coverage == "single_point"
    assert pinot.coverage == "el_staged_table"
    assert pinot.threshold_c == -3.3
    assert cabernet.threshold_c != pinot.threshold_c
    assert get_grape_frost_profile("cabernet_sauvignon")["el_rows"] is None
    assert len(get_grape_frost_profile("pinot_noir")["el_rows"]) == 4


def test_pinot_noir_el_staged_frost_rows() -> None:
    assert grape_frost_threshold_c("pinot_noir", 4).threshold_c == -2.2
    assert grape_frost_threshold_c("pinot_noir", 9).threshold_c == -1.7
    assert grape_frost_threshold_c("pinot_noir", 11).threshold_c == -1.1


def test_chardonnay_frost_is_single_point() -> None:
    chardonnay = grape_frost_threshold_c("chardonnay")
    assert chardonnay.coverage == "single_point"
    assert chardonnay.threshold_c == -2.8
    assert grape_frost_threshold_c(None) is None


def test_cabernet_psi_stem_retrievable_and_tagged() -> None:
    water = get_grape_wine_cultivar_profile("cabernet_sauvignon")["water_stress"]
    assert water["metric_type"] == "stem_water_potential"
    assert water["drives_irrigation"] is False
    assert GRAPE_WINE_WATER_STRESS_DRIVES_IRRIGATION is False
    stages = {
        row["phenological_stage"]: row["psi_stem_mpa"] for row in water["stages"]
    }
    assert stages["2 weeks pre-bloom"] == -0.6
    assert stages["Bunch closure"] == -0.8
    assert stages["Veraison initiation"] == -1.0
    assert stages["End of veraison"] == -1.2


def test_chardonnay_psi_gs50_tagged_pinot_is_open_gap() -> None:
    chardonnay = get_grape_wine_cultivar_profile("chardonnay")["water_stress"]
    pinot = get_grape_wine_cultivar_profile("pinot_noir")["water_stress"]
    assert chardonnay["metric_type"] == "leaf_water_potential_gs50"
    assert chardonnay["psi_mpa"] == -1.22
    assert chardonnay["drives_irrigation"] is False
    assert pinot["metric_type"] is None
    assert pinot["open_gap"] is True


def test_psi_stem_is_not_an_irrigation_trigger_input() -> None:
    irrigation_params = inspect.signature(evaluate_irrigation_due).parameters
    assert "water_stress" not in irrigation_params
    assert "psi" not in irrigation_params
    drydown_params = inspect.signature(project_drydown).parameters
    assert "psi" not in drydown_params
    assert "water_stress" not in drydown_params
    assert "stem_water_potential" not in drydown_params
