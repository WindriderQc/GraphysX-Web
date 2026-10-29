import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "vite";
import { applySmokeTimeout, launchSmokeBrowser } from "./smoke-harness.mjs";
import { startStaticServer } from "./static-server.mjs";
import { startWorldServer } from "../world-service/server.mjs";
import { loadRecording, startReplayServer } from "../world-service/replay.mjs";
import { startImageSidecar } from "../world-service/image-sidecar.mjs";
import { pngSize } from "../world-service/image.mjs";

// L'île from a GraphysX world service (`world-service/`), model-free: a real Mesa island with
// an agent "Eko" driven over the Clawblox HTTP protocol, recorded.
//
// 1. Live: `?app=island&embed=1&source=<world>&agent=Eko` (the Benchmark Île tab contract)
//    detects the world service, loads its document as one transient scope with physics paused,
//    draws frames between server frames, follows Eko, adds the rock-impact cubes and lists
//    each action with its result.
// 2. GET /observe/image through the image sidecar: PNGs of the requested size, not blank.
// 3. Replay of the recording (world-service/replay.mjs): transport, auto-start, seek, actions.
const artifacts = process.env.SMOKE_ARTIFACTS || "output/verify";
mkdirSync(artifacts, { recursive: true });
const server = process.env.SMOKE_BASE ? null : await startStaticServer({ root: path.resolve("dist"), port: 0 });
const base = (process.env.SMOKE_BASE || server.url).replace(/\/+$/, "");
const browser = await launchSmokeBrowser();
const app = () => (typeof window.render_game_to_text === "function" ? JSON.parse(window.render_game_to_text()).application : null);
const appState = (page) => page.evaluate(`(${app})()`);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---- the world: bundled like `npm run build:world-service`, into a temporary directory -------
const scratch = mkdtempSync(path.join(tmpdir(), "graphysx-smoke-island-world-"));
await build({ configFile: path.resolve("vite.world-service.config.ts"), root: path.resolve("."), build: { outDir: path.join(scratch, "dist"), emptyOutDir: true }, logLevel: "silent" });
const module = await import(pathToFileURL(path.join(scratch, "dist", "world.js")).href);
const sidecar = await startImageSidecar({ viewer: base, launch: () => launchSmokeBrowser() });
let world = null;
world = await startWorldServer({
  module,
  apiMarkdown: readFileSync("world-service/API.md", "utf8"),
  port: 0,
  recordDir: path.join(scratch, "rec"),
  renderImage: async (request) => {
    const response = await fetch(`${sidecar.url}/render`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ source: world.url, ...request }) });
    if (!response.ok) throw new Error((await response.json()).error);
    return Buffer.from(await response.arrayBuffer());
  },
});

