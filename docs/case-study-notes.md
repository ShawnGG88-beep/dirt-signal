# Dirt Signal: case study notes

Running project log for the shawngreyling.com writeup and for future sessions.
Append new dated or phase-based entries after each significant milestone. Do not
rewrite old entries to tidy the narrative in hindsight. Be specific about errors,
root causes, and abandoned approaches.

Convention: British English. No em dashes.

---

## 2026-07 (planning): Initial architecture decisions

Summary: Chose Tauri, a Python FastAPI sidecar, Supabase, and mock-first sensors before any hardware arrived.

### What was attempted

Define the system shape for Dirt Signal before the Raspberry Pi or sensors arrived.
Documented in `dirt-signal-project-plan.md` and scaffolded in commit `9bd7d5e`
(2026-07-15).

### Decisions and why

1. **Tauri over Electron**  
   Need a real desktop shell on the laptop with a thin native layer. Tauri keeps
   the Rust side limited to window config and sidecar lifecycle
   (`desktop/src-tauri/src/lib.rs`), while UI stays React/TypeScript and logic
   stays in Python. Electron would have meant a heavier Chromium bundle for
   little benefit given that almost none of the product logic belongs in the
   shell.

2. **Python sidecar (FastAPI) over PyO3**  
   ML and data work is already Python (supabase-py, scikit-learn later). A
   FastAPI process on `localhost:8731` that Tauri starts and stops avoids
   binding Python into Rust via PyO3, which would complicate packaging and slow
   iteration for someone newer to Rust. The Rust layer stays intentionally dumb.

3. **Supabase over a self-hosted database**  
   One-way flow: Pi writes readings, laptop reads them from anywhere with
   internet. Managed Postgres, Auth-ready later if needed, and no need to expose
   the Pi. Schema uses `timestamptz`, devices / sensor_readings / soil_tests /
   predictions. RLS left off initially for a single-user service-key setup, with
   a note to revisit if it becomes multi-user.

4. **Mock-first sensor development**  
   Every sensor sits behind a common interface; `config.yaml` selects `mock` or
   `real`. Phase 0 goal: whole pipeline works with `sensors/mock.py` before a
   single wire is connected. Same pattern later extended to the camera
   (`camera_mode: mock | real`).

### What went wrong

Nothing at this stage. These were upfront choices, not recoveries from failure.

### How it was resolved

N/A. Scaffolded as a monorepo with `pi-collector/`, `ml-backend/`, and `desktop/`.

---

## 2026-07-15 (Phase 1 bring-up): Raspberry Pi Imager SSH saga

Summary: Password SSH failed repeatedly after imaging; key-based auth eventually worked after Imager hashing suspicion, wrong key-file selection on Windows, and a stale known_hosts warning.

### What was attempted

Flash Raspberry Pi OS Lite (64-bit) with Raspberry Pi Imager on Windows,
pre-stage WiFi, enable SSH, set hostname `dirt-signal-pi`, and log in from the
laptop over SSH with the password configured in the Imager UI.

### What went wrong

1. **Password authentication kept failing** despite deliberately simple,
   carefully typed passwords set in Imager's OS customisation. Symptom was
   repeated `Permission denied (publickey,password)` (or equivalent password
   rejection) on `ssh pi@dirt-signal-pi` / the Pi's LAN IP. Not a wrong-host
   problem: the host was reachable.

2. **Suspected Imager / OpenSSL password-hashing bug on Windows**  
   After several reflash cycles with known-good passwords still rejected, the
   working theory became that the Windows Imager path was writing a password
   hash the Pi's `sshd` would not accept (OpenSSL / image-customisation
   interaction), rather than operator typo. Continuing to reflash with yet
   another password was abandoned as a dead end.

3. **Pivot to SSH key-based authentication**  
   Regenerated / configured an SSH key pair and told Imager to install the
   public key. This is the correct long-term approach anyway for a headless Pi.

4. **Windows Publisher-file-extension confusion**  
   When selecting the key to use, Windows / the file picker made it easy to
   grab the wrong file (Publisher / unexpected extension) instead of the actual
   private key. SSH then failed with key errors until the correct private key
   file was selected.

