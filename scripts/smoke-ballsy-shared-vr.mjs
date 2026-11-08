import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { applySmokeTimeout, launchSmokeBrowser } from "./smoke-harness.mjs";
import { startBallsyServer } from "./serve-ballsy.mjs";
import { installBallsySyntheticXr, bindBallsySyntheticXr } from "./fixtures/ballsy-synthetic-xr.mjs";

// Always an isolated real build + real relay. No fallback to a long-lived server/dist.
const root = path.resolve(process.env.SMOKE_DIST_ROOT || "output/ballsy-shared-vr/dist");
const directory = path.resolve(process.env.SMOKE_ARTIFACTS || "output/ballsy-shared-vr/browser");
for (const file of ["ballsy.html", "ballsy-giant.html", "assets/xr/profiles/generic-trigger/controller.gltf"]) {
  assert.ok(existsSync(path.join(root, file)), `Required isolated build input missing: ${file}`);
}
mkdirSync(directory, { recursive: true });
const report = {
  scope: "Real production Ballsy build, shared VrSessionController/VrInputRig, real HTTP relay; synthetic native session binding, viewer and input poses only",
  physicalHeadset: false, stereoValidated: false, performanceValidated: false,
  startedAt: new Date().toISOString(), root, checks: [], captures: [], errors: [], assets: [],
  build: Object.fromEntries(["ballsy.html", "ballsy-giant.html"].map(file => [file, createHash("sha256").update(readFileSync(path.join(root, file))).digest("hex")])),
};
const app = await startBallsyServer({ port: 0, root });
const browser = await launchSmokeBrowser();
let host, giant, code;
const commands = [];
const check = (name, condition, detail) => {
  report.checks.push({ name, passed: !!condition, ...(detail === undefined ? {} : { detail }) });
  assert.ok(condition, name); console.log(`PASS ${name}`);
};
function observe(page) {
  applySmokeTimeout(page);
  page.on("pageerror", error => report.errors.push(String(error)));
  page.on("console", message => { if (message.type() === "error") report.errors.push(message.text()); });
}
const hostState = () => host.evaluate(() => window.__BALLSY__.state());
const giantState = () => giant.evaluate(() => window.__BALLSY_GIANT__.state());
const phase = () => giant.evaluate(() => window.__BALLSY_GIANT__.xr.session.snapshot.phase);
const step = ms => host.evaluate(ms => window.advanceTime(ms), ms);
async function capture(page, name, inputOnly = false) {
  // Clearly labeled synthetic close-up: adjust only the fixture view and hide the DOM panel.
  // Every product mesh/model remains visible, and the normal fixture view is restored.
  if (inputOnly) {
    await page.evaluate(() => {
      document.querySelector(".giant-overlay").style.visibility = "hidden";
      const fixture = window.__ballsyXR, target = fixture.anchor(0);
      if (fixture.xr.input.slots[0].source?.hand) {
        fixture.captureIdle = fixture.anchor(1); fixture.move(1, [-.65, 1.12, -.25]);
      }
      fixture.captureView = { eye: [target[0] + .12, target[1] + .24, target[2] + .48], target };
    });
    await settledFrames();
  }
  try { await page.screenshot({ path: path.join(directory, `${name}.png`) }); }
  finally { if (inputOnly) { await page.evaluate(() => { document.querySelector(".giant-overlay").style.visibility = ""; window.__ballsyXR.captureView = null; if (window.__ballsyXR.captureIdle) { window.__ballsyXR.move(1, window.__ballsyXR.captureIdle); window.__ballsyXR.captureIdle = null; } }); await settledFrames(); } }
  report.captures.push({ file: `${name}.png`, syntheticPoseView: page === giant && await phase() === "active", domPanelHidden: inputOnly });
}
async function join() {
  await giant.locator("#room-code").fill(code);
  await giant.getByRole("button", { name: "Rejoindre", exact: true }).click();
  await giant.waitForFunction(() => window.__BALLSY_GIANT__.state().live && window.__BALLSY_GIANT__.state().snapshot?.phase === "racing");
  await host.waitForFunction(() => window.__BALLSY__.state().room?.connected);
  // Presence rotates the round after the host publishes its first snapshot. Wait for
  // that new round to reach the guest, rather than starting a deliberately stale gesture.
  const round = (await hostState()).roundId;
  await giant.waitForFunction(round => window.__BALLSY_GIANT__.state().snapshot?.roundId === round, round);
  await settledFrames();
}
async function settledFrames(count = 3) {
  const before = (await giantState()).frameCount;
  await giant.waitForFunction(({ before, count }) => window.__BALLSY_GIANT__.state().frameCount >= before + count, { before, count });
}
async function available() {
  // advanceTime controls only host physics so the flight can be inspected frame-by-frame.
  // The giant's physical pose history and cooldown use the unmodified real browser clock.
  await step(1200);
  await giant.waitForFunction(() => window.__BALLSY_GIANT__.state().balloon.stock.some(balloon => balloon.visible));
}
async function grab(index = 0) {
  await giant.waitForFunction(() => window.__BALLSY_GIANT__.state().balloon.stock.some(balloon => balloon.visible));
  await giant.evaluate(index => {
    const fixture = window.__ballsyXR, slot = fixture.xr.input.slots[index];
    const stock = window.__BALLSY_GIANT__.state().balloon.stock.find(balloon => balloon.visible);
    fixture.move(index, stock.world);
    slot.ray.visible = !slot.source.hand;
    fixture.action(index, slot.source.hand ? "selectend" : "squeezeend");
  }, index);
  await settledFrames();
  await giant.evaluate(index => {
    const fixture = window.__ballsyXR;
    fixture.action(index, fixture.xr.input.slots[index].source.hand ? "selectstart" : "squeezestart");
  }, index);
  await giant.waitForFunction(() => window.__BALLSY_GIANT__.state().balloon.held);
}
async function endGesture(index = 0) {
  await giant.evaluate(index => {
    const fixture = window.__ballsyXR;
    fixture.action(index, fixture.xr.input.slots[index].source?.hand ? "selectend" : "squeezeend");
  }, index);
}
async function cancelCheck(name, interrupt, restore = null) {
  await grab(0);
  const before = { launches: (await giantState()).balloon.launches, throws: (await hostState()).slime.throws, commands: commands.length };
  await giant.evaluate(interrupt);
  await giant.waitForFunction(() => !window.__BALLSY_GIANT__.state().balloon.held);
  if (restore) await giant.evaluate(restore);
  await endGesture(0); await settledFrames(); await giant.waitForTimeout(200);
  const after = await giantState();
  check(name, after.balloon.launches === before.launches && (await hostState()).slime.throws === before.throws && commands.length === before.commands,
    { cancelReason: after.balloon.cancelReason, launches: after.balloon.launches });
  check(`${name}: no automatic regrab`, !after.balloon.held);
}
async function physicalThrow(index, label) {
  await available();
  const before = (await hostState()).slime.throws, packets = commands.length;
  const target = (await hostState()).players[0].position;
  const world = await giant.evaluate(target => window.__BALLSY_GIANT__.modelPoint(...target).world, target);
  const velocity = [.35, 0, 0], flight = Math.sqrt(2 * .18 / 9.81), duration = 260;
  const release = [world[0] - velocity[0] * flight, world[1] + .18, world[2]];
  const from = release.map((value, axis) => value - velocity[axis] * duration / 1000);
  await grab(index);
  await giant.evaluate(({ index, from }) => window.__ballsyXR.travel(index, from, 650), { index, from });
  await giant.waitForTimeout(160);
  const gesture = await giant.evaluate(({ index, release, duration }) => {
    const fixture = window.__ballsyXR;
    return fixture.travel(index, release, duration, fixture.xr.input.slots[index].source.hand ? "selectend" : "squeezeend");
  }, { index, release, duration });
  await host.waitForFunction(before => window.__BALLSY__.state().slime.throws === before + 1, before);
  const state = await giantState(), launched = state.balloon.lastLaunch, throwId = commands.at(-1).throwId;
  // Compare the emitted world-space velocity to the known physical trajectory, accounting
  // for rotated/scaled tabletop coordinates. Never write an expected velocity to the app.
  const observedPhysical = await giant.evaluate(launch => {
    const api = window.__BALLSY_GIANT__, a = api.modelPoint(...launch.origin).world;
    const b = api.modelPoint(...launch.origin.map((value, axis) => value + launch.velocity[axis])).world;
    return b.map((value, axis) => value - a[axis]);
  }, launched);
  report[label] = { input: "Synthetic native tracked physical positions over real elapsed time", index, release, intendedPhysicalVelocity: velocity, observedPhysicalVelocity: observedPhysical, gesture, launched };
  check(`${label}: exactly one real relay throw`, commands.length === packets + 1 && state.balloon.launches > 0);
  check(`${label}: velocity follows physical pose history`, Math.abs(observedPhysical[0] - velocity[0]) < .09 && Math.abs(observedPhysical[1]) < .025 && Math.abs(observedPhysical[2]) < .025, observedPhysical);
  report[label].trajectory = [];
  for (let frame = 0; frame < 35; frame++) {
    const state = await step(frame ? 1000 / 60 : 0);
    report[label].trajectory.push({ time: state.slime.time, projectiles: state.slime.projectiles, splats: state.slime.splats });
    if (state.slime.splats.some(splat => splat.id === throwId)) break;
  }
  const impact = await hostState();
  check(`${label}: host resolves ballistic impact`, report[label].trajectory.some(frame => frame.projectiles.some(projectile => projectile.id === throwId)) && impact.slime.splats.some(splat => splat.id === throwId));
  check(`${label}: physical throw slows only struck racer`, impact.slime.splats.some(splat => splat.id === throwId && splat.player === 0) && impact.slime.slowUntil[0] > impact.slime.time && impact.slime.slowUntil[1] <= impact.slime.time);
  await giant.waitForFunction(throwId => window.__BALLSY_GIANT__.state().snapshot?.slime.splats.some(splat => splat.id === throwId), throwId);
  await capture(host, `${label}-host-impact`); await capture(giant, `${label}-synthetic-input`, true);
}

