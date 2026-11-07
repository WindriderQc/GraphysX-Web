import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { applySmokeTimeout, launchSmokeBrowser } from "./smoke-harness.mjs";
import { startBallsyServer } from "./serve-ballsy.mjs";
import { installBallsyRacePads, prepareBallsyRacePilot, driveBallsyRace } from "./fixtures/ballsy-race-pilot.mjs";

const baseline = process.argv.includes("--baseline");
const cameraOnly = baseline || process.argv.includes("--camera-only");
const finishOnly = process.argv.includes("--finish-only");
const root = path.resolve(process.env.SMOKE_DIST_ROOT || "dist");
const directory = path.resolve(process.env.SMOKE_ARTIFACTS || "output/ballsy-camera-finish");
mkdirSync(directory, { recursive: true });
const report = { root, baseline, startedAt: new Date().toISOString(), checks: [], captures: [], errors: [],
  buildHtmlSha256: createHash("sha256").update(readFileSync(path.join(root, "ballsy.html"))).digest("hex"),
  scope: "Native API placements are isolated camera probes, not race evidence. Finish journeys use real Gamepad inputs and physics. No physical controller or headset acceptance." };
const app = await startBallsyServer({ port: 0, root });
const browser = await launchSmokeBrowser();
let page;
const check = (name, condition, detail) => {
  report.checks.push({ name, passed: Boolean(condition), ...(detail === undefined ? {} : { detail }) });
  assert.ok(condition, name); console.log(`PASS ${name}`);
};
async function open(viewport = { width: 1280, height: 720 }, query = "course=volcano") {
  if (page) await page.close();
  page = applySmokeTimeout(await browser.newPage({ viewport }));
  await installBallsyRacePads(page);
  page.on("pageerror", error => report.errors.push(String(error)));
  page.on("console", message => { if (message.type() === "error") report.errors.push(message.text()); });
  await page.goto(`${app.url}ballsy.html?${query}`, { waitUntil: "load" });
  await page.waitForFunction(() => Boolean(window.__BALLSY__));
  await page.evaluate(() => window.advanceTime(0));
  await page.locator('[data-action="start"]').click();
  await page.evaluate(() => window.advanceTime(3100));
  assert.equal((await state()).phase, "racing");
}
const state = () => page.evaluate(() => window.__BALLSY__.state());
const step = ms => page.evaluate(ms => window.advanceTime(ms), ms);
async function capture(name) {
  await page.screenshot({ path: path.join(directory, `${name}.png`) });
  report.captures.push({ file: `${name}.png`, hiddenProductUi: false });
}
async function visualMetrics() {
  return page.evaluate(() => {
    const host = window.__GRAPHYSX_HOST__, camera = host.camera;
    host.scene.updateMatrixWorld(true); camera.updateMatrixWorld(true);
    const rect = host.renderer.domElement.getBoundingClientRect();
    const rectOf = element => { const r = element.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }; };
    const visible = element => element && !element.hidden && getComputedStyle(element).display !== "none" && getComputedStyle(element).visibility !== "hidden";
    const hud = [...document.querySelectorAll('.ballsy-header,.ballsy-score,[data-race-tip],[data-volcano-signal],[data-giant],[data-room],[data-finish-announcement]')]
      .filter(visible).map(element => ({ selector: element.className, box: rectOf(element) }));
    const controls = [...document.querySelectorAll('.ballsy-header a,.ballsy-tools button')].filter(visible)
      .map(element => ({ text: element.textContent, box: rectOf(element) }));
    const advice = document.querySelector('[data-volcano-signal]');
    const adviceBox = visible(advice) ? rectOf(advice) : null;
    const adviceOverControls = adviceBox ? controls.filter(({ box }) => adviceBox.left < box.right && adviceBox.right > box.left && adviceBox.top < box.bottom && adviceBox.bottom > box.top).map(control => control.text) : [];
    const right = camera.position.clone().setFromMatrixColumn(camera.matrixWorld, 0);
    const shadows = [];
    host.scene.traverse(object => {
      if (object.isDirectionalLight) shadows.push({ name: object.name, castShadow: object.castShadow,
        intensity: object.intensity, shadowMapAllocated: Boolean(object.shadow.map), mapSize: object.shadow.mapSize.toArray(),
        shadowBounds: { left: object.shadow.camera.left, right: object.shadow.camera.right, top: object.shadow.camera.top, bottom: object.shadow.camera.bottom, near: object.shadow.camera.near, far: object.shadow.camera.far } });
    });
    const screen = point => { const p = point.clone().project(camera); return { x: rect.left + (p.x + 1) * rect.width / 2, y: rect.top + (1 - p.y) * rect.height / 2, depth: p.z }; };
    const players = window.__BALLSY__.state().players.map((player, i) => {
      const center = camera.position.clone().fromArray(player.position);
      const p = screen(center), a = screen(center.clone().addScaledVector(right, .65)), b = screen(center.clone().addScaledVector(right, -.65));
      const diameterPixels = Math.hypot(a.x - b.x, a.y - b.y), radius = diameterPixels / 2;
      const box = { left: p.x - radius, right: p.x + radius, top: p.y - radius, bottom: p.y + radius };
      const intersects = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
      const ray = host.chaseScratch.raycaster;
      ray.set(camera.position, center.clone().sub(camera.position).normalize());
      const body = host.world.getEntityObject(player.id), distance = center.distanceTo(camera.position);
      const hit = ray.intersectObjects(host.scene.children, true).find(hit => {
        let object = hit.object;
        while (object) { if (!object.visible || object === body) return false; object = object.parent; }
        const materials = Array.isArray(hit.object.material) ? hit.object.material : [hit.object.material];
        if (materials.every(material => material?.transparent && material.opacity < .9)) return false;
        return hit.distance < distance - .7;
      });
      const label = document.querySelector(`[data-label="${i}"]`), sparkle = document.querySelector(`[data-finish-sparkle="${i}"]`);
      const bodyMeshes = []; body.traverse(object => { if (object.isMesh) bodyMeshes.push({ name: object.name, castShadow: object.castShadow, receiveShadow: object.receiveShadow }); });
      const roads = ["ballsy-road-main", "ballsy-road-bridge"].map(id => host.world.getEntityObject(id)).filter(Boolean);
      ray.set(center.clone().add(camera.position.clone().set(0, 3, 0)), camera.position.clone().set(0, -1, 0));
      const roadHit = ray.intersectObjects(roads, true)[0];
      return { id: player.id, position: player.position, projected: p, diameterPixels, box,
        contactDiagnostic: { radius: .65, roadY: roadHit?.point.y ?? null,
          verticalBottomGap: roadHit ? player.position[1] - .65 - roadHit.point.y : null, bodyMeshes },
        wholeBallInFrame: box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight && p.depth > -1 && p.depth < 1,
        hudOverlaps: hud.filter(item => intersects(box, item.box)).map(item => item.selector),
        opaqueBlocker: hit ? { name: hit.object.name, distance: hit.distance } : null,
        label: { visible: visible(label), text: label.textContent, box: rectOf(label), finished: label.dataset.finished,
          hudOverlaps: hud.filter(item => intersects(rectOf(label), item.box)).map(item => item.selector) },
        sparkle: sparkle ? { visible: visible(sparkle), box: rectOf(sparkle) } : null };
    });
    const gl = host.renderer.getContext(), ext = gl.getExtension("WEBGL_debug_renderer_info");
    return { viewport: [innerWidth, innerHeight], canvas: [rect.width, rect.height],
      renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      rendererInfo: { calls: host.renderer.info.render.calls, triangles: host.renderer.info.render.triangles,
        geometries: host.renderer.info.memory.geometries, textures: host.renderer.info.memory.textures },
      shadows: { enabled: host.renderer.shadowMap.enabled, type: host.renderer.shadowMap.type, lights: shadows, environmentIntensity: host.scene.environmentIntensity },
      camera: { position: camera.position.toArray(), fov: camera.fov, aspect: camera.aspect },
      reportedCamera: window.__BALLSY__.state().camera, players, hud, adviceOverControls,
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth };
  });
}

