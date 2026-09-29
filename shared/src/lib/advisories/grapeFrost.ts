/** Grape-wine cultivar frost reference lookup. Python mirror: grape_frost.py */

import {
  getGrapeWineCultivarProfile,
  type GrapeFrostElRow,
  type GrapeWineFrostReference,
} from "../growingConstants";

/**
 * Selects the correct tissue-damage table by devices.cultivar. Coverage is
 * tagged (single_point vs el_staged_table) so callers do not imply more
 * precision than the source data has.
 *
 * These tables are reference data. evaluate_frost_risk remains a 2°C ambient
 * trailing indicator and does not read this module.
 */

export interface GrapeFrostThreshold {
  cultivar: string;
  display_name: string;
  coverage: string;
  threshold_c: number;
  stage_label: string;
  el_min: number | null;
  el_max: number | null;
  note: string;
  deacclimation_note: string | null;
}

export function getGrapeFrostProfile(
  cultivar: string | null | undefined,
): GrapeWineFrostReference | null {
  const profile = getGrapeWineCultivarProfile(cultivar);
  if (profile == null) return null;
  return profile.frost;
}

export function grapeFrostThresholdC(
  cultivar: string | null | undefined,
  elNumber?: number | null,
): GrapeFrostThreshold | null {
  const profile = getGrapeWineCultivarProfile(cultivar);
  if (profile == null) return null;
  const frost = profile.frost;
  const deacclimationNote = frost.deacclimation_note;

  if (frost.coverage === "el_staged_table") {
    const rows = frost.el_rows ?? [];
    if (rows.length === 0) return null;
    const chosen = pickElRow(rows, elNumber ?? null);
    if (chosen == null) return null;
    return {
      cultivar: profile.id,
      display_name: profile.display_name,
      coverage: frost.coverage,
      threshold_c: chosen.threshold_c,
      stage_label: chosen.label,
      el_min: chosen.el_min,
      el_max: chosen.el_max,
      note: frost.note,
      deacclimation_note: deacclimationNote,
    };
  }

  if (frost.slight_damage_c == null) return null;
  return {
    cultivar: profile.id,
    display_name: profile.display_name,
    coverage: frost.coverage,
    threshold_c: frost.slight_damage_c,
    stage_label: frost.stage_label,
    el_min: null,
    el_max: null,
    note: frost.note,
    deacclimation_note: deacclimationNote,
  };
}

function pickElRow(
  rows: GrapeFrostElRow[],
  elNumber: number | null,
): GrapeFrostElRow | null {
  const ordered = [...rows].sort((a, b) => a.el_min - b.el_min);
  if (ordered.length === 0) return null;
  if (elNumber == null) return ordered[0];
  let lastAtOrBelow: GrapeFrostElRow | null = null;
  for (const row of ordered) {
    if (elNumber >= row.el_min && elNumber <= row.el_max) return row;
    if (row.el_min <= elNumber) lastAtOrBelow = row;
  }
  return lastAtOrBelow ?? ordered[0];
}
