import { SMOKE_TIMEOUT, applySmokeTimeout, launchSmokeBrowser } from "./smoke-harness.mjs";
import { mkdirSync } from "node:fs";
import path from "node:path";

// The recovered vehicles — Impreza, Cobra, Piste Ovale — reached through the real front door:
// showroom -> Browse Scenes -> Archive Garage. Drives the BUILT output like every other smoke.
//
// This first ran against a bespoke vite harness, because the garage was on no product route. It
// is now a composed row in Browse Scenes, so the harness is retired and this exercises the path a
// visitor actually takes — which is the only way to catch the failure that mattered most here:
//
//   the vehicle meshes and their textures are pruned out of `dist/` unless they are registered in
//   the asset catalog, so the garage worked perfectly in dev and would have 404'd in production.
//
// That is why this asserts on network responses and on `asset.status`, not just entity counts: a
// model that silently fails to load still exists as an entity, which is exactly the false pass.

const BASE = process.env.SMOKE_BASE || "http://127.0.0.1:4188/";
const ART = process.env.SMOKE_ARTIFACTS || path.resolve("output/verify");
mkdirSync(ART, { recursive: true });

const consoleErrors = [];
const pageErrors = [];
const badResponses = [];
const browser = await launchSmokeBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
applySmokeTimeout(page);
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
page.on("pageerror", (e) => pageErrors.push(String(e)));
page.on("response", (r) => { if (r.status() >= 400) badResponses.push(`${r.status()} ${r.url()}`); });

