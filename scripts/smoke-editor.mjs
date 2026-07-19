import { SMOKE_TIMEOUT, applySmokeTimeout, launchSmokeBrowser } from "./smoke-harness.mjs";
import { mkdirSync } from "node:fs";
import path from "node:path";

// Covers the human editing surface end to end: every library tab is reachable, a recovered
// mesh asset spawns, the inspector commits transform + material edits through the public
// API, an archive texture applies, a behaviour attaches and is listed as detachable, the
// scene-tree filter narrows rows, and the editor is a place you can leave. Each of these
// was a real regression at some point.

const EXE = process.env.SMOKE_CHROMIUM || undefined;
const BASE = process.env.SMOKE_BASE || "http://127.0.0.1:4188/";
const ART = process.env.SMOKE_ARTIFACTS || path.resolve("output/smoke");
mkdirSync(ART, { recursive: true });

const consoleErrors = [];
const pageErrors = [];
const browser = await launchSmokeBrowser();
const page = await browser.newPage();
applySmokeTimeout(page);
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
page.on("pageerror", (e) => pageErrors.push(String(e)));

const out = {};
try {
  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: SMOKE_TIMEOUT });
  await page.waitForFunction(() => !!window.__GRAPHYSX_HOST__, { timeout: SMOKE_TIMEOUT });
  await page.waitForSelector(".gx-welcome", { timeout: SMOKE_TIMEOUT });
  await page.click(".gx-welcome button");
  await page.waitForSelector(".gx-ed-toolbar", { timeout: SMOKE_TIMEOUT });

  await page.waitForSelector(".gx-ed-panel--drawer", { timeout: SMOKE_TIMEOUT });
  out.hasExitButton = await page.$$eval(".gx-ed-toolbar button", (els) =>
    els.some((e) => (e.textContent ?? "").includes("Showroom")));

  // The library is tabbed now: only the active tab renders, so walk all five and record
  // each tab's chip count. Every tab must carry content, and the vocabulary as a whole
  // must stay as large as it was when the palette was one flat list.
  out.tabChips = {};
  for (const tab of ["Prefabs", "Models", "Effects", "Terrain", "Textures"]) {
    await page.click(`.gx-ed-tab:text-is("${tab}")`);
    await page.waitForTimeout(120);
    out.tabChips[tab] = await page.$$eval(".gx-ed-chip", (els) => els.length);
  }
  out.prefabCount = Object.values(out.tabChips).reduce((a, b) => a + b, 0);
  out.everyTabPopulated = Object.values(out.tabChips).every((n) => n > 0);
  // Only the active tab is in the DOM — that is the whole point of the drawer.
  out.activeTabOnly = out.tabChips.Textures < out.prefabCount;

  // An emitter is a first-class entity type: it gets an Emitter section, and the runtime
  // refuses it a rigid body, so the inspector must explain rather than offer a control
  // whose only outcome is a rejected update.
  await page.click('.gx-ed-tab:text-is("Effects")');
  await page.click(".gx-ed-chip >> nth=0");
  await page.waitForTimeout(400);
  out.emitterSections = await page.$$eval(".gx-ed-section > summary", (els) => els.map((e) => e.textContent));
  out.emitterPhysicsControls = await page.$$eval('.gx-ed-section:has(summary:text-is("Physics")) select', (e) => e.length);
  const rateSel = '.gx-ed-section:has(summary:text-is("Emitter")) input[type=number] >> nth=0';
  await page.fill(rateSel, "77");
  await page.dispatchEvent(rateSel, "change");
  await page.waitForTimeout(300);
  out.emitterRate = await page.evaluate(() =>
    window.__GRAPHYSX__.state().entities.find((e) => e.id.startsWith("edit-emitter-"))?.emitter?.rate ?? null);

  // Terrain and water are ordinary v2 entities a human can place. Terrain must arrive with
  // its static heightfield collider already attached — a terrain you can place but fall
  // through is the exact bug this palette entry exists to make impossible.
  await page.click('.gx-ed-tab:text-is("Terrain")');
  await page.click('.gx-ed-chip:text-is("Canyon")');
  await page.waitForTimeout(500);
  out.terrainSpawned = await page.evaluate(() => {
    const t = window.__GRAPHYSX__.state().entities.find((e) => e.id.startsWith("edit-terrain-"));
    if (!t) return null;
    return {
      type: t.type,
      heightmap: t.terrain?.heightmap ?? null,
      colliderMode: t.physics?.mode ?? null,
      colliderVertices: t.terrain?.colliderVertices ?? 0,
    };
  });
  await page.click('.gx-ed-tab:text-is("Terrain")');
  await page.click('.gx-ed-chip:text-is("Water (reflective)")');
  await page.waitForTimeout(500);
  out.waterSpawned = await page.evaluate(() => {
    const w = window.__GRAPHYSX__.state().entities.find((e) => e.id.startsWith("edit-water-"));
    return w ? { type: w.type, reflection: w.water?.reflection ?? null } : null;
  });
  // Both must survive an export/reload round trip, or they are decoration rather than
  // scene vocabulary.
  out.terrainRoundTrip = await page.evaluate(() => {
    const api = window.__GRAPHYSX__;
    const doc = api.exportDocument();
    const terrain = doc.entities.find((e) => e.id.startsWith("edit-terrain-"));
    const water = doc.entities.find((e) => e.id.startsWith("edit-water-"));
    if (!terrain || !water) return { exported: false };
    const reloaded = api.load(doc);
    if (!reloaded.ok) return { exported: true, reloaded: false, error: reloaded.error };
    const after = api.state().entities.find((e) => e.id === terrain.id);
    const waterAfter = api.state().entities.find((e) => e.id === water.id);
    return {
      exported: true,
      reloaded: true,
      heightmap: after?.terrain?.heightmap ?? null,
      colliderMode: after?.physics?.mode ?? null,
      waterReflection: waterAfter?.water?.reflection ?? null,
    };
  });

  // Spawn a recovered mesh asset from the Models tab.
  const before = await page.evaluate(() => window.__GRAPHYSX__.state().entities.length);
  await page.click('.gx-ed-tab:text-is("Models")');
  await page.click('.gx-ed-chip:text-is("Zok Sword")');
  await page.waitForTimeout(700);
  const findSpawned = () => page.evaluate(() =>
    window.__GRAPHYSX__.state().entities.find((e) => e.id.startsWith("edit-model-")) ?? null);
  const spawned = await findSpawned();
  out.modelSpawned = (await page.evaluate(() => window.__GRAPHYSX__.state().entities.length)) > before;
  out.spawnedType = spawned?.type ?? null;

  // The spawned model is selected, so the inspector is live: edit a transform field and a
  // material slider and prove both land as ordinary API updates on the shared world.
  out.selectedInInspector = (await page.textContent(".gx-ed-ident-id"))?.trim() ?? null;
  await page.fill(".gx-ed-inspector .gx-ed-vec input >> nth=0", "3.5");
  await page.dispatchEvent(".gx-ed-inspector .gx-ed-vec input >> nth=0", "change");
  await page.waitForTimeout(250);
  out.positionX = (await findSpawned())?.position?.[0] ?? null;

  const roughness = ".gx-ed-inspector input[type=range] >> nth=0";
  await page.fill(roughness, "0.15");
  await page.dispatchEvent(roughness, "change");
  await page.waitForTimeout(250);
  out.roughness = (await findSpawned())?.material?.roughness ?? null;

  // Apply an archive texture from the Textures tab, then attach a living behaviour.
  await page.click('.gx-ed-tab:text-is("Textures")');
  await page.click('.gx-ed-chip:text-is("Checker")');
  await page.waitForTimeout(400);
  out.textureApplied = (await findSpawned())?.material?.texture?.id ?? null;

  await page.click('.gx-ed-chip:text-is("+ Spin")');
  await page.waitForTimeout(300);
  const withBehaviour = await findSpawned();
  out.behaviourCount = Array.isArray(withBehaviour?.behaviors) ? withBehaviour.behaviors.length : 0;
  // The behaviour shows up as a detachable row in the inspector, not just in state.
  out.behaviourRows = await page.$$eval(".gx-ed-attached", (els) => els.length);

  // The scene tree filter narrows the rows without touching the world.
  const allRows = await page.$$eval(".gx-ed-row", (els) => els.length);
  await page.fill(".gx-ed-panel--left .gx-ed-filter", "edit-model-");
  await page.waitForTimeout(200);
  const filteredRows = await page.$$eval(".gx-ed-row", (els) => els.length);
  out.treeFilterWorks = allRows > filteredRows && filteredRows > 0;
  await page.fill(".gx-ed-panel--left .gx-ed-filter", "");
  await page.waitForTimeout(200);

  await page.screenshot({ path: path.join(ART, "editor-library.png"), fullPage: false });

  // The editor must not be a one-way door.
  await page.click('.gx-ed-toolbar button:has-text("Showroom")');
  await page.waitForTimeout(600);
  out.welcomeBack = (await page.$(".gx-welcome")) !== null;
  out.editorHiddenAgain = await page.evaluate(() => {
    const t = document.querySelector(".gx-ed-toolbar");
    return !t || getComputedStyle(t).display === "none";
  });
  await page.screenshot({ path: path.join(ART, "editor-exit.png"), fullPage: false });
} catch (e) {
  out.fatal = String(e);
}

