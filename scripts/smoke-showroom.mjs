import { chromium } from "playwright";

const EXE = process.env.SMOKE_CHROMIUM || undefined;
const BASE = process.env.SMOKE_BASE || "http://127.0.0.1:4188/";

const consoleErrors = [];
const pageErrors = [];

const browser = await chromium.launch({ executablePath: EXE, headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage();
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
page.on("pageerror", (e) => pageErrors.push(String(e)));

const out = {};
try {
  // Default route = the clean host booting the welcome showroom.
  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForFunction(() => !!window.__GRAPHYSX_HOST__, { timeout: 20000 });
  await page.waitForSelector(".gx-welcome", { timeout: 15000 });
  await page.waitForTimeout(700);

  out.welcomePresent = (await page.$(".gx-welcome")) !== null;
  out.editorHiddenInitially = await page.evaluate(() => {
    const t = document.querySelector(".gx-ed-toolbar");
    return !t || getComputedStyle(t).display === "none";
  });
  out.entityCount = await page.evaluate(() => window.__GRAPHYSX__.state().entities.length);

  const probeCam = () => page.evaluate(() => {
    const h = window.__GRAPHYSX_HOST__;
    const p = h.camera.position;
    return { x: p.x, z: p.z, frame: h.frameCount };
  });
  const a = await probeCam();
  await page.waitForTimeout(1500);
  const b = await probeCam();
  out.framesAdvanced = b.frame - a.frame;
  out.camMoved = Math.hypot(b.x - a.x, b.z - a.z);
  // Any camera drift with no user input proves auto-orbit is active (headless fps is low,
  // so this is intentionally movement-based, not distance-thresholded).
  out.autoOrbiting = out.framesAdvanced > 0 && out.camMoved > 0.004;

  await page.screenshot({ path: "/tmp/smoke-showroom.png", fullPage: false });

  await page.click(".gx-welcome button");
  await page.waitForTimeout(500);
  out.editorVisibleAfterEnter = await page.evaluate(() => {
    const t = document.querySelector(".gx-ed-toolbar");
    return !!t && getComputedStyle(t).display !== "none";
  });
  out.welcomeGone = (await page.$(".gx-welcome")) === null;
  await page.screenshot({ path: "/tmp/smoke-showroom-editor.png", fullPage: false });
} catch (e) {
  out.fatal = String(e);
}

out.consoleErrors = consoleErrors;
out.pageErrors = pageErrors;
console.log(JSON.stringify(out, null, 2));
await browser.close();

const ok =
  out.welcomePresent &&
  out.editorHiddenInitially &&
  out.entityCount > 15 &&
  out.autoOrbiting &&
  out.editorVisibleAfterEnter &&
  out.welcomeGone;
process.exit(out.fatal || pageErrors.length || !ok ? 1 : 0);
