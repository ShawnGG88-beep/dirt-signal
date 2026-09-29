/** Tomato powdery mildew risk. Python mirror: tomato_powdery_mildew.py */

import {
  LEVEILLULA_DELETERIOUS_C,
  LEVEILLULA_NIGHT_DAY_DELTA_C,
  LEVEILLULA_OPTIMAL_MAX_C,
  LEVEILLULA_OPTIMAL_MIN_C,
  OIDIUM_CANDIDATE_LABEL,
} from "./constants";
import type { DailyClimate } from "./climateMerge";

export interface PowderyMildewAssessment {
  leveillula_elevated: boolean;
  leveillula_message: string;
  oidium_candidate: boolean;
  oidium_message: string;
}

export function assessPowderyMildew(
  dailySeries: DailyClimate[],
): PowderyMildewAssessment {
  const observed = dailySeries.filter((d) => d.source === "observed");
  let leveillulaDays = 0;
  for (const daily of observed.slice(-7)) {
    if (daily.t_max_c == null || daily.t_min_c == null) continue;
    if (daily.t_max_c > LEVEILLULA_DELETERIOUS_C) continue;
    if (
      daily.t_max_c >= LEVEILLULA_OPTIMAL_MIN_C &&
      daily.t_max_c <= LEVEILLULA_OPTIMAL_MAX_C &&
      daily.t_max_c - daily.t_min_c >= LEVEILLULA_NIGHT_DAY_DELTA_C
    ) {
      leveillulaDays += 1;
    }
  }

  const leveillula = leveillulaDays >= 2;
  const leveillulaMsg = leveillula
    ? "Elevated Leveillula taurica risk: cool nights and warm days in forecast/observed window."
    : "Leveillula taurica risk not elevated.";

  const oidiumWindow = observed.slice(-14);
  const oidiumTemps = oidiumWindow.filter(
    (d) => d.t_max_c != null && d.t_max_c >= 15 && d.t_max_c <= 25,
  );
  const oidiumRh = oidiumWindow.filter(
    (d) =>
      d.rh_mean_pct != null &&
      d.rh_mean_pct >= 60 &&
      d.rh_mean_pct <= 90,
  );
  const oidium = oidiumTemps.length >= 7 && oidiumRh.length >= 7;
  const oidiumMsg = oidium
    ? `Oidium neolycopersici (${OIDIUM_CANDIDATE_LABEL}): sustained 15-25°C with RH 60-90% over 2-4 weeks.`
    : `Oidium neolycopersici (${OIDIUM_CANDIDATE_LABEL}): not elevated.`;

  return {
    leveillula_elevated: leveillula,
    leveillula_message: leveillulaMsg,
    oidium_candidate: oidium,
    oidium_message: oidiumMsg,
  };
}
