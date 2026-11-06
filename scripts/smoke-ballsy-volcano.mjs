import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { applySmokeTimeout, launchSmokeBrowser } from "./smoke-harness.mjs";

const base = process.env.SMOKE_BASE || "http://127.0.0.1:4197/";
const art = process.env.SMOKE_ARTIFACTS || "output/ballsy-volcano";
mkdirSync(art, { recursive: true });
const browser = await launchSmokeBrowser();
const errors = [], report = {};
async function open(mode = "challenge", pads = false) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  applySmokeTimeout(page);
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  if (pads) await page.addInitScript(() => {
    window.volcanoPads = [0, 1].map((index) => ({ index, connected: true, mapping: "standard", id: `Synthetic pad ${index}`, axes: [0, 0], buttons: [] }));
    Object.defineProperty(navigator, "getGamepads", { value: () => window.volcanoPads });
  });
  await page.goto(new URL(`ballsy.html?mode=${mode}`, base).href, { waitUntil: "load" });
  await page.waitForFunction(() => !!window.__BALLSY__);
  await page.evaluate(() => window.advanceTime(0));
  return page;
}
const read = (page) => page.evaluate(() => window.__BALLSY__.state());
const step = (page, ms) => page.evaluate((t) => window.advanceTime(t), ms);
const start = async (page) => { await page.getByRole("button", { name: /C'est parti/ }).click(); await step(page, 3100); };
async function hold(page, point, ms) {
  const box = await page.locator(`[data-dig-point="${point}"]`).boundingBox();
  assert.ok(box, "the preparation target must be visible and clickable");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await step(page, ms);
  await page.mouse.up();
}

try {
  const page = await open();
  report.lobby = await read(page);
  assert.equal(report.lobby.course, "volcano");
  assert.equal(await page.evaluate(() => window.__BALLSY__.commandGiant({ type: "route", route: "divert" }).ok), false);
  await page.screenshot({ path: path.join(art, "volcano-lobby.png") });
  await start(page);
  await page.getByRole("button", { name: "1 rivière", exact: true }).click();
  assert.equal((await read(page)).volcano.charges, 3);
  assert.equal((await read(page)).volcano.pending.phase, "travel");
  await step(page, 850);
  await page.locator('[data-dig-point="0"]').click();
  assert.equal((await read(page)).volcano.pending.strokes, 0, "a click is not a sustained shovel gesture");
  await hold(page, 0, 400);
  assert.equal((await read(page)).volcano.pending.strokes, 0);
  await page.keyboard.press("KeyP");
  const paused = await read(page);
  await step(page, 2000);
  assert.deepEqual((await read(page)).volcano, paused.volcano, "pause freezes water and preparation");
  await page.getByRole("button", { name: /On continue/ }).click();
  for (let point = 0; point < 3; point++) await hold(page, point, 810);
  assert.equal((await read(page)).volcano.pending.phase, "warning");
  assert.equal((await read(page)).volcano.route, "split");
  await page.screenshot({ path: path.join(art, "volcano-warning.png") });
  await step(page, 1250);
  assert.equal((await read(page)).volcano.route, "concentrate");
  assert.deepEqual((await read(page)).volcano.streams.map((s) => s.flow), [1, 0]);
  report.geometry = await page.evaluate(() => {
    const api = window.__GRAPHYSX__;
    return { mountain: api.query({ ids: ["volcano-mountain"] })[0], river: api.query({ ids: ["volcano-stream-0-cross"] })[0],
      unusedRiver: api.query({ ids: ["volcano-stream-1-cross"] })[0] };
  });
  assert.equal(report.geometry.mountain.type, "mesh");
  assert.equal(report.geometry.unusedRiver.visible, false);

  // Same initial velocity, same body/steering: the wet ball slows even without a held input.
  report.slowing = await page.evaluate(() => {
    const api = window.__GRAPHYSX__;
    ["ballsy-p1", "ballsy-p2"].forEach((id, i) => api.update(id, { transform: { position: [i ? 15.3 : 13, 0.7, -1.5] }, physics: { mode: "dynamic", linearVelocity: [0, 0, -6] } }));
    return window.advanceTime(450);
  });
  const wet = Math.hypot(report.slowing.players[0].velocity[0], report.slowing.players[0].velocity[2]);
  const dry = Math.hypot(report.slowing.players[1].velocity[0], report.slowing.players[1].velocity[2]);
  assert.ok(wet < dry * 0.75, `wet=${wet}, dry=${dry}`);
  assert.ok(wet > 1.5, "lava slows but does not automatically immobilize a runner");
  await page.screenshot({ path: path.join(art, "volcano-concentrated.png") });
  await page.close();

  const flood = await open("help");
  await start(flood);
  await step(flood, 15700);
  report.flood = await read(flood);
  assert.equal(report.flood.volcano.source, 2);
  assert.ok(report.flood.volcano.streams.some((s) => s.lake > 0.5));
  assert.equal(await flood.evaluate(() => window.__GRAPHYSX__.query({ ids: ["volcano-lake-0"] })[0].visible), true);
  await flood.screenshot({ path: path.join(art, "volcano-flood.png") });
  await flood.close();

  const race = await open("help", true);
  await start(race);
  report.driven = await race.evaluate(() => {
    const api = window.__GRAPHYSX__;
    const paths = [[13, 8], [15.3, 10]].map(([x, z]) => [[x, z], [x, -z], [-x, -z], [-x, z]]);
    const next = [0, 0];
    let snapshot = window.__BALLSY__.state(), frames = 0, firstFinish = null;
    for (; frames < 7000; frames++) {
      const v = snapshot.volcano;
      const nextFlood = 12 - (v.time % 12);
      if (!v.pending && v.charges > 0 && v.time > 5 && nextFlood <= 6.4 && v.routeUntil < v.time + nextFlood + 3) window.__BALLSY__.commandGiant({ type: "route", route: "divert" });
      if (v.pending?.phase === "dig" && v.pending.heldPoint === null) window.__BALLSY__.commandGiant({ type: "dig", point: v.pending.strokes });
      ["ballsy-p1", "ballsy-p2"].forEach((id, i) => {
        const p = api.query({ ids: [id] })[0];
        let target = paths[i][next[i]], dx = target[0] - p.position[0], dz = target[1] - p.position[2];
        if (Math.hypot(dx, dz) < 1.3) { next[i] = (next[i] + 1) % 4; target = paths[i][next[i]]; dx = target[0] - p.position[0]; dz = target[1] - p.position[2]; }
        const distance = Math.hypot(dx, dz), desired = Math.min(4.7, distance * 2);
        window.volcanoPads[i].axes = [(dx / distance * desired - p.physics.linearVelocity[0]) * 0.22, (dz / distance * desired - p.physics.linearVelocity[2]) * 0.22];
      });
      snapshot = window.advanceTime(1000 / 60);
      if (!firstFinish && snapshot.players.filter((p) => p.run.phase === "complete").length === 1) firstFinish = snapshot.phase;
      if (snapshot.phase === "results") break;
    }
    return { frames, state: snapshot, firstFinish };
  });
  assert.equal(report.driven.state.phase, "results", JSON.stringify(report.driven));
  assert.equal(report.driven.firstFinish, "racing");
  assert.ok(report.driven.state.volcano.interventions >= 2);
  assert.ok(report.driven.state.players.every((p) => p.run.lap === 2 && !p.run.desynced));
  assert.deepEqual(report.driven.state.rescues, [0, 0]);
  const v = report.driven.state.volcano;
  assert.ok(Math.abs(v.inputVolume - v.drainedVolume - v.streams.reduce((sum, s) => sum + s.stored + s.lake, 0)) < 1e-7);
  await race.screenshot({ path: path.join(art, "volcano-results.png") });
  await race.getByRole("button", { name: /La revanche/ }).click();
  const reset = await read(race);
  assert.equal(reset.volcano.charges, 4);
  assert.equal(reset.volcano.time, 0);
  assert.ok(reset.volcano.streams.every((s) => s.lake === 0 && s.stored === 0));
  await step(race, 3100);
  await race.setViewportSize({ width: 1920, height: 1080 });
  await race.screenshot({ path: path.join(art, "volcano-tv.png") });
  await race.close();
  assert.deepEqual(errors, []);
  writeFileSync(path.join(art, "volcano-report.json"), JSON.stringify({ ...report, errors }, null, 2));
  console.log(JSON.stringify({ ok: true, frames: report.driven.frames, interventions: v.interventions, wetSpeed: wet, drySpeed: dry, errors }));
} finally { await browser.close(); }
