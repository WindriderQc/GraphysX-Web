import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { applySmokeTimeout, launchSmokeBrowser } from "./smoke-harness.mjs";
import { startStaticServer } from "./static-server.mjs";

const ART = process.env.SMOKE_ARTIFACTS || "output/verify";
mkdirSync(ART, { recursive: true });
let browser, server;
const errors = [];
try {
  if (!process.env.SMOKE_BASE) server = await startStaticServer({ root: path.resolve("dist"), port: 0 });
  const base = (process.env.SMOKE_BASE ?? server.url).replace(/\/$/, "");
  browser = await launchSmokeBrowser();
  const page = applySmokeTimeout(await browser.newPage({ viewport: { width: 1280, height: 800 }, hasTouch: true }));
  page.on("pageerror", error => errors.push(String(error)));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  const state = () => page.evaluate(() => JSON.parse(window.render_game_to_text()).application);
  const dialog = () => page.locator("#kidx-mission-debrief");
  const capture = name => page.screenshot({ path: path.join(ART, `kidx-debrief-${name}.png`) });
  const finish = () => page.evaluate(() => {
    let state;
    for (let frame = 0; frame < 360; frame++) {
      state = window.advanceTime(1000 / 60);
      if (!state.program.running) break;
    }
    return state;
  });
  const blocks = async ids => { for (const id of ids) await page.locator(`[data-ev3-block='${id}']`).click(); };
  const clear = async () => { while ((await state()).program.blocks.length) await page.locator("[data-ev3-undo]").click(); };
  const reachable = async selector => {
    const value = await page.locator(selector).evaluate(element => {
      element.scrollIntoView({ block: "nearest" });
      const box = element.getBoundingClientRect();
      return { width: box.width, height: box.height, left: box.left, right: box.right, bottom: box.bottom,
        hit: element.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)) };
    });
    assert.ok(value.width >= 44 && value.height >= 44 && value.left >= 0 && value.right <= page.viewportSize().width && value.bottom <= page.viewportSize().height && value.hit, JSON.stringify({ selector, value }));
  };
  await page.goto(`${base}/?app=ev3-lab`, { waitUntil: "domcontentloaded" });
  await page.locator("[data-ev3-run]").waitFor();
  await page.evaluate(() => window.advanceTime(1000 / 60));
  assert.equal((await state()).debrief, null, "idle physics cannot invent a child's attempt");
  await blocks(["forward"]); await page.locator("[data-ev3-run]").click();
  const short = await finish();
  writeFileSync(path.join(ART, "kidx-debrief-short.json"), JSON.stringify(short, null, 2));
  assert.equal(short.debrief.outcome, "finished");
  assert.equal(short.debrief.segments.length, 1);
  assert.equal(short.debrief.segments[0].completed, true);
  assert.ok(short.debrief.segments[0].distance > .5);
  assert.deepEqual([short.debrief.end.x, short.debrief.end.z], [short.rover.position[0], short.rover.position[2]]);
  await page.locator("[data-kidx-debrief]").click();
  assert.match(await dialog().innerText(), /arrêté avant l’arrivée/);
  assert.equal((await state()).debrief.hintLevel, 0);
  for (const [width, height] of [[1280, 800], [320, 740], [390, 844], [800, 480]]) {
    await page.setViewportSize({ width, height });
    for (const selector of ["[data-debrief-close]", "[data-debrief-block='0']", "[data-debrief-scrub]", "[data-debrief-hint-next]", "[data-debrief-return]"]) await reachable(selector);
    assert.equal(await dialog().evaluate(element => element.scrollWidth <= element.clientWidth), true, "no horizontal dialog overflow");
    await dialog().evaluate(element => { element.scrollTop = 0; });
    await capture(`short-${width}`);
  }
  const frozen = await state();
  await page.locator("[data-debrief-scrub]").focus(); await page.keyboard.press("Home");
  assert.equal((await state()).debrief.cursor, 0);
  assert.equal(await page.locator("[data-debrief-scrub]").getAttribute("aria-valuetext"), "Début du bloc");
  await page.keyboard.press("End");
  await page.locator("[data-debrief-hint-next]").click();
  assert.match(await page.locator("[data-debrief-hint]").innerText(), /Faut-il/);
  await page.locator("[data-debrief-hint-next]").click();
  await page.locator("[data-debrief-hint-next]").click();
  assert.equal((await state()).debrief.hintLevel, 3);
  assert.match(await page.locator("[data-debrief-hint]").innerText(), /ajouter un bloc Avancer/);
  assert.deepEqual((await state()).program.blocks, frozen.program.blocks, "hints do not replace the child's program");
  assert.deepEqual((await state()).rover, frozen.rover, "scrubbing and hints never move the live rover");
  assert.deepEqual((await state()).mission, frozen.mission, "reading never spends mission time");
  await page.locator("[data-debrief-hint-next]").click();
  assert.equal(await dialog().isVisible(), false);
  assert.equal(await page.locator("[data-kidx-debrief]").evaluate(element => element === document.activeElement), true);
  await blocks(["left", "forward", "forward"]);
  assert.deepEqual((await state()).debrief.blocks, ["forward"], "editing preserves the immutable last attempt");
  await page.locator("[data-ev3-run]").click();
  assert.equal((await state()).debrief, null, "starting clears the old report");
  await page.evaluate(() => window.advanceTime(100));
  await page.locator("[data-kidx-stop]").click();
  assert.equal((await state()).debrief.outcome, "stopped");
  await page.locator("[data-kidx-debrief]").click();
  assert.equal(await page.locator("[data-debrief-block='1']").isDisabled(), true);
  assert.match(await dialog().innerText(), /Pas encore joué/);
  await capture("stopped"); await page.keyboard.press("Escape");
  await page.locator("[data-ev3-run]").click();
  const turned = await finish();
  writeFileSync(path.join(ART, "kidx-debrief-turn.json"), JSON.stringify(turned, null, 2));
  assert.ok(turned.mission.misses > 0, "this physical route crosses a red zone");
  assert.ok(turned.debrief.segments.some(segment => segment.red), "red events retain the block active at the crossing");
  assert.ok(turned.debrief.segments[1].turn < -70);
  assert.ok(turned.debrief.segments[2].end.x < turned.debrief.segments[2].start.x - .5);
  assert.equal(turned.debrief.segments[1].completed, true);
  await page.locator("[data-kidx-debrief]").click();
  await page.locator("[data-debrief-block='1']").click();
  assert.equal((await state()).debrief.selectedBlock, 1);
  assert.match(await page.locator("[data-debrief-detail]").innerText(), /rotation/);
  await page.setViewportSize({ width: 1280, height: 800 });
  await capture("turn"); await page.keyboard.press("Escape");
  await clear(); await blocks(Array(6).fill("forward"));
  await page.locator("[data-ev3-run]").click();
  const success = await finish();
  writeFileSync(path.join(ART, "kidx-debrief-complete.json"), JSON.stringify(success, null, 2));
  assert.equal(success.mission.phase, "complete");
  assert.equal(success.debrief.outcome, "complete");
  assert.ok(success.debrief.segments.length < 6, "arriving prevents unused instructions acquiring traces");
  assert.ok(success.debrief.segments.every((segment, index) => index === 0 || Math.abs(segment.start.z - success.debrief.segments[index - 1].end.z) < 1e-9));
  await page.locator("[data-kidx-debrief]").click();
  assert.match(await dialog().innerText(), /Réussi/);
  assert.equal(await page.locator("[data-debrief-map]").evaluate(svg => {
    const body = svg.querySelector("[data-trace-footprint]").getBBox();
    const blue = svg.querySelector("[data-trace-zone='finish']").getBBox();
    return body.x <= blue.x + blue.width + 1 && body.x + body.width >= blue.x - 1
      && body.y <= blue.y + blue.height + 1 && body.y + body.height >= blue.y - 1;
  }), true, "the map shows the robot's footprint touching blue when the rules declare success");
  assert.equal(await page.locator("[data-debrief-block='5']").isDisabled(), true);
  await page.setViewportSize({ width: 390, height: 844 });
  await capture("complete"); await page.locator("[data-debrief-return]").click();
  await page.locator("[data-ev3-retry]").click();
  assert.equal((await state()).debrief, null);
  assert.equal(await page.locator("[data-kidx-debrief]").isVisible(), false);
  await clear(); await blocks(Array(6).fill("stop"));
  await page.locator("[data-ev3-run]").click();
  const stationary = await finish();
  assert.equal(stationary.debrief.segments.length, 6);
  assert.ok(stationary.debrief.segments.every(segment => segment.distance < .01));
  assert.match(stationary.debrief.summary, /resté au départ/);
  await page.locator("[data-kidx-debrief]").click();
  assert.equal(await page.locator("[data-trace-label]").evaluateAll(labels => labels.every(label => {
    const box = label.getBBox(); return box.x >= 0 && box.y >= 0 && box.x + box.width <= 360 && box.y + box.height <= 320;
  })), true, "six stationary blocks still have visible numbered map labels");
  await capture("stationary"); await page.keyboard.press("Escape");
  await page.locator("[data-ev3-mode='drive']").click();
  assert.equal((await state()).debrief, null);
  await page.locator(".gx-ev3-exit").click();
  assert.equal(await dialog().count(), 0, "leaving the mission disposes the report and dialog");
  await page.locator("[data-kidx-mission='sensor-retreat']").click();
  await page.locator("[data-kidx-lab]").waitFor();
  assert.equal(await page.locator("[data-kidx-debrief]").count(), 0, "advanced and cargo missions do not claim a simple-block report");
  assert.deepEqual(errors, []);
  console.log("KidX debrief smoke passed: measured block paths, short/turn/stop/success, unused blocks, progressive hints, frozen physics, compact layouts, focus, reset and disposal.");
} finally {
  if (browser) await browser.close();
  if (server) await server.close();
}
