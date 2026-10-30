import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "vite";
import { applySmokeTimeout, launchSmokeBrowser } from "./smoke-harness.mjs";
import { startStaticServer } from "./static-server.mjs";
import { startWorldServer } from "../world-service/server.mjs";
import { startImageSidecar } from "../world-service/image-sidecar.mjs";
import { pngSize } from "../world-service/image.mjs";
import { runGardener } from "../world-service/gardener.mjs";

// The living island (`world-service --world living-island`, docs/LIVING_ISLAND.md), model-free:
// the scripted gardener gathers a seed, sows it and advances a generation over HTTP while the
// island viewer (`?app=island&embed=1&source=<world>&agent=Jardinier`, the Benchmark Île tab
// contract) watches.
//
// 1. The viewer draws the forest, the flock and the (invisible) wind from the hello document;
//    the birds move only because the server's frames move them (local simulation is paused).
// 2. The sown sapling appears, the advanced tree is rebuilt with its new generation, and the
//    actions are listed with their result.
// 3. Captures at 1440x900 (following the gardener, then the overview), the gardener's
//    first-person image through the image sidecar, then 375x812 (no horizontal scroll, panel
//    folded), one page at a time. No 4K page: on devX's software WebGL any world-service page
//    takes about 48 s to show its first frames at 3840x2160, with or without the forest
//    (measured 2026-10-29), so a 4K capture is taken by hand (docs/LIVING_ISLAND.md).
// 4. The operator's world selector (POST /world) swaps the island back to Mesa under the same
//    page, and the living island's recording carries the birds (`swarms`) in every frame.
const artifacts = process.env.SMOKE_ARTIFACTS || "output/verify";
mkdirSync(artifacts, { recursive: true });
const server = process.env.SMOKE_BASE ? null : await startStaticServer({ root: path.resolve("dist"), port: 0 });
const base = (process.env.SMOKE_BASE || server.url).replace(/\/+$/, "");
const browser = await launchSmokeBrowser();
const app = () => (typeof window.render_game_to_text === "function" ? JSON.parse(window.render_game_to_text()).application : null);
const appState = (page) => page.evaluate(`(${app})()`);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const scratch = mkdtempSync(path.join(tmpdir(), "graphysx-smoke-living-island-"));
await build({ configFile: path.resolve("vite.world-service.config.ts"), root: path.resolve("."), build: { outDir: path.join(scratch, "dist"), emptyOutDir: true }, logLevel: "silent" });
const module = await import(pathToFileURL(path.join(scratch, "dist", "world.js")).href);
const sidecar = await startImageSidecar({ viewer: base, launch: () => launchSmokeBrowser() });
let world = null;
world = await startWorldServer({
  module,
  world: module.LIVING_WORLD_ID,
  apiMarkdown: module.livingApiMarkdown(readFileSync("world-service/API.md", "utf8")),
  port: 0,
  operatorToken: "smoke-operator",
  recordDir: path.join(scratch, "rec"),
  renderImage: async (request) => {
    const response = await fetch(`${sidecar.url}/render`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ source: world.url, ...request }) });
    if (!response.ok) throw new Error((await response.json()).error);
    return Buffer.from(await response.arrayBuffer());
  },
});

async function open(viewport) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  applySmokeTimeout(page);
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => { if (message.type() === "error" && !/ERR_CONNECTION|net::ERR_ABORTED|EventSource/.test(message.text())) errors.push(message.text()); });
  await page.goto(`${base}/?app=island&embed=1&source=${encodeURIComponent(world.url)}&agent=Jardinier`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { level: 1, name: /L.île/ }).waitFor();
  await page.waitForFunction(`(${app})()?.feed === "graphysx" && (${app})().world?.frames > 3`);
  return { page, errors };
}

const living = (page) => page.evaluate(() => {
  const api = window.__GRAPHYSX__;
  const parts = api.query({ tag: "world-part" });
  const flock = parts.find((entity) => entity.id === "flock_1");
  return {
    paused: api.state().paused,
    trees: Object.fromEntries(parts.filter((entity) => entity.type === "dna-tree").map((entity) => [entity.label, entity.dna?.generation ?? null])),
    fields: parts.filter((entity) => entity.type === "force-field").map((entity) => entity.id),
    lead: flock?.flock?.leadPosition ?? null,
    birds: flock?.flock?.memberCount ?? 0,
  };
});

