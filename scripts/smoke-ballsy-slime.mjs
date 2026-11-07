import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { applySmokeTimeout, launchSmokeBrowser } from "./smoke-harness.mjs";
import { startBallsyServer } from "./serve-ballsy.mjs";

// Run only after source freeze, under with-verify-lock and the agreed exclusive slot.
// Actual desktop input is the launch source. Request replays are separate abuse probes.
const directory = process.env.SMOKE_ARTIFACTS || "output/ballsy-slime";
mkdirSync(directory, { recursive: true });
const report = {
  label: "Real pointer input and real HTTP host/guest transport; automated, not human playtesting",
  startedAt: new Date().toISOString(), errors: [], captures: [], checks: [],
  xr: { tested: false, reason: "Desktop suite. No physical Quest claim." },
};
const app = await startBallsyServer({ port: 0, ...(process.env.SMOKE_DIST_ROOT ? { root: path.resolve(process.env.SMOKE_DIST_ROOT) } : {}) });
const browser = await launchSmokeBrowser();
let host, giant;
const commandRequests = [];
const check = (name, condition, detail) => {
  report.checks.push({ name, passed: !!condition, ...(detail === undefined ? {} : { detail }) });
  assert.ok(condition, name);
};
const hostState = () => host.evaluate(() => window.__BALLSY__.state());
const giantState = () => giant.evaluate(() => window.__BALLSY_GIANT__.state());
const step = (milliseconds) => host.evaluate(ms => window.advanceTime(ms), milliseconds);
async function capture(page, name) {
  await page.screenshot({ path: path.join(directory, `${name}.png`) });
  report.captures.push(`${name}.png`);
}
function observe(page) {
  applySmokeTimeout(page);
  page.on("pageerror", error => report.errors.push(String(error)));
  page.on("console", message => { if (message.type() === "error") report.errors.push(message.text()); });
}
async function performanceSample(page, context) {
  return page.evaluate(async context => {
    const canvas = document.querySelector("canvas"), gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    const extension = gl?.getExtension("WEBGL_debug_renderer_info"), frames = [];
    let previous = performance.now();
    await new Promise(resolve => {
      const frame = now => { frames.push(now - previous); previous = now; if (frames.length < 120) requestAnimationFrame(frame); else resolve(); };
      requestAnimationFrame(frame);
    });
    return { context, method: "120 real requestAnimationFrame intervals; no advanceTime", phase: window.__BALLSY__.state().phase,
      viewport: [innerWidth, innerHeight], drawingBuffer: [canvas.width, canvas.height], dpr: devicePixelRatio,
      renderer: extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : gl?.getParameter(gl.RENDERER),
      fps: 1000 / (frames.reduce((a,b) => a+b, 0) / frames.length), p95FrameMs: [...frames].sort((a,b) => a-b)[Math.floor(frames.length * .95)] };
  }, context);
}
async function pickBalloon() {
  const before = await giantState();
  const stock = before.balloon.stock.find(item => item.visible);
  assert.ok(stock, "A visible balloon is available to pick up");
  await giant.mouse.move(...stock.screen); await giant.mouse.down();
  await giant.waitForFunction(() => window.__BALLSY_GIANT__.state().balloon.held);
  return stock;
}
async function projectModel(position) {
  return giant.evaluate(position => window.__BALLSY_GIANT__.modelPoint(...position), position);
}
async function flingAt(position) {
  const stock = await pickBalloon();
  const stockModel = (await giant.evaluate(world => {
    const zero = window.__BALLSY_GIANT__.modelPoint(0,0,0).world;
    return world.map((value,index) => (value-zero[index])/.045);
  }, stock.world));
  // A modest real mouse sweep on the same horizontal plane as the picked balloon.
  // Offset the release by ballistic travel, rather than moving the target or calling launch.
  const height = stockModel[1], speed = 10;
  const flight = Math.sqrt(Math.max(.01, 2 * (height-position[1]) / (9.81/.045)));
  const release = [position[0]-speed*flight, height, position[2]];
  const from = [release[0]-speed*.12, height, release[2]];
  await giant.mouse.move(...(await projectModel(from)).screen, { steps: 8 });
  await giant.waitForTimeout(180);
  for (let index=1; index<=8; index++) {
    const point = [from[0]+(release[0]-from[0])*index/8, height, from[2]];
    await giant.mouse.move(...(await projectModel(point)).screen);
    await giant.waitForTimeout(15);
  }
  await giant.mouse.up();
  return { target: position, intendedRelease: release, intendedSpeed: speed, stock: { world: stock.world, screen: stock.screen } };
}
async function replay(packet, body = packet.body) {
  // Credentials remain in memory only; no request headers or tokens go into artifacts.
  const response = await fetch(packet.url, { method: "POST", headers: { "content-type": "application/json", authorization: packet.authorization, origin: new URL(packet.url).origin }, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
}

try {
  host = await browser.newPage({ viewport: { width: 1280, height: 720 } }); observe(host);
  await host.goto(`${app.url}ballsy.html?course=volcano`, { waitUntil: "load" });
  await host.waitForFunction(() => !!window.__BALLSY__);
  await host.locator('[data-action="start"]').click();
  await host.waitForFunction(() => window.__BALLSY__.state().phase === "racing");
  report.browserVersion = browser.version();
  report.performance = [await performanceSample(host, "Host alone, unpaused idle racers")];
  await capture(host, "host-racing-before-slime");
  await host.evaluate(() => {
    const api = window.__GRAPHYSX__, original = api.setSlowdownLive;
    window.ballsyObservedSlowdown = {};
    api.setSlowdownLive = (id, factor) => {
      const result = original.call(api, id, factor);
      window.ballsyObservedSlowdown[id] = factor;
      return result;
    };
  });
  await host.locator('[data-action="invite"]').click();
  await host.waitForFunction(() => !!window.__BALLSY__.state().room?.code);
  const roomCode = (await hostState()).room.code;
  // Freeze simulation, not networking, so screenshots can catch the entire ballistic sequence.
  await step(0);
  giant = await browser.newPage({ viewport: { width: 1280, height: 720 } }); observe(giant);
  giant.on("request", request => {
    if (request.method() === "POST" && request.url().endsWith("/command")) {
      const body = request.postDataJSON();
      if (body?.command?.type === "slime") commandRequests.push({ url: request.url(), authorization: request.headers().authorization, body });
    }
  });
  const guestBase = new URL(app.url); guestBase.hostname = "localhost";
  await giant.goto(`${guestBase}ballsy-giant.html`, { waitUntil: "load" });
  await giant.waitForFunction(() => !!window.__BALLSY_GIANT__);
  await giant.locator("#room-code").fill(roomCode); await giant.getByRole("button", { name: "Rejoindre", exact: true }).click();
  await giant.waitForFunction(() => window.__BALLSY_GIANT__.state().live && window.__BALLSY_GIANT__.state().snapshot?.phase === "racing");
  await host.waitForFunction(() => window.__BALLSY__.state().room?.connected);
  report.initial = { host: await hostState(), giant: await giantState() };
  check("Default giant tool is the balloon", report.initial.giant.mode === "balloon" || report.initial.giant.balloon.mode === "balloon");
  const course = await host.evaluate(() => window.__BALLSY__.course());
  report.giantFraming = await giant.evaluate(({course,players}) => {
    const api = window.__BALLSY_GIANT__;
    const edges = [...course.main,...course.shortcut].flatMap(p => [-p.width/2,p.width/2].map(lateral => api.modelPoint(p.x+p.tz*lateral,p.y+p.bank*lateral,p.z-p.tx*lateral).screen));
    return { viewport:[innerWidth,innerHeight], clippedEdges:edges.filter(([x,y]) => x<0||x>innerWidth||y<0||y>innerHeight).length, totalEdges:edges.length,
      players:players.map(player => {const screen=api.modelPoint(...player.position).screen;return {id:player.id,screen,inFrame:screen[0]>=0&&screen[0]<=innerWidth&&screen[1]>=0&&screen[1]<=innerHeight,element:document.elementFromPoint(...screen)?.tagName};}) };
  }, {course,players:report.initial.host.players});
  check("Desktop giant frames the complete road and both racers", report.giantFraming.clippedEdges===0 && report.giantFraming.players.every(player=>player.inFrame && player.element==="CANVAS"), report.giantFraming);
  await capture(giant, "giant-balloon-ready");

  const stationaryBefore = (await hostState()).slime.throws;
  await pickBalloon(); await giant.waitForTimeout(220); await giant.mouse.up();
  await giant.waitForTimeout(220);
  const stationary = await giantState(); report.stationaryRelease = stationary.balloon.lastLaunch;
  check("Stationary desktop release invents no impulse", (await hostState()).slime.throws === stationaryBefore || Math.hypot(...stationary.balloon.lastLaunch.velocity) < .001);
  await step(3400);
  await giant.waitForFunction(() => window.__BALLSY_GIANT__.state().balloon.stock.some(item => item.visible));
  const initialThrows = (await hostState()).slime.throws, requestsBefore = commandRequests.length;
  await pickBalloon(); await giant.evaluate(() => window.dispatchEvent(new Event("blur"))); await giant.mouse.up();
  await giant.waitForTimeout(180);
  check("Focus loss cancels a held balloon", !(await giantState()).balloon.held && (await hostState()).slime.throws === initialThrows);

  const target = (await hostState()).players[0].position;
  report.gesture = await flingAt(target);
  await host.waitForFunction(previous => window.__BALLSY__.state().slime.throws > previous, initialThrows);
  report.gesture.observed = (await giantState()).balloon.lastLaunch;
  check("A real pointer release emits one network launch", commandRequests.length === requestsBefore + 1 && (await hostState()).slime.throws === initialThrows + 1);
  const originalPacket = commandRequests.at(-1);
  report.trajectory = [];
  for (let index=0; index<50; index++) {
    const state = await step(index === 0 ? 0 : 1000/60);
    report.trajectory.push({ time: state.slime.time, projectiles: state.slime.projectiles, splats: state.slime.splats, slowUntil: state.slime.slowUntil, players: state.players });
    if (index === 1) { await giant.waitForTimeout(220); await capture(host, "host-balloon-in-flight"); await capture(giant, "giant-balloon-in-flight"); }
    if (state.slime.splats.length) break;
  }
  const impact = await hostState(); report.impact = impact;
  check("Balloon trajectory reaches a visible impact", report.trajectory.some(frame => frame.projectiles.length) && impact.slime.splats.length > 0);
  check("Real pointer throw hits the first racer", impact.slime.slowUntil[0] > impact.slime.time, impact.slime);
  await giant.waitForFunction(() => window.__BALLSY_GIANT__.state().snapshot?.slime?.splats.length > 0);
  await capture(host, "host-slime-impact"); await capture(giant, "giant-slime-impact");
  await step(100);
  await giant.waitForFunction(time => window.__BALLSY_GIANT__.state().snapshot?.slime?.time >= time, impact.slime.time+.09);
  report.impactCoats = await host.evaluate(() => [0,1].map(index => {
    const coat=window.__GRAPHYSX_HOST__.world.getEntityObject(`ballsy-slime-coat-${index}`);
    return {visible:coat?.visible,parent:coat?.parent?.name};
  }));
  check("Only the impacted racer receives a visible slime coating", report.impactCoats[0].visible===true && report.impactCoats[1].visible===false, report.impactCoats);
  await capture(host, "host-slime-impact-expanded"); await capture(giant, "giant-slime-impact-expanded");
  report.replay = await replay(originalPacket);
  await giant.waitForTimeout(220);
  check("HTTP retry does not replay the throw", report.replay.body.accepted && (await hostState()).slime.throws === initialThrows + 1);

  // Keep the original packet's semantic throw ID while changing transport IDs.
  // This stresses both relay rate bounds and host deduplication without adding genuine throws.
  report.rateLimit = await Promise.all(Array.from({length: 30}, () => replay(originalPacket, { ...originalPacket.body, id: randomUUID() })));
  await giant.waitForTimeout(220);
  check("Relay limits a burst of fresh packet IDs", report.rateLimit.some(result => result.body.accepted === false));
  check("Semantic throw replay cannot stack slowdown", (await hostState()).slime.throws === initialThrows + 1 && (await hostState()).slime.slowUntil[0] === impact.slime.slowUntil[0]);

  const beforePause = await hostState(); await host.keyboard.press("KeyP");
  const paused = await hostState(); await step(1000);
  const frozen = await hostState();
  check("Pause freezes active slowdown", frozen.phase === "paused" && frozen.slime.time === paused.slime.time && frozen.slime.slowUntil[0] === paused.slime.slowUntil[0]);
  check("Pause invalidates the previous network round", paused.roundId !== beforePause.roundId);
  await giant.waitForFunction(() => window.__BALLSY_GIANT__.state().snapshot?.phase === "paused");
  report.staleRound = await replay(originalPacket, { ...originalPacket.body, id: randomUUID() });
  check("Paused or stale round packet is rejected", report.staleRound.body.accepted === false);
  await host.keyboard.press("KeyP");

  // Matched real keyboard thrust on the starting straight, treatment and control racer.
  // Same force, mass and authored speed cap; no pose, velocity or effect injection.
  await host.keyboard.down("ArrowLeft"); await host.keyboard.down("KeyA");
  report.recovery = [];
  for (let index=0; index<15; index++) {
    const state = await step(200);
    const observations = await host.evaluate(() => ({ factors: { ...window.ballsyObservedSlowdown }, controls: window.__GRAPHYSX__.query({ids:["ballsy-p1","ballsy-p2"]}).map(player => player.steering) }));
    report.recovery.push({ time: state.slime.time, speeds: state.players.map(player => Math.hypot(player.velocity[0], player.velocity[2])), ...observations,
      slowUntil: [...state.slime.slowUntil], positions: state.players.map(player => player.position), rescues: state.rescues });
  }
  await host.keyboard.up("ArrowLeft"); await host.keyboard.up("KeyA");
  const recovered = await hostState();
  check("Slowdown expires rather than persisting", recovered.slime.time > recovered.slime.slowUntil[0]);
  const activeSamples = report.recovery.filter(frame => frame.factors["ballsy-p1"] === .75 && frame.time >= impact.slime.time+1 && frame.time < impact.slime.slowUntil[0]-.05);
  check("Host applies 0.75 to the impacted racer and 1 to the control", activeSamples.length >= 3 && activeSamples.every(frame => frame.factors["ballsy-p2"] === 1));
  const average = values => values.reduce((sum,value) => sum+value,0)/values.length;
  report.speedComparison = { method: "Simultaneous ArrowLeft and KeyA for identical full-throttle commands on the initial straight; real contact physics; no body writes", activeSamples,
    slowedMean: average(activeSamples.map(frame => frame.speeds[0])), controlMean: average(activeSamples.map(frame => frame.speeds[1])), recovered: report.recovery.at(-1) };
  report.speedComparison.ratio = report.speedComparison.slowedMean/report.speedComparison.controlMean;
  check("Physical racer speed is mildly reduced versus equal-input control", report.speedComparison.controlMean > 5 && report.speedComparison.ratio >= .65 && report.speedComparison.ratio <= .9, report.speedComparison);
  const recoverySample = report.recovery.at(-1);
  check("Normal factor and physical speed recover after two seconds", recoverySample.factors["ballsy-p1"] === 1 && recoverySample.speeds[0] > report.speedComparison.slowedMean*1.12 && recoverySample.speeds[0]/recoverySample.speeds[1] > .9, recoverySample);
  check("Slime never edits either authored steering cap", report.recovery.every(frame => frame.controls.every(control => control.speedCap === 8)));
  check("The comparison uses continuous racing without recoveries", report.recovery.every(frame => frame.rescues.every(count => count === 0)));
  check("The visual coating disappears with the expired effect", await host.evaluate(() => !window.__GRAPHYSX_HOST__.world.getEntityObject("ballsy-slime-coat-0").visible));
  check("Recovery preserves two racers and two-lap rules", recovered.players.length === 2 && recovered.laps === 2);
  await capture(host, "host-slime-recovered");

  await giant.locator('[data-mode="shovel"]').click();
  const earthBefore = (await hostState()).volcano.earth.excavated;
  const from = await giant.evaluate(() => window.__BALLSY_GIANT__.terrainPoint(7,-2).screen);
  await giant.mouse.move(...from); await giant.mouse.down();
  for (let index=1; index<=12; index++) {
    const next = await giant.evaluate(x => window.__BALLSY_GIANT__.terrainPoint(x,-2).screen, 7+index*.16);
    await giant.mouse.move(...next); await giant.waitForTimeout(100); await step(100);
  }
  await giant.mouse.up(); await giant.waitForTimeout(180);
  report.shovel = { before: earthBefore, after: (await hostState()).volcano.earth.excavated };
  check("Secondary shovel still excavates through real mouse input", report.shovel.after > earthBefore);
  await capture(giant, "giant-secondary-shovel");
  await giant.locator('[data-mode="balloon"]').click();

  await giant.waitForFunction(() => window.__BALLSY_GIANT__.state().balloon.stock.some(item => item.visible));
  const flightBefore = (await hostState()).slime.throws;
  await flingAt((await hostState()).players[0].position);
  await host.waitForFunction(previous => window.__BALLSY__.state().slime.throws > previous, flightBefore);
  check("An airborne balloon exists before pause cancellation", (await hostState()).slime.projectiles.length > 0);
  await host.keyboard.press("KeyP");
  check("Pause cancels airborne balloons", (await hostState()).slime.projectiles.length === 0);

  await host.locator('[data-action="restart"]').click();
  const reset = await hostState(); report.reset = reset;
  check("Restart clears all slime state", reset.slime.projectiles.length === 0 && reset.slime.splats.length === 0 && reset.slime.slowUntil.every(time => time === 0));
  await step(3100);
  await giant.waitForFunction(() => window.__BALLSY_GIANT__.state().snapshot?.phase === "racing");
  await giant.locator("[data-leave]").click();
  await host.waitForFunction(() => !window.__BALLSY__.state().room?.connected);
  const beforeDrive = await hostState(); await host.keyboard.down("ArrowLeft"); const afterDrive = await step(500); await host.keyboard.up("ArrowLeft");
  check("Giant disconnect does not stop the race", afterDrive.phase === "racing" && Math.hypot(...afterDrive.players[0].position.map((value,index) => value-beforeDrive.players[0].position[index])) > .05);
  check("No browser console or page errors", report.errors.length === 0, report.errors);
  report.ok = true;
  console.log(JSON.stringify({ok:true,checks:report.checks.length,artifactDirectory:directory,performance:report.performance}));
} catch (error) {
  report.ok = false; report.failure = String(error);
  if (host && !host.isClosed()) { report.failureHost = await hostState().catch(() => null); await capture(host, "failure-host").catch(() => {}); }
  if (giant && !giant.isClosed()) { report.failureGiant = await giantState().catch(() => null); await capture(giant, "failure-giant").catch(() => {}); }
  throw error;
} finally {
  report.finishedAt = new Date().toISOString();
  writeFileSync(path.join(directory, "slime-report.json"), JSON.stringify(report, null, 2));
  await browser.close(); await app.close();
}
