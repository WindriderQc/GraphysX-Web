import { SMOKE_TIMEOUT, applySmokeTimeout, launchSmokeBrowser } from "./smoke-harness.mjs";
import { mkdirSync } from "node:fs";
import path from "node:path";

// The generative 2D overlay layer (PRODUCT_SPEC §4, and §13's "a 2D overlay renders over the 3D
// view"). What this proves, in order of what matters:
//
//   1. OFF BY DEFAULT — a scene with no overlay draws nothing. A 2D layer must earn its budget.
//   2. ONE SHARED LOOP — the §5 hard rule. When an overlay is active, the number of overlay
//      frames drawn advances in exact lockstep with the host's 3D frames. A second rAF would
//      drift; a shared loop cannot. This is the assertion the whole design hangs on.
//   3. It actually PUTS PIXELS over the 3D view (not just a mounted-but-blank canvas).
//   4. It is SCENE DATA — set through an ordinary api.load, and survives export -> load.

const BASE = process.env.SMOKE_BASE || "http://127.0.0.1:4188/";
const ART = process.env.SMOKE_ARTIFACTS || path.resolve("output/smoke");
mkdirSync(ART, { recursive: true });

const consoleErrors = [];
const pageErrors = [];
const browser = await launchSmokeBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
applySmokeTimeout(page);
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
page.on("pageerror", (e) => pageErrors.push(String(e)));

const setOverlay = (id) => page.evaluate((overlay) => {
  const api = window.__GRAPHYSX__;
  const def = api.export();
  api.load({ ...def, environment: { ...def.environment, overlay } });
}, id);

const out = {};
try {
  await page.goto(`${BASE}?host=standalone`, { waitUntil: "load", timeout: SMOKE_TIMEOUT });
  await page.waitForFunction(() => !!window.__GRAPHYSX_HOST__, { timeout: SMOKE_TIMEOUT });
  await page.waitForTimeout(400);

  // 1. Off by default.
  out.default = await page.evaluate(() => ({
    active: window.__GRAPHYSX_HOST__.activeOverlay,
    overlayFrames: window.__GRAPHYSX_HOST__.overlayFrameCount,
    canvasPresent: !!document.querySelector(".gx-overlay-canvas"),
  }));

  // 2. Turn one on and let it run.
  await setOverlay("vignette");
  await page.waitForTimeout(1200);
  out.enabled = await page.evaluate(() => ({
    active: window.__GRAPHYSX_HOST__.activeOverlay,
    overlayFrames: window.__GRAPHYSX_HOST__.overlayFrameCount,
  }));

  // The single-loop proof: sample both counters across an interval; the overlay must advance by
  // exactly as many frames as the 3D scene did. Any independent loop would decouple these.
  const a = await page.evaluate(() => ({ f: window.__GRAPHYSX_HOST__.frameCount, o: window.__GRAPHYSX_HOST__.overlayFrameCount }));
  await page.waitForTimeout(1000);
  const b = await page.evaluate(() => ({ f: window.__GRAPHYSX_HOST__.frameCount, o: window.__GRAPHYSX_HOST__.overlayFrameCount }));
  out.loop = { frameDelta: b.f - a.f, overlayDelta: b.o - a.o };

  // 3. It draws real pixels over the 3D view. Vignette darkens the corners, so a corner pixel
  //    of the overlay canvas must be non-transparent.
  out.pixels = await page.evaluate(() => {
    const canvas = document.querySelector(".gx-overlay-canvas");
    const ctx = canvas.getContext("2d");
    const corner = ctx.getImageData(canvas.width - 4, canvas.height - 4, 1, 1).data;
    const centre = ctx.getImageData(Math.round(canvas.width / 2), Math.round(canvas.height / 2), 1, 1).data;
    return { cornerAlpha: corner[3], centreAlpha: centre[3] };
  });
  await page.screenshot({ path: path.join(ART, "overlay-vignette.png") });

  // 4. Turn it off — drawing stops and the canvas clears.
  await setOverlay(null);
  await page.waitForTimeout(300);
  const offAt = await page.evaluate(() => window.__GRAPHYSX_HOST__.overlayFrameCount);
  await page.waitForTimeout(700);
  out.disabled = await page.evaluate((framesWhenOff) => {
    const canvas = document.querySelector(".gx-overlay-canvas");
    const corner = canvas.getContext("2d").getImageData(canvas.width - 4, canvas.height - 4, 1, 1).data;
    return {
      active: window.__GRAPHYSX_HOST__.activeOverlay,
      stoppedDrawing: window.__GRAPHYSX_HOST__.overlayFrameCount === framesWhenOff,
      cornerAlphaAfterClear: corner[3],
    };
  }, offAt);

  // 5. Scene data: survives export -> load.
  await setOverlay("starfield");
  await page.waitForTimeout(200);
  out.roundTrip = await page.evaluate(() => {
    const api = window.__GRAPHYSX__;
    const exported = api.export();
    api.load(exported);
    return {
      inDocument: exported.environment.overlay,
      active: window.__GRAPHYSX_HOST__.activeOverlay,
      state: api.state().environment.overlay,
    };
  });
} catch (error) {
  out.fatal = String(error);
}

out.consoleErrors = consoleErrors;
out.pageErrors = pageErrors;
console.log(JSON.stringify(out, null, 2));
await browser.close();

const ok =
  out.default?.active === null &&
  out.default?.overlayFrames === 0 &&
  out.default?.canvasPresent === true &&
  out.enabled?.active === "vignette" &&
  out.enabled?.overlayFrames > 0 &&
  out.loop?.frameDelta > 0 &&
  out.loop?.overlayDelta === out.loop?.frameDelta &&
  out.pixels?.cornerAlpha > 0 &&
  out.pixels?.centreAlpha === 0 &&
  out.disabled?.active === null &&
  out.disabled?.stoppedDrawing === true &&
  out.disabled?.cornerAlphaAfterClear === 0 &&
  out.roundTrip?.inDocument === "starfield" &&
  out.roundTrip?.active === "starfield" &&
  out.roundTrip?.state === "starfield";

process.exit(out.fatal || pageErrors.length || consoleErrors.length || !ok ? 1 : 0);