const out = {};
try {
  await page.goto(BASE, { waitUntil: "load", timeout: SMOKE_TIMEOUT });
  await page.waitForFunction(() => !!window.__GRAPHYSX_HOST__, { timeout: SMOKE_TIMEOUT });
  await page.waitForSelector(".gx-welcome", { timeout: SMOKE_TIMEOUT });

  // Reachable from the front door, listed above the starter scenes.
  await page.click(".gx-welcome .gx-go-browse");
  await page.waitForSelector(".gx-browse", { timeout: SMOKE_TIMEOUT });
  out.listed = await page.evaluate(() => {
    const row = document.querySelector('.gx-browse-row[data-scene-id="archive-garage"]');
    return { present: !!row, meta: row?.querySelector(".gx-browse-meta")?.textContent ?? "" };
  });

  await page.click('.gx-browse-row[data-scene-id="archive-garage"]');
  // Three meshes totalling ~500 KB have to fetch, decode and resolve.
  await page
    .waitForFunction(
      () => {
        const models = window.__GRAPHYSX__.query({ type: "model" });
        return models.length === 3 && models.every((m) => m.asset?.status === "ready");
      },
      { timeout: SMOKE_TIMEOUT },
    )
    .catch(() => {});
  await page.waitForFunction(
    () => window.__GRAPHYSX__.state().environment.lighting?.source === "hdri"
      && window.__GRAPHYSX_HOST__.scene.environment !== window.__GRAPHYSX_HOST__.roomEnvironmentTarget.texture,
    { timeout: SMOKE_TIMEOUT },
  );

  out.scene = await page.evaluate(() => {
    const api = window.__GRAPHYSX__;
    const models = api.query({ type: "model" });
    return {
      mode: window.__GRAPHYSX_HOST__.mode,
      entities: api.state().entities.length,
      shelfGone: !document.querySelector(".gx-browse"),
      models: models
        .map((m) => ({ id: m.id, status: m.asset?.status ?? null, y: Number(m.position[1].toFixed(3)) }))
        .sort((a, b) => a.id.localeCompare(b.id)),
      pbr: models.map((model) => {
        const root = window.__GRAPHYSX_HOST__.world.getEntityObject(model.id);
        const materials = [];
        root?.traverse((object) => {
          if (!object.isMesh) return;
          for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
            materials.push({
              name: material.name,
              phong: material.isMeshPhongMaterial === true,
              standard: material.isMeshStandardMaterial === true && material.isMeshPhysicalMaterial !== true,
              physical: material.isMeshPhysicalMaterial === true,
              roughness: material.roughness ?? null,
              metalness: material.metalness ?? null,
              clearcoat: material.clearcoat ?? null,
              hasMap: !!material.map,
              map: material.map?.name ?? material.map?.source?.data?.currentSrc ?? material.map?.source?.data?.src ?? null,
              colorSpace: material.map?.colorSpace ?? null,
            });
          }
        });
        return { id: model.id, materials };
      }).sort((a, b) => a.id.localeCompare(b.id)),
      // The garage replaced the world rather than being added to the showroom.
      showroomEntities: api.query({ tag: "showroom" }).length,
      hdriActive: api.state().environment.lighting?.source === "hdri"
        && window.__GRAPHYSX_HOST__.scene.environment !== window.__GRAPHYSX_HOST__.roomEnvironmentTarget.texture,
    };
  });
  await page.screenshot({ path: path.join(ART, "archive-garage-source.png") });

  out.slotAuthoring = await page.evaluate(async () => {
    const api = window.__GRAPHYSX__;
    const bridge = window.__GRAPHYSX_AGENT_BRIDGE__;
    const ids = {
      imprezaBody: "mesh:0:chasis:material:0:material-1-chasis-jpg",
      imprezaGlass: "mesh:0:chasis:material:1:material-2-ventanas-jpg",
      imprezaUnder: "mesh:0:chasis:material:2:material-3-chasis-a-jpg",
      cobraBody: "mesh:0:cobra-body:material:0:cobra-body-cobra-blue-tga",
      cobraTire: "mesh:1:tire:material:0:cobra-tire-no-recovered-texture-in-this-repo",
      piste: "mesh:0:pisteovale:material:0:pisteovale-material-groups-not-decoded",
    };
    const expected = {
      impreza: [
        ids.imprezaBody,
        ids.imprezaGlass,
        ids.imprezaUnder,
        "mesh:1:rueda-1:material:0:ruedas-ruedas-jpg",
        "mesh:2:rueda-4:material:0:ruedas-ruedas-jpg",
        "mesh:3:rueda-3:material:0:ruedas-ruedas-jpg",
        "mesh:4:rueda-2:material:0:ruedas-ruedas-jpg",
      ],
      cobra: [
        ids.cobraBody,
        ids.cobraTire,
        "mesh:2:tire0:material:0:cobra-tire-no-recovered-texture-in-this-repo",
        "mesh:3:tire1:material:0:cobra-tire-no-recovered-texture-in-this-repo",
        "mesh:4:tire2:material:0:cobra-tire-no-recovered-texture-in-this-repo",
      ],
      piste: [ids.piste],
    };
    const stateOf = (entityId) => api.query({ ids: [entityId] })[0];
    const live = (entityId, slotId) => {
      const state = stateOf(entityId);
      const slot = state.materialSlots.find((candidate) => candidate.id === slotId);
      const root = window.__GRAPHYSX_HOST__.world.getEntityObject(entityId);
      const mesh = root?.children[0]?.children[slot.meshIndex];
      const material = Array.isArray(mesh?.material) ? mesh.material[slot.materialIndex] : mesh?.material;
      return { slot, mesh, material };
    };
    const signature = (entityId) => {
      const entity = stateOf(entityId);
      const authored = api.exportDocument().entities.find((candidate) => candidate.id === entityId);
      const root = window.__GRAPHYSX_HOST__.world.getEntityObject(entityId);
      const geometries = [];
      root?.traverse((object) => { if (object.isMesh) geometries.push(object.geometry.uuid); });
      return {
        transform: authored?.transform,
        physics: entity.physics ? {
          mode: entity.physics.mode,
          material: entity.physics.material,
          collider: entity.physics.collider,
        } : null,
        tags: entity.tags,
        geometries,
      };
    };

    const before = {
      impreza: signature("garage-impreza"),
      cobra: signature("garage-cobra"),
      body: live("garage-impreza", ids.imprezaBody),
      glass: live("garage-impreza", ids.imprezaGlass),
      under: live("garage-impreza", ids.imprezaUnder),
      cobraBody: live("garage-cobra", ids.cobraBody),
      cobraTire: live("garage-cobra", ids.cobraTire),
    };
    const sourceMapUuid = before.body.material.map?.uuid ?? null;
    const sourceMapColorSpace = before.body.material.map?.colorSpace ?? null;
    const nonTargetUuids = {
      glass: before.glass.material.uuid,
      under: before.under.material.uuid,
      cobraTire: before.cobraTire.material.uuid,
    };

    const bridgeResult = await bridge.call("update", "garage-impreza", {
      modelMaterialOverrides: {
        [ids.imprezaBody]: { color: "#d6e6ff", roughness: 0.2, metalness: 0.14, clearcoat: 0.94, clearcoatRoughness: 0.1 },
      },
    });
    const afterBody = live("garage-impreza", ids.imprezaBody);
    const afterBodyOthers = {
      glass: live("garage-impreza", ids.imprezaGlass).material.uuid,
      under: live("garage-impreza", ids.imprezaUnder).material.uuid,
    };
    const glassResult = api.update("garage-impreza", {
      modelMaterialOverrides: {
        [ids.imprezaGlass]: { color: "#9fb4c7", roughness: 0.12, opacity: 0.72, clearcoat: 0.82 },
      },
    });
    const cobraResult = api.update("garage-cobra", {
      modelMaterialOverrides: {
        [ids.cobraBody]: { color: "#d8e8ff", roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.08 },
      },
    });
    const afterGlass = live("garage-impreza", ids.imprezaGlass);
    const afterCobraBody = live("garage-cobra", ids.cobraBody);
    const bodyUuidAfterGlass = live("garage-impreza", ids.imprezaBody).material.uuid;
    const tireAfterCobra = live("garage-cobra", ids.cobraTire);

    const resetGlass = api.update("garage-impreza", { modelMaterialOverrides: { [ids.imprezaGlass]: null } });
    const afterResetGlass = stateOf("garage-impreza");
    const bodyAfterResetGlass = live("garage-impreza", ids.imprezaBody);
    const glassAfterReset = live("garage-impreza", ids.imprezaGlass);

    let retiredDisposeCount = 0;
    let sourceMapDisposeCount = 0;
    before.body.material.map?.addEventListener("dispose", () => { sourceMapDisposeCount += 1; });
    for (let cycle = 0; cycle < 12; cycle += 1) {
      api.update("garage-impreza", { modelMaterialOverrides: { [ids.imprezaBody]: { roughness: 0.18 + cycle * 0.01 } } });
      const generated = live("garage-impreza", ids.imprezaBody).material;
      generated.addEventListener("dispose", () => { retiredDisposeCount += 1; });
      api.update("garage-impreza", { modelMaterialOverrides: { [ids.imprezaBody]: null } });
    }
    const afterCycles = live("garage-impreza", ids.imprezaBody);
    const cycleDocument = api.exportDocument();

    // Leave one paint + one glass override in the scene for the visual and round-trip proof.
    api.update("garage-impreza", {
      modelMaterialOverrides: {
        [ids.imprezaBody]: { color: "#d6e6ff", roughness: 0.2, clearcoat: 0.94 },
        [ids.imprezaGlass]: { color: "#9fb4c7", roughness: 0.12, opacity: 0.72 },
      },
    });
    api.update("garage-cobra", {
      modelMaterialOverrides: { [ids.cobraBody]: { color: "#d8e8ff", roughness: 0.18, clearcoat: 1 } },
    });

    const exactIds = {
      impreza: stateOf("garage-impreza").materialSlots.map((slot) => slot.id),
      cobra: stateOf("garage-cobra").materialSlots.map((slot) => slot.id),
      piste: stateOf("garage-piste-ovale").materialSlots.map((slot) => slot.id),
      expected,
    };
    const afterInvariant = {
      impreza: signature("garage-impreza"),
      cobra: signature("garage-cobra"),
    };
    const invariants = {
      impreza: JSON.stringify(afterInvariant.impreza) === JSON.stringify(before.impreza),
      cobra: JSON.stringify(afterInvariant.cobra) === JSON.stringify(before.cobra),
    };
    const slotTypes = {
      body: before.body.slot.materialType,
      glass: before.glass.slot.materialType,
      under: before.under.slot.materialType,
      cobraTire: before.cobraTire.slot.materialType,
      piste: live("garage-piste-ovale", ids.piste).slot.materialType,
    };
    const cycles = {
      retiredDisposeCount,
      sourceMapDisposeCount,
      sourceRestored: afterCycles.material.uuid === before.body.material.uuid,
      emptyOverridesOmitted: !cycleDocument.entities.find((entity) => entity.id === "garage-impreza")?.modelMaterialOverrides,
    };
    const waitForModelAssets = async () => {
      for (let attempt = 0; attempt < 400; attempt += 1) {
        if (api.query({ type: "model" }).every((model) => model.asset?.status === "ready")) return true;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      return false;
    };
    const unknownRejected = api.update("garage-cobra", {
      modelMaterialOverrides: { "mesh:99:missing:material:0:missing": { color: "#ffffff" } },
    });
    const readyAfterUnknown = await waitForModelAssets();
    const unsupportedRejected = api.update("garage-cobra", {
      modelMaterialOverrides: { [ids.cobraTire]: { clearcoat: 1 } },
    });
    const readyAfterUnsupported = await waitForModelAssets();
    const genericRejected = api.update("garage-cobra", { material: { color: "#00ffff" } });

    return {
      capability: api.capabilities.includes("model.material-slots"),
      exactIds,
      slotTypes,
      sourceMaps: {
        body: before.body.slot.hasSourceMap,
        glass: before.glass.slot.hasSourceMap,
        under: before.under.slot.hasSourceMap,
        cobraTire: before.cobraTire.slot.hasSourceMap,
        uuidPreserved: afterBody.material.map?.uuid === sourceMapUuid,
        colorSpace: sourceMapColorSpace,
      },
      bridgeOk: bridgeResult?.ok === true,
      glassOk: glassResult.ok,
      cobraOk: cobraResult.ok,
      isolation: {
        glass: afterBodyOthers.glass === nonTargetUuids.glass,
        under: afterBodyOthers.under === nonTargetUuids.under,
        bodyAcrossGlass: afterBody.material.uuid === bodyUuidAfterGlass,
        tire: tireAfterCobra.material.uuid === nonTargetUuids.cobraTire && tireAfterCobra.material.roughness === 0.9,
      },
      values: {
        bodyRoughness: afterBody.material.roughness,
        bodyClearcoat: afterBody.material.clearcoat,
        glassOpacity: afterGlass.material.opacity,
        glassTransparent: afterGlass.material.transparent,
        glassDepthWrite: afterGlass.material.depthWrite,
        cobraRoughness: afterCobraBody.material.roughness,
      },
      resetOne: resetGlass.ok
        && afterResetGlass.materialSlots.find((slot) => slot.id === ids.imprezaBody)?.overridden === true
        && afterResetGlass.materialSlots.find((slot) => slot.id === ids.imprezaGlass)?.overridden === false
        && bodyAfterResetGlass.material.uuid === bodyUuidAfterGlass
        && glassAfterReset.material.uuid === nonTargetUuids.glass,
      cycles,
      invariants,
      genericRejected: genericRejected.ok === false,
      unsupportedRejected: unsupportedRejected.ok === false,
      unknownRejected: unknownRejected.ok === false,
      recoveredAfterRejections: readyAfterUnknown && readyAfterUnsupported,
    };
  });
  await page.waitForFunction(
    () => window.__GRAPHYSX__.query({ type: "model" }).every((model) => model.asset?.status === "ready"),
    { timeout: SMOKE_TIMEOUT },
  );
  await page.screenshot({ path: path.join(ART, "archive-garage-materials.png") });

  // A recovered scene is claimed to be an ordinary scene: it must survive export -> load with
  // every model re-resolving out of the catalog.
  out.roundTrip = await page.evaluate(async () => {
    const api = window.__GRAPHYSX__;
    const exported = api.export();
    const before = api.state().entities.length;
    const loaded = api.load(exported);
    if (!loaded.ok) return { loadError: loaded.error };
    await new Promise((resolve) => setTimeout(resolve, 3000));
    const models = api.query({ type: "model" });
    const impreza = models.find((model) => model.id === "garage-impreza");
    const cobra = models.find((model) => model.id === "garage-cobra");
    const persisted = {
      imprezaBody: impreza?.materialSlots.find((slot) => slot.role === "body")?.overridden === true,
      imprezaGlass: impreza?.materialSlots.find((slot) => slot.role === "glass")?.overridden === true,
      cobraBody: cobra?.materialSlots.find((slot) => slot.role === "body")?.overridden === true,
      documentHasOverrides: models.every((model) => {
        const entity = api.exportDocument().entities.find((candidate) => candidate.id === model.id);
        return model.id === "garage-piste-ovale" ? !entity?.modelMaterialOverrides : !!entity?.modelMaterialOverrides;
      }),
    };
    const resetAll = api.update("garage-impreza", { modelMaterialOverrides: null });
    const resetCobra = api.update("garage-cobra", { modelMaterialOverrides: null });
    return {
      before,
      after: api.state().entities.length,
      survived: before === api.state().entities.length,
      allReady: models.length === 3 && models.every((m) => m.asset?.status === "ready"),
      persisted,
      resetAll: resetAll.ok && resetCobra.ok
        && api.query({ type: "model" }).every((model) => model.materialSlots.every((slot) => !slot.overridden))
        && api.exportDocument().entities.filter((entity) => entity.type === "model").every((entity) => !entity.modelMaterialOverrides),
    };
  });

  await page.screenshot({ path: path.join(ART, "archive-garage-reset.png") });

  // Asset arrival is asynchronous, but authoring is not allowed to become time-dependent.
  // Hold the payload itself at the network boundary, make several edits while the model has
  // no discovered slots yet, and prove that only the final reset is applied when it arrives.
  let releaseDelayedImpreza;
  let markDelayedImpreza;
  const delayedImprezaSeen = new Promise((resolve) => { markDelayedImpreza = resolve; });
  await page.route("**/archive-impreza.json?wave12-late=1", async (route) => {
    markDelayedImpreza();
    await new Promise((resolve) => { releaseDelayedImpreza = resolve; });
    await route.continue();
  });
  out.lateReset = await page.evaluate(() => {
    const api = window.__GRAPHYSX__;
    const slot = "mesh:0:chasis:material:0:material-1-chasis-jpg";
    const spawned = api.spawn({
      id: "late-material-model",
      type: "model",
      asset: {
        id: "archive-impreza",
        url: "/assets/vehicles/archive-impreza.json?wave12-late=1",
        format: "graphysx-mesh-json",
        fitSize: 4,
      },
    });
    const first = api.update("late-material-model", {
      modelMaterialOverrides: { [slot]: { color: "#ff0000", roughness: 0.12 } },
    });
    const second = api.update("late-material-model", {
      modelMaterialOverrides: { [slot]: { color: "#0000ff", roughness: 0.72 } },
    });
    const reset = api.update("late-material-model", { modelMaterialOverrides: { [slot]: null } });
    return { spawned: spawned.ok, first: first.ok, second: second.ok, reset: reset.ok };
  });
  await delayedImprezaSeen;
  releaseDelayedImpreza();
  await page.waitForFunction(
    () => window.__GRAPHYSX__.query({ ids: ["late-material-model"] })[0]?.asset?.status === "ready",
    { timeout: SMOKE_TIMEOUT },
  );
  Object.assign(out.lateReset, await page.evaluate(() => {
    const api = window.__GRAPHYSX__;
    const entity = api.query({ ids: ["late-material-model"] })[0];
    const authored = api.exportDocument().entities.find((candidate) => candidate.id === "late-material-model");
    return {
      slotCount: entity.materialSlots.length,
      sourceOnly: entity.materialSlots.every((slot) => !slot.overridden),
      omitted: !authored.modelMaterialOverrides,
    };
  }));

  // A completion owned by a removed runtime must not attach to a replacement that reuses
  // the same id. This also exercises the loader's disposed-target checkpoints: the delayed
  // Cobra payload is abandoned, while the replacement remains the one-slot Piste model.
  let releaseDelayedCobra;
  let markDelayedCobra;
  const delayedCobraSeen = new Promise((resolve) => { markDelayedCobra = resolve; });
  await page.route("**/archive-cobra.json?wave12-late=2", async (route) => {
    markDelayedCobra();
    await new Promise((resolve) => { releaseDelayedCobra = resolve; });
    await route.continue();
  });
  out.staleReplacement = await page.evaluate(() => {
    const api = window.__GRAPHYSX__;
    const cobraBody = "mesh:0:cobra-body:material:0:cobra-body-cobra-blue-tga";
    const first = api.spawn({
      id: "late-reused-model",
      type: "model",
      asset: {
        id: "archive-cobra",
        url: "/assets/vehicles/archive-cobra.json?wave12-late=2",
        format: "graphysx-mesh-json",
        fitSize: 4,
      },
      modelMaterialOverrides: { [cobraBody]: { color: "#ff00ff", roughness: 0.2 } },
    });
    return { first: first.ok };
  });
  await delayedCobraSeen;
  Object.assign(out.staleReplacement, await page.evaluate(() => {
    const api = window.__GRAPHYSX__;
    const removed = api.remove("late-reused-model");
    const replacement = api.spawn({
      id: "late-reused-model",
      type: "model",
      asset: { id: "archive-piste-ovale", fitSize: 4 },
    });
    return { removed: removed.ok, replacement: replacement.ok };
  }));
  releaseDelayedCobra();
  await page.waitForFunction(
    () => window.__GRAPHYSX__.query({ ids: ["late-reused-model"] })[0]?.asset?.status === "ready",
    { timeout: SMOKE_TIMEOUT },
  );
  await page.waitForTimeout(250);
  Object.assign(out.staleReplacement, await page.evaluate(() => {
    const entity = window.__GRAPHYSX__.query({ ids: ["late-reused-model"] })[0];
    return {
      assetId: entity.asset.id,
      slotIds: entity.materialSlots.map((slot) => slot.id),
      sourceOnly: entity.materialSlots.every((slot) => !slot.overridden),
    };
  }));
} catch (error) {
  out.fatal = String(error);
}

