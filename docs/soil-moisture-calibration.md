# Soil moisture calibration (HW-390 depletion anchors)

Grape moisture is scored by **depletion between two user-measured anchors**,
not against a fixed percentage band. This document is the physical procedure
for obtaining those anchors.

## Why there is no grape moisture percentage band

Viticulture irrigation thresholds are published in **soil water tension**
(centibars), not volumetric water content. Examples:

- Irrigation should begin before soil tension at roughly 2 ft depth approaches
  −40 to −50 centibars, depending on soil type (San Joaquin Valley extension
  guidance).
- Common practice in the SJV is roughly −30 to −40 centibars.

Tension does not convert to a single moisture percentage. The relationship is
soil-texture dependent (BC Wine Grape Council Best Practices Guide; IRROMETER
*Soil Water Basics*). Fabricating a crop-wide `moisture_min` / `moisture_max`
for grape would be wrong.

## What the HW-390 actually reports

The capacitive probe in this build is calibrated on the Pi:

- dry air → 0%
- fully submerged → 100%

That scale is **relative saturation**, not volumetric water content (VWC).
Published field-capacity and permanent-wilting-point VWC figures (METER Group;
Oklahoma State University Extension) therefore **cannot** be compared directly
to `moisture_pct`. Any code that treats the HW-390 percentage as VWC is wrong.

The two anchors below are also on that relative-saturation scale. They are
**soil-specific and device-specific**. Re-measure them if the probe moves to
different soil, or if you re-run the Pi dry/wet ADC calibration
(`moisture_dry_raw` / `moisture_wet_raw` in `pi-collector/config.yaml`), which
would invalidate prior anchors.

## Anchors stored on the device

| Column | Meaning |
|--------|---------|
| `devices.soil_field_capacity_raw` | HW-390 % at field capacity for this soil |
| `devices.soil_refill_point_raw` | HW-390 % at which irrigation should be triggered |

Both are numeric 0–100. Field capacity must be strictly greater than the refill
point. Until **both** are set, the dashboard shows moisture as
**needs field calibration** (status remains technically `unknown`; no defaults
are invented).

Populate them in the Supabase SQL editor / Table Editor, or via
`PATCH /devices/{id}/profile`.

## Procedure: measure field capacity

Field capacity (FC) is conventionally the water content after free drainage —
classically near −33 kPa — and can be measured in the field rather than looked
up (METER Group, *Plant available water*):

1. Irrigate (or wait for rainfall) until the root zone around the probe is
   thoroughly wet.
2. Stop irrigation and leave the soil to drain.
3. Monitor `moisture_pct` for roughly **three days**. In fine-textured soils
   drainage can take **up to about ten days**.
4. When the reading stops changing significantly (a plateau), that plateau is
   field capacity for **this** soil and **this** probe placement.
5. Record that plateau value as `soil_field_capacity_raw`.

Do not copy a literature VWC for sand or clay onto this column. The HW-390
scale is relative, and your soil is its own reference.

## Procedure: choose the refill point

Do **not** hardcode a refill threshold in software. Published grape guidance
is in tension (−30 to −50 centibars depending on soil type). Translating
tension onto the HW-390 relative scale requires either:

- running a tensiometer alongside the HW-390 for a season and reading the
  HW-390 % when tension hits your chosen trigger, or
- accepting a grower-chosen relative-saturation threshold based on experience.

Set that value as `soil_refill_point_raw`. It must be lower than field capacity.
The tension figures are the **reference you eventually anchor against**, not
something this codebase can derive.

## How scoring uses the anchors

Once both anchors exist:

- **0% depletion** — reading at field capacity
- **100% depletion** — reading at the refill point
- Above field capacity → watch (gravitational water, not plant-available)
- At or below refill → warn (irrigation due)
- Approaching refill within 10% of the available span → watch

Tomato devices keep their existing moisture percentage band and do not use
these anchors for scoring.
