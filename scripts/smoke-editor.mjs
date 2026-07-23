import { SMOKE_TIMEOUT, applySmokeTimeout, launchSmokeBrowser } from "./smoke-harness.mjs";
import { mkdirSync } from "node:fs";
import path from "node:path";

// Covers the human editing surface end to end: every library tab is reachable, a recovered
// mesh asset spawns, the inspector commits transform + material edits through the public
// API, an archive texture applies, a behaviour attaches and is listed as detachable, the
// scene-tree filter narrows rows, scene bloom is authorable without rebuilding the world,
// and the editor is a place you can leave. Each of these was a real regression at some point.

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
    // Two chip kinds since the palette gained thumbnails: flat chips and thumb cards are
    // both one-click spawn/apply controls, so both count as library content.
    out.tabChips[tab] = await page.$$eval(".gx-ed-chip, .gx-ed-thumb", (els) => els.length);
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
  // Textures render as thumb cards now; the label is a child span rather than the button text.
  await page.click('.gx-ed-thumb:has(.gx-ed-thumb-label:text-is("Checker"))');
  await page.waitForTimeout(400);
  out.textureApplied = (await findSpawned())?.material?.texture?.id ?? null;

  await page.click('.gx-ed-chip:text-is("+ Spin")');
  await page.waitForTimeout(300);
  const withBehaviour = await findSpawned();
  out.behaviourCount = Array.isArray(withBehaviour?.behaviors) ? withBehaviour.behaviors.length : 0;
  // The behaviour shows up as a detachable row in the inspector, not just in state.
  out.behaviourRows = await page.$$eval(".gx-ed-attached", (els) => els.length);

  // Bloom used to be three unlabeled boxes that export→loaded the whole scene on every edit.
  // Drive the human-facing preset and a custom value, then prove the host composer changed
  // while the selected entity and its actual Three object stayed put.
  out.bloomInitial = await page.evaluate(() => ({
    post: window.__GRAPHYSX__.state().environment.post,
    toggle: document.querySelector('[data-gx-bloom="toggle"]')?.checked ?? null,
    presetDisabled: document.querySelector('[data-gx-bloom="preset"]')?.disabled ?? null,
    inputsDisabled: [...document.querySelectorAll('[data-gx-bloom="strength"], [data-gx-bloom="threshold"], [data-gx-bloom="radius"]')]
      .every((input) => input.disabled),
  }));
  out.selectedBeforeBloom = (await page.textContent(".gx-ed-ident-id"))?.trim() ?? null;
  await page.evaluate((id) => {
    window.__GX_BLOOM_OBJECT__ = window.__GRAPHYSX_HOST__.world.getEntityObject(id);
    window.__GX_BLOOM_ENVIRONMENT__ = window.__GRAPHYSX_HOST__.scene.environment;
  }, out.selectedBeforeBloom);
  await page.click('[data-gx-bloom="toggle"]');
  await page.selectOption('[data-gx-bloom="preset"]', "neon");
  await page.waitForTimeout(350);
  out.bloomNeon = await page.evaluate((id) => ({
    post: window.__GRAPHYSX__.state().environment.post,
    composer: !!window.__GRAPHYSX_HOST__.composer,
    pass: window.__GRAPHYSX_HOST__.bloomPass ? {
      strength: window.__GRAPHYSX_HOST__.bloomPass.strength,
      threshold: window.__GRAPHYSX_HOST__.bloomPass.threshold,
      radius: window.__GRAPHYSX_HOST__.bloomPass.radius,
    } : null,
    selected: document.querySelector(".gx-ed-ident-id")?.textContent?.trim() ?? null,
    sameObject: window.__GX_BLOOM_OBJECT__ === window.__GRAPHYSX_HOST__.world.getEntityObject(id),
    sameEnvironment: window.__GX_BLOOM_ENVIRONMENT__ === window.__GRAPHYSX_HOST__.scene.environment,
    preset: document.querySelector('[data-gx-bloom="preset"]')?.value ?? null,
  }), out.selectedBeforeBloom);
  await page.fill('[data-gx-bloom="strength"]', "0.8");
  await page.dispatchEvent('[data-gx-bloom="strength"]', "change");
  await page.fill('[data-gx-bloom="threshold"]', "0.55");
  await page.dispatchEvent('[data-gx-bloom="threshold"]', "change");
  await page.fill('[data-gx-bloom="radius"]', "0.3");
  await page.dispatchEvent('[data-gx-bloom="radius"]', "change");
  await page.waitForTimeout(350);
  out.bloomCustom = await page.evaluate(() => ({
    post: window.__GRAPHYSX__.state().environment.post,
    preset: document.querySelector('[data-gx-bloom="preset"]')?.value ?? null,
    state: document.querySelector(".gx-ed-post-state")?.textContent?.trim() ?? null,
    sameEnvironment: window.__GX_BLOOM_ENVIRONMENT__ === window.__GRAPHYSX_HOST__.scene.environment,
  }));
  await page.selectOption('[data-gx-bloom="preset"]', "cinematic");
  await page.waitForTimeout(300);
  out.bloomCinematic = await page.evaluate(() => ({
    post: window.__GRAPHYSX__.state().environment.post,
    preset: document.querySelector('[data-gx-bloom="preset"]')?.value ?? null,
    sameEnvironment: window.__GX_BLOOM_ENVIRONMENT__ === window.__GRAPHYSX_HOST__.scene.environment,
  }));
  // Native number inputs permit programmatic out-of-range values. The editor must reject one
  // before it reaches transaction rollback, which would rebuild the selected live object.
  await page.fill('[data-gx-bloom="strength"]', "4");
  await page.dispatchEvent('[data-gx-bloom="strength"]', "change");
  await page.waitForTimeout(200);
  out.bloomRejected = await page.evaluate((id) => ({
    post: window.__GRAPHYSX__.state().environment.post,
    sameObject: window.__GX_BLOOM_OBJECT__ === window.__GRAPHYSX_HOST__.world.getEntityObject(id),
    sameEnvironment: window.__GX_BLOOM_ENVIRONMENT__ === window.__GRAPHYSX_HOST__.scene.environment,
  }), out.selectedBeforeBloom);
  await page.selectOption('[data-gx-bloom="preset"]', "cinematic");
  await page.waitForTimeout(200);
  await page.locator(".gx-ed-post").scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(ART, "editor-bloom.png"), fullPage: false });

  await page.click('[data-gx-bloom="toggle"]');
  await page.waitForTimeout(250);
  out.bloomOff = await page.evaluate(() => ({
    post: window.__GRAPHYSX__.state().environment.post,
    composer: !!window.__GRAPHYSX_HOST__.composer,
    sameEnvironment: window.__GX_BLOOM_ENVIRONMENT__ === window.__GRAPHYSX_HOST__.scene.environment,
    inputsDisabled: [...document.querySelectorAll('[data-gx-bloom="strength"], [data-gx-bloom="threshold"], [data-gx-bloom="radius"]')]
      .every((input) => input.disabled),
  }));

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
  out.bloomInitial?.post === null &&
  out.bloomInitial?.toggle === false &&
  out.bloomInitial?.presetDisabled === true &&
  out.bloomInitial?.inputsDisabled === true &&
  out.bloomNeon?.post?.bloom?.strength === 0.65 &&
  out.bloomNeon?.post?.bloom?.threshold === 0.6 &&
  out.bloomNeon?.post?.bloom?.radius === 0.4 &&
  out.bloomNeon?.composer === true &&
  out.bloomNeon?.pass?.strength === 0.65 &&
  out.bloomNeon?.pass?.threshold === 0.6 &&
  out.bloomNeon?.pass?.radius === 0.4 &&
  out.bloomNeon?.selected === out.selectedBeforeBloom &&
  out.bloomNeon?.sameObject === true &&
  out.bloomNeon?.sameEnvironment === true &&
  out.bloomNeon?.preset === "neon" &&
  out.bloomCustom?.post?.bloom?.strength === 0.8 &&
  out.bloomCustom?.post?.bloom?.threshold === 0.55 &&
  out.bloomCustom?.post?.bloom?.radius === 0.3 &&
  out.bloomCustom?.preset === "custom" &&
  out.bloomCustom?.state === "On" &&
  out.bloomCustom?.sameEnvironment === true &&
  out.bloomCinematic?.post?.bloom?.strength === 0.48 &&
  out.bloomCinematic?.post?.bloom?.threshold === 0.62 &&
  out.bloomCinematic?.post?.bloom?.radius === 0.35 &&
  out.bloomCinematic?.preset === "cinematic" &&
  out.bloomCinematic?.sameEnvironment === true &&
  out.bloomRejected?.post?.bloom?.strength === 0.48 &&
  out.bloomRejected?.post?.bloom?.threshold === 0.62 &&
  out.bloomRejected?.post?.bloom?.radius === 0.35 &&
  out.bloomRejected?.sameObject === true &&
  out.bloomRejected?.sameEnvironment === true &&
  out.bloomOff?.post === null &&
  out.bloomOff?.composer === false &&
  out.bloomOff?.sameEnvironment === true &&
  out.bloomOff?.inputsDisabled === true &&
  out.treeFilterWorks &&
  out.welcomeBack &&
  out.editorHiddenAgain;
process.exit(out.fatal || pageErrors.length || !ok ? 1 : 0);
