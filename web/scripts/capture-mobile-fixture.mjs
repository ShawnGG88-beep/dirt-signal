/**
 * Capture 390x844 screenshots of a local fixture HTML page and print
 * computed font sizes / tap-target dimensions for key selectors.
 *
 * Usage:
 *   node web/scripts/capture-mobile-fixture.mjs <url> <out-png> [label]
 */
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const require = createRequire(import.meta.url);
const puppeteer = (() => {
  try {
    return require("puppeteer-core");
  } catch {
    return require("puppeteer");
  }
})();

const SELECTORS = [
  ".app-nav-btn",
  ".app-menu-toggle",
  ".app-mobile-title",
  ".theme-toggle",
  ".device-picker-select",
  ".system-status-label",
  ".system-status-device",
  ".system-status-reading",
  ".system-status-poll",
  ".system-status-profile-chip",
  ".system-status-meta",
  ".metric-label",
  ".metric-value",
  ".metric-status",
  ".band-bar-num",
  ".dashboard-header h1",
  ".app-nav-drawer-link",
  ".app-nav-drawer-signout",
];

const url = process.argv[2];
const out = process.argv[3];
const label = process.argv[4] || "capture";

if (!url || !out) {
  console.error("Usage: capture-mobile-fixture.mjs <url> <out-png> [label]");
  process.exit(1);
}

mkdirSync(dirname(out), { recursive: true });

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || "/usr/local/bin/google-chrome",
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
});

const page = await browser.newPage();
const device = puppeteer.KnownDevices?.["iPhone 12"];
if (device) {
  await page.emulate(device);
} else {
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
await page.goto(url, { waitUntil: "networkidle0", timeout: 60_000 });
await page.screenshot({ path: out, fullPage: true });

const metrics = await page.evaluate((selectors) => {
  const root = getComputedStyle(document.documentElement).fontSize;
  const horizontalScroll =
    document.documentElement.scrollWidth >
    document.documentElement.clientWidth + 1;
  const results = {
    rootFontSize: root,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
    },
    horizontalScroll,
    elements: {},
  };
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (!el) {
      results.elements[sel] = null;
      continue;
    }
    const cs = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    results.elements[sel] = {
      fontSize: cs.fontSize,
      lineHeight: cs.lineHeight,
      fontWeight: cs.fontWeight,
      width: Math.round(rect.width * 10) / 10,
      height: Math.round(rect.height * 10) / 10,
      text: (el.textContent || "").trim().slice(0, 40),
    };
  }
  return results;
}, SELECTORS);

console.log(JSON.stringify({ label, out, url, metrics }, null, 2));
await browser.close();
