import { useEffect, useMemo, useState } from "react";

import { fetchProfileOptions, patchDeviceProfile } from "../data/client";

import type { ProfileCropOption } from "../data/types";

import {
  grapeWineSeasonStartHint,
} from "../lib/phenology";
import {
  getGrapeWineCultivarProfile,
  grapeWineCultivarOptions,
  WINKLER_INDEX_NOT_PHENOLOGY_NOTE,
  type GrapeWineCultivarProfile,
} from "../lib/growingConstants";



interface PlantProfileSectionProps {

  deviceId: string | null;

  cropType: string;

  lifecycleStage: string;

  seasonStartDate?: string | null;

  soilTexture?: string | null;

  cultivar?: string | null;

  onProfileSaved: (

    cropType: string,

    lifecycleStage: string,

    seasonStartDate?: string | null,

    soilTexture?: string | null,

    cultivar?: string | null,

  ) => void;

}



export function PlantProfileSection({

  deviceId,

  cropType,

  lifecycleStage,

  seasonStartDate = null,

  soilTexture = null,

  cultivar = null,

  onProfileSaved,

}: PlantProfileSectionProps) {

  const [crops, setCrops] = useState<ProfileCropOption[]>([]);

  const [draftCrop, setDraftCrop] = useState(cropType);

  const [draftStage, setDraftStage] = useState(lifecycleStage);

  const [draftSeasonStart, setDraftSeasonStart] = useState(

    seasonStartDate ?? "",

  );

  const [draftSoilTexture, setDraftSoilTexture] = useState(soilTexture ?? "loam");

  const [draftCultivar, setDraftCultivar] = useState(cultivar ?? "");

  const [confirmOpen, setConfirmOpen] = useState(false);

  const [saving, setSaving] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const [loadError, setLoadError] = useState<string | null>(null);



  useEffect(() => {

    setDraftCrop(cropType);

    setDraftStage(lifecycleStage);

  }, [cropType, lifecycleStage]);



  useEffect(() => {

    setDraftSeasonStart(seasonStartDate ?? "");

  }, [seasonStartDate]);



  useEffect(() => {

    setDraftSoilTexture(soilTexture ?? "loam");

  }, [soilTexture]);



  useEffect(() => {

    setDraftCultivar(cultivar ?? "");

  }, [cultivar]);



  useEffect(() => {

    if (!deviceId) return;

    let cancelled = false;

    async function load() {

      try {

        const options = await fetchProfileOptions(deviceId!);

        if (!cancelled) {

          setCrops(options.crops);

          setLoadError(null);

        }

      } catch (err) {

        if (!cancelled) {

          setLoadError(

            err instanceof Error ? err.message : "Failed to load profile options",

          );

        }

      }

    }

    void load();

    return () => {

      cancelled = true;

    };

  }, [deviceId]);



  const selectedCrop = useMemo(

    () => crops.find((c) => c.crop_type === draftCrop) ?? null,

    [crops, draftCrop],

  );



  const stages = selectedCrop?.lifecycle_stages ?? [];



  useEffect(() => {

    if (stages.length === 0) return;

    if (!stages.some((s) => s.lifecycle_stage === draftStage)) {

      setDraftStage(stages[0].lifecycle_stage);

    }

  }, [stages, draftStage]);



  useEffect(() => {

    if (draftCrop !== "grape_wine" && draftCultivar !== "") {

      setDraftCultivar("");

    }

  }, [draftCrop, draftCultivar]);



  const cultivarOptions =

    selectedCrop?.cultivars && selectedCrop.cultivars.length > 0

      ? selectedCrop.cultivars

      : grapeWineCultivarOptions();

  const cultivarProfile = getGrapeWineCultivarProfile(

    draftCrop === "grape_wine" ? draftCultivar : null,

  );



  const profileDirty =

    draftCrop !== cropType ||

    draftStage !== lifecycleStage ||

    (draftCultivar || null) !== (cultivar ?? null);

  const textureDirty = (draftSoilTexture || null) !== (soilTexture ?? "loam");

  const seasonDirty =

    (draftSeasonStart.trim() || null) !== (seasonStartDate ?? null);

  const dirty = profileDirty || seasonDirty || textureDirty;



  const cropLabel =

    crops.find((c) => c.crop_type === draftCrop)?.display_name ?? draftCrop;

  const stageLabel =

    stages.find((s) => s.lifecycle_stage === draftStage)?.display_name ??

    draftStage;



  async function applyProfile() {

    if (!deviceId) return;

    setSaving(true);

    setError(null);

    try {

      const updated = await patchDeviceProfile(deviceId, {

        crop_type: draftCrop,

        lifecycle_stage: draftStage,

        soil_texture: draftSoilTexture,

        cultivar: draftCrop === "grape_wine" ? draftCultivar || "" : "",

      });

      onProfileSaved(

        updated.crop_type,

        updated.lifecycle_stage,

        updated.season_start_date ?? seasonStartDate,

        updated.soil_texture ?? draftSoilTexture,

        updated.cultivar ?? null,

      );

      setConfirmOpen(false);

    } catch (err) {

      setError(err instanceof Error ? err.message : "Failed to update profile");

    } finally {

      setSaving(false);

    }

  }



  async function applySeasonStart() {

    if (!deviceId) return;

    setSaving(true);

    setError(null);

    try {

      const trimmed = draftSeasonStart.trim();

      const updated = await patchDeviceProfile(

        deviceId,

        trimmed

          ? { season_start_date: trimmed }

          : { clear_season_start: true },

      );

      onProfileSaved(

        updated.crop_type,

        updated.lifecycle_stage,

        updated.season_start_date ?? null,

      );

    } catch (err) {

      setError(err instanceof Error ? err.message : "Failed to update season start");

    } finally {

      setSaving(false);

    }

  }



  async function apply() {
    if (profileDirty) {
      await applyProfile();
    }
    if (seasonDirty) {
      await applySeasonStart();
    }
  }



  return (

    <section className="plant-profile">

      <div className="plant-profile-header">

        <h2>Plant profile</h2>

        <p className="subtitle">

          Single planting per device. Reassign when the planter is replanted.

        </p>

      </div>



      {!deviceId && (

        <p className="view-status">Waiting for device id from the data source…</p>

      )}

      {loadError && <div className="error-banner">{loadError}</div>}

      {error && <div className="error-banner">{error}</div>}



      <div className="plant-profile-controls">

        <label className="plant-profile-field">

          <span className="plant-profile-label">Crop</span>

          <select

            className="plant-profile-select"

            value={draftCrop}

            disabled={!deviceId || crops.length === 0}

            onChange={(e) => setDraftCrop(e.target.value)}

          >

            {crops.map((crop) => (

              <option key={crop.crop_type} value={crop.crop_type}>

                {crop.display_name}

              </option>

            ))}

          </select>

        </label>



        <label className="plant-profile-field">

          <span className="plant-profile-label">Stage</span>

          <select

            className="plant-profile-select"

            value={draftStage}

            disabled={!deviceId || stages.length === 0}

            onChange={(e) => setDraftStage(e.target.value)}

          >

            {stages.map((stage) => (

              <option

                key={stage.lifecycle_stage}

                value={stage.lifecycle_stage}

              >

                {stage.display_name}

              </option>

            ))}

          </select>

        </label>



        {draftCrop === "tomato" && (

          <label className="plant-profile-field">

            <span className="plant-profile-label">Soil texture</span>

            <select

              className="plant-profile-select"

              value={draftSoilTexture}

              disabled={!deviceId}

              onChange={(e) => setDraftSoilTexture(e.target.value)}

            >

              <option value="sand">Sand</option>

              <option value="sandy_loam">Sandy loam</option>

              <option value="loam">Loam</option>

              <option value="clay">Clay</option>

            </select>

            <span className="muted">

              Placeholder depletion bands for moisture stability advisories.

            </span>

          </label>

        )}



        {draftCrop === "grape_wine" && (

          <label className="plant-profile-field">

            <span className="plant-profile-label">Cultivar</span>

            <select

              className="plant-profile-select"

              value={draftCultivar}

              disabled={!deviceId}

              onChange={(e) => setDraftCultivar(e.target.value)}

            >

              <option value="">Not set (shared GDD bands)</option>

              {cultivarOptions.map((option) => (

                <option key={option.cultivar} value={option.cultivar}>

                  {option.display_name}

                </option>

              ))}

            </select>

            <span className="muted">

              Optional. Null keeps the shared Chardonnay GDD working points.

            </span>

          </label>

        )}



        <label className="plant-profile-field">

          <span className="plant-profile-label">Season start</span>

          <input

            type="date"

            className="plant-profile-select"

            value={draftSeasonStart}

            disabled={!deviceId}

            onChange={(e) => setDraftSeasonStart(e.target.value)}

          />

          {draftCrop === "grape_wine" ? (
            <p className="plant-profile-hint muted">
              Southern Hemisphere default is 1 September (not applied
              automatically). Hint for this year:{" "}
              {grapeWineSeasonStartHint(new Date(), "Africa/Johannesburg")}.
            </p>
          ) : null}

        </label>



        <button

          type="button"

          className="refresh-btn"

          disabled={!dirty || !deviceId || saving}

          onClick={() => {

            if (profileDirty) setConfirmOpen(true);

            else void applySeasonStart();

          }}

        >

          Apply

        </button>

      </div>



      {seasonStartDate && (

        <p className="muted plant-profile-season-note">

          Current season start: {seasonStartDate}. Clear the date and apply to

          reset cumulative degree days.

        </p>

      )}

      {cultivarProfile ? (
        <GrapeCultivarReferencePanel profile={cultivarProfile} />
      ) : null}



      {confirmOpen && (

        <div className="plant-profile-confirm" role="alertdialog">

          <p>

            Reassigning this device to {cropLabel} ({stageLabel}

            {draftCultivar
              ? `, ${cultivarProfile?.display_name ?? draftCultivar}`
              : ""}

            ). Past readings keep their original profile. Continue?

          </p>

          <div className="plant-profile-confirm-actions">

            <button

              type="button"

              className="refresh-btn"

              disabled={saving}

              onClick={() => setConfirmOpen(false)}

            >

              Cancel

            </button>

            <button

              type="button"

              className="refresh-btn plant-profile-confirm-go"

              disabled={saving}

              onClick={() => void apply()}

            >

              {saving ? "Saving…" : "Continue"}

            </button>

          </div>

        </div>

      )}

    </section>

  );

}

