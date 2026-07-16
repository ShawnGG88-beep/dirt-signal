import { useEffect, useMemo, useState } from "react";
import {
  fetchProfileOptions,
  patchDeviceProfile,
  type ProfileCropOption,
} from "../lib/api";

interface PlantProfileSectionProps {
  deviceId: string | null;
  cropType: string;
  lifecycleStage: string;
  onProfileSaved: (cropType: string, lifecycleStage: string) => void;
}

export function PlantProfileSection({
  deviceId,
  cropType,
  lifecycleStage,
  onProfileSaved,
}: PlantProfileSectionProps) {
  const [crops, setCrops] = useState<ProfileCropOption[]>([]);
  const [draftCrop, setDraftCrop] = useState(cropType);
  const [draftStage, setDraftStage] = useState(lifecycleStage);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    setDraftCrop(cropType);
    setDraftStage(lifecycleStage);
  }, [cropType, lifecycleStage]);

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

  const dirty =
    draftCrop !== cropType || draftStage !== lifecycleStage;

  const cropLabel =
    crops.find((c) => c.crop_type === draftCrop)?.display_name ?? draftCrop;
  const stageLabel =
    stages.find((s) => s.lifecycle_stage === draftStage)?.display_name ??
    draftStage;

  async function apply() {
    if (!deviceId) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await patchDeviceProfile(
        deviceId,
        draftCrop,
        draftStage,
      );
      onProfileSaved(updated.crop_type, updated.lifecycle_stage);
      setConfirmOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update profile");
    } finally {
      setSaving(false);
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
        <p className="view-status">Waiting for device id from sidecar…</p>
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

        <button
          type="button"
          className="refresh-btn"
          disabled={!dirty || !deviceId || saving}
          onClick={() => setConfirmOpen(true)}
        >
          Apply
        </button>
      </div>

      {confirmOpen && (
        <div className="plant-profile-confirm" role="alertdialog">
          <p>
            Reassigning this device to {cropLabel} ({stageLabel}). Past
            readings keep their original profile. Continue?
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
