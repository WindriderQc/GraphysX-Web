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

  // Keep the real showroom -> editor navigation contract above, then author inside a small
  // deterministic world. Rendering all 96 showroom actors through SwiftShader for every
  // inspector assertion adds minutes of software-GPU work without testing editor behavior.
  await page.evaluate(() => window.__GRAPHYSX__.create({
    schema: "graphysx.agent-world/v2",
    id: "editor-smoke-lab",
    label: "Editor Smoke Lab",
    environment: {
      background: "#07141d",
      sky: null,
      ground: { visible: true, size: 24, color: "#102b2c", grid: true, gridColor: "#4aa998" },
      physics: { gravity: [0, -9.81, 0] },
    },
    entities: [
      { id: "editor-ambient", type: "ambient-light", intensity: 0.8 },
      { id: "editor-sun", type: "directional-light", intensity: 2, transform: { position: [-6, 9, 8] } },
      { id: "editor-plinth", type: "box", transform: { position: [0, 0.5, 0], scale: [4, 0.5, 4] } },
    ],
  }));
  await page.waitForFunction(() => window.__GRAPHYSX__.state()?.world?.id === "editor-smoke-lab", { timeout: SMOKE_TIMEOUT });

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

  // The spawned model is selected, so its transform is live. Recovered submaterials are
  // source-owned slot data; the inspector must say so instead of offering write-only generic
  // sliders that cannot represent a multi-material mesh.
  out.selectedInInspector = (await page.textContent(".gx-ed-ident-id"))?.trim() ?? null;
  out.modelMaterialNote = (await page.textContent('[data-gx-model-materials="source"]'))?.trim() ?? null;
  await page.fill(".gx-ed-inspector .gx-ed-vec input >> nth=0", "3.5");
  await page.dispatchEvent(".gx-ed-inspector .gx-ed-vec input >> nth=0", "change");
  await page.waitForTimeout(250);
  out.positionX = (await findSpawned())?.position?.[0] ?? null;

  // Material controls remain fully editable for ordinary scene primitives.
  await page.click('.gx-ed-toolbar button:text-is("+ Box")');
  await page.waitForFunction(() => document.querySelector(".gx-ed-ident-id")?.textContent?.trim()?.startsWith("edit-box-") === true, { timeout: SMOKE_TIMEOUT });
  const materialTargetId = (await page.textContent(".gx-ed-ident-id"))?.trim() ?? "";
  const findMaterialTarget = () => page.evaluate((id) => window.__GRAPHYSX__.query({ ids: [id] })[0] ?? null, materialTargetId);
  out.materialTargetType = (await findMaterialTarget())?.type ?? null;
  const roughness = ".gx-ed-inspector input[type=range] >> nth=0";
  await page.fill(roughness, "0.15");
  await page.dispatchEvent(roughness, "change");
  await page.waitForTimeout(250);
  out.roughness = (await findMaterialTarget())?.material?.roughness ?? null;

  // Apply an archive texture from the Textures tab, then attach a living behaviour.
  await page.click('.gx-ed-tab:text-is("Textures")');
  // Textures render as thumb cards now; the label is a child span rather than the button text.
  await page.click('.gx-ed-thumb:has(.gx-ed-thumb-label:text-is("Checker"))');
  await page.waitForTimeout(400);
  out.textureApplied = (await findMaterialTarget())?.material?.texture?.id ?? null;

  // Transform behaviours intentionally require kinematic physics; make that contract true
  // before exercising the human attach control.
  await page.evaluate((id) => window.__GRAPHYSX__.update(id, { physics: { mode: "kinematic" } }), materialTargetId);
  await page.click('.gx-ed-section:has(summary:text-is("Behaviours")) .gx-ed-chip:text-is("+ Spin")');
  await page.waitForFunction((id) => (window.__GRAPHYSX__.query({ ids: [id] })[0]?.behaviors?.length ?? 0) === 1, materialTargetId, { timeout: SMOKE_TIMEOUT });
  const withBehaviour = await findMaterialTarget();
  out.behaviourCount = Array.isArray(withBehaviour?.behaviors) ? withBehaviour.behaviors.length : 0;
  // The behaviour shows up as a detachable row in the inspector, not just in state.
  out.behaviourRows = await page.$$eval(".gx-ed-attached", (els) => els.length);

  // Image lighting is authored independently from the visible sky. Exercise the human
  // controls and inspect Three's live Scene values: these are renderer-facing properties,
  // so state/export assertions alone would miss a write-only implementation.
  out.iblInitial = await page.evaluate(() => ({
    lighting: window.__GRAPHYSX__.state().environment.lighting,
    source: document.querySelector('[data-gx-ibl="source"]')?.value ?? null,
    presetDisabled: document.querySelector('[data-gx-ibl="preset"]')?.disabled ?? null,
    inputsDisabled: [...document.querySelectorAll('[data-gx-ibl="intensity"], [data-gx-ibl="yaw"], [data-gx-ibl="background-intensity"], [data-gx-ibl="background-blur"]')]
      .every((input) => input.disabled),
  }));
  const skySelector = '.gx-ed-field:has(.gx-ed-label:text-is("Sky")) select';
  const firstSky = await page.locator(`${skySelector} option:not([value=""])`).first().getAttribute("value");
  // Start flat so the blur scalar can be renderer-verified without asking CI's software GPU
  // to filter a cube; the sky/source/cache assertions below then exercise a real texture path.
  await page.selectOption(skySelector, "");
  await page.waitForFunction(() => window.__GRAPHYSX_HOST__.scene.background?.isColor === true, { timeout: SMOKE_TIMEOUT });
  out.selectedBeforeIbl = (await page.textContent(".gx-ed-ident-id"))?.trim() ?? null;
  await page.evaluate((id) => {
    window.__GX_IBL_OBJECT__ = window.__GRAPHYSX_HOST__.world.getEntityObject(id);
  }, out.selectedBeforeIbl);
  await page.selectOption('[data-gx-ibl="source"]', "sky");
  await page.waitForTimeout(150);
  await page.selectOption('[data-gx-ibl="preset"]', "hero");
  await page.waitForTimeout(250);
  out.iblHero = await page.evaluate((id) => ({
    lighting: window.__GRAPHYSX__.state().environment.lighting,
    intensity: window.__GRAPHYSX_HOST__.scene.environmentIntensity,
    environmentYaw: window.__GRAPHYSX_HOST__.scene.environmentRotation.y,
    backgroundYaw: window.__GRAPHYSX_HOST__.scene.backgroundRotation.y,
    backgroundIntensity: window.__GRAPHYSX_HOST__.scene.backgroundIntensity,
    backgroundBlur: window.__GRAPHYSX_HOST__.scene.backgroundBlurriness,
    roomFallback: window.__GRAPHYSX_HOST__.scene.environment === window.__GRAPHYSX_HOST__.roomEnvironmentTarget.texture,
    sameObject: window.__GX_IBL_OBJECT__ === window.__GRAPHYSX_HOST__.world.getEntityObject(id),
    preset: document.querySelector('[data-gx-ibl="preset"]')?.value ?? null,
  }), out.selectedBeforeIbl);
  await page.locator(".gx-ed-ibl").scrollIntoViewIfNeeded();
  await page.locator(".gx-ed-ibl").screenshot({ path: path.join(ART, "editor-ibl.png") });
  // An agent can edit the same full object while a human field is focused. The control stays
  // stable mid-edit, then the whole card must converge on blur so stale sibling values cannot
  // overwrite the agent's newer source/preset on the next human change.
  await page.focus('[data-gx-ibl="intensity"]');
  await page.evaluate(() => {
    const api = window.__GRAPHYSX__;
    api.transaction([{ op: "set-environment", environment: {
      ...api.export().environment,
      lighting: { source: "studio", intensity: 0.9, yawDegrees: 15, backgroundIntensity: 0.9, backgroundBlur: 0.15 },
    } }]);
  });
  await page.locator('[data-gx-ibl="intensity"]').blur();
  await page.waitForFunction(() => document.querySelector('[data-gx-ibl="source"]')?.value === "studio"
    && document.querySelector('[data-gx-ibl="preset"]')?.value === "soft"
    && document.querySelector('[data-gx-ibl="intensity"]')?.value === "0.9", { timeout: SMOKE_TIMEOUT });
  out.iblExternalSync = await page.evaluate((id) => ({
    lighting: window.__GRAPHYSX__.state().environment.lighting,
    source: document.querySelector('[data-gx-ibl="source"]')?.value ?? null,
    preset: document.querySelector('[data-gx-ibl="preset"]')?.value ?? null,
    intensity: document.querySelector('[data-gx-ibl="intensity"]')?.value ?? null,
    sameObject: window.__GX_IBL_OBJECT__ === window.__GRAPHYSX_HOST__.world.getEntityObject(id),
  }), out.selectedBeforeIbl);
  await page.selectOption('[data-gx-ibl="source"]', "sky");
  await page.selectOption('[data-gx-ibl="preset"]', "hero");
  // Blur has now been proven on Three's live Scene. Set it back to zero before attaching a
  // cube backdrop: headless CI renders through SwiftShader, where filtering the sky adds cost
  // without strengthening the source/cache assertions that follow.
  await page.evaluate(() => {
    const api = window.__GRAPHYSX__;
    const environment = api.export().environment;
    api.transaction([{ op: "set-environment", environment: {
      ...environment,
      lighting: { ...environment.lighting, backgroundBlur: 0 },
    } }]);
  });
  await page.waitForFunction(() => document.querySelector('[data-gx-ibl="background-blur"]')?.value === "0", { timeout: SMOKE_TIMEOUT });
  // Hold the six face requests long enough to deterministically switch source while the sky
  // is pending. Its late completion may install the backdrop, but must not steal Studio IBL.
  await page.route("**/*", async (route) => {
    if (route.request().resourceType() === "image") await new Promise((resolve) => setTimeout(resolve, 300));
    await route.continue();
  });
  await page.selectOption(skySelector, firstSky);
  await page.selectOption('[data-gx-ibl="source"]', "studio");
  await page.waitForFunction(() => window.__GRAPHYSX_HOST__.scene.background?.isCubeTexture === true, { timeout: SMOKE_TIMEOUT });
  out.iblPendingStudio = await page.evaluate(() => ({
    cubeBackground: window.__GRAPHYSX_HOST__.scene.background?.isCubeTexture === true,
    roomEnvironment: window.__GRAPHYSX_HOST__.scene.environment === window.__GRAPHYSX_HOST__.roomEnvironmentTarget.texture,
    source: window.__GRAPHYSX__.state().environment.lighting?.source ?? null,
  }));
  await page.unroute("**/*");
  await page.selectOption('[data-gx-ibl="source"]', "sky");
  await page.waitForFunction(() => window.__GRAPHYSX_HOST__.scene.environment !== window.__GRAPHYSX_HOST__.roomEnvironmentTarget.texture, { timeout: SMOKE_TIMEOUT });
  out.iblSkyLoaded = await page.evaluate(() => {
    window.__GX_IBL_BACKGROUND__ = window.__GRAPHYSX_HOST__.scene.background;
    window.__GX_IBL_SKY_ENVIRONMENT__ = window.__GRAPHYSX_HOST__.scene.environment;
    return {
      cubeBackground: window.__GRAPHYSX_HOST__.scene.background?.isCubeTexture === true,
      skyEnvironment: window.__GRAPHYSX_HOST__.scene.environment !== window.__GRAPHYSX_HOST__.roomEnvironmentTarget.texture,
    };
  });
  await page.screenshot({ path: path.join(ART, "editor-ibl-sky.png"), fullPage: false });
  await page.selectOption('[data-gx-ibl="source"]', "studio");
  await page.waitForTimeout(200);
  out.iblStudio = await page.evaluate(() => ({
    lighting: window.__GRAPHYSX__.state().environment.lighting,
    sameBackground: window.__GX_IBL_BACKGROUND__ === window.__GRAPHYSX_HOST__.scene.background,
    roomEnvironment: window.__GRAPHYSX_HOST__.scene.environment === window.__GRAPHYSX_HOST__.roomEnvironmentTarget.texture,
    differentFromSky: window.__GX_IBL_SKY_ENVIRONMENT__ !== window.__GRAPHYSX_HOST__.scene.environment,
  }));
  await page.selectOption('[data-gx-ibl="source"]', "sky");
  await page.waitForTimeout(200);
  out.iblSkyAgain = await page.evaluate(() => ({
    cachedEnvironment: window.__GX_IBL_SKY_ENVIRONMENT__ === window.__GRAPHYSX_HOST__.scene.environment,
    sameBackground: window.__GX_IBL_BACKGROUND__ === window.__GRAPHYSX_HOST__.scene.background,
  }));
  // The bundled HDRI is reflection-only: keep the cube backdrop, prove a pending HDR load
  // cannot steal Studio after the source changes, then activate the cached PMREM explicitly.
  await page.route("**/*.hdr", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 350));
    await route.continue();
  });
  await page.selectOption('[data-gx-ibl="source"]', "hdri:studio-small-08");
  await page.selectOption('[data-gx-ibl="source"]', "studio");
  await page.waitForTimeout(700);
  out.iblPendingHdriStudio = await page.evaluate(() => ({
    roomEnvironment: window.__GRAPHYSX_HOST__.scene.environment === window.__GRAPHYSX_HOST__.roomEnvironmentTarget.texture,
    sameBackground: window.__GX_IBL_BACKGROUND__ === window.__GRAPHYSX_HOST__.scene.background,
    source: window.__GRAPHYSX__.state().environment.lighting?.source ?? null,
  }));
  await page.unroute("**/*.hdr");
  await page.selectOption('[data-gx-ibl="source"]', "hdri:studio-small-08");
  await page.waitForFunction(() => window.__GRAPHYSX_HOST__.scene.environment !== window.__GRAPHYSX_HOST__.roomEnvironmentTarget.texture, { timeout: SMOKE_TIMEOUT });
  out.iblHdri = await page.evaluate(() => ({
    lighting: window.__GRAPHYSX__.state().environment.lighting,
    sourceControl: document.querySelector('[data-gx-ibl="source"]')?.value ?? null,
    status: document.querySelector('[data-gx-ibl="state"]')?.textContent?.trim() ?? null,
    sameBackground: window.__GX_IBL_BACKGROUND__ === window.__GRAPHYSX_HOST__.scene.background,
    differentFromSky: window.__GX_IBL_SKY_ENVIRONMENT__ !== window.__GRAPHYSX_HOST__.scene.environment,
    roomEnvironment: window.__GRAPHYSX_HOST__.scene.environment === window.__GRAPHYSX_HOST__.roomEnvironmentTarget.texture,
  }));
  await page.screenshot({ path: path.join(ART, "editor-ibl-hdri.png"), fullPage: false });
  await page.selectOption('[data-gx-ibl="source"]', "sky");
  await page.waitForTimeout(150);
  await page.selectOption('[data-gx-ibl="preset"]', "natural");
  await page.waitForTimeout(150);
  await page.fill('[data-gx-ibl="intensity"]', "4");
  await page.dispatchEvent('[data-gx-ibl="intensity"]', "change");
  await page.waitForTimeout(150);
  out.iblRejected = await page.evaluate((id) => ({
    lighting: window.__GRAPHYSX__.state().environment.lighting,
    input: document.querySelector('[data-gx-ibl="intensity"]')?.value ?? null,
    preset: document.querySelector('[data-gx-ibl="preset"]')?.value ?? null,
    sameObject: window.__GX_IBL_OBJECT__ === window.__GRAPHYSX_HOST__.world.getEntityObject(id),
    sameEnvironment: window.__GX_IBL_SKY_ENVIRONMENT__ === window.__GRAPHYSX_HOST__.scene.environment,
  }), out.selectedBeforeIbl);
  out.iblAccessibility = await page.$$eval("[data-gx-ibl]", (els) => ({
    allNamed: els.filter((el) => el.matches("input,select")).every((el) => !!el.getAttribute("aria-label") || !!el.closest("label")?.textContent?.trim()),
    noOverflow: (() => { const card = document.querySelector(".gx-ed-ibl"); return !!card && card.scrollWidth <= card.clientWidth; })(),
  }));
  await page.selectOption('[data-gx-ibl="source"]', "auto");
  await page.waitForTimeout(150);
  out.iblAuto = await page.evaluate(() => ({
    lighting: window.__GRAPHYSX__.state().environment.lighting,
    state: document.querySelector('[data-gx-ibl="state"]')?.textContent?.trim() ?? null,
    inputsDisabled: [...document.querySelectorAll('[data-gx-ibl="intensity"], [data-gx-ibl="yaw"], [data-gx-ibl="background-intensity"], [data-gx-ibl="background-blur"]')]
      .every((input) => input.disabled),
    preset: document.querySelector('[data-gx-ibl="preset"]')?.value ?? null,
    values: [...document.querySelectorAll('[data-gx-ibl="intensity"], [data-gx-ibl="yaw"], [data-gx-ibl="background-intensity"], [data-gx-ibl="background-blur"]')]
      .map((input) => input.value),
    defaults: {
      intensity: window.__GRAPHYSX_HOST__.scene.environmentIntensity,
      environmentYaw: window.__GRAPHYSX_HOST__.scene.environmentRotation.y,
      backgroundYaw: window.__GRAPHYSX_HOST__.scene.backgroundRotation.y,
      backgroundIntensity: window.__GRAPHYSX_HOST__.scene.backgroundIntensity,
      backgroundBlur: window.__GRAPHYSX_HOST__.scene.backgroundBlurriness,
    },
  }));

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
    state: document.querySelector('[data-gx-bloom="state"]')?.textContent?.trim() ?? null,
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
  await page.locator(".gx-ed-post:not(.gx-ed-ibl)").scrollIntoViewIfNeeded();
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
  /Source materials/.test(out.modelMaterialNote ?? "") &&
  out.materialTargetType === "box" &&
  out.positionX === 3.5 &&
  out.roughness === 0.15 &&
  out.textureApplied === "checker" &&
  out.behaviourCount === 1 &&
  out.behaviourRows === 1 &&
  out.iblInitial?.lighting === null &&
  out.iblInitial?.source === "auto" &&
  out.iblInitial?.presetDisabled === true &&
  out.iblInitial?.inputsDisabled === true &&
  out.iblHero?.lighting?.source === "sky" &&
  out.iblHero?.lighting?.intensity === 1.25 &&
  out.iblHero?.lighting?.yawDegrees === -35 &&
  out.iblHero?.lighting?.backgroundIntensity === 0.75 &&
  out.iblHero?.lighting?.backgroundBlur === 0.28 &&
  out.iblHero?.intensity === 1.25 &&
  Math.abs(out.iblHero?.environmentYaw - (-35 * Math.PI / 180)) < 1e-9 &&
  Math.abs(out.iblHero?.backgroundYaw - (-35 * Math.PI / 180)) < 1e-9 &&
  out.iblHero?.backgroundIntensity === 0.75 &&
  out.iblHero?.backgroundBlur === 0.28 &&
  out.iblHero?.roomFallback === true &&
  out.iblHero?.sameObject === true &&
  out.iblHero?.preset === "hero" &&
  out.iblExternalSync?.lighting?.source === "studio" &&
  out.iblExternalSync?.lighting?.intensity === 0.9 &&
  out.iblExternalSync?.lighting?.yawDegrees === 15 &&
  out.iblExternalSync?.source === "studio" &&
  out.iblExternalSync?.preset === "soft" &&
  out.iblExternalSync?.intensity === "0.9" &&
  out.iblExternalSync?.sameObject === true &&
  out.iblPendingStudio?.cubeBackground === true &&
  out.iblPendingStudio?.roomEnvironment === true &&
  out.iblPendingStudio?.source === "studio" &&
  out.iblSkyLoaded?.cubeBackground === true &&
  out.iblSkyLoaded?.skyEnvironment === true &&
  out.iblStudio?.lighting?.source === "studio" &&
  out.iblStudio?.sameBackground === true &&
  out.iblStudio?.roomEnvironment === true &&
  out.iblStudio?.differentFromSky === true &&
  out.iblSkyAgain?.cachedEnvironment === true &&
  out.iblSkyAgain?.sameBackground === true &&
  out.iblPendingHdriStudio?.roomEnvironment === true &&
  out.iblPendingHdriStudio?.sameBackground === true &&
  out.iblPendingHdriStudio?.source === "studio" &&
  out.iblHdri?.lighting?.source === "hdri" &&
  out.iblHdri?.lighting?.hdri === "studio-small-08" &&
  out.iblHdri?.sourceControl === "hdri:studio-small-08" &&
  out.iblHdri?.status === "HDRI · Studio Small" &&
  out.iblHdri?.sameBackground === true &&
  out.iblHdri?.differentFromSky === true &&
  out.iblHdri?.roomEnvironment === false &&
  out.iblRejected?.lighting?.intensity === 1 &&
  out.iblRejected?.input === "1" &&
  out.iblRejected?.preset === "natural" &&
  out.iblRejected?.sameObject === true &&
  out.iblRejected?.sameEnvironment === true &&
  out.iblAccessibility?.allNamed === true &&
  out.iblAccessibility?.noOverflow === true &&
  out.iblAuto?.lighting === null &&
  out.iblAuto?.state === "Auto · Sky" &&
  out.iblAuto?.inputsDisabled === true &&
  out.iblAuto?.preset === "natural" &&
  JSON.stringify(out.iblAuto?.values) === JSON.stringify(["1", "0", "1", "0"]) &&
  out.iblAuto?.defaults?.intensity === 1 &&
  out.iblAuto?.defaults?.environmentYaw === 0 &&
  out.iblAuto?.defaults?.backgroundYaw === 0 &&
  out.iblAuto?.defaults?.backgroundIntensity === 1 &&
  out.iblAuto?.defaults?.backgroundBlur === 0 &&
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
  out.editorHiddenAgain &&
  consoleErrors.length === 0;
process.exit(out.fatal || pageErrors.length || !ok ? 1 : 0);