5. **Stale `known_hosts` after reflashing**  
   Reflashing the SD card changes the host key. Next SSH attempt produced the
   familiar WARNING about remote host identification having changed /
   `OFFENDING HOST KEY` in `~/.ssh/known_hosts`. That blocked login until the
   old entry for the Pi's IP/hostname was removed.

### How it was resolved

- Abandoned password auth for this bring-up path.
- Installed SSH public key via Imager; authenticated with the correct private
  key file (not the mis-selected Publisher-related file).
- Cleared the stale `known_hosts` entry after reflash.
- Result: working key-based SSH into the Pi.

### Decision

Prefer key-based SSH for the Dirt Signal Pi from here on. Do not rely on Imager
password customisation on Windows without verifying login once before investing
more setup time.

---

## 2026-07-15 (Phase 1): Git identity and GitHub authentication on the Pi

Summary: First commit failed because git user.name / user.email were unset; GitHub then rejected password push; fixed with a PAT and credential caching.

### What was attempted

Clone or use the Dirt Signal repo on the Pi, make the first local change, commit,
and push to GitHub (`ShawnGG88-beep/dirt-signal`).

### What went wrong

1. **Unset git identity**  
   First commit failed because `user.name` and `user.email` were not configured
   on the Pi. Git refuses the commit until identity is set (error along the
   lines of "Please tell me who you are" / `user.email` and `user.name` unset).

2. **GitHub rejected password-based push**  
   After identity was set, `git push` with the GitHub account password failed.
   GitHub no longer accepts account passwords for Git HTTPS; the remote rejects
   the credentials.

### How it was resolved

- Set git config on the Pi (`user.name` / `user.email`). Evidence in history:
  commit `ab1b08a` is authored as `Shawn Greyling <shawn@struktlab.com>`,
  distinct from the Cursor-coauthored `ShawnGG88-beep <tools@struktlab.com>`
  commits.
- Created a GitHub Personal Access Token (PAT) and used it for HTTPS push.
- Cached credentials on the Pi so subsequent pushes did not require re-pasting
  the token every time.

### Decision

On every new machine (especially the Pi), set git identity before the first
commit, and use a PAT or SSH deploy key for GitHub. Never expect password auth
to work for `git push`.

---

## 2026-07-15 (Phase 1): `.env` and `.gitignore` gap on the Pi

Summary: First `.env` on the Pi raised a secrets-leak scare; history check showed nothing committed; package-level ignore added retroactively.

### What was attempted

Create `pi-collector/.env` on the Pi with Supabase URL and service role key so
the collector could write mock readings.

### What went wrong

When that first `.env` was created on the Pi, there was no adequate local
gitignore story in place for how the Pi working tree was being used. Immediate
fear: the service role key might already be in git history or about to be
committed.

### How it was resolved

1. Ran `git log --all --full-history` (and related path checks) for `.env`
   files before assuming the worst.
2. Confirmed nothing had leaked: no `.env` content in history.
3. Added `pi-collector/.gitignore` retroactively in commit `ab1b08a`
   ("Add gitignore for env files and venv") covering:

   ```
   .env
   venv/
   __pycache__/
   ```

Note: the monorepo root `.gitignore` from scaffold `9bd7d5e` already listed
`.env`, `.venv/`, and `venv/`, which is why nothing had been committed even
before the nested file existed. The Pi still needed the explicit local ignore
and the verification step for peace of mind. The nested ignore listing `venv/`
(not only `.venv/`) matches how the virtualenv was actually created on the Pi
(see next entry).

### Decision

Never create a `.env` on a new checkout without confirming ignore rules first.
Keep both root and package-level ignores. Treat "did it leak?" as a history
question (`git log --all --full-history`), not a guess.

---

## 2026-07-15 (Phase 1): systemd `203/EXEC` from `.venv` vs `venv` mismatch

Summary: Collector unit failed with status 203/EXEC because ExecStart pointed at `.venv` while the Pi had created `venv`.

### What was attempted

Install and enable `pi-collector/dirt-signal.service` so the mock collector runs
on boot / stays up under systemd.

Unit file (then and now) contains:

```
ExecStart=/home/pi/dirt-signal/pi-collector/.venv/bin/python collector.py
```

