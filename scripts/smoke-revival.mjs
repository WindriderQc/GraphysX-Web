import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { applySmokeTimeout, launchSmokeBrowser } from "./smoke-harness.mjs";

const base = process.env.SMOKE_BASE || "http://127.0.0.1:4196/";
const artifacts = process.env.SMOKE_ARTIFACTS || path.resolve("output/playwright/revival");
mkdirSync(artifacts, { recursive: true });
const browser = await launchSmokeBrowser();
const errors = [], failures = [], badResponses = [];
const page = applySmokeTimeout(await browser.newPage({ viewport: { width: 1440, height: 900 } }));
page.on("pageerror", (error) => errors.push(String(error)));
page.on("requestfailed", (request) => failures.push({ url: request.url(), error: request.failure()?.errorText }));
page.on("response", (response) => { if (response.status() >= 400) badResponses.push({ url: response.url(), status: response.status() }); });
const check = (name, value) => { assert.ok(value, name); console.log(`ok ${name}`); };
const state = () => page.evaluate(() => window.__GRAPHYSX__.state());
const captureScenePreview = async (file) => {
  const data = await page.evaluate(() => new Promise((resolve) => {
    const host = window.__GRAPHYSX_HOST__;
    const off = host.subscribeAfterRender(() => {
      off();
      const canvas = document.createElement("canvas");
      canvas.width = 480; canvas.height = 300;
      canvas.getContext("2d").drawImage(host.renderer.domElement, 0, 0, 480, 300);
      resolve(canvas.toDataURL("image/jpeg", 0.88).split(",")[1]);
    });
  }));
  writeFileSync(path.join(artifacts, file), Buffer.from(data, "base64"));
};
const boot = async () => {
  await page.goto(new URL("?intro=0", base).href, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".gx-welcome--center");
  await page.waitForFunction(() => Boolean(window.__GRAPHYSX_HOST__));
};
try {
  await boot();
  await page.evaluate(() => window.advanceTime(5000));
  await page.screenshot({ path: path.join(artifacts, "welcome-desktop.png") });
  const before = await state();
  await page.click(".gx-dna-next");
  const evolved = await state();
  check("DNA button changes the real entity through one scene revision", evolved.revision === before.revision + 1
    && evolved.entities.find((entity) => entity.id === "showroom-dna-grove").dna.generation === 2);
  check("DNA feedback describes the human change without reporting a refused proposal", await page.evaluate(() =>
    document.querySelector(".gx-dna-next").textContent.includes("génération 2")
    && document.querySelector("[data-nestor-briefing]").textContent.includes("génération 2")
    && document.querySelector("[data-proposal-outcome]")?.dataset.outcome !== "declined"
    && JSON.parse(window.render_game_to_text()).discovery.dnaGeneration === 2));
  const motion = await page.evaluate(() => {
    const object = window.__GRAPHYSX_HOST__.world.getEntityObject("showroom-dna-grove");
    const matrices = [];
    object.traverse((child) => { if (child.isInstancedMesh) matrices.push(Array.from(child.instanceMatrix.array).slice(0, 200)); });
    return matrices;
  });
  await page.click(".gx-dna-next");
  const mutated = await page.evaluate(() => {
    const object = window.__GRAPHYSX_HOST__.world.getEntityObject("showroom-dna-grove");
    const matrices = [];
    object.traverse((child) => { if (child.isInstancedMesh) matrices.push(Array.from(child.instanceMatrix.array).slice(0, 200)); });
    return matrices;
  });
  check("generations change rendered instance geometry", JSON.stringify(motion) !== JSON.stringify(mutated));

  const documentBefore = await page.evaluate(() => JSON.stringify(window.__GRAPHYSX__.exportDocument()));
  // Read the timer-driven UI in the same task as its buttons; round trips can otherwise
  // outlast a dwell under software GL, and falsely test a later stop.
  check("discovery reaches the real DNA entity", await page.evaluate(() => {
    document.querySelector("[data-tour-start]").click();
    document.querySelector("[data-tour-next]").click();
    return document.querySelector(".gx-welcome").dataset.tourStopId === "dna"
      && window.__GRAPHYSX__.state().selectedIds.includes("showroom-dna-grove");
  }));
  await page.waitForFunction(() => !window.__GRAPHYSX_HOST__.focusing);
  await page.screenshot({ path: path.join(artifacts, "discovery-dna.png") });
  // A real pointer takes ownership of the camera and stops the tour's future timers.
  await page.mouse.move(1100, 250); await page.mouse.down(); await page.mouse.move(1140, 260); await page.mouse.up();
  check("grabbing the camera ends the guided ride", await page.evaluate(() => !document.querySelector(".gx-welcome--touring")));
  check("camera tour authors no scene content", await page.evaluate((expected) => JSON.stringify(window.__GRAPHYSX__.exportDocument()) === expected, documentBefore));

  await page.click(".gx-go-browse");
  await page.waitForSelector(".gx-browse");
  const visible = () => page.locator(".gx-browse [data-shelf-key]:visible").evaluateAll((rows) => rows.map((row) => row.dataset.shelfCollection));
  check("creations open without archive/prototype rows", (await visible()).every((collection) => collection === "creations") && (await visible()).length > 0);
  await page.click('[data-collection="lab"]');
  await page.fill(".gx-browse .gx-shelf-search", "physics");
  check("search is scoped to the selected laboratory", (await visible()).length > 0 && (await visible()).every((collection) => collection === "lab"));
  await page.click(".gx-browse-close");
  await page.click(".gx-go-archive");
  await page.waitForSelector('.gx-browse [data-collection="archive"][aria-pressed="true"]');
  check("archive entry opens its own collection", (await visible()).every((collection) => collection === "archive") && (await visible()).length > 0);
  await page.screenshot({ path: path.join(artifacts, "archives-desktop.png") });
  await page.click('[data-scene-id="archive-cuisine"]');
  await page.waitForFunction(() => window.__GRAPHYSX__.query({ ids: ["cuisine-model"] })[0]?.asset?.status === "ready");
  const kitchenMeshes = await page.evaluate(() => {
    let meshes = 0;
    window.__GRAPHYSX_HOST__.world.getEntityObject("cuisine-model").traverse((child) => { if (child.isMesh) meshes++; });
    return meshes;
  });
  check("all 76 kitchen meshes load through the normal model runtime", kitchenMeshes === 76);
  check("archive opens in the real editor", (await page.locator(".gx-ed-toolbar").isVisible()) && (await state()).world.id === "archive-cuisine");
  await page.waitForFunction(() => !window.__GRAPHYSX_HOST__.focusing);
  await page.screenshot({ path: path.join(artifacts, "cuisine-source-camera.png") });
  await captureScenePreview("cuisine-preview.jpg");
  await page.evaluate(() => window.__GRAPHYSX_HOST__.frameView([8, 7, 3], [2, 1, -4], 0));
  await page.screenshot({ path: path.join(artifacts, "cuisine-overview.png") });
  await page.click(".gx-ed-exit");
  await page.click(".gx-go-archive");
  await page.click('[data-scene-id="archive-native-intro"]');
  await page.waitForFunction(() => window.__GRAPHYSX__.state().world.id === "archive-native-intro");
  const native = await state();
  check("native C# intro contains two ten-body cylinder families", native.entities.filter((entity) => entity.id.startsWith("intro-cylinder-")).length === 20);
  const fallen = await page.evaluate(() => {
    const api = window.__GRAPHYSX__;
    api.pause(true);
    const before = api.query({ ids: ["intro-cylinder-0-9"] })[0].position[1];
    api.step(0.5);
    const after = api.query({ ids: ["intro-cylinder-0-9"] })[0].position[1];
    return after < before - 0.3;
  });
  check("recovered cylinders participate in actual physics", fallen);
  await page.waitForFunction(() => !window.__GRAPHYSX_HOST__.focusing);
  await page.screenshot({ path: path.join(artifacts, "native-intro.png") });
  await captureScenePreview("native-intro-preview.jpg");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await boot();
  for (const selector of [".gx-go-editor", ".gx-go-browse", ".gx-go-games", ".gx-center-apps summary", ".gx-go-archive"]) {
    const rect = await page.locator(selector).boundingBox();
    check(`mobile destination is visible: ${selector}`, rect && rect.x >= 0 && rect.x + rect.width <= 391 && rect.y + rect.height <= 844);
  }
  await page.click("[data-tour-start]");
  check("reduced motion uses immediate camera cuts", await page.evaluate(() => !window.__GRAPHYSX_HOST__.focusing));
  await page.click("[data-tour-stop]");
  await page.screenshot({ path: path.join(artifacts, "welcome-mobile.png") });
  await page.click(".gx-go-archive");
  await page.screenshot({ path: path.join(artifacts, "archives-mobile.png") });
  check("mobile catalogue fits the viewport", await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.click(".gx-browse-close");
  await page.click(".gx-go-games");
  await page.waitForSelector(".gx-shelf .gx-shelf-collections");
  check("new games are visible before archive courses", await page.locator('[data-course-id="ballsy-slime"]').isVisible()
    && !(await page.locator('[data-game-id="archive-cup"]').isVisible()));
  await page.click('[data-collection="archive"]');
  check("archive campaign remains reachable", await page.locator('[data-game-id="archive-cup"]').isVisible());
  await page.click(".gx-shelf-close");
  const finalGeneration = await page.evaluate(() => window.__GRAPHYSX__.update("showroom-dna-grove", { dna: { generation: 64 } }));
  check("the last supported DNA generation can be inspected", finalGeneration.ok);
  const lastRevision = (await state()).revision;
  await page.click(".gx-dna-next");
  check("a finished lineage never silently wraps to generation one", await page.evaluate((revision) => {
    const api = window.__GRAPHYSX__;
    return api.state().revision === revision && api.query({ ids: ["showroom-dna-grove"] })[0].dna.generation === 64;
  }, lastRevision));
  check("no browser exceptions", errors.length === 0);
  writeFileSync(path.join(artifacts, "receipt.json"), JSON.stringify({ kitchenMeshes, nativeCylinders: 20, errors, failures, badResponses }, null, 2));
  check("no failed product assets", failures.filter((failure) => failure.error !== "net::ERR_ABORTED")
    .every(({ url }) => url.startsWith("http://localhost:8788/") || url.startsWith("http://127.0.0.1:8788/")));
  check("no HTTP asset errors", badResponses.length === 0);
} finally { await browser.close(); }