async function frameBudget() {
  return page.evaluate(async () => {
    const deltas = []; let last;
    await new Promise(resolve => {
      const observe = now => {
        if (last !== undefined) deltas.push(now - last);
        last = now;
        if (deltas.length < 120) requestAnimationFrame(observe); else resolve();
      };
      requestAnimationFrame(observe);
    });
    const sorted = [...deltas].sort((a, b) => a - b);
    return { method: "120 real requestAnimationFrame intervals with full product renderer, native manual pose held; no physics throughput claim",
      fps: 1000 / (deltas.reduce((a, b) => a + b, 0) / deltas.length), p95FrameMs: sorted[Math.floor(sorted.length * .95)],
      minimumFrameMs: sorted[0], maximumFrameMs: sorted.at(-1), samples: deltas.length };
  });
}

async function checkFinishUi(label, expectedCount) {
  const current = await state(), metrics = await visualMetrics();
  const completed = current.players.map((p, i) => p.run.phase === "complete" ? i : -1).filter(i => i >= 0);
  check(`${label}: authoritative finish count`, completed.length === expectedCount);
  check(`${label}: presentation matches authoritative finish`, current.finishes.length === expectedCount);
  for (const i of completed) {
    check(`${label}: racer ${i + 1} has persistent arrival badge`, metrics.players[i].label.visible && metrics.players[i].label.finished === "true" && /Arriv/.test(metrics.players[i].label.text));
    check(`${label}: racer ${i + 1} remains in frame`, metrics.players[i].wholeBallInFrame);
    check(`${label}: racer ${i + 1} has no opaque blocker`, !metrics.players[i].opaqueBlocker, metrics.players[i].opaqueBlocker);
    check(`${label}: racer ${i + 1} arrival badge does not cover the HUD`, metrics.players[i].label.hudOverlaps.length === 0, metrics.players[i].label.hudOverlaps);
  }
  if (completed.length === 2) {
    const [a, b] = completed.map(i => metrics.players[i].label.box);
    check(`${label}: individual arrival badges remain separately readable`, !(a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top), [a, b]);
  }
  check(`${label}: accessible arrival announcement`, await page.locator("[data-finish-announcement]").isVisible());
  await capture(label);
  return { state: current, metrics };
}

