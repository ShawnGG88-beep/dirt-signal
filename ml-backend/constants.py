"""
Dirt Signal: reference bounds for tomato growing conditions.

Used by the Reports feature to flag readings that fall outside sensible
ranges for tomatoes. These are guideline bounds, not hard scientific
thresholds, drawn from general horticultural sources plus one cited
agricultural extension fact sheet. Adjust as real sensor data and chemical
test strip results accumulate.

Sources:
- General horticultural references (multiple, uncited, common consensus
  ranges for tomato growing)
- Hillock, D.A. and Rebek, E. "Growing Tomatoes in the Home Garden."
  Oklahoma Cooperative Extension Service, HLA-6012. Oklahoma State
  University. Cited below as OSU HLA-6012.

Caveat on N, P, K: budget RS485 soil sensors estimate these from EC and
dielectric properties using an unpublished formula, not direct ion-selective
measurement. Treat n_est, p_est, and k_est as provisional inputs to be
calibrated against chemical test strip ground truth (see soil_tests table),
not as trusted absolute readings.
"""

# Soil pH
# OSU HLA-6012: "prefer deep, fertile, well-drained soil ... slightly acidic
# (pH of about 6.5)"
PH_MIN = 6.0
PH_MAX = 6.8
PH_IDEAL = 6.5

# Soil moisture, calibrated percentage (relative to your specific soil and
# sensor calibration curve, not an absolute field capacity measurement)
MOISTURE_MIN_PCT = 60.0
MOISTURE_MAX_PCT = 80.0

# Soil temperature
# OSU HLA-6012: tomatoes should go in the ground when soil temperature is
# above 60F (~15.5C); temperatures below 50F (~10C) impair growth entirely
SOIL_TEMP_MIN_C = 10.0        # hard floor, growth impaired below this
SOIL_TEMP_PLANTING_MIN_C = 15.5  # minimum to transplant/plant out
SOIL_TEMP_IDEAL_MIN_C = 18.0
SOIL_TEMP_IDEAL_MAX_C = 24.0
SOIL_TEMP_MAX_C = 32.0        # root stress above this

# Ambient temperature
# OSU HLA-6012: fruit set fails when night temp is below ~60F (15.5C) or
# above ~70F (21C), or when day temp is consistently above ~92F (33C)
AMBIENT_TEMP_DAY_MIN_C = 21.0
AMBIENT_TEMP_DAY_MAX_C = 27.0
AMBIENT_TEMP_NIGHT_MIN_C = 15.5
AMBIENT_TEMP_NIGHT_MAX_C = 21.0
AMBIENT_TEMP_FRUIT_SET_CEILING_C = 33.0  # fruit set drops sharply above this

# Ambient humidity
HUMIDITY_MIN_PCT = 65.0
HUMIDITY_MAX_PCT = 75.0

# Electrical conductivity (once an EC-capable sensor is added)
EC_MIN_MS_CM = 2.0
EC_MAX_MS_CM = 3.5

# N, P, K categorical levels
# OSU HLA-6012: "tomatoes prefer a fertilizer low in nitrogen, high in
# phosphorus, and medium to high in potassium" (e.g. 10-20-10 ratio)
# These are directional targets, not numeric bounds, given the sensor
# estimation caveat above.
NPK_LEVELS = ["depleted", "low", "medium", "high", "surplus"]
N_TARGET = "low"          # low to moderate, avoid surplus (excess N delays
                           # fruit set and favours leaf growth over fruit)
P_TARGET = "high"
K_TARGET = "high"         # especially during fruiting

# Known physiological risk: blossom end rot
# OSU HLA-6012: BER results from calcium deficiency in young fruit "due to
# fluctuations in available moisture," occurring when soil is either too dry
# or excessively wet. A useful validation target: if moisture readings swing
# repeatedly outside MOISTURE_MIN_PCT/MOISTURE_MAX_PCT and BER is later
# observed on the plant, that is a citable link between sensor data and a
# real outcome for the case study.
