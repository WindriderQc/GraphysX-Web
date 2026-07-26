import { SMOKE_TIMEOUT, applySmokeTimeout, launchSmokeBrowser } from "./smoke-harness.mjs";
import { mkdirSync } from "node:fs";
import path from "node:path";

// Generative Surfaces (Wave 15): live Canvas2D sketches drawn onto in-world meshes as textures.
// What this proves, in order of what matters:
//
//   1. OFF BY DEFAULT — a mesh with no `surface` costs nothing; surfaceRedraws stays 0.
//   2. ONE SHARED LOOP — the §5 hard rule. While a surface runs, `state().surfaceRedraws` climbs
//      as the host's 3D frameCount climbs; a second rAF would decouple them. This is the
//      assertion the whole design hangs on (mirrors the overlay smoke's frame-lockstep proof).
//   3. It is SCENE DATA — the surface appears in state(), and survives export -> load.
//   4. It is EDITABLE — an agent can retune the sketch, and remove it (`surface: null`) which
//      disposes the texture and stops the redraws.
//   5. Zero console/page errors, and a screenshot of the showcase.

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

const out = {};
try {
  await page.goto(`${BASE}?host=standalone`, { waitUntil: "load", timeout: SMOKE_TIMEOUT });
  await page.waitForFunction(() => !!window.__GRAPHYSX_HOST__ && !!window.__GRAPHYSX__, { timeout: SMOKE_TIMEOUT });
  await page.waitForTimeout(400);

  // 1. A fresh empty world has no surfaces, so nothing redraws.
  out.default = await page.evaluate(() => {
    const api = window.__GRAPHYSX__;
    api.clear("surfaces-smoke", "Surfaces Smoke");
    return { surfaceRedraws: api.state().surfaceRedraws, listed: api.surfaces().map((s) => s.id) };
  });

  // 2. Spawn a screen carrying a surface, then run and prove the shared loop drives it.
  out.spawn = await page.evaluate(() => {
    const api = window.__GRAPHYSX__;
    const r = api.spawn({ id: "screen", type: "box", geometry: { width: 6, height: 4, depth: 0.3 }, transform: { position: [0, 3, 0] }, surface: { sketch: "waveform", resolution: 256, fps: 30, emissive: true } });
    const ent = api.query({ ids: ["screen"] })[0];
    return { ok: !!(r && r.ok), sketchInState: ent?.surface?.sketch ?? null, fpsInState: ent?.surface?.fps ?? null };
  });
  const a = await page.evaluate(() => ({ f: window.__GRAPHYSX_HOST__.frameCount, s: window.__GRAPHYSX__.state().surfaceRedraws }));
  await page.waitForTimeout(1200);
  const b = await page.evaluate(() => ({ f: window.__GRAPHYSX_HOST__.frameCount, s: window.__GRAPHYSX__.state().surfaceRedraws }));
  out.loop = { frameDelta: b.f - a.f, redrawDelta: b.s - a.s };

  // 3. Scene data: survives export -> load with the surface intact.
  out.roundTrip = await page.evaluate(() => {
    const api = window.__GRAPHYSX__;
    const exported = api.export();
    const inDocument = exported.entities.find((e) => e.id === "screen")?.surface?.sketch ?? null;
    api.load(exported);
    return { inDocument, afterLoad: api.query({ ids: ["screen"] })[0]?.surface?.sketch ?? null };
  });

  // 4a. Retune the sketch through an ordinary patch, and screenshot the live surface.
  out.retune = await page.evaluate(() => {
    const api = window.__GRAPHYSX__;
    api.update("screen", { surface: { sketch: "plasma", resolution: 256, fps: 20, emissive: true } });
    return api.query({ ids: ["screen"] })[0]?.surface?.sketch ?? null;
  });
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(ART, "surfaces-plasma.png") });

  // 4b. Remove the surface (null) — redraws must stop, and the field clears.
  await page.evaluate(() => window.__GRAPHYSX__.update("screen", { surface: null }));
  await page.waitForTimeout(200);
  const offAt = await page.evaluate(() => window.__GRAPHYSX__.state().surfaceRedraws);
  await page.waitForTimeout(700);
  out.removed = await page.evaluate((redrawsWhenOff) => {
    const api = window.__GRAPHYSX__;
    return {
      surfaceInState: api.query({ ids: ["screen"] })[0]?.surface ?? null,
      stoppedRedrawing: api.state().surfaceRedraws === redrawsWhenOff,
    };
  }, offAt);
} catch (error) {
  out.fatal = String(error);
}

out.consoleErrors = consoleErrors;
out.pageErrors = pageErrors;
console.log(JSON.stringify(out, null, 2));
await browser.close();

const ok =
  out.default?.surfaceRedraws === 0 &&
  Array.isArray(out.default?.listed) && out.default.listed.includes("waveform") &&
  out.spawn?.ok === true &&
  out.spawn?.sketchInState === "waveform" &&
  out.loop?.frameDelta > 0 &&
  out.loop?.redrawDelta > 0 &&
  out.roundTrip?.inDocument === "waveform" &&
  out.roundTrip?.afterLoad === "waveform" &&
  out.retune === "plasma" &&
  out.removed?.surfaceInState === null &&
  out.removed?.stoppedRedrawing === true;

process.exit(out.fatal || pageErrors.length || consoleErrors.length || !ok ? 1 : 0);
