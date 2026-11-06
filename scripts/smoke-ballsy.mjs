import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { applySmokeTimeout, launchSmokeBrowser } from "./smoke-harness.mjs";

const base = process.env.SMOKE_BASE || "http://127.0.0.1:4188/";
const artifacts = process.env.SMOKE_ARTIFACTS || "output/ballsy";
mkdirSync(artifacts, { recursive: true });
const browser = await launchSmokeBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
applySmokeTimeout(page);
const errors = [];
page.on("pageerror", (error) => errors.push(String(error)));
page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
const report = {};
const read = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const step = (ms) => page.evaluate((milliseconds) => window.advanceTime(milliseconds), ms);
try {
  await page.addInitScript(() => {
    const buttons = () => Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 }));
    window.ballsyTestPads = [1, 3].map((index) => ({ index, connected: true, mapping: "standard", id: `Synthetic standard pad ${index}`, axes: [0, 0], buttons: buttons() }));
    Object.defineProperty(navigator, "getGamepads", { value: () => [null, window.ballsyTestPads[0], null, window.ballsyTestPads[1]] });
  });
  await page.goto(new URL("ballsy.html?course=practice", base).href, { waitUntil: "load" });
  await page.waitForFunction(() => !!window.__BALLSY__);
  report.lobby = await step(0);
  assert.deepEqual(report.lobby.slots, [1, 3]);
  assert.equal(report.lobby.phase, "lobby");
  await page.screenshot({ path: path.join(artifacts, "ballsy-lobby.png") });
  await page.getByRole("button", { name: /C'est parti/ }).click();
  await step(1000);
  assert.equal((await read()).phase, "countdown");
  assert.equal((await read()).players[0].run.elapsedSeconds, 0);
  await step(2100);
  assert.equal((await read()).phase, "racing");
  const before = await read();
  await page.keyboard.down("ArrowRight");
  await page.keyboard.down("KeyW");
  await step(500);
  await page.keyboard.up("ArrowRight");
  await page.keyboard.up("KeyW");
  report.keyboard = await read();
  assert.ok(report.keyboard.players[0].position[0] > before.players[0].position[0] + 0.3);
  assert.ok(report.keyboard.players[1].position[2] < before.players[1].position[2] - 0.3);
  await page.keyboard.down("Space");
  const speed = (p) => Math.hypot(p.velocity[0], p.velocity[2]);
  const preBrake = await read();
  await step(250);
  await page.keyboard.up("Space");
  report.braking = await read();
  assert.ok(speed(report.braking.players[0]) < speed(preBrake.players[0]));
  await page.keyboard.press("KeyP");
  const paused = await read();
  await step(1000);
  assert.deepEqual((await read()).players, paused.players, "pause freezes both bodies and race clocks");
  await page.getByRole("button", { name: /On continue/ }).click();
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  assert.equal((await read()).phase, "paused");
  await page.getByRole("button", { name: /On continue/ }).click();
  await page.evaluate(() => { window.ballsyTestPads[0] = null; });
  await step(0);
  report.disconnect = await read();
  assert.equal(report.disconnect.phase, "paused");
  assert.deepEqual(report.disconnect.slots, [1, 3], "unplugging never gives the second player the first ball");
  await page.getByRole("button", { name: /On continue/ }).click();
  await page.keyboard.down("ArrowRight");
  const unboundBefore = await read();
  await step(200);
  await page.keyboard.up("ArrowRight");
  assert.ok((await read()).players[0].position[0] > unboundBefore.players[0].position[0]);
  await page.evaluate(() => { window.ballsyTestPads[0] = { index: 1, connected: true, mapping: "standard", id: "Reconnected synthetic pad", axes: [0, 0], buttons: [] }; });

  // Native rule attribution: an early finish and a wrong-order gate cannot bank a lap.
  report.rules = await page.evaluate(() => {
    const api = window.__GRAPHYSX__;
    api.rules.reset();
    const move = (id, position) => {
      api.update(id, { transform: { position }, physics: { mode: "dynamic", linearVelocity: [0, 0, 0] } });
      api.step(0.08);
    };
    move("ballsy-p1", [0, 0.7, 9]);
    const early = api.rules.status();
    move("ballsy-p1", [-13.5, 0.7, 0]);
    const wrongOrder = api.rules.status();
    move("ballsy-p1", [13.5, 0.7, 0]);
    const firstGate = api.rules.standings();
    api.rules.reset();
    return { early, wrongOrder, firstGate };
  });
  assert.equal(report.rules.early.lap, 0);
  assert.equal(report.rules.wrongOrder.checkpointIndex, 0);
  assert.equal(report.rules.firstGate.find((p) => p.subjectId === "ballsy-p1").run.checkpointIndex, 1);
  assert.equal(report.rules.firstGate.find((p) => p.subjectId === "ballsy-p2").run.checkpointIndex, 0);

  // Full physical race through synthetic standard controllers. Only stick input moves
  // the balls: the control driver follows the two lanes, with no position writes.
  report.drivenRace = await page.evaluate(() => {
    const api = window.__GRAPHYSX__;
    const waypoints = [[13, 8], [15, 10]].map(([x, z]) => [[x, z], [x, -z], [-x, -z], [-x, z]]);
    const next = [0, 0];
    let snapshot;
    let frames = 0;
    let firstFinish = null;
    for (; frames < 7000; frames++) {
      ["ballsy-p1", "ballsy-p2"].forEach((id, i) => {
        const player = api.query({ ids: [id] })[0];
        let target = waypoints[i][next[i]];
        let dx = target[0] - player.position[0];
        let dz = target[1] - player.position[2];
        if (Math.hypot(dx, dz) < 1.3) {
          next[i] = (next[i] + 1) % 4;
          target = waypoints[i][next[i]];
          dx = target[0] - player.position[0];
          dz = target[1] - player.position[2];
        }
        const distance = Math.hypot(dx, dz);
        const desired = Math.min(4.7, distance * 2);
        const vx = player.physics.linearVelocity[0], vz = player.physics.linearVelocity[2];
        window.ballsyTestPads[i].axes = [(dx / distance * desired - vx) * 0.22, (dz / distance * desired - vz) * 0.22];
      });
      snapshot = window.advanceTime(1000 / 60);
      const complete = snapshot.players.filter((player) => player.run.phase === "complete");
      if (complete.length === 1 && !firstFinish) firstFinish = { phase: snapshot.phase, runs: snapshot.players.map((p) => ({ id: p.id, phase: p.run.phase })) };
      if (snapshot.phase === "results") break;
    }
    return { frames, firstFinish, state: snapshot };
  });
  assert.equal(report.drivenRace.state.phase, "results", JSON.stringify(report.drivenRace));
  assert.ok(report.drivenRace.frames < 7000);
  assert.equal(report.drivenRace.firstFinish.phase, "racing", "the second racer can finish after the winner");
  assert.ok(report.drivenRace.state.players.every((player) => player.run.lap === 2 && !player.run.desynced));
  assert.deepEqual(report.drivenRace.state.rescues, [0, 0]);
  await page.screenshot({ path: path.join(artifacts, "ballsy-results.png") });
  await page.getByRole("button", { name: /La revanche/ }).click();
  report.rematch = await read();
  assert.equal(report.rematch.phase, "countdown");
  assert.ok(report.rematch.players.every((player) => player.run.lap === 0 && player.run.elapsedSeconds === 0));
  assert.deepEqual(report.rematch.slots, [1, 3]);
  await step(3100);
  await page.screenshot({ path: path.join(artifacts, "ballsy-race.png") });
  await page.getByRole("button", { name: "Plein écran", exact: true }).click();
  await page.waitForFunction(() => !!document.fullscreenElement);
  assert.equal(await page.evaluate(() => !!document.fullscreenElement), true);
  await page.getByRole("button", { name: "Fenêtre", exact: true }).click();
  await page.waitForFunction(() => !document.fullscreenElement);
  assert.equal(await page.evaluate(() => !!document.fullscreenElement), false);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.screenshot({ path: path.join(artifacts, "ballsy-tv.png") });
  report.layout = await page.evaluate(() => {
    const host = window.__GRAPHYSX_HOST__;
    const points = [[-17, 0, -13], [17, 0, -13], [-17, 0, 13], [17, 0, 13]];
    const projected = points.map((p) => {
      const v = host.camera.position.clone().set(...p).project(host.camera);
      return { x: v.x, y: v.y };
    });
    return { projected, overflow: document.documentElement.scrollWidth > innerWidth };
  });
  assert.ok(report.layout.projected.every((p) => Math.abs(p.x) < 1 && Math.abs(p.y) < 1), "both distant racers remain inside the authored TV frame");
  assert.equal(report.layout.overflow, false);
  // Out-of-bounds rescue preserves progress; it is never needed to move through the course.
  report.rescue = await page.evaluate(() => {
    window.__GRAPHYSX__.update("ballsy-p2", { transform: { position: [0, -8, 0] } });
    return window.advanceTime(1000 / 60);
  });
  assert.equal(report.rescue.rescues[1], 1);
  assert.ok(report.rescue.players[1].position[1] > 0);
  // A fresh page never enters manual stepping: prove the actual host loop drives play.
  const livePage = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  applySmokeTimeout(livePage);
  livePage.on("pageerror", (error) => errors.push(String(error)));
  livePage.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await livePage.goto(new URL("ballsy.html?course=practice", base).href, { waitUntil: "load" });
  await livePage.waitForFunction(() => !!window.__BALLSY__);
  await livePage.getByRole("button", { name: /C'est parti/ }).click();
  await livePage.waitForFunction(() => window.__BALLSY__.state().phase === "racing");
  await livePage.keyboard.down("ArrowRight");
  await livePage.keyboard.down("KeyD");
  await livePage.waitForFunction(() => window.__BALLSY__.state().players.every((player) => player.position[0] > -2.5));
  await livePage.keyboard.up("ArrowRight");
  await livePage.keyboard.up("KeyD");
  report.liveFrameLoop = await livePage.evaluate(() => window.__BALLSY__.state());
  await livePage.screenshot({ path: path.join(artifacts, "ballsy-live.png") });
  await livePage.keyboard.press("KeyP");
  assert.equal(await livePage.evaluate(() => window.__BALLSY__.state().phase), "paused");
  await livePage.close();
  assert.equal(errors.length, 0, JSON.stringify(errors));
  report.errors = errors;
  writeFileSync(path.join(artifacts, "ballsy-report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: true, physicallyDrivenFrames: report.drivenRace.frames, artifacts, errors }));
} finally { await browser.close(); }