### What went wrong

Service failed to start with **status `203/EXEC`**. On systemd, that means the
kernel could not execute the path in `ExecStart` (typically "No such file or
directory" for a missing interpreter or script).

Root cause: path mismatch. The unit expected:

`/home/pi/dirt-signal/pi-collector/.venv/bin/python`

but the virtualenv on the Pi had been created as `venv/` (no leading dot), so
the binary lived at:

`/home/pi/dirt-signal/pi-collector/venv/bin/python`

README and Windows-oriented docs suggest `python -m venv .venv`; the Pi session
used `venv` instead. The unit file was never updated to match. Result: systemd
could not exec the configured Python and exited `203/EXEC`.

### How it was resolved

Aligned the paths: either recreate the env as `.venv` to match the unit, or
point `ExecStart` at the `venv` that actually existed, then
`daemon-reload` and restart the service. Confirmed the collector process stayed
up and continued writing mock rows to Supabase.

### Decision

Standardise on `.venv` in docs, unit file, and Pi setup commands so this cannot
drift again. When systemd says `203/EXEC`, check the ExecStart binary path
before debugging Python imports.

---

## 2026-07-16: Multi-crop profiles (tomato first, grapes later)

Summary: Abandoned a single tomato reference-bounds file for per-device crop profiles after planning a Cape Winelands grape test.

### What was attempted

Reports / Dashboard scoring started from a single tomato reference file
(`ml-backend/constants.py` and mirrored `desktop/src/lib/growingConstants.ts` in
commit `a8ede96`), with flat constants such as `PH_MIN`, `MOISTURE_MIN_PCT`, and
directional N/P/K targets for tomatoes only.

### What went wrong / pressure to change

Nothing "broke", but the model of one global bounds file could not survive a
second crop. A contact in the Cape Winelands made grapevines a realistic next
test of the same hardware and pipeline. Tomato pH/moisture/N targets are wrong
for wine or table grapes, and grape literature splits by production goal and
lifecycle stage, not by cultivar (Zhao et al. 2019: no significant soil OM /
available-nutrient differences across five major varieties).

### How it was resolved

Pivoted to a multi-crop profile architecture in commit `109a1fb`:

- `CROP_PROFILES` keyed by `crop_type` then lifecycle `stage`
  (`tomato`, `grape_table`, `grape_wine`; stages such as `mature` /
  `establishment`).
- Supabase migrations `003_crop_profiles.sql` and
  `004_reading_profile_provenance.sql`: devices carry `crop_type` and
  `lifecycle_stage`; readings stamp profile provenance so History stays honest
  after a replant.
- Desktop: per-device crop profile switcher, Dashboard scoring and segmented
  History charts driven from the active profile.
- Explicit sampling limitations for any grape device, including that none of the
  cited sources is South African and local validation is required before any
  Cape Winelands claim.

### Decision

Split profiles by production goal and lifecycle stage, never by cultivar. Keep
tomato as the default working profile; treat grape profiles as provisional until
field validation. Stamp provenance on each reading so changing the device
profile does not silently re-score old data against new bounds.

---

## 2026-07 (planning through Phase 0–2): NPK ground truth pivot

Summary: Budget RS485 "NPK" sensors only estimate N/P/K from EC; chemical soil test strips became ground truth instead.

### What was attempted

Original hardware story included a commercial RS485 Modbus NPK sensor (12V,
TTL-RS485, pymodbus) whose N, P, and K outputs would feed the model and UI
(see project plan Phase 5 and schema columns `npk_n_est`, `npk_p_est`,
`npk_k_est`, `ec_us_cm`).

### What went wrong

On inspection of how budget RS485 NPK probes actually work: they do **not**
measure nitrate, phosphate, and potassium with ion-selective chemistry. They
estimate N, P, and K from electrical conductivity / dielectric properties via an
unpublished vendor formula. Treating those estimates as labels would train the
model on a proxy of a proxy.

### How it was resolved

- Keep the RS485 probe as a possible **future input feature** (especially EC),
  never as ground truth.
- Use **chemical soil test strips** for N, P, and K categorical labels
  (`soil_tests` table: depleted / low / medium / high / surplus), logged from
  the desktop Soil Tests flow.
- Document the caveat in `constants.py` and the project plan so Reports and ML
  do not pretend sensor NPK is absolute.

### Decision

Ground truth = strips (and later lab tests if needed). Sensor NPK estimates =
provisional features to calibrate against strips. Do not buy the RS485 unit until
sourcing is settled (see open questions); the mock pipeline and strip workflow
do not block on it.

---

## 2026-07-16: Camera hardware choice (Module 3 NoIR over IMX500)

Summary: Chose Raspberry Pi Camera Module 3 NoIR for a simpler path and NDVI-style analysis instead of the Sony IMX500 AI Camera.

### What was attempted

Select a Pi camera for plant observations alongside soil sensors. Two candidates
in mind: Raspberry Pi Camera Module 3 NoIR, and the Sony IMX500 AI Camera
(on-sensor inference).

### Decision and why

Chose **Camera Module 3 NoIR**:

- Simpler development path (picamera2 / standard CSI stack; no IMX500 firmware
  and on-sensor model pipeline to learn while soil bring-up is still unfinished).
- Prioritise **NDVI-style vegetation analysis** (NoIR supports the NIR-oriented
  workflow) over on-sensor AI classification.
- Matches the software already stubbed: `plant_observations` stores local
  `image_path` + `ndvi_estimate` (migration `002_plant_observations.sql`);
  collector has a separate capture loop from sensor reads; `camera_mode: mock`
  ships first (`e8e2193`).

### What went wrong

Nothing yet: hardware not wired; `PiCameraCapture` still raises
`NotImplementedError` until the module is connected. Mock path is intentional.

### How it was resolved

N/A at hardware level. Software path is mock-first, images stay on device (no
upload to Supabase), metadata only in `plant_observations`.

---

## 2026-07-16: Supabase UTC vs local timezone display

Summary: Questioned whether Dashboard times were wrong UTC; confirmed desktop already converts with local `toLocaleString`.

### What was attempted

Verify that reading timestamps shown in the desktop app match wall-clock local
time (South Africa, SAST / UTC+2), after noticing Supabase / Postgres stores
`timestamptz` and the collector writes UTC:

```python
datetime.now(timezone.utc).isoformat()
```

### What went wrong

Potential confusion only: if the UI printed raw ISO strings, evening local
readings would appear shifted by two hours. Needed a clear answer before
changing schema or collector behaviour.

### How it was resolved

Checked the desktop formatting path. Dashboard (and charts) already do:

```typescript
new Date(iso).toLocaleString("en-GB", { ... })
```

`Date` parses the ISO UTC timestamp; `toLocaleString` renders in the host local
timezone. Daily summary logic also buckets by local calendar day
(`localDayKey` in `dailySummary.ts`). No schema change and no collector change
required.

### Decision

Keep storing UTC (`timestamptz` + collector UTC ISO). Keep displaying local time
in the app. Do not dual-write local timestamps.

---

## Open questions / not yet resolved

- **RS485 NPK sensor sourcing**: Still not ordered. When/if purchased, treat N/P/K
  outputs as estimated features only; prefer a probe with a documented Modbus
  map and usable EC. Budget remains a constraint; strips cover ground truth for
  now.
- **Grape crop profile**: `grape_table` and `grape_wine` profiles exist with
  cited non-SA sources and explicit sampling limitations. No Cape Winelands
  field validation yet. Contact exists; no on-vine deployment schedule.
- **Real sensor wiring (Phase 2)**: DS18B20, DHT22, ADS1115 moisture, pH still
  mock. Counterfeit DHT22 cross-check still ahead.
- **Camera Module 3 NoIR**: Chosen but not yet wired; `PiCameraCapture` stub
  only. NDVI pipeline beyond mock `ndvi_estimate` not built.
- **ML layer (Phase 4)**: Train/predict endpoints and Model view still out of
  milestone scope; need weeks of readings plus strip labels first.
- **RLS / multi-user**: Service key, RLS off. Revisit before any shared access.

---

## Maintenance

After each significant milestone (hardware bring-up step, abandoned approach,
security scare, schema change, or field decision), append a new entry above the
Open questions section (or update Open questions in place). Prefer honest
failure detail over a clean story.
