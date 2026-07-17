# Pi collector

Python service that runs on the Raspberry Pi. It reads soil sensors and
captures plant images on independent intervals, then inserts rows into
Supabase. Image files stay on the Pi; only the local `image_path` is stored.

## Camera dependency (apt, not pip)

Picamera2 is provided by Raspberry Pi OS as an apt package. Install it
before enabling `camera_mode: real`:

```bash
sudo apt update
sudo apt install -y python3-picamera2
```

Confirm the Camera Module 3 NoIR is visible:

```bash
rpicam-hello --list-cameras
# Expect imx708_noir (or similar) in the output
```

Make the system package visible to the collector venv (Raspberry Pi OS):

```bash
cd /home/pi/dirt-signal/pi-collector
python3 -m venv --system-site-packages .venv
source .venv/bin/activate
pip install -r requirements.txt
```

`--system-site-packages` is required so the venv can import `picamera2`
installed via apt.

## Configuration

Edit `config.yaml`:

| Key | Purpose |
|-----|---------|
| `camera_mode` | `mock` or `real` |
| `capture_interval_seconds` | Camera loop interval (independent of sensors) |
| `capture_width` / `capture_height` | Still size (default 2304x1296) |
| `light_condition` | `natural`, `grow_light`, `mixed`, or `unknown` |

`light_condition` may also be set via the `LIGHT_CONDITION` environment
variable (see `.env.example`). Set it to match the lighting in use. The grow
light emits negligible NIR, so grow-light and daylight images must not be
mixed in any future NDVI-style proxy without filtering on this tag.

## systemd

```bash
sudo cp dirt-signal.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now dirt-signal.service
sudo systemctl status dirt-signal.service
```

After a reboot the service should come back on its own (`WantedBy=multi-user.target`).
A missing or failed camera must not stop the sensor loop: the collector starts
in degraded mode, logs clearly, and keeps writing sensor readings.

## Manual test procedure (after deploy)

1. Watch the service log and wait for one camera interval:

   ```bash
   journalctl -u dirt-signal.service -f
   ```

   Expect a successful capture line such as
   `Camera capture succeeded` followed by
   `Inserted plant observation: path=captures/plant_obs_...`.

2. Confirm a new JPEG appeared locally:

   ```bash
   ls -lt /home/pi/dirt-signal/pi-collector/captures/ | head
   ```

3. Confirm the matching Supabase row has `image_path` populated and
   `light_condition` set to your configured value (`ndvi_estimate` may be null):

   ```sql
   select captured_at, image_path, light_condition, ndvi_estimate
   from plant_observations
   order by captured_at desc
   limit 5;
   ```

4. Degraded-mode check (camera fault must not kill sensors):

   - Disconnect the camera ribbon (or temporarily set an invalid capture
     path / stop the camera stack), then restart the service if needed.
   - `journalctl -u dirt-signal.service -f` should show a clear degraded-mode
     or capture-failure message.
   - Sensor inserts should continue on their own interval.
   - The process must stay up (`systemctl is-active dirt-signal.service`
     reports `active`).

5. Reboot check:

   ```bash
   sudo reboot
   # after reconnect
   systemctl is-active dirt-signal.service
   journalctl -u dirt-signal.service -b --no-pager | tail -n 50
   ```
