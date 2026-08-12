import { mkdirSync } from "node:fs";
import path from "node:path";
import { SMOKE_TIMEOUT, applySmokeTimeout, launchSmokeBrowser } from "./smoke-harness.mjs";

// Suzanne 1 composed scene: the skipped record revived. Asserts the archive counts landed
// (208 dynamic walls, 45 chains, 15 rings, 3 pistons), that a piston plate actually MOVES
// under deterministic stepping along its archived axis, that the ball rests and a ring
// collects, and that the run completes through the LINE gates over the archived 3 laps.
// All physics via pause + fixed step, never wall-clock.

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
  await page.waitForFunction(() => !!window.__GRAPHYSX__ && !!window.__GRAPHYSX_HOST__, null, { timeout: SMOKE_TIMEOUT });

  // Compose through the discoverable archive global, the spiral smoke's own pattern.
  await page.waitForFunction(() => !!window.__GRAPHYSX_CONTENT__, null, { timeout: SMOKE_TIMEOUT });
  out.composed = await page.evaluate(async () => {
    const created = await window.__GRAPHYSX_CONTENT__.composeSuzanne1();
    return created.ok ? { ok: true } : { composeError: created.error };
  });
  await page.waitForFunction(() => window.__GRAPHYSX__.query({ tag: "suzanne1" }).length > 300, null, { timeout: SMOKE_TIMEOUT });

  out.census = await page.evaluate(() => {
    const api = window.__GRAPHYSX__;
    const all = api.query({ tag: "suzanne1" });
    const walls = all.filter((entity) => entity.id.startsWith("suzanne1-wall-"));
    const plates = all.filter((entity) => entity.id.endsWith("-plate"));
    return {
      walls: walls.length,
      wallsDynamic: walls.filter((entity) => entity.physics?.mode === "dynamic").length,
      rings: all.filter((entity) => entity.tags.includes("collectible")).length,
      chains: all.filter((entity) => entity.tags.includes("chain")).length,
      plates: plates.length,
      platesKinematic: plates.filter((entity) => entity.physics?.mode === "kinematic").length,
      gates: all.filter((entity) => entity.tags.includes("gate")).length,
      posts: all.filter((entity) => entity.tags.includes("post")).length,
      hasBall: all.some((entity) => entity.id === "suzanne1-ball"),
      laps: api.rules.get()?.laps ?? 0,
      collectibleCount: api.rules.status()?.collectibleCount ?? 0,
    };
  });

  // A piston plate must MOVE, deterministically, along its archived axis. Piston "0" is
  // yaw 270 → travel along +Z only.
  out.piston = await page.evaluate(() => {
    const api = window.__GRAPHYSX__;
    api.pause(true);
    const before = api.query({ ids: ["suzanne1-piston-0-plate"] })[0]?.position;
    for (let i = 0; i < 120; i += 1) api.step(1 / 60);
    const after = api.query({ ids: ["suzanne1-piston-0-plate"] })[0]?.position;
    return {
      before,
      after,
      movedZ: Math.abs(after[2] - before[2]),
      driftX: Math.abs(after[0] - before[0]),
      driftY: Math.abs(after[1] - before[1]),
    };
  });

  // Rest, one ring, and the full 3-lap completion through the line gates — the
  // teleport-driven pattern the archive-levels smoke established.
  out.run = await page.evaluate(() => {
    const api = window.__GRAPHYSX__;
    const settle = (n) => { for (let i = 0; i < n; i += 1) api.step(1 / 60); };
    const teleport = (position) => {
      const ball = api.query({ ids: ["suzanne1-ball"] })[0];
      api.update("suzanne1-ball", {
        transform: { position },
        physics: { mode: ball.physics.mode, mass: ball.physics.mass, material: ball.physics.material, linearVelocity: [0, 0, 0] },
      });
      settle(14);
    };
    settle(90);
    const ball = api.query({ ids: ["suzanne1-ball"] })[0];
    const restY = ball.position[1];
    for (const ring of api.query({ tag: "collectible" })) teleport(ring.position);
    const afterRings = api.rules.status();
    const half = api.query({ ids: ["suzanne1-half-gate"] })[0];
    const finish = api.query({ ids: ["suzanne1-finish-gate"] })[0];
    for (let lap = 0; lap < (api.rules.get()?.laps ?? 1); lap += 1) {
      teleport(half.position);
      teleport(finish.position);
      settle(30);
    }
    const final = api.rules.status();
    return {
      restY: Number(restY.toFixed(3)),
      ringsCollected: afterRings?.collected.length ?? 0,
      ringsHidden: api.query({ tag: "collectible" }).filter((ring) => ring.visible === false).length,
      phase: final?.phase,
      lap: final?.lap,
    };
  });

  // Round trip: a composed revived arena is an ordinary scene.
  out.roundTrip = await page.evaluate(() => {
    const api = window.__GRAPHYSX__;
    const doc = api.export();
    const before = doc.entities.length;
    const loaded = api.load(doc);
    return {
      before,
      after: api.state()?.entities.length ?? 0,
      ok: loaded.ok,
      lapsSurvived: api.rules.get()?.laps ?? 0,
    };
  });

  await page.evaluate(() => { window.__GRAPHYSX_HOST__.setMode("play"); });
  await page.waitForFunction(() => window.__GRAPHYSX__.query({ ids: ["suzanne1-ball-shell"] })[0]?.asset?.status === "ready", null, { timeout: SMOKE_TIMEOUT });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(ART, "suzanne1-arena.png") });
} catch (error) {
  out.fatal = String(error);
}

out.consoleErrors = consoleErrors;
out.pageErrors = pageErrors;
await browser.close();

const pass =
  !out.fatal &&
  out.census?.walls === 208 &&
  out.census?.wallsDynamic === 208 &&
  out.census?.rings === 15 &&
  out.census?.chains === 135 &&
  out.census?.plates === 3 &&
  out.census?.platesKinematic === 3 &&
  out.census?.gates === 2 &&
  out.census?.posts === 4 &&
  out.census?.hasBall === true &&
  out.census?.laps === 3 &&
  out.census?.collectibleCount === 15 &&
  out.piston?.movedZ > 0.3 &&
  out.piston?.driftX < 0.05 &&
  out.piston?.driftY < 0.05 &&
  out.run?.restY < 1.4 &&
  out.run?.ringsCollected === 15 &&
  out.run?.ringsHidden === 15 &&
  out.run?.phase === "complete" &&
  out.roundTrip?.ok === true &&
  out.roundTrip?.before === out.roundTrip?.after &&
  out.roundTrip?.lapsSurvived === 3 &&
  out.pageErrors.length === 0;

console.log(JSON.stringify(out, null, 2));
console.log(pass ? "SMOKE PASS" : "SMOKE FAIL");
process.exit(pass ? 0 : 1);