out.consoleErrors = consoleErrors;
out.pageErrors = pageErrors;
console.log(JSON.stringify(out, null, 2));
await browser.close();

const ok =
  out.prefabCount > 15 &&
  out.everyTabPopulated &&
  out.activeTabOnly &&
  out.hasExitButton &&
  out.emitterSections?.includes("Emitter") &&
  out.emitterPhysicsControls === 0 &&
  out.emitterRate === 77 &&
  out.terrainSpawned?.type === "terrain" &&
  out.terrainSpawned?.heightmap === "canyon" &&
  out.terrainSpawned?.colliderMode === "static" &&
  out.terrainSpawned?.colliderVertices > 1000 &&
  out.waterSpawned?.type === "water" &&
  out.waterSpawned?.reflection === true &&
  out.terrainRoundTrip?.reloaded === true &&
  out.terrainRoundTrip?.heightmap === "canyon" &&
  out.terrainRoundTrip?.colliderMode === "static" &&
  out.terrainRoundTrip?.waterReflection === true &&
  out.modelSpawned &&
  out.spawnedType === "model" &&
  out.selectedInInspector?.startsWith("edit-model-") &&
  out.positionX === 3.5 &&
  out.roughness === 0.15 &&
  out.textureApplied === "checker" &&
  out.behaviourCount === 1 &&
  out.behaviourRows === 1 &&
  out.treeFilterWorks &&
  out.welcomeBack &&
  out.editorHiddenAgain;
process.exit(out.fatal || pageErrors.length || !ok ? 1 : 0);