try {
  host = await browser.newPage({ viewport: { width: 1280, height: 720 } }); observe(host);
  await host.goto(`${app.url}ballsy.html?course=volcano`, { waitUntil: "load" });
  await host.waitForFunction(() => !!window.__BALLSY__);
  await host.locator('[data-action="start"]').click();
  await host.waitForFunction(() => window.__BALLSY__.state().phase === "racing");
  await host.locator('[data-action="invite"]').click();
  await host.waitForFunction(() => !!window.__BALLSY__.state().room?.code);
  code = (await hostState()).room.code; await step(0);
  giant = await browser.newPage({ viewport: { width: 1280, height: 720 } }); observe(giant);
  giant.on("request", request => {
    if (request.method() === "POST" && request.url().endsWith("/command")) {
      const command = request.postDataJSON()?.command;
      if (command?.type === "slime") commands.push(command); // No auth header, room code or token is retained.
    }
  });
  giant.on("response", response => {
    if (response.url().includes("/assets/xr/profiles/")) report.assets.push({ url: response.url(), status: response.status() });
  });
  await giant.addInitScript(installBallsySyntheticXr);
  const guest = new URL(app.url); guest.hostname = "localhost";
  await giant.goto(`${guest}ballsy-giant.html`, { waitUntil: "load" });
  await giant.waitForFunction(() => !!window.__BALLSY_GIANT__?.xr);
  await join(); await capture(giant, "desktop-connected");
  report.browserVersion = browser.version();
  check("Entry requires an explicit click", await giant.evaluate(() => window.__ballsyXR.requests.length === 0));
  await giant.locator("[data-vr]").click();
  await giant.waitForFunction(() => window.__BALLSY_GIANT__.xr.session.snapshot.phase === "error");
  check("Rejected VR entry preserves usable desktop and role", (await giantState()).live && (await giantState()).view === "screen");
  await giant.evaluate(bindBallsySyntheticXr);
  await giant.evaluate(() => { window.__ballsyXR.reject = false; });
  await giant.locator("[data-vr]").click();
  await giant.waitForFunction(() => window.__BALLSY_GIANT__.xr.session.snapshot.phase === "active" && window.__BALLSY_GIANT__.state().placements > 0);
  const cadenceStart = await giant.evaluate(() => ({ frames: window.__BALLSY_GIANT__.state().frameCount, at: performance.now() }));
  await giant.waitForTimeout(1000);
  report.cadence = await giant.evaluate(start => {
    const frames = window.__BALLSY_GIANT__.state().frameCount - start.frames, elapsed = performance.now() - start.at;
    const gl = document.querySelector("canvas").getContext("webgl2"), extension = gl.getExtension("WEBGL_debug_renderer_info");
    return { frames, elapsedMs: elapsed, fps: 1000 * frames / elapsed, method: "One-second real giant frame-count sample with host connected, not headset performance", renderer: extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) };
  }, cadenceStart);
  check("Shared session enters with optional local-floor", await giant.evaluate(() => window.__ballsyXR.referenceType === "local-floor"));
  await giant.evaluate(() => { window.__ballsyXR.connect(0, "right"); window.__ballsyXR.connect(1, "left"); });
  await giant.waitForFunction(() => window.__BALLSY_GIANT__.xr.input.slots.every(slot => slot.modelReady));
  check("Reversed source order preserves handedness", await giant.evaluate(() => window.__BALLSY_GIANT__.xr.input.slots.map(slot => slot.source.handedness).join() === "right,left"));
  check("Controller factory assets are loaded from the same origin", report.assets.length >= 3 && report.assets.every(asset => asset.status === 200 && new URL(asset.url).origin === guest.origin), report.assets);
  for (const [button, node] of [[0, "xr-standard-trigger-value"], [1, "xr-standard-squeeze-value"], [4, "a-button-value"]]) {
    const before = await giant.evaluate(node => window.__BALLSY_GIANT__.xr.input.slots[0].modelRoot.getObjectByName(node).position.toArray(), node);
    await giant.evaluate(button => { window.__BALLSY_GIANT__.xr.input.slots[0].source.gamepad.buttons[button] = { value: 1, pressed: true, touched: true }; }, button);
    await giant.waitForFunction(({ node, before }) => {
      const point = window.__BALLSY_GIANT__.xr.input.slots[0].modelRoot.getObjectByName(node).position.toArray();
      return Math.hypot(...point.map((value, axis) => value - before[axis])) > .001;
    }, { node, before });
    check(`Local controller button ${button} animates`, true);
    await giant.evaluate(button => { window.__BALLSY_GIANT__.xr.input.slots[0].source.gamepad.buttons[button] = { value: 0, pressed: false, touched: false }; }, button);
  }
  await grab(0);
  await giant.evaluate(() => { window.__ballsyXR.action(0, "selectstart"); window.__ballsyXR.action(0, "selectend"); });
  await settledFrames();
  check("Trigger release cannot throw while squeeze remains held", (await giantState()).balloon.held && (await giantState()).balloon.launches === 0);
  await giant.waitForTimeout(180);
  const stationaryBefore = (await hostState()).slime.throws;
  await endGesture(0);
  await host.waitForFunction(before => window.__BALLSY__.state().slime.throws === before + 1, stationaryBefore);
  report.stationary = (await giantState()).balloon.lastLaunch;
  check("Stationary tracked release invents no impulse", Math.hypot(...report.stationary.velocity) < .001 && report.stationary.source === "right", report.stationary);
  await physicalThrow(0, "controller-throw");
  await available(); await grab(1); await giant.waitForTimeout(160);
  const leftThrows = (await hostState()).slime.throws; await endGesture(1);
  await giant.waitForFunction(() => window.__BALLSY_GIANT__.state().balloon.lastLaunch?.source === "left");
  await host.waitForFunction(before => window.__BALLSY__.state().slime.throws === before + 1, leftThrows);
  check("Left source also owns its release independent of slot", (await giantState()).balloon.lastLaunch.source === "left");
  await available();
  await cancelCheck("Pose loss before native release cancels", () => {
    const fixture = window.__ballsyXR; fixture.xr.input.slots[0].grip.visible = false; fixture.action(0, "squeezeend");
  }, () => { window.__ballsyXR.xr.input.slots[0].grip.visible = true; });
  await cancelCheck("Controller target-ray loss cancels", () => {
    window.__ballsyXR.xr.input.slots[0].ray.visible = false;
  }, () => { window.__ballsyXR.xr.input.slots[0].ray.visible = true; });
  await cancelCheck("Emulated native pose cannot become a throw", () => {
    window.__ballsyXR.emulated = true; window.__ballsyXR.action(0, "squeezeend");
  }, () => { window.__ballsyXR.emulated = false; });
  await cancelCheck("Disconnected source cancels", () => { window.__ballsyXR.action(0, "disconnected"); }, () => { window.__ballsyXR.connect(0, "right"); });
  await cancelCheck("Hidden session cancels without leaving race", () => {
    const session = window.__ballsyXR.session; session.visibilityState = "hidden"; session.dispatchEvent(new Event("visibilitychange"));
  }, () => { const session = window.__ballsyXR.session; session.visibilityState = "visible"; session.dispatchEvent(new Event("visibilitychange")); });
  check("Visibility return keeps the shared session and host race", await phase() === "active" && (await hostState()).phase === "racing");
  await cancelCheck("Reference reset cancels old pose history", () => { window.__ballsyXR.reference.dispatchEvent(new Event("reset")); });
  await grab(0);
  const recenterLaunches = (await giantState()).balloon.launches, placements = (await giantState()).placements;
  await giant.evaluate(() => { window.__ballsyXR.viewer = [.12, 1.6, -.04]; window.__ballsyXR.viewerYaw = .23; });
  await giant.locator("[data-recenter]").click();
  await giant.waitForFunction(before => window.__BALLSY_GIANT__.state().placements > before, placements);
  check("Table recenter cancels hold without launch", !(await giantState()).balloon.held && (await giantState()).balloon.launches === recenterLaunches);
  report.recenteredTable = (await giantState()).table;
  check("Table follows requested viewer origin/yaw only once", Math.abs(report.recenteredTable.yaw - .23) < .001 && Math.abs(report.recenteredTable.position[0] - .12) < .001, report.recenteredTable);
  await giant.evaluate(() => { window.__ballsyXR.viewer = [.42, 1.6, .1]; }); await settledFrames();
  check("Ordinary head motion does not drag the table", Math.abs((await giantState()).table.position[0] - .12) < .001);

  await giant.evaluate(() => {
    window.__ballsyXR.connect(0, "right", "hand");
  });
  await grab(0);
  check("Native hand pinch grabs near stock without a target ray", await giant.evaluate(() => !window.__BALLSY_GIANT__.xr.input.slots[0].ray.visible && window.__BALLSY_GIANT__.state().balloon.held));
  await giant.waitForFunction(() => window.__BALLSY_GIANT__.xr.input.slots[0].modelRoot.children[0].motionController.handMesh.count === 25);
  await capture(giant, "synthetic-hand-joints", true);
  await giant.evaluate(() => { window.__ballsyXR.xr.input.slots[0].hand.joints["thumb-tip"].visible = false; window.__ballsyXR.action(0, "selectend"); });
  await giant.waitForFunction(() => !window.__BALLSY_GIANT__.state().balloon.held);
  await giant.waitForFunction(() => window.__BALLSY_GIANT__.xr.input.slots[0].modelRoot.children[0].motionController.handMesh.count === 24);
  check("Missing tracked finger removes its sphere and cancels pinch", !(await giantState()).balloon.held);
  await giant.evaluate(() => { window.__ballsyXR.xr.input.slots[0].hand.joints["thumb-tip"].visible = true; });
  await physicalThrow(0, "hand-throw-rotated-table");
  await available(); await grab(0);
  const beforePause = (await giantState()).balloon.launches;
  await host.keyboard.press("KeyP");
  await giant.waitForFunction(() => window.__BALLSY_GIANT__.state().snapshot.phase === "paused" && !window.__BALLSY_GIANT__.state().balloon.held);
  await endGesture(0);
  check("Host pause cancels held pinch and rejects its late release", (await giantState()).balloon.launches === beforePause);
  const oldRound = (await hostState()).roundId;
  await host.locator('[data-action="restart"]').click(); await step(3100);
  await giant.waitForFunction(oldRound => window.__BALLSY_GIANT__.state().snapshot.phase === "racing" && window.__BALLSY_GIANT__.state().snapshot.roundId !== oldRound, oldRound);
  check("Rematch has no stale held input or projectile", !(await giantState()).balloon.held && (await hostState()).slime.projectiles.length === 0);

  await giant.evaluate(() => { window.__ballsyXR.connect(0, "left"); window.__ballsyXR.connect(1, "right"); });
  await giant.waitForFunction(() => window.__BALLSY_GIANT__.xr.input.slots.every(slot => slot.modelReady));
  check("Changed connection order resolves dominant right source", (await giantState()).shovel.dominant === 1);
  await giant.evaluate(() => { const fixture = window.__ballsyXR; fixture.aim(1, window.__BALLSY_GIANT__.state().targets[2]); fixture.action(1, "selectstart"); fixture.action(1, "selectend"); });
  await giant.waitForFunction(() => window.__BALLSY_GIANT__.state().balloon.mode === "shovel");
  check("Shared native trigger activates the secondary tool button", true);
  await settledFrames();
  await giant.evaluate(() => { const fixture = window.__ballsyXR; fixture.action(1, "selectstart"); fixture.action(1, "selectend"); });
  await giant.waitForFunction(() => window.__BALLSY_GIANT__.state().balloon.mode === "balloon");
  await giant.evaluate(()=>{
    const fixture=window.__ballsyXR;fixture.connect(0,'left','controller','oculus-touch-v3');fixture.connect(1,'right','controller','oculus-touch-v3');
  });
  await giant.waitForFunction(()=>window.__BALLSY_GIANT__.xr.input.slots.every(slot=>slot.controllerHand));
  check("Both Quest 2 controller avatars load in Ballsy",await giant.evaluate(()=>
    window.__BALLSY_GIANT__.xr.input.slots.every((slot,index)=>slot.controllerHand.object.userData.poseSource==='controller-gamepad' && slot.controllerHand.object.userData.handedness===(index?'right':'left'))));
  await giant.evaluate(()=>{
    const slots=window.__BALLSY_GIANT__.xr.input.slots;
    window.__ballsyAvatarBefore=slots.map(slot=>slot.controllerHand.joints.get('index-finger-tip').bone.position.clone());
    slots.forEach(slot=>{slot.source.gamepad.buttons[0]={value:1,touched:true,pressed:true};slot.source.gamepad.buttons[3].touched=true;});
  });
  await giant.waitForFunction(()=>window.__BALLSY_GIANT__.xr.input.slots.every((slot,index)=>
    slot.controllerHand.joints.get('index-finger-tip').bone.position.distanceTo(window.__ballsyAvatarBefore[index])>.01));
  check("Ballsy avatars animate from gamepad state without synthetic game actions",!(await giantState()).balloon.held);
  await giant.evaluate(()=>window.__BALLSY_GIANT__.xr.input.slots.forEach(slot=>{slot.source.gamepad.buttons[0]={value:0,touched:false,pressed:false};slot.source.gamepad.buttons[3].touched=false;}));
  const desktopCamera = (await giantState()).screenCamera;
  await grab(0); const exitLaunches = (await giantState()).balloon.launches;
  await giant.locator("[data-vr]").click();
  await giant.waitForFunction(() => window.__BALLSY_GIANT__.xr.session.snapshot.phase === "ready");
  check("Session exit safely cancels held input", !(await giantState()).balloon.held && (await giantState()).balloon.launches === exitLaunches && (await giantState()).view === "screen");
  check("Desktop camera is preserved on exit", JSON.stringify((await giantState()).screenCamera) === JSON.stringify(desktopCamera));
  await host.waitForFunction(() => !window.__BALLSY__.state().room?.connected);
  if (!(await giantState()).joined) await join();
  await giant.locator('[data-mode="shovel"]').click();
  await settledFrames();
  await giant.evaluate(() => {
    window.__desktopInputEvents = [];
    const record = event => window.__desktopInputEvents.push({ type: event.type, at: performance.now(), held: window.__BALLSY_GIANT__.state().shovel.held, live: window.__BALLSY_GIANT__.state().live, round: window.__BALLSY_GIANT__.state().snapshot?.roundId });
    for (const name of ["blur", "focus"]) window.addEventListener(name, record);
    for (const name of ["pointerdown", "pointermove", "pointerup", "pointercancel", "lostpointercapture"]) document.querySelector("canvas").addEventListener(name, record);
  });
  const earthBefore = (await hostState()).volcano.earth.excavated;
  const from = await giant.evaluate(() => window.__BALLSY_GIANT__.terrainPoint(7, -2).screen);
  await giant.mouse.move(...from); await giant.mouse.down();
  for (let i = 1; i <= 12; i++) {
    const next = await giant.evaluate(x => window.__BALLSY_GIANT__.terrainPoint(x, -2).screen, 7 + i * .16);
    await giant.mouse.move(...next); await giant.waitForTimeout(100); await step(100);
  }
  await giant.mouse.up();
  await host.waitForFunction(before => window.__BALLSY__.state().volcano.earth.excavated > before, earthBefore);
  report.desktopInputEvents = await giant.evaluate(() => window.__desktopInputEvents);
  check("Desktop shovel still excavates after VR exit", (await hostState()).volcano.earth.excavated > earthBefore);
  await capture(giant, "desktop-shovel-after-vr");
  await giant.locator('[data-mode="balloon"]').click();
  await giant.evaluate(() => { window.__ballsyXR.localOnly = true; window.__ballsyXR.viewer = [0, 0, 0]; window.__ballsyXR.viewerYaw = 0; });
  await giant.locator("[data-vr]").click();
  await giant.waitForFunction(() => window.__BALLSY_GIANT__.xr.session.snapshot.phase === "active");
  check("Reentry falls back to local when floor is unavailable", await giant.evaluate(() => window.__ballsyXR.referenceType === "local"));
  await giant.evaluate(() => { window.__ballsyXR.connect(0, "right"); });
  await settledFrames();
  report.localFallback = await giantState();
  check("Local fallback retains a floor-height tabletop", Math.abs(report.localFallback.table.position[1]) < .001, report.localFallback.table);
  await available(); await grab(0);
  const roleDepartureLaunches = (await giantState()).balloon.launches;
  await giant.locator("[data-leave]").click();
  await host.waitForFunction(() => !window.__BALLSY__.state().room?.connected);
  await giant.waitForFunction(() => window.__BALLSY_GIANT__.xr.session.snapshot.phase === "ready");
  check("Leaving giant role exits VR and releases ownership", !(await giantState()).joined && !(await giantState()).balloon.held && (await giantState()).balloon.launches === roleDepartureLaunches);
  check("Host racing remains available after role departure", (await hostState()).phase === "racing");
  const requests = await giant.evaluate(() => window.__ballsyXR.requests);
  check("All immersive requests retain user activation and optional hand tracking", requests.length === 3 && requests.every(request => request.activation && request.mode === "immersive-vr" && !request.options.requiredFeatures && request.options.optionalFeatures.includes("hand-tracking")), requests);
  check("No browser errors", report.errors.length === 0, report.errors);
  report.commands = commands; report.ok = true;
  console.log(JSON.stringify({ ok: true, checks: report.checks.length, directory, physicalHeadset: false }));
} catch (error) {
  report.ok = false; report.failure = String(error);
  if (host && !host.isClosed()) { report.failureHost = await hostState().catch(() => null); if (report.failureHost?.room) delete report.failureHost.room.code; await capture(host, "failure-host").catch(() => {}); }
  if (giant && !giant.isClosed()) { report.failureGiant = await giantState().catch(() => null); report.desktopInputEvents = await giant.evaluate(() => window.__desktopInputEvents).catch(() => null); await capture(giant, "failure-giant").catch(() => {}); }
  throw error;
} finally {
  report.finishedAt = new Date().toISOString();
  writeFileSync(path.join(directory, "shared-vr-report.json"), JSON.stringify(report, null, 2));
  await browser.close(); await app.close();
}