out.badResponses = badResponses;
// The scene-store probe refusal is a known, pre-existing console error on routes with no store.
out.consoleErrors = consoleErrors.filter((t) => !/localhost:8788|ERR_CONNECTION_REFUSED/.test(t));
out.pageErrors = pageErrors;
console.log(JSON.stringify(out, null, 2));
await browser.close();

const ok =
  out.listed?.present === true &&
  out.scene?.mode === "scene" &&
  out.scene?.shelfGone === true &&
  out.scene?.entities === 25 &&
  out.scene?.showroomEntities === 0 &&
  out.scene?.hdriActive === true &&
  out.scene?.models?.length === 3 &&
  out.scene.models.every((m) => m.status === "ready") &&
  out.scene.pbr?.find((model) => model.id === "garage-impreza")?.materials.filter((material) => material.physical).length === 2 &&
  out.scene.pbr?.find((model) => model.id === "garage-impreza")?.materials.filter((material) => material.standard).length === 5 &&
  out.scene.pbr?.find((model) => model.id === "garage-impreza")?.materials.every((material) => !material.phong && (!material.hasMap || material.colorSpace === "srgb")) &&
  out.scene.pbr?.find((model) => model.id === "garage-cobra")?.materials.filter((material) => material.physical).length === 1 &&
  out.scene.pbr?.find((model) => model.id === "garage-cobra")?.materials.filter((material) => material.standard).length === 4 &&
  out.scene.pbr?.find((model) => model.id === "garage-cobra")?.materials.every((material) => !material.phong) &&
  out.scene.pbr?.find((model) => model.id === "garage-piste-ovale")?.materials.length === 1 &&
  out.scene.pbr?.find((model) => model.id === "garage-piste-ovale")?.materials[0]?.standard === true &&
  out.scene.pbr?.find((model) => model.id === "garage-piste-ovale")?.materials[0]?.roughness === 0.8 &&
  out.slotAuthoring?.capability === true &&
  JSON.stringify(out.slotAuthoring?.exactIds?.impreza) === JSON.stringify(out.slotAuthoring?.exactIds?.expected?.impreza) &&
  JSON.stringify(out.slotAuthoring?.exactIds?.cobra) === JSON.stringify(out.slotAuthoring?.exactIds?.expected?.cobra) &&
  JSON.stringify(out.slotAuthoring?.exactIds?.piste) === JSON.stringify(out.slotAuthoring?.exactIds?.expected?.piste) &&
  out.slotAuthoring?.slotTypes?.body === "physical" &&
  out.slotAuthoring?.slotTypes?.glass === "physical" &&
  out.slotAuthoring?.slotTypes?.under === "standard" &&
  out.slotAuthoring?.slotTypes?.cobraTire === "standard" &&
  out.slotAuthoring?.slotTypes?.piste === "standard" &&
  out.slotAuthoring?.sourceMaps?.body === true &&
  out.slotAuthoring?.sourceMaps?.glass === true &&
  out.slotAuthoring?.sourceMaps?.under === true &&
  out.slotAuthoring?.sourceMaps?.cobraTire === false &&
  out.slotAuthoring?.sourceMaps?.uuidPreserved === true &&
  out.slotAuthoring?.sourceMaps?.colorSpace === "srgb" &&
  out.slotAuthoring?.bridgeOk === true &&
  out.slotAuthoring?.glassOk === true &&
  out.slotAuthoring?.cobraOk === true &&
  Object.values(out.slotAuthoring?.isolation ?? {}).every(Boolean) &&
  out.slotAuthoring?.values?.bodyRoughness === 0.2 &&
  out.slotAuthoring?.values?.bodyClearcoat === 0.94 &&
  out.slotAuthoring?.values?.glassOpacity === 0.72 &&
  out.slotAuthoring?.values?.glassTransparent === true &&
  out.slotAuthoring?.values?.glassDepthWrite === false &&
  out.slotAuthoring?.values?.cobraRoughness === 0.18 &&
  out.slotAuthoring?.resetOne === true &&
  out.slotAuthoring?.cycles?.retiredDisposeCount === 12 &&
  out.slotAuthoring?.cycles?.sourceMapDisposeCount === 0 &&
  out.slotAuthoring?.cycles?.sourceRestored === true &&
  out.slotAuthoring?.cycles?.emptyOverridesOmitted === true &&
  out.slotAuthoring?.invariants?.impreza === true &&
  out.slotAuthoring?.invariants?.cobra === true &&
  out.slotAuthoring?.genericRejected === true &&
  out.slotAuthoring?.unsupportedRejected === true &&
  out.slotAuthoring?.unknownRejected === true &&
  out.slotAuthoring?.recoveredAfterRejections === true &&
  out.roundTrip?.survived === true &&
  out.roundTrip?.allReady === true &&
  Object.values(out.roundTrip?.persisted ?? {}).every(Boolean) &&
  out.roundTrip?.resetAll === true &&
  Object.values(out.lateReset ?? {}).every(Boolean) &&
  out.lateReset?.slotCount === 7 &&
  out.staleReplacement?.first === true &&
  out.staleReplacement?.removed === true &&
  out.staleReplacement?.replacement === true &&
  out.staleReplacement?.assetId === "archive-piste-ovale" &&
  JSON.stringify(out.staleReplacement?.slotIds) === JSON.stringify([
    "mesh:0:pisteovale:material:0:pisteovale-material-groups-not-decoded",
  ]) &&
  out.staleReplacement?.sourceOnly === true &&
  out.badResponses.length === 0;

process.exit(out.fatal || out.pageErrors.length || out.consoleErrors.length || !ok ? 1 : 0);
