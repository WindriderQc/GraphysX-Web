import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applySmokeTimeout, launchSmokeBrowser } from "./smoke-harness.mjs";
import { startBallsyServer } from "./serve-ballsy.mjs";

const art = process.env.SMOKE_ARTIFACTS || "output/ballsy-giant";
mkdirSync(art, { recursive: true });
const iwer = process.env.SMOKE_IWER ? path.resolve(process.env.SMOKE_IWER) : fileURLToPath(new URL("../build/iwer.min.js", import.meta.resolve("iwer")));
if (!existsSync(iwer)) throw new Error("Install dev dependencies, or set SMOKE_IWER to the pinned IWER 2.8.0 UMD build.");
const app = await startBallsyServer({ port: 0 });
const guestBase = new URL(app.url); guestBase.hostname = "localhost";
const browser = await launchSmokeBrowser();
const errors = [], report = {};
const host = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const giant = await browser.newPage({ viewport: { width: 1280, height: 720 } });
for (const page of [host, giant]) {
  applySmokeTimeout(page);
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
}
const hostState = () => host.evaluate(() => window.__BALLSY__.state());
const guestState = () => giant.evaluate(() => window.__BALLSY_GIANT__.state());
const step = (ms) => host.evaluate((t) => window.advanceTime(t), ms);
async function releaseTrigger() {
  const before = (await guestState()).selectEnds;
  await giant.evaluate(() => window.testHeadset.controllers.right.updateButtonValue("trigger", 0));
  await giant.waitForFunction((count) => window.__BALLSY_GIANT__.state().selectEnds > count, before);
}
async function aim(index) {
  await giant.evaluate((i) => {
    const controller = window.testHeadset.controllers.right;
    const head = window.testHeadset.position;
    const p = [head.x + 0.25, head.y - 0.3, head.z - 0.25], target = window.__BALLSY_GIANT__.state().targets[i];
    const d = target.map((n, a) => n - p[a]), length = Math.hypot(...d);
    const b = d.map((n) => n / length), q = [b[1], -b[0], 0, 1 - b[2]], qLength = Math.hypot(...q);
    controller.position.set(...p); controller.quaternion.set(...q.map((n) => n / qLength));
  }, index);
  await giant.waitForFunction((i) => window.__BALLSY_GIANT__.state().hoverTargets[1] === i, index);
}
async function pressTarget(index) {
  await aim(index);
  const before = (await guestState()).selectStarts;
  await giant.evaluate(() => window.testHeadset.controllers.right.updateButtonValue("trigger", 1));
  await giant.waitForFunction((count) => window.__BALLSY_GIANT__.state().selectStarts > count, before);
}

