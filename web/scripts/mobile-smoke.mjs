/**
 * 390x844 mobile smoke checks for the web dashboard.
 *
 * 1) Fixture layout: no horizontal scroll; font/tap floors.
 * 2) Production preview: manifest.webmanifest reachable, service worker
 *    registers, no horizontal scroll on the shell (login/config notice).
 *
 * Usage (from repo root, with a static server on FIXTURE_PORT and a
 * `vite preview` on PREVIEW_PORT):
 *   node web/scripts/mobile-smoke.mjs
 *
 * Env:
 *   FIXTURE_BASE  default http://127.0.0.1:8765
 *   PREVIEW_BASE  default http://127.0.0.1:4173
 */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const puppeteer = require("puppeteer-core");

const FIXTURE_BASE = process.env.FIXTURE_BASE || "http://127.0.0.1:8765";
const PREVIEW_BASE = process.env.PREVIEW_BASE || "http://127.0.0.1:4173";

const failures = [];

function fail(msg) {
  failures.push(msg);
  console.error("FAIL:", msg);
}

function ok(msg) {
  console.log("OK:", msg);
}

async function withPage(fn) {
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH || "/usr/local/bin/google-chrome",
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    const page = await browser.newPage();
    const device = puppeteer.KnownDevices?.["iPhone 12"];
    if (device) await page.emulate(device);
    else {
      await page.setViewport({
        width: 390,
        height: 844,
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      });
    }
    await page.emulateMediaFeatures([
      { name: "prefers-color-scheme", value: "dark" },
    ]);
    await fn(page);
  } finally {
    await browser.close();
  }
}

async function checkFixture(page) {
  const url = `${FIXTURE_BASE}/web/fixtures/mobile-dashboard-after.html`;
  await page.goto(url, { waitUntil: "networkidle0", timeout: 60_000 });

  const report = await page.evaluate(() => {
    const rootPx = parseFloat(getComputedStyle(document.documentElement).fontSize);
    const horizontalScroll =
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth + 1;

    const samples = {};
    const sels = [
      ".app-menu-toggle",
      ".app-mobile-title",
      ".theme-toggle",
      ".metric-label",
      ".metric-value",
      ".metric-status",
      ".band-bar-num",
      ".system-status-label",
      ".system-status-meta",
      ".system-status-profile-chip",
      ".dashboard-header h1",
      ".subtitle",
    ];
    for (const sel of sels) {
      const el = document.querySelector(sel);
      if (!el) {
        samples[sel] = null;
        continue;
      }
      const cs = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      samples[sel] = {
        fontSize: parseFloat(cs.fontSize),
        lineHeight: cs.lineHeight,
        width: rect.width,
        height: rect.height,
      };
    }

    // Absolute floor: nothing rendered below 12px.
    const all = Array.from(document.querySelectorAll("body *"));
    let minFont = Infinity;
    let minFontEl = null;
    for (const el of all) {
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden") continue;
      const text = (el.childNodes && Array.from(el.childNodes).some(
        (n) => n.nodeType === 3 && n.textContent.trim().length > 0,
      ));
      if (!text) continue;
      const fs = parseFloat(cs.fontSize);
      if (fs > 0 && fs < minFont) {
        minFont = fs;
        minFontEl = el.className || el.tagName;
      }
    }

    return { rootPx, horizontalScroll, samples, minFont, minFontEl };
  });

  if (report.horizontalScroll) fail("Fixture has horizontal scroll at 390px");
  else ok("Fixture: no horizontal scroll");

  if (report.rootPx < 15.5) fail(`Root font-size too small: ${report.rootPx}px`);
  else ok(`Root font-size ${report.rootPx}px`);

  const s = report.samples;
  const expectMin = (sel, min, dim = "fontSize") => {
    const v = s[sel]?.[dim];
    if (v == null) fail(`Missing ${sel}`);
    else if (v + 0.01 < min) fail(`${sel} ${dim}=${v} < ${min}`);
    else ok(`${sel} ${dim}=${Math.round(v * 10) / 10}`);
  };

  expectMin(".dashboard-header h1", 28);
  expectMin(".metric-label", 20);
  expectMin(".metric-value", 24);
  expectMin(".metric-status", 16);
  expectMin(".band-bar-num", 14);
  expectMin(".system-status-label", 16);
  expectMin(".system-status-meta", 14);
  expectMin(".subtitle", 16);
  expectMin(".app-menu-toggle", 44, "height");
  expectMin(".app-menu-toggle", 44, "width");
  expectMin(".theme-toggle", 44, "height");
  expectMin(".theme-toggle", 44, "width");
  expectMin(".system-status-profile-chip", 44, "height");

  if (report.minFont < 12) {
    fail(`Found text below 12px: ${report.minFont}px on ${report.minFontEl}`);
  } else {
    ok(`Smallest text node font-size ${report.minFont}px (>= 12)`);
  }
}

async function checkPreview(page) {
  const manifestRes = await page.goto(`${PREVIEW_BASE}/manifest.webmanifest`, {
    waitUntil: "networkidle0",
    timeout: 60_000,
  });
  if (!manifestRes || !manifestRes.ok()) {
    fail(`manifest.webmanifest HTTP ${manifestRes?.status()}`);
  } else {
    const body = await manifestRes.json();
    if (!body.name) fail("manifest missing name");
    else ok(`manifest.webmanifest ok (${body.name})`);
  }

  await page.goto(PREVIEW_BASE, { waitUntil: "networkidle0", timeout: 60_000 });

  const shell = await page.evaluate(async () => {
    const horizontalScroll =
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth + 1;
    let sw = "unsupported";
    if ("serviceWorker" in navigator) {
      try {
        // vite-plugin-pwa registers on load; give it a moment then check.
        await new Promise((r) => setTimeout(r, 1500));
        const regs = await navigator.serviceWorker.getRegistrations();
        sw = regs.length > 0 ? "registered" : "none";
      } catch (e) {
        sw = `error:${e}`;
      }
    }
    return { horizontalScroll, sw, title: document.title };
  });

  if (shell.horizontalScroll) fail("Preview shell has horizontal scroll at 390px");
  else ok("Preview shell: no horizontal scroll");

  if (shell.sw === "registered") ok("Service worker registered");
  else if (shell.sw === "unsupported") fail("Service worker unsupported in browser");
  else fail(`Service worker not registered (${shell.sw})`);
}

await withPage(async (page) => {
  console.log("--- Fixture layout (390x844) ---");
  await checkFixture(page);
  console.log("--- Preview PWA shell (390x844) ---");
  await checkPreview(page);
});

if (failures.length) {
  console.error(`\n${failures.length} failure(s)`);
  process.exit(1);
}
console.log("\nAll mobile smoke checks passed.");