function GrapeCultivarReferencePanel({
  profile,
}: {
  profile: GrapeWineCultivarProfile;
}) {
  const frost = profile.frost;
  const water = profile.water_stress;
  return (
    <div className="plant-profile-reference">
      <h3 className="plant-profile-label">Cultivar reference</h3>
      <p className="muted">
        {profile.display_name} · {profile.winkler_region_label}
      </p>
      <p className="muted plant-profile-hint">{WINKLER_INDEX_NOT_PHENOLOGY_NOTE}</p>
      <p className="muted">
        Frost coverage: {frost.coverage.replace(/_/g, " ")} ({frost.stage_label}
        ). {frost.note}
      </p>
      {frost.deacclimation_note ? (
        <p className="muted">{frost.deacclimation_note}</p>
      ) : null}
      {frost.el_rows ? (
        <table className="cultivar-reference-table">
          <caption className="muted">Pinot Noir E-L frost thresholds</caption>
          <thead>
            <tr>
              <th>E-L</th>
              <th>Threshold</th>
            </tr>
          </thead>
          <tbody>
            {frost.el_rows.map((row) => (
              <tr key={`${row.el_min}-${row.el_max}`}>
                <td>{row.label}</td>
                <td>{row.threshold_c.toFixed(1)}°C</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {water.metric_type === "leaf_water_potential_gs50" &&
      water.psi_mpa != null ? (
        <p className="muted">
          Water-stress reference ({water.metric_type}): Psi_gs50 = {water.psi_mpa}{" "}
          ± {water.psi_mpa_plus_minus} {water.units}. {water.note}
        </p>
      ) : null}
      {water.metric_type === "stem_water_potential" && water.stages ? (
        <>
          <p className="muted">
            Water-stress reference ({water.metric_type}). {water.note}
          </p>
          <table className="cultivar-reference-table">
            <caption className="muted">
              Cabernet Sauvignon Psi_stem (manual comparison only)
            </caption>
            <thead>
              <tr>
                <th>Phenological stage</th>
                <th>Psi_stem (MPa)</th>
              </tr>
            </thead>
            <tbody>
              {water.stages.map((row) => (
                <tr key={row.phenological_stage}>
                  <td>{row.phenological_stage}</td>
                  <td>{row.psi_stem_mpa.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {water.rdi_note ? <p className="muted">{water.rdi_note}</p> : null}
          {water.severity_warning ? (
            <p className="muted">{water.severity_warning}</p>
          ) : null}
        </>
      ) : null}
      {water.open_gap ? <p className="muted">{water.note}</p> : null}
    </div>
  );
}

