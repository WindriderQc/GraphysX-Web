// Opens a scene document in a real headless browser and photographs it.
//
// Porting a world is not done when the JSON validates — it is done when the thing looks
// right. This drives the built app the way a visitor would, waits for async model loads to
// settle, and writes a picture, so a port can be judged rather than assumed. It also
// reports what failed to load, which is how you find placements referencing assets that do
// not exist.
//
//   node scripts/shoot-scene.mjs scenes/dominus-village.json
//   node scripts/shoot-scene.mjs scenes/dominus-village.json --camera 46,30,62 --target 0,0,0
//   node scripts/shoot-scene.mjs scenes/dominus-village.json --out output/scenes
//
// Requires a build in dist/ (npm run build).

import { chromium } from "playwright";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startSceneStore } from "../server/scene-store.mjs";
import { putScene } from "../tools/graphysx-scene-agent.mjs";
import { startStaticServer } from "./static-server.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const flags = {};
  const positional = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index].startsWith("--")) flags[argv[index].slice(2)] = argv[++index];
    else positional.push(argv[index]);
  }
  return { flags, positional };
}

const vector = (value, fallback) => {
  if (!value) return fallback;
  const parts = value.split(",").map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) throw new Error(`Bad vector: ${value}`);
  return parts;
};

const { flags, positional } = parseArgs(process.argv.slice(2));
const scenePath = positional[0];
if (!scenePath) {
  console.error("usage: node scripts/shoot-scene.mjs <scene.json> [--camera x,y,z] [--target x,y,z] [--out dir]");
  process.exit(1);
}

const definition = JSON.parse(await readFile(path.resolve(ROOT, scenePath), "utf8"));
const scene = definition.definition ?? definition;
const name = scene.id;
const outDir = path.resolve(ROOT, flags.out ?? "output/scenes");
await mkdir(outDir, { recursive: true });

const storeDir = await mkdtemp(path.join(tmpdir(), "graphysx-shoot-"));
const store = await startSceneStore({ port: 0, dir: storeDir });
const site = await startStaticServer({ root: path.join(ROOT, "dist"), port: 0 });
await putScene(store.url, name, scene, undefined, { actor: "shoot-scene", intent: "opened for a photograph" });

const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
page.on("pageerror", (error) => errors.push(String(error)));

const report = { scene: name, entities: scene.entities.length };
try {
  await page.goto(`${site.url}?scene=${name}&store=${encodeURIComponent(store.url)}`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForFunction(() => !!window.__GRAPHYSX_HOST__, { timeout: 20000 });
  await page.waitForFunction(
    (id) => window.__GRAPHYSX__.state()?.world.id === id,
    name,
    { timeout: 30000 },
  );

  // Models stream in after the document loads. Waiting on the condition rather than a fixed
  // duration keeps this honest on a slow machine and quick on a fast one.
  await page
    .waitForFunction(
      () => {
        const models = window.__GRAPHYSX__.state().entities.filter((entity) => entity.type === "model");
        return models.length === 0 || models.every((model) => model.asset?.status !== "loading");
      },
      null,
      { timeout: 90000 },
    )
    .catch(() => {});

  Object.assign(report, await page.evaluate(() => {
    const state = window.__GRAPHYSX__.state();
    const models = state.entities.filter((entity) => entity.type === "model");
    return {
      loaded: state.entities.length,
      models: models.length,
      ready: models.filter((model) => model.asset?.status === "ready").length,
      failed: models.filter((model) => model.asset?.status === "error").map((model) => `${model.id}: ${model.asset.error}`),
      bounds: state.bounds,
    };
  }));

  const camera = vector(flags.camera, null);
  if (camera) {
    const target = vector(flags.target, [0, 0, 0]);
    await page.evaluate(({ camera: position, target: look }) => {
      const host = window.__GRAPHYSX_HOST__;
      host.camera.position.set(...position);
      host.camera.lookAt(...look);
    }, { camera, target });
    await page.waitForTimeout(1000);
  } else {
    await page.waitForTimeout(1500);
  }

  const shot = path.join(outDir, `${name}.png`);
  await page.screenshot({ path: shot });
  report.screenshot = shot;
} catch (error) {
  report.fatal = String(error);
} finally {
  await browser.close();
  await site.close();
  await store.close();
  await rm(storeDir, { recursive: true, force: true });
}

report.errors = errors.slice(0, 8);
console.log(JSON.stringify(report, null, 2));
process.exit(report.fatal || report.failed?.length ? 1 : 0);
