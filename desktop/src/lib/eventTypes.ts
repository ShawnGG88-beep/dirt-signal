/**
 * Plant event types for the annotation layer.
 *
 * SOURCE OF TRUTH: ml-backend/constants.py (PLANT_EVENT_TYPES).
 * Mirror that file when adding or renaming types. Do not invent keys here.
 */

export type PlantEventTypeKey =
  | "irrigation"
  | "fertiliser"
  | "pruning"
  | "transplant"
  | "pest_disease_observation"
  | "pest_disease_treatment"
  | "harvest"
  | "sensor_calibration"
  | "sensor_maintenance"
  | "stage_change"
  | "observation";

export interface PlantEventTypeDef {
  key: PlantEventTypeKey;
  label: string;
  icon: string;
  quantityApplicable: boolean;
  defaultQuantityUnit: string | null;
  colour: string;
  /** Compact monospace glyph for rails and reports. */
  glyph: string;
}

export const PLANT_EVENT_TYPES: readonly PlantEventTypeDef[] = [
  {
    key: "irrigation",
    label: "Irrigation",
    icon: "droplet",
    quantityApplicable: true,
    defaultQuantityUnit: "ml",
    colour: "#107EEC",
    glyph: "~",
  },
  {
    key: "fertiliser",
    label: "Fertiliser",
    icon: "flask",
    quantityApplicable: true,
    defaultQuantityUnit: "ml",
    colour: "#2DB500",
    glyph: "*",
  },
  {
    key: "pruning",
    label: "Pruning",
    icon: "scissors",
    quantityApplicable: false,
    defaultQuantityUnit: null,
    colour: "#FF8A00",
    glyph: "x",
  },
  {
    key: "transplant",
    label: "Transplant",
    icon: "pot",
    quantityApplicable: false,
    defaultQuantityUnit: null,
    colour: "#c0c0c0",
    glyph: "+",
  },
  {
    key: "pest_disease_observation",
    label: "Pest / disease seen",
    icon: "eye",
    quantityApplicable: false,
    defaultQuantityUnit: null,
    colour: "#e0b000",
    glyph: "o",
  },
  {
    key: "pest_disease_treatment",
    label: "Pest / disease treatment",
    icon: "spray",
    quantityApplicable: false,
    defaultQuantityUnit: null,
    colour: "#e05050",
    glyph: "!",
  },
  {
    key: "harvest",
    label: "Harvest",
    icon: "basket",
    quantityApplicable: true,
    defaultQuantityUnit: "g",
    colour: "#9b59b6",
    glyph: "#",
  },
  {
    key: "sensor_calibration",
    label: "Sensor calibration",
    icon: "calibrate",
    quantityApplicable: false,
    defaultQuantityUnit: null,
    colour: "#1abc9c",
    glyph: "=",
  },
  {
    key: "sensor_maintenance",
    label: "Sensor maintenance",
    icon: "wrench",
    quantityApplicable: false,
    defaultQuantityUnit: null,
    colour: "#e67e22",
    glyph: "/",
  },
  {
    key: "stage_change",
    label: "Stage change",
    icon: "swap",
    quantityApplicable: false,
    defaultQuantityUnit: null,
    colour: "#888888",
    glyph: ">",
  },
  {
    key: "observation",
    label: "Observation",
    icon: "note",
    quantityApplicable: false,
    defaultQuantityUnit: null,
    colour: "#555555",
    glyph: ".",
  },
] as const;

const BY_KEY = Object.fromEntries(
  PLANT_EVENT_TYPES.map((t) => [t.key, t]),
) as Record<PlantEventTypeKey, PlantEventTypeDef>;

export function getEventType(
  key: string | null | undefined,
): PlantEventTypeDef | null {
  if (!key) return null;
  return BY_KEY[key as PlantEventTypeKey] ?? null;
}

export function eventTypeLabel(key: string): string {
  return getEventType(key)?.label ?? key;
}

export function eventTypeColour(key: string): string {
  return getEventType(key)?.colour ?? "#555555";
}

export function eventTypeGlyph(key: string): string {
  return getEventType(key)?.glyph ?? "?";
}

export function eventQuantityApplicable(key: string): boolean {
  return getEventType(key)?.quantityApplicable ?? false;
}

export function isPlantEventTypeKey(value: string): value is PlantEventTypeKey {
  return value in BY_KEY;
}

/** Types offered in the quick-entry grid (exclude system-only stage_change). */
export const MANUAL_EVENT_TYPES: readonly PlantEventTypeDef[] =
  PLANT_EVENT_TYPES.filter((t) => t.key !== "stage_change");

const FILTER_STORAGE_PREFIX = "dirt-signal-event-filter:";

/** All type keys enabled by default. */
export function defaultEventFilter(): Set<PlantEventTypeKey> {
  return new Set(PLANT_EVENT_TYPES.map((t) => t.key));
}

export function loadEventFilter(viewKey: string): Set<PlantEventTypeKey> {
  try {
    const raw = localStorage.getItem(`${FILTER_STORAGE_PREFIX}${viewKey}`);
    if (!raw) return defaultEventFilter();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return defaultEventFilter();
    const keys = parsed.filter(
      (k): k is PlantEventTypeKey =>
        typeof k === "string" && isPlantEventTypeKey(k),
    );
    if (keys.length === 0) return defaultEventFilter();
    return new Set(keys);
  } catch {
    return defaultEventFilter();
  }
}

export function saveEventFilter(
  viewKey: string,
  enabled: Set<PlantEventTypeKey>,
): void {
  localStorage.setItem(
    `${FILTER_STORAGE_PREFIX}${viewKey}`,
    JSON.stringify([...enabled]),
  );
}
