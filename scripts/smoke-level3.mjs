import { mkdirSync } from "node:fs";
import path from "node:path";
import { SMOKE_TIMEOUT, applySmokeTimeout, launchSmokeBrowser } from "./smoke-harness.mjs";

// Archive Level 3 v2 composition: exact source census, floor/platform separation, NightSky,
// authored spawn, collectible + LINE-gate three-lap rule, catch-floor physics, round-trip,
// texture registry and a player-visible fidelity capture.

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
    const result = await window.__GRAPHYSX_CONTENT__.composeArchiveLevel3();
    return { ok: result.ok, error: result.error ?? null, provenance: result.provenance ?? null };
  });
  await page.waitForFunction(() => window.__GRAPHYSX__.query({ tag: "archive-level3" }).length === 389, null, { timeout: SMOKE_TIMEOUT });

  out.census = await page.evaluate(() => {
    const api = window.__GRAPHYSX__;
    const all = api.query({ tag: "archive-level3" });
    const floor = api.query({ ids: ["archive-level3-floor"] })[0];
    const ball = api.query({ ids: ["archive-level3-ball"] })[0];
    const run = api.rules.status();
    const textures = api.textures();
    return {
      total: all.length,
      platforms: all.filter((entity) => entity.tags.includes("platform")).length,
      tops: all.filter((entity) => entity.tags.includes("platform-top")).length,
      checkpoints: all.filter((entity) => entity.tags.includes("checkpoint")).length,
      posts: all.filter((entity) => entity.tags.includes("post")).length,
      gates: all.filter((entity) => entity.tags.includes("gate")).length,
      sourceFloor: floor.tags.includes("source-bAddFloor"),
      floorY: floor.position[1],
      floorTexture: floor.material.texture?.id,
      floorNormal: floor.material.normalTexture?.id,
      ballRadius: ball.geometry.radius,
      spawn: ball.position,
      sky: api.state().environment.sky,
      laps: run?.laps,
      inventory: run?.collectibleCount,
      target: run?.collectibleTarget,
      textures: ["classic-alien02", "classic-alien02-normal", "two-way"].every((id) => textures.some((texture) => texture.id === id)),
    };
  });

  out.roundTrip = await page.evaluate(() => {
    const api = window.__GRAPHYSX__;
    const document_ = api.exportDocument();
    const before = document_.entities.length;
    const loaded = api.load(document_);
    const floor = api.query({ ids: ["archive-level3-floor"] })[0];
    const run = api.rules.status();
    return {
      ok: loaded.ok,
      before,
      after: api.state().entities.length,
      floorTexture: floor.material.texture?.id,
      floorNormal: floor.material.normalTexture?.id,
      sky: api.state().environment.sky,
      laps: run?.laps,
    };
  });

  out.drop = await page.evaluate(() => {
    const api = window.__GRAPHYSX__;
    api.pause(true);
    const ball = api.query({ ids: ["archive-level3-ball"] })[0];
    api.update("archive-level3-ball", {
      transform: { position: [-9.5, 2, -9] },
      physics: { mode: ball.physics.mode, mass: ball.physics.mass, material: ball.physics.material, linearVelocity: [0, 0, 0] },
    });
    for (let index = 0; index < 180; index += 1) api.step(1 / 60);
    const landed = api.query({ ids: ["archive-level3-ball"] })[0].position;
    const reset = api.rules.reset();
    const respawned = api.query({ ids: ["archive-level3-ball"] })[0].position;
    return { landed, reset: reset.ok, respawned };
  });

  out.rule = await page.evaluate(() => {
    const api = window.__GRAPHYSX__;
    const teleport = (position) => {
      const ball = api.query({ ids: ["archive-level3-ball"] })[0];
      api.update("archive-level3-ball", {
        transform: { position },
        physics: { mode: ball.physics.mode, mass: ball.physics.mass, material: ball.physics.material, linearVelocity: [0, 0, 0] },
      });
      for (let index = 0; index < 14; index += 1) api.step(1 / 60);
    };
    const rings = api.query({ tag: "checkpoint" });
    for (const ring of rings) teleport(ring.position);
    const afterRings = api.rules.status();
    const half = api.query({ ids: ["archive-level3-half-gate"] })[0];
    const finish = api.query({ ids: ["archive-level3-finish-gate"] })[0];
    for (let lap = 0; lap < 3; lap += 1) {
      teleport(half.position);
      teleport([-9.5, 1.35, -9]);
      teleport(finish.position);
      teleport([-9.5, 1.35, -9]);
    }
    const complete = api.rules.status();
    return {
      rings: rings.length,
      afterRings: { collected: afterRings.collected.length, phase: afterRings.phase },
      complete: { phase: complete.phase, lap: complete.lap, laps: complete.laps, checkpointIndex: complete.checkpointIndex },
      hidden: rings.filter((ring) => api.query({ ids: [ring.id] })[0]?.visible === false).length,
    };
  });

  // Replay through the human panel, not a private cleanup: composed replay restores hidden
  // pickups as well as the rules clock, and leaves the screenshot on the actual fresh game.
  const replay = page.getByRole("button", { name: /Play again/i });
  out.scoreboard = await page.locator(".gx-bz-win-score").innerText();
  await replay.click();
  await replay.waitFor({ state: "detached" });
  await page.waitForTimeout(500);
  out.replay = await page.evaluate(() => {
    const api = window.__GRAPHYSX__;
    const run = api.rules.status();
    return {
      phase: run?.phase,
      collected: run?.collected.length,
      lap: run?.lap,
      visible: api.query({ tag: "checkpoint" }).filter((ring) => ring.visible).length,
      hud: document.querySelector(".gx-bz-status")?.textContent ?? null,
    };
  });
  await page.evaluate(() => {
    window.__GRAPHYSX__.pause(true);
    window.__GRAPHYSX_HOST__.setMode("play");
  });
  await page.waitForFunction(() => ["archive-level3-ball-shell", "archive-level3-aim-arrow"].every((id) => window.__GRAPHYSX__.query({ ids: [id] })[0]?.asset?.status === "ready"), null, { timeout: SMOKE_TIMEOUT * 2 });
  await page.evaluate(() => {
    const host = window.__GRAPHYSX_HOST__;
    host.chaseTargetId = null;
    host.camera.position.set(-14.5, 16.5, 18.5);
    host.orbitTarget.set(0, 0.6, 0);
    host.camera.lookAt(host.orbitTarget);
  });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(ART, "archive-level3-v2.png") });
} catch (error) {
  out.fatal = String(error);
}

