import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { applySmokeTimeout, launchSmokeBrowser } from "./smoke-harness.mjs";
import { startStaticServer } from "./static-server.mjs";
import { createKidxDocumentRoute } from "./kidx-document-server.mjs";
import { createKidxTeamRoute } from "./kidx-team-server.mjs";
export async function runKidxInteractive({ part = "all" } = {}) {
  assert.ok(["all", "program", "drive", "construction"].includes(part), `Unknown interactive part: ${part}`);
  const ART = process.env.SMOKE_ARTIFACTS || "output/verify";
  mkdirSync(ART, { recursive: true });
  let browser, secondBrowser, server;
  const errors = [];
  const tracedContexts = [];
  try {
    if (!process.env.SMOKE_BASE) {
      const documents = await createKidxDocumentRoute(), teams = createKidxTeamRoute();
      server = await startStaticServer({ root: path.resolve("dist"), port: 0, routeRequest: (req, res) => teams(req, res) || documents(req, res) });
    }
    const base = (process.env.SMOKE_BASE ?? server.url).replace(/\/$/, "");
    browser = await launchSmokeBrowser();
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, hasTouch: true });
    const page = applySmokeTimeout(await context.newPage());
    page.on("pageerror", e => errors.push(String(e))); page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
    const state = () => page.evaluate(() => JSON.parse(window.render_game_to_text()).application);
    if (part !== "construction") await page.goto(`${base}/?app=ev3-lab`, { waitUntil: "domcontentloaded" });
    if (part === "drive") {
      await page.waitForFunction(() => typeof window.advanceTime === "function");
      await page.evaluate(() => window.advanceTime(0));
    }
    if (part === "all" || part === "program") {
      // Use real host time here: deterministic stepping would hide a world left paused after Stop.
      await page.locator("[data-ev3-block='forward']").click();
      await page.locator("[data-ev3-run]").click();
      await page.waitForFunction(() => !JSON.parse(window.render_game_to_text()).application.program.running);
      const finishedPosition = (await state()).rover.position;
      await page.locator("[data-ev3-mode='drive']").click();
      await page.waitForTimeout(300);
      const handoff = (await state()).rover;
      assert.deepEqual([handoff.position[0], handoff.position[2]], [finishedPosition[0], finishedPosition[2]], "entering Drive must brake residual program momentum before resuming the world");
      assert.deepEqual([handoff.velocity[0], handoff.velocity[2]], [0, 0]);
      assert.equal(await page.locator("[data-kidx-stop]").isDisabled(), true);
      const manualReverse = page.locator("[data-ev3='backward']");
      await manualReverse.focus(); await page.keyboard.down("Space"); await page.keyboard.up("Space");
      await page.locator("[data-kidx-stop]").click();
      assert.equal(await page.evaluate(() => window.__GRAPHYSX__.state().paused), true);
      const restartZ = (await state()).rover.position[2];
      await manualReverse.focus(); await page.keyboard.down("Space");
      assert.equal(await page.evaluate(() => window.__GRAPHYSX__.state().paused), false, "a fresh direction resumes after Stop");
      await page.waitForFunction(z => JSON.parse(window.render_game_to_text()).application.rover.position[2] > z + .05, restartZ);
      await page.keyboard.up("Space"); await page.locator("[data-kidx-stop]").click();
      assert.deepEqual((await state()).rover.velocity, [0, 0, 0]);
      await page.locator("[data-ev3-mode='program']").click();
      await page.locator("[data-kidx-lab]").click();
      await page.locator("[data-code-example]").click();
      await page.locator("[data-code-save]").click();
      assert.match(await page.locator("[data-code-status]").innerText(), /enregistré/);
      await page.reload(); await page.locator("[data-kidx-lab]").click(); await page.locator("[data-code-load]").click();
      assert.equal((await state()).laboratory.code[0].kind, "repeat");
      await page.evaluate(() => window.advanceTime(0));
      await page.locator("[data-code-step]").click();
      await page.evaluate(() => window.advanceTime(1000));
      const paused = await state(); assert.equal(paused.laboratory.paused, true); assert.ok(paused.rover.position[2] < 17);
      assert.equal(await page.locator("[data-kidx-stop]").isEnabled(), true, "a paused program can still be cancelled");
      assert.equal(await page.locator("[data-code-stop]").isEnabled(), true);
      await page.evaluate(() => window.advanceTime(500));
      assert.deepEqual((await state()).rover.position, paused.rover.position, "step pause must freeze the physical pose");
      await page.screenshot({ path: path.join(ART, "kidx-code-step.png") });
      await page.locator("[data-code-resume]").click();
      await page.locator("[data-lab-close]").click();
      await page.evaluate(() => window.advanceTime(2500));
      assert.equal((await state()).mission.phase, "complete", "a nested repeat must drive the ordinary mission");
      console.log("  ok nested programs, save/reload and physical step/pause/resume");
    }
    if (part === "all" || part === "drive") {
      if (part === "all") await page.locator("[data-ev3-retry]").click();
      await page.locator("[data-kidx-lab]").click();
      await page.locator("summary").filter({ hasText: "Pilotage et son" }).click();
      await page.locator("[data-lab-sound]").click();
      assert.equal(await page.locator("[data-lab-sound]").getAttribute("aria-pressed"), "true");
      assert.equal((await state()).wheels.soundEnabled, true);
      await page.locator("[data-lab-power]").focus(); await page.locator("[data-lab-power]").press("Home");
      await page.locator("[data-lab-close]").click();
      await page.locator("[data-ev3-mode='drive']").click();
      const reverse = page.locator("[data-ev3='backward']");
      assert.equal(await page.locator("[data-kidx-stop]").isDisabled(), true, "selecting Drive is not yet a motor command");
      await reverse.focus(); await page.keyboard.down("Space");
      const movement = await page.evaluate(() => ({ state: window.advanceTime(500), meters: window.__GRAPHYSX__.query({ tag: "kidx-lcd" }).filter(e => e.visible).length }));
      await page.keyboard.up("Space");
      assert.equal(await page.locator("[data-kidx-stop]").isEnabled(), true, "release can leave momentum, so braking must remain available");
      const reversing = movement.state; assert.ok(reversing.rover.position[2] > 17.1, "low-power held reverse must overcome rolling resistance");
      assert.ok(reversing.wheels.lcdMotors.every(level => level > 0), "both brick LCD meters must reflect actual wheel movement");
      assert.equal(movement.meters, 2);
      const released = await page.evaluate(() => window.advanceTime(800));
      assert.ok(Math.hypot(...released.rover.velocity) < 0.1, "releasing the keyboard must stop driving without the emergency button");
      await page.locator("[data-kidx-stop]").click();
      const stoppedPose = (await state()).rover.position;
      assert.ok(stoppedPose[2] > 17.1); assert.deepEqual((await state()).rover.velocity, [0, 0, 0]);
      assert.equal(await page.locator("[data-kidx-stop]").isDisabled(), true);
      await page.locator("[data-ev3-mode='program']").click();
      for (const width of [390, 800]) {
        await page.setViewportSize({ width, height: width === 800 ? 480 : 844 });
        await page.locator("[data-kidx-lab]").click();
        const reach = await page.locator("[data-code-run]").evaluate(button => { button.scrollIntoView({ block: "nearest" }); const r=button.getBoundingClientRect(); return { left:r.left, right:r.right, bottom:r.bottom, hit:button.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)) }; });
        assert.ok(reach.left >= 0 && reach.right <= width && reach.hit, JSON.stringify(reach));
        await page.screenshot({ path: path.join(ART, `kidx-code-${width}.png`) });
        await page.locator("[data-lab-close]").click();
      }
      console.log("  ok sound, low-power keyboard reverse, release and compact controls");
    }
    if (part === "all" || part === "construction") {
      // A cold second WebGL client can still be loading CAD after its HTML controls
      // appear. Use the same asset readiness contract as the construction-guide smoke.
      const constructionReady = target => target.waitForFunction(() => {
        const models = window.__GRAPHYSX__?.state().entities.filter(entity => entity.tags.includes("kidx-build"));
        return models?.length && models.every(entity => entity.asset?.status === "ready");
      });
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto(`${base}/?app=ev3-lab&view=build&model=track3r`, { waitUntil: "domcontentloaded" });
      await constructionReady(page);
      await page.locator("[data-build-replay]").click();
      await page.waitForFunction(() => window.__GRAPHYSX__.query({ ids: ["kidx-demo-piece-0", "kidx-demo-destination"] }).every(e => e.asset?.status === "ready"));
      await page.evaluate(() => window.advanceTime(400));
      await page.locator("[data-build-pause]").click();
      const moving = await page.evaluate(() => window.__GRAPHYSX__.query({ ids: ["kidx-demo-piece-0"] })[0].position);
      await page.evaluate(() => window.advanceTime(500));
      assert.deepEqual(await page.evaluate(() => window.__GRAPHYSX__.query({ ids: ["kidx-demo-piece-0"] })[0].position), moving);
      assert.equal(await page.evaluate(() => window.__GRAPHYSX__.query({ tag: "insertion-arrow" }).filter(e => e.visible).length), 2);
      await page.screenshot({ path: path.join(ART, "kidx-insertion-paused.png") });
      await page.locator("[data-build-resume]").click(); await page.evaluate(() => window.advanceTime(400));
      assert.notDeepEqual(await page.evaluate(() => window.__GRAPHYSX__.query({ ids: ["kidx-demo-piece-0"] })[0].position), moving);
      await page.locator("summary").filter({ hasText: "Demander à Nestor" }).click();
      await page.getByLabel("Demande à Nestor").fill("Montre-moi dessous"); await page.getByLabel("Demande à Nestor").press("Enter");
      assert.equal((await state()).construction.underside, true);
      await page.getByLabel("Demande à Nestor").fill("Étape 3"); await page.getByLabel("Demande à Nestor").press("Enter");
      assert.equal((await state()).build.step, 3);
      assert.equal(await page.evaluate(() => window.__GRAPHYSX__.query({ ids: ["ev3-lab-floor"] }).length), 0);
      await page.getByLabel("Demande à Nestor").fill("Vue normale"); await page.getByLabel("Demande à Nestor").press("Enter");
      console.log("  ok real CAD insertion, pause/resume and French Nestor scene controls");
      await page.locator("[data-build-team] > summary").click();
      await page.locator("[data-team-one]").fill("Alex"); await page.locator("[data-team-two]").fill("Sam");
      await page.locator("summary").filter({ hasText: "Partager avec un autre écran" }).click();
      await page.locator("[data-team-create]").click();
      await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).application.construction.duo.session?.code);
      const code = (await state()).construction.duo.session.code;
      // Two screens use independent renderers. Separate Chromium processes keep their
      // software WebGL queues independent too, instead of sharing one GPU process.
      secondBrowser = await launchSmokeBrowser();
      const secondContext = await secondBrowser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
      await secondContext.tracing.start({ screenshots: true, snapshots: true, sources: true });
      tracedContexts.push(secondContext);
      const second = applySmokeTimeout(await secondContext.newPage());
      second.on("pageerror", e => errors.push(String(e))); second.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
      second.on("requestfailed", request => console.error("Construction request failed:", request.url(), request.failure()));
      await second.goto(`${base}/?app=ev3-lab&view=build&model=track3r`, { waitUntil: "domcontentloaded" });
      await constructionReady(second);
      await second.screenshot({ path: path.join(ART, "kidx-duo-ready-390.png") });
      console.log("  ok second browser's cold CAD scene is loaded and rendered");
      await second.locator("[data-build-team] > summary").click();
      await second.locator("summary").filter({ hasText: "Partager avec un autre écran" }).click();
      await second.locator("[data-team-code]").fill(code); await second.locator("[data-team-join]").click();
      await second.waitForFunction(() => JSON.parse(window.render_game_to_text()).application.build.step === 3);
      await page.locator("[data-team-ready]").click();
      await second.waitForFunction(() => JSON.parse(window.render_game_to_text()).application.construction.duo.prepared === true);
      await second.locator("[data-team-ready]").click();
      await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).application.build.step === 4);
      await second.screenshot({ path: path.join(ART, "kidx-duo-390.png") });
      assert.deepEqual((await state()).construction.duo.names, ["Alex", "Sam"]);
      await secondContext.tracing.stop({ path: path.join(ART, "kidx-duo-trace.zip") });
      tracedContexts.pop();
      await secondContext.close();
      await secondBrowser.close(); secondBrowser = null;
      console.log("  ok two independent browsers synchronize the build and preparation handoff");
      await page.locator("[data-build-back]").click(); await page.locator("[data-kidx-missions]").click();
      await page.locator("[data-kidx-mechanism]").click();
      await page.waitForFunction(() => window.__GRAPHYSX__.query({ tag: "kidx-mechanism" }).every(e => e.asset?.status === "ready"));
      await page.evaluate(() => window.advanceTime(3000));
      const gears = (await state()).mechanism;
      assert.ok(gears.driverDegrees > 200); assert.equal(gears.drivenDegrees, -gears.driverDegrees / 3);
      await page.locator("[data-demo-play]").click();
      const stopped = (await state()).mechanism.driverDegrees;
      await page.evaluate(() => window.advanceTime(500)); assert.equal((await state()).mechanism.driverDegrees, stopped);
      await page.screenshot({ path: path.join(ART, "kidx-gears.png") });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({ path: path.join(ART, "kidx-gears-390.png") });
      await page.locator("[data-demo-back]").click();
    }
    assert.deepEqual(errors, []);
    console.log("KidX interactive scenario passed; no browser errors.");
  } catch (error) {
    console.error("KidX interactive browser errors:", errors);
    for (const context of tracedContexts) {
      await context.tracing.stop({ path: path.join(ART, "kidx-duo-trace.zip") }).catch(traceError => console.error(traceError));
    }
    throw error;
  } finally { if (secondBrowser) await secondBrowser.close(); if (browser) await browser.close(); if (server) await server.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runKidxInteractive();
}