try {
  // ---- 1. the living island in the viewer ------------------------------------------------------
  const desk = await open({ width: 1440, height: 900 });
  const { page } = desk;
  const first = await appState(page);
  assert.equal(first.reconcileError, null);
  assert.equal(first.world.label, "Living island");
  assert.deepEqual([first.kinds["dna-tree"], first.kinds.flock, first.kinds["force-field"]], [5, 1, 6], "five founders, one flock, five perches and the wind");
  let scene = await living(page);
  assert.equal(scene.paused, true, "the viewer simulates nothing");
  assert.equal(scene.birds, 28);
  assert.ok(scene.fields.includes("wind_1"), "the wind is in the scene (invisible)");
  const leads = new Set();
  for (let i = 0; i < 8; i += 1) {
    leads.add(JSON.stringify((await living(page)).lead));
    await sleep(200);
  }
  assert.ok(leads.size >= 3, `the birds fly with the server's frames (${leads.size} distinct lead positions in 8 samples)`);

  // ---- 2. the gardener plays ---------------------------------------------------------------------
  const summary = await runGardener(world.url, { name: "Jardinier", taste: "bushy", log: (line) => console.log(`gardener: ${line}`) });
  const parent = summary.parent.name;
  const sapling = summary.sapling.name;
  await page.waitForFunction(`(${app})()?.kinds?.["dna-tree"] === 6 && (${app})().world.followed === "Jardinier"`, null, { timeout: 15000 });
  await page.waitForFunction((name) => window.__GRAPHYSX__.query({ tag: "world-part" }).find((entity) => entity.label === name)?.dna?.generation === 2, parent, { timeout: 15000 });
  scene = await living(page);
  assert.equal(scene.trees[parent], 2, `${parent} rebuilt with its next generation`);
  assert.equal(scene.trees[sapling], 1, `${sapling} appears`);
  assert.equal((await appState(page)).kinds["force-field"], 7, "the sapling brings its perch");
  const lines = await page.locator(".gx-island-messages li").allTextContents();
  for (const pattern of [/^GatherSeed \(.*\) → GatherSeedSuccess$/, /^Sow \(.*\) → SowSuccess$/, /^NextGeneration \(.*\) → NextGenerationSuccess$/]) {
    assert.ok(lines.some((text) => pattern.test(text)), `${pattern} in the panel (${lines.join(" | ")})`);
  }
  await page.waitForFunction(`(${app})()?.camera?.pivotToAgent < 2`);
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${artifacts}/living-island-desktop.png` });
  // The birds keep away from the followed agent, so the overview is where they show.
  await page.locator('[data-action="follow"]').click();
  await page.waitForFunction(`(${app})()?.world?.followed === "Jardinier" && document.querySelector('[data-action="follow"]').getAttribute("aria-pressed") === "false"`);
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${artifacts}/living-island-overview.png` });
  assert.deepEqual(desk.errors, []);
  await page.close();

  // The gardener's own eyes: what an agent would see through GET /observe/image.
  const response = await fetch(`${world.url}/observe/image`, { headers: { "x-session": summary.session } });
  assert.equal(response.status, 200);
  const png = Buffer.from(await response.arrayBuffer());
  assert.deepEqual(pngSize(png), { width: 1088, height: 640 });
  writeFileSync(`${artifacts}/living-island-eye.png`, png);

  // ---- 3. phone --------------------------------------------------------------------------------------
  const phone = await open({ width: 375, height: 812 });
  const layout = await phone.page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth, open: document.querySelector(".gx-island-panel details")?.open ?? null }));
  assert.ok(layout.scrollWidth <= layout.innerWidth, "no horizontal page scroll");
  assert.equal(layout.open, false, "the panel starts folded on a phone");
  await phone.page.waitForFunction(`(${app})()?.kinds?.["dna-tree"] === 6 && (${app})()?.camera?.pivotToAgent < 2`);
  await phone.page.waitForTimeout(1200);
  await phone.page.screenshot({ path: `${artifacts}/living-island-phone.png` });
  // The operator's world selector swaps the island in place: the same page follows.
  const switched = await fetch(`${world.url}/world`, { method: "POST", headers: { "content-type": "application/json", "x-operator-token": "smoke-operator" }, body: JSON.stringify({ world: "mesa-island", force: true }) });
  assert.equal(switched.status, 200);
  await phone.page.waitForFunction(`(${app})()?.world?.label === "Mesa island" && !(${app})().kinds["dna-tree"] && !(${app})().kinds.flock`, null, { timeout: 15000 });
  assert.equal((await appState(phone.page)).reconcileError, null);
  assert.deepEqual(phone.errors, []);
  await phone.page.close();


  // ---- 4. the recording keeps the birds ---------------------------------------------------------------
  await world.close();
  world = null;
  const frames = readFileSync(path.join(scratch, "rec", "graphysx-recording.ndjson"), "utf8").trim().split("\n").map((line) => JSON.parse(line)).filter((line) => line.kind === "frame");
  assert.ok(frames.length > 20 && frames.every((frame) => frame.swarms?.[0]?.length === 1 + 28 * 3), "every recorded frame carries all 28 birds");
  console.log(`living-island: forest, flock, gardener (${parent} → ${sapling}), overview, first-person view and phone OK`);
} finally {
  await world?.close();
  await sidecar.close();
  await browser.close();
  server?.close?.();
  rmSync(scratch, { recursive: true, force: true });
}