const call = async (method, route, body, session) => {
  const response = await fetch(`${world.url}${route}`, { method, headers: { "content-type": "application/json", ...(session ? { "x-session": session } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return response.json();
};
const { session } = await call("POST", "/join?name=Eko");
const observe = () => call("GET", "/observe", null, session);
const act = async (type, data) => (await call("POST", "/input", { type, data }, session)).player.attributes.LastActionResult;
const find = (observation, name) => observation.world.entities.find((item) => item.name === name);
const arrive = async (target) => {
  for (let i = 0; i < 60; i += 1) {
    await sleep(150);
    const position = (await observe()).player.position;
    if (Math.hypot(position[0] - target[0], position[2] - target[2]) < 0.8) return;
  }
  throw new Error(`Eko did not reach ${target}`);
};
const walk = async (target) => { await act("MoveTo", { position: target }); await arrive(target); };

async function open(viewport, source, options = {}) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  applySmokeTimeout(page);
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => { if (message.type() === "error" && !/ERR_CONNECTION|net::ERR_ABORTED|EventSource/.test(message.text())) errors.push(message.text()); });
  await page.goto(`${base}/?app=island&embed=1&source=${encodeURIComponent(source)}${options.agent ? `&agent=${options.agent}` : ""}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { level: 1, name: /L.île/ }).waitFor();
  return { page, errors };
}

/** Mean and spread of a PNG's pixels, decoded by the browser: a blank frame has no spread. */
async function pixelStats(page, png) {
  return page.evaluate(async (b64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${b64}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0);
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    let sum = 0, sumSq = 0;
    const colors = new Set();
    for (let i = 0; i < data.length; i += 4) {
      const luma = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      sum += luma; sumSq += luma * luma;
      if (i % 64 === 0) colors.add((data[i] >> 3) << 10 | (data[i + 1] >> 3) << 5 | (data[i + 2] >> 3));
    }
    const n = data.length / 4;
    const mean = sum / n;
    return { width: image.width, height: image.height, mean, deviation: Math.sqrt(Math.max(0, sumSq / n - mean * mean)), colors: colors.size };
  }, png.toString("base64"));
}

try {
  // ---- 1. live ------------------------------------------------------------------------------
  const live = await open({ width: 1440, height: 900 }, world.url, { agent: "Eko" });
  const { page } = live;
  await page.waitForFunction(`(${app})()?.feed === "graphysx" && (${app})().mode === "live" && (${app})().world?.frames > 3 && (${app})().agent?.position !== null`);
  const first = await appState(page);
  assert.equal(first.reconcileError, null);
  assert.equal(first.connected, true);
  assert.equal(first.world.label, "Mesa island");
  assert.deepEqual(first.world.agents, ["Eko"]);
  assert.equal(first.world.followed, "Eko");
  assert.equal(first.agent.title, "d'Eko");
  assert.equal(first.kinds.agent, 1, "the avatar is an ordinary agent entity of the document");
  // 2 lights, ocean, 5 ground slabs, 4 invisible walls, 11 mesas, 12 blocks, rock, ring, Eko;
  // the 12 blocks, the rock, the ring and Eko move.
  assert.deepEqual([first.parts, first.moving], [38, 15], "the whole Mesa island and its moving things");
  const scene = await page.evaluate(() => {
    const api = window.__GRAPHYSX__;
    return {
      parts: api.query({ tag: "world-part" }).length,
      authored: api.exportDocument().entities?.length ?? 0,
      paused: api.state().paused,
      walls: api.query({ tag: "world-part" }).filter((entity) => /^Boundary/.test(entity.label ?? "")).map((entity) => entity.visible),
      sky: api.state().environment?.sky ?? null,
    };
  });
  assert.equal(scene.parts, first.parts, "every streamed entity is in the transient scope");
  assert.equal(scene.authored, 0, "streamed entities are transport state, never authored document");
  assert.equal(scene.paused, true, "local physics is paused: the server is the only truth");
  assert.deepEqual(scene.walls, [false, false, false, false], "Clawblox's invisible walls stay invisible");
  assert.equal(scene.sky, "clearblue", "the document says nothing about the sky; the island look fills it in");
  assert.equal(await page.locator(".gx-island-eyebrow").textContent(), "AgentX · Île · GraphysX");
  assert.equal(await page.locator('[data-action="follow"]').getAttribute("aria-pressed"), "true");
  assert.equal(await page.locator(".gx-island-header button:visible").count(), 0, "embedded: no exit button");

  // Eko works: pick up a block and place it, then throw the rock so it bursts into cubes.
  let observation = await observe();
  const block = find(observation, "Block_1").position;
  await walk([block[0] - 2.5, 2.5, block[2]]);
  assert.equal(await act("Pickup", { position: find(await observe(), "Block_1").position }), "PickupSuccess");
  // While Eko carries the block across (~28 studs at 16 studs/s), the viewer draws it moving.
  // Software WebGL renders a frame every few hundred ms here, so only a few poses are seen.
  const carryTo = [block[0] - 28, 2.5, block[2] + 6];
  await act("MoveTo", { position: carryTo });
  const seen = new Set();
  for (let i = 0; i < 10; i += 1) {
    const s = await appState(page);
    if (s.agent.position) seen.add(s.agent.position.join(","));
    await sleep(150);
  }
  assert.ok(seen.size >= 3, `Eko drawn moving (${seen.size} distinct poses in 10 samples)`);
  await arrive(carryTo);
  const at = (await observe()).player.position;
  assert.equal(await act("Place", { position: [at[0] + 2, 0.375, at[2]], rotation: { yaw: 30 } }), "PlaceSuccess");
  observation = await observe();
  const rock = find(observation, "Rock_1").position;
  await walk([rock[0], 2.5, 22.8]);
  assert.equal(await act("Pickup", { position: rock }), "PickupSuccess");
  await sleep(600);
  assert.equal(await act("Throw", { direction: [0, 0, -1], speed: 10 }), "ThrowSuccess");
  await page.waitForFunction(`(${app})()?.world?.actions >= 6 && (${app})().kinds.box > ${first.kinds.box}`, null, { timeout: 15000 });
  const after = await appState(page);
  const cubes = (await observe()).world.entities.filter((item) => item.name.startsWith("ImpactBlock_")).length;
  assert.ok(cubes >= 1, "the rock burst on the server");
  assert.equal(after.kinds.box - first.kinds.box, cubes, "each rock-impact cube appears in the viewer");
  assert.equal(after.resets, 0);
  const lines = await page.locator(".gx-island-messages li").allTextContents();
  assert.ok(lines.some((text) => /^Pickup \(.*\) → PickupSuccess$/.test(text)), `actions with their result (${lines.join(" | ")})`);
  assert.ok(lines.some((text) => /^Throw .* → ThrowSuccess$/.test(text)));
  assert.ok(lines.some((text) => /^MoveTo \([^)]*\)$/.test(text)), "a move shows no stale result");
  await page.waitForFunction(`(${app})()?.camera?.pivotToAgent < 2 && (${app})().camera.distanceToAgent < 60`);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${artifacts}/island-world-live.png` });
  assert.deepEqual(live.errors, []);

  // Phone: the Île tab on a narrow screen.
  const phone = await open({ width: 375, height: 812 }, world.url, { agent: "Eko" });
  await phone.page.waitForFunction(`(${app})()?.feed === "graphysx" && (${app})().world?.frames > 3`);
  const layout = await phone.page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth, open: document.querySelector(".gx-island-panel details")?.open ?? null }));
  assert.ok(layout.scrollWidth <= layout.innerWidth, "no horizontal page scroll");
  assert.equal(layout.open, false, "the panel starts folded on a phone");
  await phone.page.waitForTimeout(1500);
  await phone.page.screenshot({ path: `${artifacts}/island-world-phone.png` });
  assert.deepEqual(phone.errors, []);
  await phone.page.close();

  // ---- 2. first-person images ----------------------------------------------------------------
  const timings = [];
  let started = performance.now();
  let response = await fetch(`${world.url}/observe/image`, { headers: { "x-session": session } });
  timings.push(performance.now() - started);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/png");
  const png = Buffer.from(await response.arrayBuffer());
  writeFileSync(`${artifacts}/island-world-eko-view.png`, png);
  assert.deepEqual(pngSize(png), { width: 1088, height: 640 });
  const stats = await pixelStats(page, png);
  assert.deepEqual([stats.width, stats.height], [1088, 640]);
  assert.ok(stats.deviation > 12 && stats.colors > 40, `not blank (luma deviation ${stats.deviation.toFixed(1)}, ${stats.colors} colours)`);
  for (let i = 0; i < 2; i += 1) {
    started = performance.now();
    response = await fetch(`${world.url}/observe/image?width=320&height=180`, { headers: { "x-session": session } });
    timings.push(performance.now() - started);
    assert.equal(response.status, 200);
  }
  const small = Buffer.from(await response.arrayBuffer());
  assert.deepEqual(pngSize(small), { width: 320, height: 180 });
  assert.ok((await pixelStats(page, small)).deviation > 12);
  const health = await (await fetch(`${sidecar.url}/healthz`)).json();
  assert.equal(health.renders, 3);
  assert.equal(health.failures, 0);
  console.log(`observe/image: ${timings.map((ms) => `${Math.round(ms)} ms`).join(", ")} (first one starts the page)`);
  await page.close();

  // ---- 3. replay of the recording ------------------------------------------------------------
  await world.close();
  world = null;
  const recording = loadRecording(path.join(scratch, "rec"));
  assert.ok(recording.actions.length >= 6 && recording.changes.length >= 2, "the recording holds the join, the burst and every action");
  const replay = await startReplayServer({ recording, port: 0 });
  try {
    const watched = await open({ width: 1440, height: 900 }, replay.url, { agent: "Eko" });
    const r = watched.page;
    await r.waitForFunction(`(${app})()?.feed === "graphysx" && (${app})().mode === "replay" && (${app})().replay && (${app})().autoStarted && (${app})().replay.paused === false && (${app})().messageLog > 0`);
    let state = await appState(r);
    assert.equal(state.messageLog, recording.actions.length, "the whole action log is loaded");
    assert.equal(state.replay.paused, false, "an embedded replay starts itself");
    assert.ok(state.replay.current_tick >= recording.actions[0].tick - 60, "skip-idle jumped to just before the first action");
    assert.equal(await r.locator("[data-transport]").isVisible(), true);
    // Pause, seek past the burst, and the cubes are there in a fresh hello.
    await r.locator('[data-action="toggle"]').click();
    await r.waitForFunction(`(${app})()?.replay?.paused === true`);
    const burst = recording.changes.find((change) => change.added?.some((item) => /^impactblock/i.test(item.entity.id)));
    await r.locator("[data-seek]").evaluate((input, tick) => { input.value = String(tick); input.dispatchEvent(new Event("change")); }, burst.tick + 30);
    await r.waitForFunction(`(${app})()?.replay?.current_tick === ${burst.tick + 30} && (${app})().kinds.box >= ${after.kinds.box}`);
    state = await appState(r);
    assert.equal(state.kinds.box, after.kinds.box, "the document at the seek tick has the cubes");
    const shown = await r.locator(".gx-island-messages li").allTextContents();
    assert.ok(shown.some((text) => /Throw .* → ThrowSuccess/.test(text)), "actions up to the seek tick are listed");
    await r.waitForFunction(`(${app})()?.camera?.pivotToAgent < 2`);
    await r.waitForTimeout(500);
    await r.screenshot({ path: `${artifacts}/island-world-replay.png` });
    assert.deepEqual(watched.errors, []);
  } finally {
    await replay.close();
  }
  console.log("island-world: live, images and replay OK");
} finally {
  await world?.close();
  await sidecar.close();
  await browser.close();
  server?.close?.();
  rmSync(scratch, { recursive: true, force: true });
}
