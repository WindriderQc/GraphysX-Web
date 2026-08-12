import { mkdirSync } from "node:fs";
import path from "node:path";
import { SMOKE_TIMEOUT, applySmokeTimeout, launchSmokeBrowser } from "./smoke-harness.mjs";

// Suzanne 2 composed game: assert the exact archive census, source-shaped any-two rule,
// moving piston, vendored XML meshes, ordinary scene round-trip and player-visible render.
// Physics is advanced only with pause + fixed step.

const BASE = process.env.SMOKE_BASE || "http://127.0.0.1:4188/";
const ART = process.env.SMOKE_ARTIFACTS || "output/smoke";
mkdirSync(ART, { recursive: true });

const browser = await launchSmokeBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
applySmokeTimeout(page);
const consoleErrors = [];
const pageErrors = [];
page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
page.on("pageerror", (error) => pageErrors.push(String(error)));
const out = {};

try {
  await page.goto(`${BASE}?host=standalone`, { waitUntil: "load" });
  await page.waitForFunction(() => !!window.__GRAPHYSX__ && !!window.__GRAPHYSX_HOST__ && !!window.__GRAPHYSX_CONTENT__, null, { timeout: SMOKE_TIMEOUT });
  out.composed = await page.evaluate(async () => {
    const result = await window.__GRAPHYSX_CONTENT__.composeSuzanne2();
    return { ok: result.ok, error: result.error ?? null, provenance: result.provenance ?? null };
  });
  await page.waitForFunction(() => window.__GRAPHYSX__.query({ tag: "suzanne2" }).length > 360, null, { timeout: SMOKE_TIMEOUT });

  out.census = await page.evaluate(() => {
    const api = window.__GRAPHYSX__;
    const all = api.query({ tag: "suzanne2" });
    const walls = all.filter((entity) => entity.tags.includes("wall"));
    const run = api.rules.status();
    const catalog = api.assets();
    return {
      total: all.length,
      walls: walls.length,
      dynamicWalls: walls.filter((entity) => entity.physics?.mode === "dynamic").length,
      rings: all.filter((entity) => entity.tags.includes("collectible")).length,
      chains: all.filter((entity) => entity.tags.includes("chain")).length,
      plates: all.filter((entity) => entity.tags.includes("mover")).length,
      sourceTriggers: all.filter((entity) => entity.tags.includes("source-trigger")).length,
      gates: all.filter((entity) => entity.tags.includes("gate")).length,
      posts: all.filter((entity) => entity.tags.includes("post")).length,
      recoveredMeshes: all.filter((entity) => entity.tags.includes("recovered-mesh")).length,
      xmlObjects: all.filter((entity) => entity.tags.includes("xml-object")).length,
      inventory: run?.collectibleCount,
      target: run?.collectibleTarget,
      hasRotatorsVendored: ["archive-suzanne-rotator", "archive-suzanne-rotator-cube"].every((id) => catalog.some((asset) => asset.id === id)),
      hasSuzanne2Assets: ["archive-suzanne2-airplane", "archive-suzanne2-boned-gate", "archive-suzanne2-super-cage"].every((id) => catalog.some((asset) => asset.id === id)),
    };
  });

  out.piston = await page.evaluate(() => {
    const api = window.__GRAPHYSX__;
    api.pause(true);
    const before = api.query({ ids: ["suzanne2-piston-0-plate"] })[0].position;
    for (let index = 0; index < 120; index += 1) api.step(1 / 60);
    const after = api.query({ ids: ["suzanne2-piston-0-plate"] })[0].position;
    return { moved: Math.hypot(after[0] - before[0], after[1] - before[1], after[2] - before[2]) };
  });

  out.rule = await page.evaluate(() => {
    const api = window.__GRAPHYSX__;
    const teleport = (position) => {
      const ball = api.query({ ids: ["suzanne2-ball"] })[0];
      api.update("suzanne2-ball", {
        transform: { position },
        physics: { mode: ball.physics.mode, mass: ball.physics.mass, material: ball.physics.material, linearVelocity: [0, 0, 0] },
      });
      for (let index = 0; index < 14; index += 1) api.step(1 / 60);
    };
    const rings = api.query({ tag: "collectible" });
    teleport(rings[0].position);
    const afterOne = api.rules.status();
    teleport(rings[14].position); // prove any two, not an adjacent privileged pair
    const afterTwo = api.rules.status();
    return {
      afterOne: { phase: afterOne.phase, collected: afterOne.collected.length },
      afterTwo: { phase: afterTwo.phase, collected: afterTwo.collected.length, inventory: afterTwo.collectibleCount, target: afterTwo.collectibleTarget },
      hidden: rings.filter((ring) => api.query({ ids: [ring.id] })[0]?.visible === false).length,
    };
  });

  out.roundTrip = await page.evaluate(() => {
    const api = window.__GRAPHYSX__;
    const document_ = api.exportDocument();
    const before = document_.entities.length;
    const loaded = api.load(document_);
    const run = api.rules.status();
    return { ok: loaded.ok, before, after: api.state().entities.length, target: run?.collectibleTarget, inventory: run?.collectibleCount };
  });

  await page.evaluate(() => window.__GRAPHYSX_HOST__.setMode("play"));
  await page.waitForFunction(() => ["suzanne2-super-cage", "suzanne2-airplane", "suzanne2-boned-gate"].every((id) => window.__GRAPHYSX__.query({ ids: [id] })[0]?.asset?.status === "ready"), null, { timeout: SMOKE_TIMEOUT * 2 });
  // Keep the game HUD but disable the close chase for this fidelity capture: the archive
  // camera is a fixed map-centre overlook, and the whole 40×40 composition must be visible.
  await page.evaluate(() => {
    const host = window.__GRAPHYSX_HOST__;
    host.chaseTargetId = null;
    host.camera.position.set(-76, 66, 94);
    host.orbitTarget.set(0, 0.6, 0);
    host.camera.lookAt(host.orbitTarget);
  });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(ART, "suzanne2-arena.png") });
} catch (error) {
  out.fatal = String(error);
}

out.consoleErrors = consoleErrors;
out.pageErrors = pageErrors;
await browser.close();

const pass =
  !out.fatal &&
  out.composed?.ok === true &&
  out.census?.walls === 315 && out.census?.dynamicWalls === 315 &&
  out.census?.rings === 15 && out.census?.chains === 9 &&
  out.census?.plates === 3 && out.census?.sourceTriggers === 3 &&
  out.census?.gates === 2 && out.census?.posts === 4 &&
  out.census?.recoveredMeshes === 3 && out.census?.xmlObjects === 3 &&
  out.census?.inventory === 15 && out.census?.target === 2 &&
  out.census?.hasRotatorsVendored === true && out.census?.hasSuzanne2Assets === true &&
  out.piston?.moved > 0.3 &&
  out.rule?.afterOne?.phase === "running" && out.rule?.afterOne?.collected === 1 &&
  out.rule?.afterTwo?.phase === "complete" && out.rule?.afterTwo?.collected === 2 &&
  out.rule?.afterTwo?.inventory === 15 && out.rule?.afterTwo?.target === 2 && out.rule?.hidden === 2 &&
  out.roundTrip?.ok === true && out.roundTrip?.before === out.roundTrip?.after &&
  out.roundTrip?.inventory === 15 && out.roundTrip?.target === 2 &&
  out.pageErrors.length === 0;

console.log(JSON.stringify(out, null, 2));
console.log(pass ? "SMOKE PASS" : "SMOKE FAIL");
process.exit(pass ? 0 : 1);
