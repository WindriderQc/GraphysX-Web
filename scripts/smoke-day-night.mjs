import { mkdirSync } from "node:fs";
import path from "node:path";
import { SMOKE_TIMEOUT, applySmokeTimeout, launchSmokeBrowser } from "./smoke-harness.mjs";

// Scene-native archive atmosphere: exact source-shaped timing, endpoint sky/HDRI binding,
// pause/step determinism, document round-trip and player-visible noon/midnight captures.
const BASE = process.env.SMOKE_BASE || "http://127.0.0.1:4188/";
const ART = process.env.SMOKE_ARTIFACTS || "output/smoke";
mkdirSync(ART, { recursive: true });

const browser = await launchSmokeBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
applySmokeTimeout(page);
const consoleErrors = [];
const pageErrors = [];
page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
page.on("pageerror", (error) => pageErrors.push(String(error)));
const out = {};

try {
  await page.goto(`${BASE}?host=standalone`, { waitUntil: "load" });
  await page.waitForFunction(() => !!window.__GRAPHYSX__ && !!window.__GRAPHYSX_HOST__ && !!window.__GRAPHYSX_CONTENT__, null, { timeout: SMOKE_TIMEOUT });
  out.composed = await page.evaluate(async () => {
    const result = await window.__GRAPHYSX_CONTENT__.composeArchiveDayNight();
    window.__GRAPHYSX__.pause(true);
    return { ok: result.ok, error: result.error ?? null, provenance: result.provenance ?? null };
  });
  await page.waitForFunction(() => window.__GRAPHYSX_HOST__.dayNightState?.activeLook === "day", null, { timeout: SMOKE_TIMEOUT });
  await page.waitForTimeout(1200);

  out.day = await page.evaluate(() => ({
    atmosphere: window.__GRAPHYSX_HOST__.dayNightState,
    world: window.__GRAPHYSX__.state().world,
    entityCount: window.__GRAPHYSX__.query({ tag: "day-night" }).length,
    exported: window.__GRAPHYSX__.exportDocument().environment.dayNight,
  }));
  await page.screenshot({ path: path.join(ART, "day-night-noon.png") });

  await page.evaluate(() => window.__GRAPHYSX__.step(6));
  await page.waitForFunction(() => window.__GRAPHYSX_HOST__.dayNightState?.activeLook === "night", null, { timeout: SMOKE_TIMEOUT });
  await page.waitForTimeout(1200);
  out.night = await page.evaluate(() => ({
    atmosphere: window.__GRAPHYSX_HOST__.dayNightState,
    exported: window.__GRAPHYSX__.exportDocument().environment.dayNight,
  }));
  await page.screenshot({ path: path.join(ART, "day-night-midnight.png") });

  out.frozen = await page.evaluate(async () => {
    const before = window.__GRAPHYSX_HOST__.dayNightState.phase;
    await new Promise((resolve) => setTimeout(resolve, 250));
    return { before, after: window.__GRAPHYSX_HOST__.dayNightState.phase };
  });
  out.roundTrip = await page.evaluate(() => {
    const api = window.__GRAPHYSX__;
    const document_ = api.exportDocument();
    const loaded = api.load(document_);
    window.__GRAPHYSX_HOST__.applyEnvironment();
    return {
      ok: loaded.ok,
      cycleSeconds: api.exportDocument().environment.dayNight?.cycleSeconds,
      daySky: api.exportDocument().environment.dayNight?.day.sky,
      nightSky: api.exportDocument().environment.dayNight?.night.sky,
    };
  });
} catch (error) {
  out.fatal = String(error);
}

out.consoleErrors = consoleErrors;
out.pageErrors = pageErrors;
await browser.close();

const pass =
  !out.fatal && out.composed?.ok === true &&
  out.composed?.provenance?.cycle?.includes("faithful") &&
  out.day?.entityCount === 23 && out.day?.world?.id === "archive-day-night-rig" &&
  out.day?.atmosphere?.activeLook === "day" && out.day?.atmosphere?.sky === "ballz18-clear-sky" &&
  out.day?.atmosphere?.hdri === "lilienstein" && out.day?.atmosphere?.sunHeight > 0.99 &&
  out.day?.exported?.cycleSeconds === 12 &&
  out.night?.atmosphere?.activeLook === "night" && out.night?.atmosphere?.sky === "nightsky" &&
  out.night?.atmosphere?.hdri === "vignaioli-night" && out.night?.atmosphere?.sunHeight < -0.99 &&
  out.frozen?.before === out.frozen?.after &&
  out.roundTrip?.ok === true && out.roundTrip?.cycleSeconds === 12 &&
  out.roundTrip?.daySky === "ballz18-clear-sky" && out.roundTrip?.nightSky === "nightsky" &&
  out.pageErrors.length === 0;

console.log(JSON.stringify(out, null, 2));
console.log(pass ? "SMOKE PASS" : "SMOKE FAIL");
process.exit(pass ? 0 : 1);
