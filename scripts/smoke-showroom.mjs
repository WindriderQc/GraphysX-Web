import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import path from "node:path";

const EXE = process.env.SMOKE_CHROMIUM || undefined;
const BASE = process.env.SMOKE_BASE || "http://127.0.0.1:4188/";
const ART = process.env.SMOKE_ARTIFACTS || path.resolve("output/smoke");
mkdirSync(ART, { recursive: true });

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

  await page.screenshot({ path: path.join(ART, "showroom.png"), fullPage: false });

  // Interactive physics: clicking a kinetic body fires its apply-impulse interaction, and
  // clicking the ground drops a dynamic sphere. Both go through the ordinary agent API.
  const entityPos = (id) => page.evaluate((entityId) => {
    const e = window.__GRAPHYSX__.state().entities.find((x) => x.id === entityId);
    return e ? e.position ?? e.transform?.position ?? null : null;
  }, id);
  const screenOf = (id) => page.evaluate((entityId) => {
    const host = window.__GRAPHYSX_HOST__;
    const obj = host.world.getEntityObject(entityId);
    if (!obj) return null;
    const v = obj.getWorldPosition(new (obj.position.constructor)());
    v.project(host.camera);
    const rect = host.renderer.domElement.getBoundingClientRect();
    return { x: rect.left + ((v.x + 1) / 2) * rect.width, y: rect.top + ((-v.y + 1) / 2) * rect.height };
  }, id);

  const blockBefore = await entityPos("showroom-block-5");
  const blockAt = await screenOf("showroom-block-5");
  if (blockAt) await page.mouse.click(blockAt.x, blockAt.y);
  // Wait for the body to actually move rather than guessing a duration. Headless software
  // GL runs the frame loop at a few fps, so a fixed timeout races the physics step — this
  // is a wait on the condition being asserted, not a weaker assertion.
  await page
    .waitForFunction(
      (a) => {
        const e = window.__GRAPHYSX__.state().entities.find((x) => x.id === a.id);
        const p = e && (e.position ?? e.transform?.position);
        return !!p && Math.hypot(p[0] - a.b[0], p[1] - a.b[1], p[2] - a.b[2]) > 0.15;
      },
      { id: "showroom-block-5", b: blockBefore },
      { timeout: 20000 },
    )
    .catch(() => {});
  const blockAfter = await entityPos("showroom-block-5");
  out.impulseMoved = blockBefore && blockAfter
    ? Number(Math.hypot(blockAfter[0] - blockBefore[0], blockAfter[1] - blockBefore[1], blockAfter[2] - blockBefore[2]).toFixed(3))
    : 0;

  const countBefore = await page.evaluate(() => window.__GRAPHYSX__.state().entities.length);
  await page.mouse.click(300, 630);
  await page
    .waitForFunction(
      () => window.__GRAPHYSX__.state().entities.some((e) => e.id.startsWith("showroom-drop-")),
      null,
      { timeout: 20000 },
    )
    .catch(() => {});
  out.ballDropped = await page.evaluate(() =>
    window.__GRAPHYSX__.state().entities.some((e) => e.id.startsWith("showroom-drop-")));
  out.spawnedOne = (await page.evaluate(() => window.__GRAPHYSX__.state().entities.length)) === countBefore + 1;

  await page.click(".gx-welcome button");
  // The editor module is loaded on demand, so wait for it to mount rather than guessing.
  await page.waitForSelector(".gx-ed-toolbar", { timeout: 15000 });
  await page.waitForTimeout(200);
  out.editorVisibleAfterEnter = await page.evaluate(() => {
    const t = document.querySelector(".gx-ed-toolbar");
    return !!t && getComputedStyle(t).display !== "none";
  });
  out.welcomeGone = (await page.$(".gx-welcome")) === null;
  await page.screenshot({ path: path.join(ART, "showroom-editor.png"), fullPage: false });
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
  out.impulseMoved > 0.15 &&
  out.ballDropped &&
  out.spawnedOne &&
  out.editorVisibleAfterEnter &&
  out.welcomeGone;
process.exit(out.fatal || pageErrors.length || !ok ? 1 : 0);
