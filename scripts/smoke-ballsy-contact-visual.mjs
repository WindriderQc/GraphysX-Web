import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { applySmokeTimeout, launchSmokeBrowser } from "./smoke-harness.mjs";
import { startBallsyServer } from "./serve-ballsy.mjs";

// Visual acceptance supplement, not a replacement for the historical slime smoke.
// A real pointer sweep launches through the real relay; no effect/body state injection.
const root = path.resolve(process.env.SMOKE_DIST_ROOT || "dist");
const directory = path.resolve(process.env.SMOKE_ARTIFACTS || "output/ballsy-contact-visual");
mkdirSync(directory, { recursive: true });
const app = await startBallsyServer({ port: 0, root });
const browser = await launchSmokeBrowser();
const host = applySmokeTimeout(await browser.newPage({ viewport: { width: 1280, height: 720 } }));
const giant = applySmokeTimeout(await browser.newPage({ viewport: { width: 1280, height: 720 } }));
const report = { root, startedAt: new Date().toISOString(), errors: [], captures: [], samples: [],
  scope: "Real pointer gesture, HTTP relay, host-authoritative ballistics and native contact physics. No body or effect injection; no physical headset claim." };
for (const page of [host, giant]) {
  page.on("pageerror", error => report.errors.push(String(error)));
  page.on("console", message => { if (message.type() === "error") report.errors.push(message.text()); });
}
const state = () => host.evaluate(() => window.__BALLSY__.state());
const step = ms => host.evaluate(ms => window.advanceTime(ms), ms);
async function capture(label) {
  for (const [name, page] of [["host", host], ["giant", giant]]) {
    const file = `${name}-${label}.png`; await page.screenshot({ path: path.join(directory, file) }); report.captures.push(file);
  }
}
async function diagnostics() {
  return host.evaluate(() => {
    const host = window.__GRAPHYSX_HOST__, state = window.__BALLSY__.state();
    host.scene.updateMatrixWorld(true);
    const lights = [];
    host.scene.traverse(object => {
      if (object.isDirectionalLight) lights.push({ name: object.name, castShadow: object.castShadow, intensity: object.intensity,
        shadowMapAllocated: Boolean(object.shadow.map), mapSize: object.shadow.mapSize.toArray(),
        shadowBounds: { left: object.shadow.camera.left, right: object.shadow.camera.right, top: object.shadow.camera.top, bottom: object.shadow.camera.bottom, near: object.shadow.camera.near, far: object.shadow.camera.far } });
    });
    const ray = host.chaseScratch.raycaster;
    const players = state.players.map(player => {
      const body = host.world.getEntityObject(player.id), meshes = [];
      body.traverse(object => { if (object.isMesh) meshes.push({ name: object.name, castShadow: object.castShadow, receiveShadow: object.receiveShadow }); });
      const origin = host.camera.position.clone().fromArray(player.position); origin.y += 3;
      ray.set(origin, origin.clone().set(0, -1, 0));
      const roads = ["ballsy-road-main", "ballsy-road-bridge"].map(id => host.world.getEntityObject(id));
      const hit = ray.intersectObjects(roads, true)[0];
      return { id: player.id, position: player.position, velocity: player.velocity, meshes,
        roadY: hit?.point.y ?? null, verticalBottomGap: hit ? player.position[1] - .65 - hit.point.y : null };
    });
    const effects = []; host.scene.traverse(object => { if (/^ballsy-slime-(splat|coat)-\d+$/.test(object.name)) effects.push({ name: object.name, visible: object.visible, scale: object.scale.toArray() }); });
    return { phase: state.phase, players, slime: state.slime, effects, lights, rendererShadowMap: host.renderer.shadowMap.enabled,
      environmentIntensity: host.scene.environmentIntensity, render: { calls: host.renderer.info.render.calls, triangles: host.renderer.info.render.triangles } };
  });
}
async function giantDiagnostics() {
  return giant.evaluate(() => {
    const xr = window.__BALLSY_GIANT__.xr, scene = xr.rig.parent, renderer = xr.renderer, lights = [], effects = [];
    scene.traverse(object => {
      if (object.isLight) lights.push({ name: object.name, type: object.type, intensity: object.intensity,
        castShadow: object.castShadow, shadowMapAllocated: Boolean(object.shadow?.map),
        mapSize: object.shadow?.mapSize.toArray(), bias: object.shadow?.bias, normalBias: object.shadow?.normalBias });
      if (/^ballsy-slime-(splat|coat)-\d+$/.test(object.name)) effects.push({ name: object.name, visible: object.visible });
    });
    return { shadowEnabled: renderer.shadowMap.enabled, shadowType: renderer.shadowMap.type, lights, effects,
      render: { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
        geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures } };
  });
}
try {
  await host.goto(`${app.url}ballsy.html`, { waitUntil: "load" });
  await host.waitForFunction(() => Boolean(window.__BALLSY__));
  await step(0); await host.locator('[data-action="start"]').click(); await step(3700);
  await host.locator('[data-action="invite"]').click();
  await host.waitForFunction(() => Boolean(window.__BALLSY__.state().room?.code));
  const code = (await state()).room.code;
  const guestUrl = new URL("ballsy-giant.html", app.url); guestUrl.hostname = "localhost";
  await giant.goto(guestUrl.href, { waitUntil: "load" });
  await giant.waitForFunction(() => Boolean(window.__BALLSY_GIANT__));
  await giant.locator("#room-code").fill(code);
  await giant.getByRole("button", { name: "Rejoindre", exact: true }).click();
  await host.waitForFunction(() => window.__BALLSY__.state().room?.connected);
  const round = (await state()).roundId;
  await giant.waitForFunction(round => window.__BALLSY_GIANT__.state().live && window.__BALLSY_GIANT__.state().snapshot?.roundId === round, round);
  await step(0);
  const settled = await diagnostics(), giantSettled = await giantDiagnostics();
  report.samples.push({ label: "settled-before-throw", diagnostics: settled, giant: giantSettled });
  assert.ok(settled.players.every(p => p.verticalBottomGap !== null && Math.abs(p.verticalBottomGap) < .02), "Resting balls contact the actual road mesh within two centimetres");
  assert.ok(settled.players.every(p => p.meshes.some(mesh => mesh.name === p.id && mesh.castShadow && mesh.receiveShadow)), "Native ball meshes cast and receive shadows");
  assert.ok(settled.rendererShadowMap && settled.lights.some(light => light.name === "ballsy-sun" && light.shadowMapAllocated), "Host uses an allocated native sun shadow map");
  assert.ok(giantSettled.shadowEnabled && giantSettled.lights.some(light => light.name === "ballsy-sun" && light.shadowMapAllocated), "Giant uses an allocated native sun shadow map");
  await capture("settled-before-throw");
  const target = (await state()).players[0].position;
  await giant.waitForFunction(() => window.__BALLSY_GIANT__.state().balloon.stock.some(item => item.visible));
  const stock = await giant.evaluate(() => window.__BALLSY_GIANT__.state().balloon.stock.find(item => item.visible));
  await giant.mouse.move(...stock.screen); await giant.mouse.down();
  await giant.waitForFunction(() => window.__BALLSY_GIANT__.state().balloon.held);
  const stockModel = await giant.evaluate(world => {
    const zero = window.__BALLSY_GIANT__.modelPoint(0, 0, 0).world;
    return world.map((value, index) => (value - zero[index]) / .045);
  }, stock.world);
  const height = stockModel[1], speed = 10;
  const flight = Math.sqrt(Math.max(.01, 2 * (height - target[1]) / (9.81 / .045)));
  const release = [target[0] - speed * flight, height, target[2]];
  const from = [release[0] - speed * .12, height, release[2]];
  const screen = p => giant.evaluate(p => window.__BALLSY_GIANT__.modelPoint(...p).screen, p);
  await giant.mouse.move(...await screen(from), { steps: 8 }); await giant.waitForTimeout(180);
  const throwsBefore = (await state()).slime.throws;
  for (let i = 1; i <= 8; i++) {
    await giant.mouse.move(...await screen([from[0] + (release[0] - from[0]) * i / 8, height, from[2]]));
    await giant.waitForTimeout(15);
  }
  await giant.mouse.up();
  await host.waitForFunction(before => window.__BALLSY__.state().slime.throws === before + 1, throwsBefore);
  for (let frame = 0; frame < 50 && (await state()).slime.splats.length === 0; frame++) await step(1000 / 60);
  const impact = await state();
  assert.ok(impact.slime.splats.length > 0, "Real pointer throw reaches a visible impact");
  assert.ok(impact.slime.slowUntil[0] > impact.slime.time, "Real throw hits the first physical racer");
  for (const [label, milliseconds] of [["impact-onset", 0], ["impact-100ms", 100], ["impact-600ms", 500]]) {
    await step(milliseconds); const current = await state();
    await giant.waitForFunction(time => window.__BALLSY_GIANT__.state().snapshot?.slime?.time >= time, current.slime.time - .001);
    await capture(label);
    const sample = { label, sinceImpactSeconds: current.slime.time - impact.slime.time, diagnostics: await diagnostics(), giant: await giantDiagnostics() };
    report.samples.push(sample);
    assert.ok(sample.diagnostics.effects.find(effect => effect.name === "ballsy-slime-coat-0")?.visible, "The hit racer keeps its native slime coat during the slowdown");
    const burstVisible = sample.diagnostics.effects.some(effect => effect.name.startsWith("ballsy-slime-splat-") && effect.visible);
    assert.equal(burstVisible, sample.sinceImpactSeconds < .45, "The direct-hit burst disappears after 450 ms instead of leaving a vertical flag");
  }
  assert.deepEqual(report.errors, []);
  report.ok = true;
} catch (error) {
  report.ok = false; report.failure = String(error); await capture("failure").catch(() => {}); throw error;
} finally {
  report.finishedAt = new Date().toISOString();
  writeFileSync(path.join(directory, "contact-visual-report.json"), JSON.stringify(report, null, 2));
  await browser.close(); await app.close();
}