async function checkHeldBrake(input) {
  await open();
  if (input === "keyboard") {
    await page.keyboard.down("ArrowLeft"); await page.keyboard.down("KeyA");
  } else await page.evaluate(() => { window.ballsyQaPads.forEach(p => { p.axes = [-1, 0]; }); });
  await step(800);
  if (input === "keyboard") {
    await page.keyboard.up("ArrowLeft"); await page.keyboard.up("KeyA");
    await page.keyboard.down("Space"); await page.keyboard.down("ShiftLeft");
  } else await page.evaluate(() => { window.ballsyQaPads.forEach(p => { p.axes = [0, 0]; p.buttons[0] = { pressed: true, value: 1 }; }); });
  const braking = await page.evaluate(() => {
    const before = window.__BALLSY__.state(), samples = [];
    for (let frame = 1; frame <= 210; frame++) {
      const current = window.advanceTime(1000 / 60);
      if (frame % 6 === 0 || frame === 90 || frame === 210)
        samples.push({ seconds: frame / 60, players: current.players });
    }
    return { before, samples, after: window.__BALLSY__.state() };
  });
  const speed = p => Math.hypot(p.velocity[0], p.velocity[2]);
  const stopped = braking.samples.find(sample => sample.seconds === 1.5);
  check(`${input}: both racers were moving before the brake`, braking.before.players.every(p => speed(p) > 1));
  check(`${input}: both racers stop within 1.5 seconds`, stopped.players.every(p => speed(p) < .25));
  check(`${input}: holding the brake for two more seconds keeps racers stopped`, braking.samples.filter(sample => sample.seconds >= 1.5).every(sample => sample.players.every(p => speed(p) < .25)));
  check(`${input}: holding the brake does not launch either racer backwards`, braking.samples.every(sample => sample.players.every((p, i) => {
    const initial = braking.before.players[i].velocity, initialSpeed = speed(braking.before.players[i]);
    return (p.velocity[0] * initial[0] + p.velocity[2] * initial[2]) / initialSpeed >= -.1;
  })));
  check(`${input}: stopped racers drift less than half a metre while the brake stays held`, braking.samples.filter(sample => sample.seconds >= 1.5).every(sample => sample.players.every((p, i) => Math.hypot(...p.position.map((v, axis) => v - stopped.players[i].position[axis])) < .5)));
  await capture(`${input}-brake-held`);
  if (input === "keyboard") {
    await page.keyboard.up("Space"); await page.keyboard.up("ShiftLeft");
    await page.keyboard.down("ArrowLeft"); await page.keyboard.down("KeyA");
  } else await page.evaluate(() => { window.ballsyQaPads.forEach(p => { p.buttons[0] = { pressed: false, value: 0 }; p.axes = [-1, 0]; }); });
  await step(500);
  braking.resumed = await state();
  check(`${input}: releasing the brake permits normal motion again`, braking.resumed.players.every(p => speed(p) > 1));
  if (input === "keyboard") { await page.keyboard.up("ArrowLeft"); await page.keyboard.up("KeyA"); }
  return braking;
}

