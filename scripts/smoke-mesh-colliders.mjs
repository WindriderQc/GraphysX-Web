import { SMOKE_TIMEOUT, applySmokeTimeout, launchSmokeBrowser } from "./smoke-harness.mjs";
import { startStaticServer } from "./static-server.mjs";
import { mkdirSync } from "node:fs";
import path from "node:path";

// Scene-native mesh collider contract, through the shipped browser API:
// - the recovered Great Slide is reachable as a starter and resolves to its exact trimesh;
// - a dynamic ball follows the sloped surface instead of a placeholder primitive;
// - collider intent and mesh statistics survive exportDocument -> load;
// - moving trimeshes are rejected, while a model-backed convex hull works through the bridge.

const SHARED_BASE = process.env.SMOKE_BASE || null;
const ART = process.env.SMOKE_ARTIFACTS || path.resolve("output/verify");
mkdirSync(ART, { recursive: true });

const consoleErrors = [];
const pageErrors = [];
const badResponses = [];
let server;
const browser = await launchSmokeBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
applySmokeTimeout(page);
page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
page.on("pageerror", (error) => pageErrors.push(String(error)));
page.on("response", (response) => { if (response.status() >= 400) badResponses.push(`${response.status()} ${response.url()}`); });

const out = {};
try {
  if (!SHARED_BASE) server = await startStaticServer({ root: path.resolve("dist"), port: Number(process.env.SMOKE_PORT || 0) });
  const base = SHARED_BASE ?? server.url;
  await page.goto(`${base}?host=standalone`, { waitUntil: "load", timeout: SMOKE_TIMEOUT });
  await page.waitForFunction(() => !!window.__GRAPHYSX__ && !!window.__GRAPHYSX_AGENT_BRIDGE__, { timeout: SMOKE_TIMEOUT });

  out.loaded = await page.evaluate(() => {
    const api = window.__GRAPHYSX__;
    const listed = api.starters().some((starter) => starter.id === "archive-great-slide");
    api.pause(true);
    const result = api.loadStarter("archive-great-slide");
    return { listed, ok: result.ok, error: result.error ?? null };
  });
  await page.waitForFunction(
    () => {
      const slide = window.__GRAPHYSX__.query({ ids: ["great-slide-terrain"] })[0];
      return slide?.asset?.status === "ready" && slide?.physics?.collider?.effective === "trimesh";
    },
    { timeout: SMOKE_TIMEOUT },
  );

  out.motion = await page.evaluate(() => {
    const api = window.__GRAPHYSX__;
    const before = api.query({ ids: ["great-slide-ball"] })[0];
    let minimumY = before?.position[1] ?? Number.NEGATIVE_INFINITY;
    for (let frame = 0; frame < 240; frame += 1) {
      api.step(1 / 60);
      const ball = api.query({ ids: ["great-slide-ball"] })[0];
      if (ball) minimumY = Math.min(minimumY, ball.position[1]);
    }
    const after = api.query({ ids: ["great-slide-ball"] })[0];
    const slide = api.query({ ids: ["great-slide-terrain"] })[0];
    return {
      before: before?.position ?? null,
      after: after?.position ?? null,
      minimumY,
      asset: slide?.asset ?? null,
      collider: slide?.physics?.collider ?? null,
    };
  });

  out.roundTrip = await page.evaluate(() => {
    const api = window.__GRAPHYSX__;
    const document = api.exportDocument();
    const slide = document?.entities.find((entity) => entity.id === "great-slide-terrain");
    const authoredCollider = slide?.physics?.collider ?? null;
    const loaded = api.load(document);
    return { authoredCollider, ok: loaded.ok, error: loaded.error ?? null };
  });
  await page.waitForFunction(
    () => window.__GRAPHYSX__.query({ ids: ["great-slide-terrain"] })[0]?.physics?.collider?.effective === "trimesh",
    { timeout: SMOKE_TIMEOUT },
  );
  out.reloaded = await page.evaluate(() => {
    const slide = window.__GRAPHYSX__.query({ ids: ["great-slide-terrain"] })[0];
    return { asset: slide?.asset ?? null, collider: slide?.physics?.collider ?? null };
  });

  await page.click('.gx-ed-row[title^="great-slide-terrain —"]');
  out.editor = await page.evaluate(() => {
    const fields = [...document.querySelectorAll(".gx-ed-field")];
    const field = fields.find((row) => row.querySelector(".gx-ed-label")?.textContent === "Collider");
    const select = field?.querySelector("select");
    const hint = [...document.querySelectorAll(".gx-ed-hint")]
      .find((element) => /vertices/.test(element.textContent ?? ""));
    const initial = select?.value ?? null;
    const options = select ? [...select.options].map((option) => option.value) : [];
    if (select) {
      select.value = "auto";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    }
    return { initial, options, hint: hint?.textContent ?? null };
  });
  await page.waitForFunction(
    () => window.__GRAPHYSX__.query({ ids: ["great-slide-terrain"] })[0]?.physics?.collider?.effective === "auto",
    { timeout: SMOKE_TIMEOUT },
  );
  await page.evaluate(() => {
    const fields = [...document.querySelectorAll(".gx-ed-field")];
    const field = fields.find((row) => row.querySelector(".gx-ed-label")?.textContent === "Collider");
    const select = field?.querySelector("select");
    if (!select) return;
    select.value = "trimesh";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.waitForFunction(
    () => window.__GRAPHYSX__.query({ ids: ["great-slide-terrain"] })[0]?.physics?.collider?.effective === "trimesh",
    { timeout: SMOKE_TIMEOUT },
  );
  await page.waitForFunction(
    () => [...document.querySelectorAll(".gx-ed-hint")]
      .some((element) => element.textContent === "trimesh · 100 vertices · 92 triangles"),
    { timeout: SMOKE_TIMEOUT },
  );
  out.editorFinalHint = await page.evaluate(() => [...document.querySelectorAll(".gx-ed-hint")]
    .find((element) => /vertices/.test(element.textContent ?? ""))?.textContent ?? null);

  out.dynamicTrimesh = await page.evaluate(() => {
    const result = window.__GRAPHYSX__.spawn({
      id: "forbidden-moving-trimesh",
      type: "model",
      asset: { id: "archive-slide-large", fitSize: 3 },
      transform: { position: [0, 14, 0] },
      physics: { mode: "dynamic", mass: 1, collider: "trimesh" },
    });
    return { ok: result.ok, error: result.error ?? null };
  });

  out.convexSpawn = await page.evaluate(async () => {
    const result = await window.__GRAPHYSX_AGENT_BRIDGE__.call("spawn", {
      id: "moving-convex-model",
      type: "model",
      asset: { id: "archive-slide-large", fitSize: 3 },
      transform: { position: [0, 14, 0], scale: [0.75, 0.75, 0.75] },
      physics: { mode: "dynamic", mass: 1, material: "default" },
    });
    return { ok: result.ok, error: result.error ?? null };
  });
  await page.waitForFunction(
    () => {
      const model = window.__GRAPHYSX__.query({ ids: ["moving-convex-model"] })[0];
      return model?.asset?.status === "ready" && model?.physics?.collider?.effective === "auto";
    },
    { timeout: SMOKE_TIMEOUT },
  );
  out.convexPromote = await page.evaluate(async () => {
    const result = await window.__GRAPHYSX_AGENT_BRIDGE__.call("update", "moving-convex-model", {
      physics: { collider: "convex-hull" },
    });
    return { ok: result.ok, error: result.error ?? null };
  });
  await page.waitForFunction(
    () => window.__GRAPHYSX__.query({ ids: ["moving-convex-model"] })[0]?.physics?.collider?.effective === "convex-hull",
    { timeout: SMOKE_TIMEOUT },
  );
  out.convexMotion = await page.evaluate(() => {
    const api = window.__GRAPHYSX__;
    const before = api.query({ ids: ["moving-convex-model"] })[0];
    for (let frame = 0; frame < 60; frame += 1) api.step(1 / 60);
    const after = api.query({ ids: ["moving-convex-model"] })[0];
    return {
      beforeY: before?.position[1] ?? null,
      afterY: after?.position[1] ?? null,
      collider: after?.physics?.collider ?? null,
      finite: after?.position.every(Number.isFinite) ?? false,
    };
  });

  await page.screenshot({ path: path.join(ART, "mesh-colliders-great-slide.png") });
} catch (error) {
  out.fatal = String(error);
}

out.badResponses = badResponses;
out.consoleErrors = consoleErrors.filter((text) => !/localhost:8788|ERR_CONNECTION_REFUSED/.test(text));
out.pageErrors = pageErrors;
console.log(JSON.stringify(out, null, 2));
await browser.close();
if (server) await server.close();

const slideStatsOk = (value) =>
  value?.collider?.requested === "trimesh" &&
  value.collider.effective === "trimesh" &&
  value.collider.vertexCount === 100 &&
  value.collider.triangleCount === 92;
const motionOk =
  Array.isArray(out.motion?.before) &&
  Array.isArray(out.motion?.after) &&
  out.motion.after.every(Number.isFinite) &&
  out.motion.after[0] < out.motion.before[0] - 4 &&
  out.motion.after[1] < out.motion.before[1] - 2 &&
  // Free fall reaches the catch basin near y=-8. The ball remaining above the lower slide
  // surface for every observed frame proves it actually contacted the exact mesh.
  out.motion.minimumY > 1.5;
const trimeshRejected =
  out.dynamicTrimesh?.ok === false &&
  /static/i.test(out.dynamicTrimesh?.error ?? "") &&
  /convex/i.test(out.dynamicTrimesh?.error ?? "");
const convexOk =
  out.convexSpawn?.ok === true &&
  out.convexPromote?.ok === true &&
  out.convexMotion?.finite === true &&
  out.convexMotion.afterY < out.convexMotion.beforeY - 1 &&
  out.convexMotion.collider?.effective === "convex-hull" &&
  out.convexMotion.collider?.vertexCount === 100;
const editorOk =
  out.editor?.initial === "trimesh" &&
  JSON.stringify(out.editor?.options) === JSON.stringify(["auto", "convex-hull", "trimesh"]) &&
  /100 vertices/.test(out.editor?.hint ?? "") &&
  out.editorFinalHint === "trimesh · 100 vertices · 92 triangles";
const ok =
  out.loaded?.listed === true && out.loaded?.ok === true &&
  slideStatsOk(out.motion) && motionOk &&
  out.roundTrip?.authoredCollider === "trimesh" && out.roundTrip?.ok === true &&
  slideStatsOk(out.reloaded) && editorOk && trimeshRejected && convexOk &&
  out.badResponses.length === 0 && out.consoleErrors.length === 0 && out.pageErrors.length === 0;

process.exit(out.fatal || !ok ? 1 : 0);
