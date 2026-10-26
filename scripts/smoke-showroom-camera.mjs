import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { SMOKE_TIMEOUT, applySmokeTimeout, launchSmokeBrowser } from "./smoke-harness.mjs";

const base = process.env.SMOKE_BASE || "http://127.0.0.1:4188/";
const output = process.env.SMOKE_ARTIFACTS || path.resolve("output/smoke");
mkdirSync(output, { recursive: true });
const browser = await launchSmokeBrowser();
const errors = [];
const results = {};
const read = page => page.evaluate(() => {
  const host = window.__GRAPHYSX_HOST__;
  return { position: host.camera.position.toArray(), target: host.orbitTarget.toArray(),
    distance: host.camera.position.distanceTo(host.orbitTarget), frame: host.frameCount,
    playing: host.introPlaying, completed: host.introCompleted, focusing: host.focusing,
    exposure: host.renderer.toneMappingExposure, time: performance.now() };
});
const open = async reducedMotion => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, reducedMotion });
  applySmokeTimeout(page);
  page.on("pageerror", error => errors.push(String(error)));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__GRAPHYSX_HOST__?.frameCount > 0, null, { timeout: SMOKE_TIMEOUT });
  return page;
};

try {
  const arrival = await open("no-preference");
  const wide = await read(arrival);
  assert.equal(wide.playing, true, "the first visible frames must still show the wide arrival");
  await arrival.screenshot({ path: path.join(output, "showroom-arrival-wide.png") });
  await arrival.waitForFunction(() => window.__GRAPHYSX_HOST__.introCompleted, null, { timeout: SMOKE_TIMEOUT });
  const near = await read(arrival);
  assert.ok(near.distance < wide.distance * 0.8, "arrival must approach the subject instead of only fading");
  assert.ok(near.time - wide.time >= 4000, "the visible approach must be slow, not a short splash");
  assert.equal(near.playing, false);
  assert.ok(near.exposure > 1);
  assert.ok(Math.hypot(near.target[0], near.target[1] - 4.6, near.target[2] + 6.2) < 0.05);
  await arrival.screenshot({ path: path.join(output, "showroom-arrival-near.png") });
  await arrival.waitForTimeout(1500);
  const orbit = await read(arrival);
  assert.ok(orbit.frame > near.frame && Math.hypot(...orbit.position.map((v, i) => v - near.position[i])) > 0.004);
  assert.ok(Math.abs(orbit.distance - near.distance) < 0.05, "idle orbit must not keep zooming");
  results.arrival = { wide, near, orbit };
  await arrival.close();

  const manual = await open("no-preference");
  assert.equal((await read(manual)).playing, true);
  await manual.mouse.move(1000, 160);
  await manual.mouse.down();
  await manual.mouse.move(1060, 170, { steps: 3 });
  await manual.mouse.up();
  const grabbed = await read(manual);
  assert.equal(grabbed.playing, false, "manual input must cancel the arrival immediately");
  assert.equal(grabbed.focusing, false);
  assert.ok(grabbed.exposure > 1, "interruption must restore full exposure");
  await manual.waitForTimeout(1200);
  const retained = await read(manual);
  assert.equal(retained.playing, false);
  assert.equal(retained.focusing, false);
  assert.ok(Math.abs(retained.distance - grabbed.distance) < 0.1, "the abandoned approach must not resume");
  results.manual = { grabbed, retained };
  await manual.close();

  const reduced = await open("reduce");
  const still = await read(reduced);
  assert.equal(still.playing, false);
  assert.equal(still.completed, false, "reduced motion suppresses the move instead of fast-forwarding it");
  assert.ok(still.exposure > 1);
  await reduced.waitForTimeout(1500);
  const after = await read(reduced);
  assert.ok(after.frame > still.frame, "the live world must continue rendering with reduced motion");
  assert.ok(Math.hypot(...after.position.map((v, i) => v - still.position[i])) < 0.001, "reduced motion must suppress idle camera rotation too");
  results.reduced = { still, after };
  await reduced.close();
  assert.deepEqual(errors, []);
  writeFileSync(path.join(output, "showroom-camera.json"), JSON.stringify({ ok: true, results, errors }, null, 2));
  console.log("PASS showroom camera: visible wide-to-near approach, fixed-radius orbit, immediate manual takeover and reduced motion");
} finally {
  await browser.close();
}