try {
  report.browserVersion = browser.version();
  if (!finishOnly) {
    report.cameraProbes = [];
    // Exactly the same course-space poses and viewport on both builds. advanceTime(0)
    // paints the native state but awards no gate and advances no physics or race time.
    for (const [width, height] of [[1280, 720], [1920, 1080], [960, 540], [390, 844]]) {
      await open({ width, height });
      const probes = [["close-start", [.02, .03], ["main", "main"]], ["banked-turn", [.57, .59], ["main", "main"]], ["bridge-crossing", [.78, .79], ["shortcut", "shortcut"]], ["opposite-sides", [.22, .72], ["main", "main"]]];
      // Additional current-build containment probe at the vertical extremes. It is
      // deliberately outside the fixed four-pose A/B set recorded by the baseline.
      if (!baseline) probes.push(["vertical-separated", [.02, .52], ["main", "main"]]);
      for (const [name, progress, branches] of probes) {
        const placed = await page.evaluate(({ progress, branches }) => {
          const course = window.__BALLSY__.course();
          const before = window.__BALLSY__.state();
          const positions = progress.map((t, i) => {
            const samples = course[branches[i]];
            const p = samples.reduce((best, p) => Math.abs(p.t - t) < Math.abs(best.t - t) ? p : best, samples[0]);
            return [p.x, p.y + .66, p.z];
          });
          positions.forEach((position, i) => window.__GRAPHYSX__.update(before.players[i].id,
            { transform: { position }, physics: { mode: "dynamic", linearVelocity: [0, 0, 0], angularVelocity: [0, 0, 0] } }));
          window.advanceTime(0);
          return { positions, before: before.players.map(p => p.run), after: window.__BALLSY__.state().players.map(p => p.run) };
        }, { progress, branches });
        assert.deepEqual(placed.after, placed.before, "Camera probe must not award race progress");
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const metrics = await visualMetrics();
        if (width >= 1280 && name === "close-start") metrics.frameBudget = await frameBudget();
        report.cameraProbes.push({ name, width, height, placement: "Native API isolated pose; not course-completion evidence", placed, metrics });
        await capture(`${baseline ? "before" : "after"}-${name}-${width}x${height}`);
        if (!baseline) {
          check(`${name} ${width}: entire balls in frame`, metrics.players.every(p => p.wholeBallInFrame));
          check(`${name} ${width}: no HUD over balls`, metrics.players.every(p => p.hudOverlaps.length === 0), metrics.players.map(p => p.hudOverlaps));
          check(`${name} ${width}: no opaque scene blocker`, metrics.players.every(p => !p.opaqueBlocker), metrics.players.map(p => p.opaqueBlocker));
          check(`${name} ${width}: no horizontal overflow`, !metrics.horizontalOverflow);
          check(`${name} ${width}: route advice does not cover controls`, metrics.adviceOverControls.length === 0, metrics.adviceOverControls);
          if (width >= 960 && name !== "opposite-sides" && name !== "vertical-separated") check(`${name} ${width}: racers are readable at game size`, metrics.players.every(p => p.diameterPixels >= height * .035), metrics.players.map(p => p.diameterPixels));
        }
      }
    }
    if (!baseline && process.env.SMOKE_CAMERA_BASELINE) {
      const before = JSON.parse(readFileSync(process.env.SMOKE_CAMERA_BASELINE, "utf8"));
      report.cameraComparison = report.cameraProbes.filter(probe => probe.name !== "vertical-separated").map(probe => {
        const original = before.cameraProbes.find(p => p.name === probe.name && p.width === probe.width && p.height === probe.height);
        assert.deepEqual(probe.placed.positions, original.placed.positions, "A/B must use identical positions");
        return { name: probe.name, viewport: [probe.width, probe.height], diameterRatios: probe.metrics.players.map((p, i) => p.diameterPixels / original.metrics.players[i].diameterPixels) };
      });
      check("Close desktop camera materially enlarges the balls (at least 50%)", report.cameraComparison.filter(p => p.name !== "opposite-sides" && p.viewport[0] >= 960).every(p => p.diameterRatios.every(ratio => ratio >= 1.5)), report.cameraComparison);
    }
  }
  if (!cameraOnly) {
    await open();
    report.pilot = await prepareBallsyRacePilot(page);
    report.individual = await driveBallsyRace(page, { stopOnFirstFinish: true });
    check("First arrival leaves unfinished player racing", report.individual.state.phase === "racing" && report.individual.state.players.filter(p => p.run.phase === "complete").length === 1);
    report.firstArrival = await checkFinishUi("individual-arrival", 1);
    const slot = report.firstArrival.state.players.findIndex(p => p.run.phase === "complete");
    check("First arrival has a visible sparkle", report.firstArrival.metrics.players[slot].sparkle.visible);
    await page.keyboard.press("KeyP");
    const paused = await state(); await step(2000); const stillPaused = await state();
    check("Arrival pause freezes physics and sparkle clock", stillPaused.phase === "paused" && JSON.stringify(stillPaused.players) === JSON.stringify(paused.players) && JSON.stringify(stillPaused.finishes) === JSON.stringify(paused.finishes));
    await capture("individual-arrival-paused");
    await page.keyboard.press("KeyP");
    check("Arrival resumes to racing", (await state()).phase === "racing");
    report.firstArrivalSettled = await driveBallsyRace(page, { maxFrames: 90 });
    const firstBefore = report.firstArrival.state.players[slot], firstAfter = report.firstArrivalSettled.state.players[slot];
    check("First finisher gently stops within 1.5 seconds", Math.hypot(firstAfter.velocity[0], firstAfter.velocity[2]) < .25, firstAfter.velocity);
    check("First finisher stays near its own arrival", Math.hypot(...firstAfter.position.map((v, axis) => v - firstBefore.position[axis])) < 4);
    check("First finisher clock stays fixed while the other races", firstAfter.run.elapsedSeconds === firstBefore.run.elapsedSeconds && report.firstArrivalSettled.state.phase === "racing");
    await capture("individual-arrival-settled");
    report.driven = await driveBallsyRace(page);
    check("Both players finish two actual laps", report.driven.state.phase === "results" && report.driven.state.players.every(p => p.run.lap === 2));
    check("Continuous race has no teleport or recovery", report.driven.jumps.length === 0 && report.driven.state.rescues.every(n => n === 0));
    check("Moving racers remain in frame", report.driven.visibility.every(sample => sample.players.every(p => p.inFrame)));
    report.results = await checkFinishUi("results-two-laps", 2);
    check("Final results expose both racers", await page.locator("[data-results] li").count() === 2);
    const secondSlot = 1 - slot;
    check("Second arrival has its own sparkle", report.results.metrics.players[secondSlot].sparkle.visible);
    const arrivedElapsed = report.results.state.players.map(p => p.run.elapsedSeconds);
    await step(1500); report.resultsSettled = await state();
    check("Both finishers gently stop during results", report.resultsSettled.players.every(p => Math.hypot(p.velocity[0], p.velocity[2]) < .25));
    check("Result deceleration stays within four metres of the arrival poses", report.resultsSettled.players.every((p, i) => Math.hypot(...p.position.map((v, axis) => v - report.results.state.players[i].position[axis])) < 4));
    await capture("results-settled");
    await step(4000); const settled = await state();
    check("Results advance only sparkle presentation", JSON.stringify(settled.players.map(p => p.run.elapsedSeconds)) === JSON.stringify(arrivedElapsed) && settled.finishes.every(f => f.sparkleSeconds === 3));
    check("Sparkles end but arrival badges persist", await page.locator("[data-finish-sparkle]:visible").count() === 0 && await page.locator('[data-label][data-finished="true"]:visible').count() === 2);
    for (const viewport of [{ width: 960, height: 540 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport); await step(0);
      report.responsiveResults ??= [];
      report.responsiveResults.push(await checkFinishUi(`results-${viewport.width}x${viewport.height}`, 2));
      const button = await page.locator('[data-action="start"]').boundingBox();
      check(`Results ${viewport.width}: rematch button is on screen`, button && button.x >= 0 && button.y >= 0 && button.x + button.width <= viewport.width && button.y + button.height <= viewport.height);
    }
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.locator('[data-action="start"]').click();
    const rematch = await state();
    check("Rematch resets laps, clock and finish presentation", rematch.phase === "countdown" && rematch.finishes.length === 0 && rematch.players.every(p => p.run.lap === 0 && p.run.elapsedSeconds === 0));
    check("Rematch clears arrival badges and announcement", await page.locator('[data-label][data-finished="true"]').count() === 0 && await page.locator("[data-finish-announcement]").isHidden());
    await step(3100);
    await page.evaluate(() => { window.ballsyQaPads.forEach(p => { p.axes = [0, 0]; p.buttons[0] = { pressed: false, value: 0 }; }); });
    await page.keyboard.down("ArrowLeft"); await step(500); await page.keyboard.up("ArrowLeft");
    check("Keyboard still moves a racer after rematch", Math.hypot(...(await state()).players[0].velocity.filter((_, i) => i !== 1)) > .1);
    await page.evaluate(() => { window.ballsyQaPads[0].buttons[9] = { pressed: true, value: 1 }; }); await step(0);
    check("Gamepad Start pauses the rematch", (await state()).phase === "paused");
    await page.evaluate(() => { window.ballsyQaPads[0].buttons[9] = { pressed: false, value: 0 }; }); await step(0);
    await page.keyboard.press("KeyP");
    check("Keyboard resumes gamepad pause", (await state()).phase === "racing");
    await capture("rematch-keyboard-gamepad");
    report.heldBrakes = { keyboard: await checkHeldBrake("keyboard"), gamepad: await checkHeldBrake("gamepad") };
    // Independent clean race, not the above keyboard-control probe.
    await open();
    report.closePilot = await prepareBallsyRacePilot(page, ["main", "main"]);
    report.closeFinish = await driveBallsyRace(page, { closeFinish: true });
    const times = report.closeFinish.state.players.map(p => p.run.elapsedSeconds);
    check("Close arrival completes through physical inputs", report.closeFinish.state.phase === "results" && report.closeFinish.jumps.length === 0 && report.closeFinish.state.rescues.every(n => n === 0));
    check("Close arrival actually finishes within two seconds", Math.abs(times[0] - times[1]) <= 2, times);
    report.closeResults = await checkFinishUi("close-arrival", 2);
    check("Close arrival displays both sparkles together", report.closeResults.metrics.players.every(p => p.sparkle.visible));
  }
  check("No page or console errors", report.errors.length === 0, report.errors);
  report.ok = true;
} catch (error) {
  report.ok = false; report.failure = String(error);
  if (page && !page.isClosed()) { report.failureState = await state().catch(() => null); await capture("failure").catch(() => {}); }
  throw error;
} finally {
  report.finishedAt = new Date().toISOString();
  writeFileSync(path.join(directory, "camera-finish-report.json"), JSON.stringify(report, null, 2));
  await browser.close(); await app.close();
}
