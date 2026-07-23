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
    return {
      before,
      after: api.state().entities.length,
      survived: before === api.state().entities.length,
      allReady: models.length === 3 && models.every((m) => m.asset?.status === "ready"),
    };
  });

  await page.screenshot({ path: path.join(ART, "archive-garage.png") });
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
  out.roundTrip?.survived === true &&
  out.roundTrip?.allReady === true &&
  out.badResponses.length === 0;

process.exit(out.fatal || out.pageErrors.length || out.consoleErrors.length || !ok ? 1 : 0);