out.consoleErrors = consoleErrors;
out.pageErrors = pageErrors;
await browser.close();

const near = (actual, expected, tolerance = 0.06) => Math.abs(actual - expected) <= tolerance;
const pass =
  !out.fatal &&
  out.composed?.ok === true &&
  out.composed?.provenance?.census?.platforms === 178 &&
  out.composed?.provenance?.bestTimeMs === 158507.313 &&
  out.census?.total === 389 && out.census?.platforms === 178 && out.census?.tops === 178 &&
  out.census?.checkpoints === 20 && out.census?.posts === 4 && out.census?.gates === 2 &&
  out.census?.sourceFloor === true && near(out.census?.floorY, -0.06) &&
  out.census?.floorTexture === "classic-alien02" && out.census?.floorNormal === "classic-alien02-normal" &&
  near(out.census?.ballRadius, 0.3) && near(out.census?.spawn?.[0], -5.5) && near(out.census?.spawn?.[1], 1.35) && near(out.census?.spawn?.[2], 6) &&
  out.census?.sky === "nightsky" && out.census?.laps === 3 && out.census?.inventory === 20 && out.census?.target === 20 && out.census?.textures === true &&
  out.roundTrip?.ok === true && out.roundTrip?.before === out.roundTrip?.after &&
  out.roundTrip?.floorTexture === "classic-alien02" && out.roundTrip?.floorNormal === "classic-alien02-normal" && out.roundTrip?.sky === "nightsky" && out.roundTrip?.laps === 3 &&
  near(out.drop?.landed?.[1], 0.3, 0.12) && out.drop?.reset === true &&
  near(out.drop?.respawned?.[0], -5.5) && near(out.drop?.respawned?.[1], 1.35) && near(out.drop?.respawned?.[2], 6) &&
  out.rule?.rings === 20 && out.rule?.afterRings?.collected === 20 && out.rule?.afterRings?.phase === "running" &&
  out.rule?.complete?.phase === "complete" && out.rule?.complete?.lap === 3 && out.rule?.complete?.laps === 3 && out.rule?.hidden === 20 &&
  out.scoreboard?.includes("MEDAL") && out.scoreboard?.includes("GOLD") &&
  out.replay?.phase === "running" && out.replay?.collected === 0 && out.replay?.lap === 0 && out.replay?.visible === 20 && out.replay?.hud?.includes("0 / 20") &&
  out.consoleErrors.length === 0 &&
  out.pageErrors.length === 0;

console.log(JSON.stringify(out, null, 2));
console.log(pass ? "SMOKE PASS" : "SMOKE FAIL");
process.exit(pass ? 0 : 1);
