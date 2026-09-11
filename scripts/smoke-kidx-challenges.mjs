import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { applySmokeTimeout, launchSmokeBrowser } from "./smoke-harness.mjs";
import { startStaticServer } from "./static-server.mjs";
import { createKidxDocumentRoute } from "./kidx-document-server.mjs";

const ART = process.env.SMOKE_ARTIFACTS || "output/verify";
mkdirSync(ART, { recursive: true });
let browser, server;
const errors = [];
try {
  if (!process.env.SMOKE_BASE) server = await startStaticServer({ root: path.resolve("dist"), port: 0, routeRequest: await createKidxDocumentRoute() });
  const base = (process.env.SMOKE_BASE ?? server.url).replace(/\/$/, "");
  browser = await launchSmokeBrowser();
  const page = applySmokeTimeout(await browser.newPage({ viewport: { width: 1280, height: 800 }, hasTouch: true }));
  page.on("pageerror", e => errors.push(String(e)));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(`${base}/?app=ev3-lab&view=atelier`, { waitUntil: "domcontentloaded" });
  for (const id of ["reverse-parking", "cargo-push", "sensor-retreat", "ramp-crossing", "color-detect", "touch-and-back"]) {
    console.log(`  measuring ${id}`);
    await page.locator(`[data-kidx-mission="${id}"]`).click();
    const initial = await page.evaluate(() => window.advanceTime(0));
    assert.equal(initial.mission.phase, "running", "no challenge wins at spawn");
    if (id === "reverse-parking") {
      for (let i = 0; i < 2; i++) await page.locator("[data-ev3-block='backward']").click();
      await page.locator("[data-ev3-run]").click();
    } else {
      await page.locator("[data-kidx-lab]").click();
      await page.locator("[data-code-example]").click();
      await page.locator("[data-code-run]").click();
    }
    let state, minimumZ = 17, maximumY = .83;
    for (let burst = 0; burst < 36; burst++) {
      state = await page.evaluate(() => window.advanceTime(500));
      minimumZ = Math.min(minimumZ, state.rover.position[2]); maximumY = Math.max(maximumY, state.rover.position[1]);
      if (state.mission.phase === "complete" || (!state.laboratory.running && !state.program.running)) break;
    }
    assert.equal(state.mission.phase, "complete", JSON.stringify({ id, state }));
    assert.equal(state.laboratory.error, null);
    if (id === "reverse-parking") {
      assert.ok(state.rover.position[2] > 19 && state.rover.headingDegrees === 0);
      assert.ok(state.wheels.leftDegrees < 0 && state.wheels.rightDegrees < 0, JSON.stringify(state.wheels));
    } else {
      assert.ok(minimumZ < 13, "regulated motors must actually move the robot");
      // Rapier can return IEEE -0 on a stationary axis; still require exactly zero, with no tolerance.
      assert.deepEqual(state.rover.velocity.map(value => value + 0), [0, 0, 0], "stopping preserves the final pose without residual motion");
      if (id === "cargo-push") {
        const facts = await page.evaluate(() => ({ cargo: window.__GRAPHYSX__.query({ ids: ["kidx-cargo"] })[0].position, rules: window.__GRAPHYSX__.rules.get() }));
        assert.equal(facts.rules.subjectId, "kidx-cargo"); assert.ok(facts.cargo[2] < 9);
        assert.ok(state.rover.position[2] < 13, "braking must not teleport the chassis to spawn");
      } else {
        assert.equal(await page.evaluate(() => window.__GRAPHYSX__.rules.status().checkpointIndex), 1);
        if (id === "ramp-crossing") assert.ok(maximumY > 1, "the rigid body must climb the ramp");
        else {
          assert.equal(state.laboratory.lastCondition.matched, true);
          assert.equal(state.laboratory.lastCondition.sensor, id === "sensor-retreat" ? "distance" : id === "color-detect" ? "color" : "touch");
          assert.ok(state.rover.position[2] > minimumZ + 2, "the sensor must cause a real reverse journey");
        }
      }
    }
    await page.screenshot({ path: path.join(ART, `kidx-challenge-${id}.png`) });
    await page.locator("[data-ev3-retry]").click();
    const reset = await page.evaluate(() => window.advanceTime(0));
    assert.equal(reset.rover.position[2], 17); assert.equal(reset.mission.phase, "running");
    if (id === "cargo-push") assert.equal(await page.evaluate(() => window.__GRAPHYSX__.query({ ids: ["kidx-cargo"] })[0].position[2]), 12);
    await page.locator(".gx-ev3-exit").click();
    assert.match(await page.locator(".kx-card").filter({ has: page.locator(`[data-kidx-mission="${id}"]`) }).innerText(), /RÉUSSIE/);
    console.log(`  ok ${id}: ${state.mission.elapsedSeconds.toFixed(2)} s, actual route and reset verified`);
  }
  assert.deepEqual(errors, []);
  console.log("KidX physical challenges passed, no browser errors.");
} finally { if (browser) await browser.close(); if (server) await server.close(); }