try {
  // Origin checks run on the actual HTTP listener, without making a browser log an expected error.
  const refused = await fetch(`${app.url}api/ballsy/create`, { method: "POST", headers: { Origin: "https://unrelated.invalid", "content-type": "application/json" }, body: "{}" });
  assert.equal(refused.status, 403);
  await host.goto(`${app.url}ballsy.html?mode=help`, { waitUntil: "load" });
  await host.waitForFunction(() => !!window.__BALLSY__);
  await step(0);
  await host.getByRole("button", { name: "Inviter un géant", exact: true }).click();
  await host.waitForFunction(() => !!window.__BALLSY__.state().room?.code);
  const code = (await hostState()).room.code;
  const installHeadset = () => {
    const runtime = window.IWER;
    const device = new runtime.XRDevice(runtime.metaQuest2);
    device.installRuntime({ forceInstall: true }); device.stereoEnabled = true; device.ipd = 0.064;
    device.position.set(0, 1.6, 0); device.quaternion.set(Math.sin(-0.45 / 2), 0, 0, Math.cos(-0.45 / 2));
    window.testHeadset = device;
  };
  // One init script: Playwright does not guarantee the ordering of separate init scripts.
  await giant.addInitScript({ content: `${readFileSync(iwer, "utf8")}\n;(${installHeadset.toString()})();` });
  await giant.goto(`${guestBase}ballsy-giant.html`, { waitUntil: "load" });
  await giant.waitForFunction(() => !!window.__BALLSY_GIANT__);
  await giant.getByLabel("Code affiché sur la télé").fill(code);
  await giant.getByRole("button", { name: "Rejoindre", exact: true }).click();
  await giant.waitForFunction(() => window.__BALLSY_GIANT__.state().live);
  await host.waitForFunction(() => window.__BALLSY__.state().room?.connected);
  report.joined = { host: (await hostState()).room, guest: await guestState() };
  assert.ok(report.joined.guest.boardSize[0] > 1.4 && report.joined.guest.boardSize[0] < 1.9, "the actual world is a tabletop maquette in metres");
  assert.equal(await host.evaluate(() => window.__BALLSY__.commandGiant({ type: "route", route: "concentrate" }).ok), false, "the local mouse does not take the connected giant's shovel");
  await host.getByRole("button", { name: /C'est parti/ }).click();
  await step(3100);
  await giant.waitForFunction(() => window.__BALLSY_GIANT__.state().snapshot?.phase === "racing");
  await host.evaluate(() => window.dispatchEvent(new Event("blur")));
  assert.equal((await hostState()).phase, "racing", "a separate giant window does not pause the TV");
  report.capability = await giant.evaluate(async () => {
    try { return { secure: isSecureContext, supported: await navigator.xr.isSessionSupported("immersive-vr"), headset: !!window.testHeadset, button: document.querySelector("[data-vr]").textContent }; }
    catch (e) { return { secure: isSecureContext, error: String(e), headset: !!window.testHeadset }; }
  });
  assert.equal(report.capability.supported, true, JSON.stringify({ capability: report.capability, errors }));
  await giant.getByRole("button", { name: "Devenir le géant en VR", exact: true }).click();
  await giant.waitForFunction(() => window.__BALLSY_GIANT__.state().view === "vr" && window.__BALLSY_GIANT__.state().eyes === 2);
  report.stereo = await guestState();
  assert.equal(report.stereo.placements, 1, "first tracked pose places the tabletop in front of the viewer");
  await giant.screenshot({ path: path.join(art, "giant-stereo.png") });

  // Moving/turning the viewer does not carry the table or move the authoritative race.
  const originalTable = report.stereo.table;
  const hostBeforeRecenter = await hostState();
  await giant.evaluate(() => {
    const yaw = Math.PI / 2, pitch = -0.45, sy = Math.sin(yaw / 2), cy = Math.cos(yaw / 2), sx = Math.sin(pitch / 2), cx = Math.cos(pitch / 2);
    window.testHeadset.position.set(2, 1.15, 1);
    window.testHeadset.quaternion.set(cy * sx, sy * cx, -sy * sx, cy * cx);
  });
  const frameBefore = (await guestState()).frameCount;
  await giant.waitForFunction((n) => window.__BALLSY_GIANT__.state().frameCount > n + 3, frameBefore);
  assert.deepEqual((await guestState()).table, originalTable, "no camera-following table or forced viewer movement");
  await giant.evaluate(() => window.testHeadset.controllers.right.updateButtonValue("a-button", 1));
  await giant.waitForFunction(() => window.__BALLSY_GIANT__.state().placements === 2);
  report.recentered = await guestState();
  assert.ok(Math.abs(report.recentered.table.yaw - Math.PI / 2) < 1e-5);
  assert.ok(Math.abs(report.recentered.table.centre[0] - 0.5) < 1e-5);
  assert.ok(Math.abs(report.recentered.table.centre[1] - 0.37) < 1e-5);
  assert.ok(Math.abs(report.recentered.table.centre[2] - 1) < 1e-5);
  await giant.evaluate(() => window.testHeadset.position.set(2.2, 1.15, 1));
  const heldFrame = (await guestState()).frameCount;
  await giant.waitForFunction((n) => window.__BALLSY_GIANT__.state().frameCount > n + 3, heldFrame);
  assert.equal((await guestState()).placements, 2, "holding A does not continuously drag the table");
  assert.deepEqual((await guestState()).table, report.recentered.table);
  await giant.evaluate(() => window.testHeadset.controllers.right.updateButtonValue("a-button", 0));
  await giant.waitForFunction(() => window.__BALLSY_GIANT__.state().controllers.some((c) => c.hand === "right" && !c.primaryDown));
  await pressTarget(4); await releaseTrigger();
  await giant.waitForFunction(() => window.__BALLSY_GIANT__.state().placements === 3);
  assert.ok(Math.abs((await guestState()).table.centre[0] - 0.7) < 1e-5);
  assert.deepEqual((await hostState()).players, hostBeforeRecenter.players);
  assert.deepEqual((await hostState()).volcano, hostBeforeRecenter.volcano, "placement never spends an action or advances lava");
  await giant.screenshot({ path: path.join(art, "giant-recentered-seated.png") });

  await pressTarget(0);
  await host.waitForFunction(() => window.__BALLSY__.state().volcano.pending?.route === "concentrate");
  assert.equal((await hostState()).volcano.charges, 3);
  await releaseTrigger();
  await step(850);
  await giant.waitForFunction(() => window.__BALLSY_GIANT__.state().snapshot?.volcano.pending?.phase === "dig");
  for (let point = 0; point < 3; point++) {
    await pressTarget(point);
    await host.waitForFunction((p) => window.__BALLSY__.state().volcano.pending?.heldPoint === p, point);
    await step(810);
    await giant.waitForFunction((count) => window.__BALLSY_GIANT__.state().snapshot?.volcano.pending?.strokes === count, point + 1);
    await releaseTrigger();
  }
  assert.equal((await hostState()).volcano.pending.phase, "warning");
  await step(1250);
  await giant.waitForFunction(() => window.__BALLSY_GIANT__.state().snapshot?.volcano.route === "concentrate");
  await giant.waitForFunction(() => {
    const s = window.__BALLSY_GIANT__.state();
    return s.renderedPlayers.every((p, i) => Math.hypot(...p.local.map((n, a) => n - s.snapshot.players[i].position[a])) < 1e-6);
  });
  report.applied = { host: await hostState(), guest: await guestState() };
  assert.equal(report.applied.host.volcano.interventions, 1);
  assert.equal(report.applied.host.volcano.charges, 3, "controller retries never pay twice");
  for (let i = 0; i < 2; i++) assert.ok(Math.hypot(...report.applied.guest.renderedPlayers[i].local.map((n, a) => n - report.applied.host.players[i].position[a])) < 1e-6, "the displayed ball settles on the authoritative position");
  await giant.screenshot({ path: path.join(art, "giant-applied.png") });
  await host.screenshot({ path: path.join(art, "tv-giant-connected.png") });

  // The real 3D exit target ends the XR session; the race and controls stay on the PC.
  await pressTarget(3);
  await giant.waitForFunction(() => window.__BALLSY_GIANT__.state().view === "screen" && !window.__BALLSY_GIANT__.state().joined);
  assert.deepEqual((await guestState()).table.position, [0, 0, 0]);
  assert.deepEqual((await guestState()).screenCamera.position, [0, 1.6, 0.1], "screen framing is restored after an offset/rotated XR session");
  await host.waitForFunction(() => !window.__BALLSY__.state().room?.connected);
  report.afterExit = await hostState();
  assert.equal(report.afterExit.phase, "racing");
  const before = report.afterExit.players[0].position[0];
  await host.keyboard.down("ArrowRight"); await step(650); await host.keyboard.up("ArrowRight");
  assert.ok((await hostState()).players[0].position[0] > before + 0.4);
  await host.getByRole("button", { name: "1 rivière", exact: true }).click();
  assert.equal((await hostState()).volcano.charges, 2, "the local giant can take over after headset exit");
  await host.keyboard.press("KeyP");
  await host.getByRole("button", { name: "Recommencer la course", exact: true }).click();
  assert.equal((await hostState()).volcano.charges, 4);
  assert.notEqual((await hostState()).roundId, report.afterExit.roundId);
  await step(3100);
  await giant.getByRole("button", { name: "Rejoindre", exact: true }).click();
  await giant.waitForFunction(() => window.__BALLSY_GIANT__.state().live);
  await host.waitForFunction(() => window.__BALLSY__.state().room?.connected);
  const diversion = giant.locator('[data-target="2"]');
  // A real pointer keeps the same capture/hold path as a person at the mouse.
  const routeBox = await diversion.boundingBox();
  await giant.mouse.move(routeBox.x + routeBox.width / 2, routeBox.y + routeBox.height / 2); await giant.mouse.down(); await giant.mouse.up();
  await host.waitForFunction(() => window.__BALLSY__.state().volcano.pending?.route === "divert");
  await step(2600);
  await giant.waitForFunction(() => window.__BALLSY_GIANT__.state().snapshot?.volcano.pending?.phase === "dig");
  const digBox = await giant.locator('[data-target="0"]').boundingBox();
  await giant.mouse.move(digBox.x + digBox.width / 2, digBox.y + digBox.height / 2); await giant.mouse.down();
  await host.waitForFunction(() => window.__BALLSY__.state().volcano.pending?.heldPoint === 0);
  await step(400);
  const crash = await giant.context().newCDPSession(giant);
  const crashed = giant.waitForEvent("crash");
  void crash.send("Page.crash").catch(() => undefined);
  await crashed;
  await host.waitForFunction(() => {
    const s = window.__BALLSY__.state();
    return s.volcano.pending?.heldPoint === null && s.volcano.pending?.strokeSeconds === 0;
  });
  report.abruptLoss = await hostState();
  assert.equal(report.abruptLoss.phase, "racing");
  assert.equal(report.abruptLoss.room.connected, true, "the hold watchdog releases before the longer guest lease expires");
  assert.equal(report.abruptLoss.volcano.pending.strokes, 0);
  assert.equal(report.abruptLoss.volcano.charges, 3);
  await host.waitForFunction(() => !window.__BALLSY__.state().room?.connected);

  const replacement = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  applySmokeTimeout(replacement);
  replacement.on("pageerror", (e) => errors.push(String(e)));
  replacement.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await replacement.addInitScript(() => {
    const xr = new EventTarget();
    xr.isSessionSupported = async () => true;
    xr.requestSession = async () => { throw new DOMException("Synthetic permission refusal", "NotAllowedError"); };
    Object.defineProperty(navigator, "xr", { configurable: true, value: xr });
  });
  await replacement.goto(`${guestBase}ballsy-giant.html`, { waitUntil: "load" });
  await replacement.waitForFunction(() => !!window.__BALLSY_GIANT__);
  await replacement.getByLabel("Code affiché sur la télé").fill(code);
  await replacement.getByRole("button", { name: "Rejoindre", exact: true }).click();
  await replacement.waitForFunction(() => window.__BALLSY_GIANT__.state().live);
  await replacement.getByRole("button", { name: "Devenir le géant en VR", exact: true }).click();
  await replacement.waitForFunction(() => document.querySelector("[data-status]").textContent.includes("Entrée VR refusée"));
  report.refusedVR = await replacement.evaluate(() => window.__BALLSY_GIANT__.state());
  assert.equal(report.refusedVR.joined, true);
  assert.equal(report.refusedVR.view, "screen");
  assert.equal((await hostState()).phase, "racing");
  for (let point = 0; point < 3; point++) {
    await replacement.waitForFunction((p) => !document.querySelector(`[data-target="${p}"]`).disabled, point);
    const b = await replacement.locator(`[data-target="${point}"]`).boundingBox();
    await replacement.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await replacement.mouse.down();
    await host.waitForFunction((p) => window.__BALLSY__.state().volcano.pending?.heldPoint === p, point);
    await step(810); await replacement.mouse.up();
  }
  await step(1250);
  assert.equal((await hostState()).volcano.route, "divert");
  assert.equal((await hostState()).volcano.charges, 3, "reconnection resumes the paid preparation without charging it again");
  await replacement.screenshot({ path: path.join(art, "giant-refused-vr-fallback.png") });
  await replacement.getByRole("button", { name: "Rendre la pelle", exact: true }).click();
  await replacement.close();
  assert.deepEqual(errors, []);
  report.errors = errors;
  writeFileSync(path.join(art, "giant-report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: true, profile: "IWER 2.8.0 / Quest 2", eyes: report.stereo.eyes, placements: report.applied.guest.placements, gestures: report.applied.guest.selectStarts, sourceKeepsRacingAfterExit: report.afterExit.phase === "racing", errors }));
} catch (error) {
  report.failure = String(error); report.errors = errors;
  try { report.guestFailureState = await guestState(); await giant.screenshot({ path: path.join(art, "giant-failure.png") }); } catch { /* preserve the original failure */ }
  writeFileSync(path.join(art, "giant-failure.json"), JSON.stringify(report, null, 2));
  throw error;
} finally { await browser.close(); await app.close(); }
