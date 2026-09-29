/**
 * Record the shared-element tile → drawer transition as a short WebM.
 * Usage (desktop Vite on :1420):
 *   node scripts/record-tile-drawer.mjs
 */
import { createRequire } from "node:module";
import { mkdir, writeFile, access } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.resolve(__dirname, "../web/package.json"));
const puppeteer = require("puppeteer-core");

const OUT_DIR = path.resolve(__dirname, "../docs/redesign/screenshots");
const OUT_FILE = path.join(OUT_DIR, "part-d-tile-drawer-transition.webm");
const URL = process.env.RECORD_URL ?? "http://localhost:1420/#/dashboard";

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
].filter(Boolean);

async function findChrome() {
  for (const candidate of CHROME_CANDIDATES) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      /* try next */
    }
  }
  throw new Error("Chrome/Edge not found. Set CHROME_PATH.");
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const executablePath = await findChrome();
  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    defaultViewport: { width: 1280, height: 900 },
    args: ["--autoplay-policy=no-user-gesture-required"],
  });
  const page = await browser.newPage();
  await page.goto(URL, { waitUntil: "networkidle0", timeout: 60_000 });
  await page.waitForSelector('[data-sensor-tile="ph"]', { timeout: 30_000 });

  // Ensure motion is allowed so View Transitions run.
  await page.evaluate(() => {
    document.documentElement.setAttribute("data-reduce-motion", "false");
    document.querySelector(".needs-attention")?.scrollIntoView({
      block: "start",
    });
  });
  await new Promise((r) => setTimeout(r, 500));

  const client = await page.createCDPSession();
  await client.send("Page.startScreencast", {
    format: "jpeg",
    quality: 70,
    everyNthFrame: 1,
    maxWidth: 1280,
    maxHeight: 900,
  });

  const frames = [];
  client.on("Page.screencastFrame", async (evt) => {
    frames.push(Buffer.from(evt.data, "base64"));
    try {
      await client.send("Page.screencastFrameAck", {
        sessionId: evt.sessionId,
      });
    } catch {
      /* session may end */
    }
  });

  await new Promise((r) => setTimeout(r, 300));
  await page.click('[data-sensor-tile="ph"]');
  await new Promise((r) => setTimeout(r, 1400));
  await page.click(".weather-horizon-drawer-close");
  await new Promise((r) => setTimeout(r, 1000));

  await client.send("Page.stopScreencast");
  await browser.close();

  if (frames.length < 5) {
    throw new Error(`Too few frames captured (${frames.length})`);
  }

  const tmpDir = path.join(OUT_DIR, "_vt-frames");
  await mkdir(tmpDir, { recursive: true });
  for (let i = 0; i < frames.length; i += 1) {
    await writeFile(
      path.join(tmpDir, `frame-${String(i).padStart(4, "0")}.jpg`),
      frames[i],
    );
  }

  const ff = spawnSync(
    "ffmpeg",
    [
      "-y",
      "-framerate",
      "20",
      "-i",
      path.join(tmpDir, "frame-%04d.jpg"),
      "-c:v",
      "libvpx-vp9",
      "-b:v",
      "1M",
      "-an",
      OUT_FILE,
    ],
    { encoding: "utf8" },
  );
  if (ff.status !== 0) {
    // Fallback GIF via magick, else keep frame strip note.
    const gif = path.join(OUT_DIR, "part-d-tile-drawer-transition.gif");
    const magick = spawnSync(
      "magick",
      [
        "-delay",
        "5",
        "-loop",
        "0",
        path.join(tmpDir, "frame-*.jpg"),
        gif,
      ],
      { encoding: "utf8", shell: true },
    );
    if (magick.status === 0) {
      console.log(`Wrote ${gif} from ${frames.length} frames (no ffmpeg)`);
      return;
    }
    const still = path.join(
      OUT_DIR,
      "part-d-tile-drawer-transition-still.jpg",
    );
    await writeFile(
      still,
      frames[Math.min(frames.length - 1, Math.floor(frames.length * 0.55))],
    );
    console.log(
      `No ffmpeg/magick; wrote ${frames.length} frames to ${tmpDir} and still ${still}`,
    );
    console.error(ff.stderr || ff.stdout || magick.stderr);
    return;
  }
  console.log(`Wrote ${OUT_FILE} from ${frames.length} frames`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
