import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { applySmokeTimeout, launchSmokeBrowser } from "./smoke-harness.mjs";
import { startStaticServer } from "./static-server.mjs";

export async function runKidxGuidance({ part = "all" } = {}) {
  assert.ok(["all", "arrival", "attempt", "laboratory"].includes(part), `Unknown guidance part: ${part}`);
  const ART = process.env.SMOKE_ARTIFACTS || "output/verify";
  mkdirSync(ART, { recursive: true });
  let browser, server;
  const errors = [];
  try {
    if (!process.env.SMOKE_BASE) server = await startStaticServer({ root: path.resolve("dist"), port: 0 });
    const base = (process.env.SMOKE_BASE ?? server.url).replace(/\/$/, "");
    browser = await launchSmokeBrowser();
    const page = applySmokeTimeout(await browser.newPage({ viewport: { width: 1280, height: 800 }, hasTouch: true }));
    page.on("pageerror", e => errors.push(String(e)));
    page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
    const state = () => page.evaluate(() => JSON.parse(window.render_game_to_text()).application);
    const guide = () => page.locator("#kidx-mission-guide");
    const capture = name => page.screenshot({ path: path.join(ART, `kidx-guidance-${name}.png`) });
    const robotView = () => inspectKidxRobotView(page);
    const highlighted = async selector => assert.equal(await page.locator(selector).getAttribute("data-kidx-guide-target"), "true", selector);
    const reachable = async selector => {
      const bounds = await page.locator(selector).evaluate(button => {
        button.scrollIntoView({ block: "nearest" });
        const r = button.getBoundingClientRect();
        return { left: r.left, right: r.right, width: r.width, height: r.height, bottom: r.bottom,
          hit: button.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)) };
      });
      assert.ok(bounds.left >= 0 && bounds.right <= page.viewportSize().width && bounds.bottom <= page.viewportSize().height && bounds.width >= 44 && bounds.height >= 44 && bounds.hit, JSON.stringify({ selector, bounds }));
    };
    await page.goto(`${base}/?app=ev3-lab${part === "laboratory" ? "&view=atelier" : ""}`, { waitUntil: "domcontentloaded" });
    if (part === "attempt") {
      await page.waitForFunction(() => typeof window.advanceTime === "function");
      await page.evaluate(() => window.advanceTime(0));
    }
    if (part === "all" || part === "arrival") {
      await guide().waitFor();
      assert.equal(await page.locator("[data-kidx-lab]").getAttribute("aria-label"), "Blocs avancés");
      assert.match(await page.locator("[data-kidx-lab]").innerText(), /Moteurs · capteurs · boucles/);
      assert.equal(await page.locator("[data-kidx-stop]").isDisabled(), true);
      assert.match(await page.locator("[data-kidx-stop]").innerText(), /Déjà à l’arrêt/);
      assert.equal((await state()).guidance.stage, "block-0");
      assert.match(await guide().innerText(), /Un bloc = un ordre/);
      await highlighted("[data-ev3-block='forward']");
      const before = (await state()).mission.elapsedSeconds;
      await page.waitForTimeout(300);
      assert.equal((await state()).mission.elapsedSeconds, before, "reading arrival guidance must not spend mission time");
      await page.evaluate(() => window.advanceTime(17));
      assert.equal((await state()).guidance.stage, "block-0", "a physics frame is not a child's attempt");
      await capture("desktop");
      for (const [index, [width, height]] of [[320, 740], [390, 844], [800, 480], [844, 390]].entries()) {
        await page.setViewportSize({ width, height });
        if (index > 0) await page.reload({ waitUntil: "domcontentloaded" });
        await page.waitForFunction(() => window.__GRAPHYSX_HOST__?.world.getEntityObject("ev3-drive-base:technic")?.getObjectByName("ev3-driving-base source model")?.children.length === 14);
        const view = await robotView();
        assert.ok(view.meshes >= 18 && view.robot.right - view.robot.left >= 80 && view.coveredFraction <= .05
          && view.robot.left >= 0 && view.robot.right <= width && view.robot.top >= 0 && view.robot.bottom <= height,
        `the real CAD robot stays in view, clear of the mission and controls: ${JSON.stringify({ width, height, ...view })}`);
        console.log(`ok: real CAD visible at ${width}x${height}; UI covers ${(view.coveredFraction * 100).toFixed(2)}% of its projected bounds`);
        assert.equal(await guide().isVisible(), false, "compact arrival keeps the full instructions closed");
        assert.equal((await state()).guidance.enabled, true, "compact coaching still highlights the next ordinary control");
        await highlighted("[data-ev3-block='forward']");
        await capture(`${width}-robot-visible`);
        for (const selector of ["[data-kidx-guide]", "[data-ev3-block='forward']", ".gx-ev3-exit", "[data-kidx-lab]", "[data-kidx-stop]"]) await reachable(selector);
        await page.locator("[data-kidx-guide]").click();
        await guide().waitFor();
        assert.equal(await page.locator("[data-kidx-guide]").getAttribute("aria-expanded"), "true");
        for (const selector of ["[data-kidx-guide]", "[data-ev3-block='forward']", ".gx-ev3-exit", "[data-guide-close]", "[data-kidx-lab]", "[data-kidx-stop]"]) await reachable(selector);
        await capture(`${width}`);
        await guide().locator("summary").click();
        assert.match(await guide().innerText(), /bandes rouges/);
        assert.match(await guide().innerText(), /gauche à droite/);
        await reachable("[data-kidx-guide]");
        await capture(`${width}-landmarks`);
        await guide().locator("summary").click();
        await page.locator("[data-guide-close]").click();
        assert.equal(await page.locator("[data-kidx-guide]").evaluate(e => e === document.activeElement), true);
        assert.equal(await guide().isVisible(), false);
        assert.ok((await robotView()).coveredFraction <= .05, "closing Help restores the unobstructed robot");
        assert.deepEqual((await state()).program.blocks, [], "reading Help never changes the child's program");
        if (width === 390) {
          await page.locator("[data-kidx-guide]").click();
          await page.locator("[data-guide-close]").focus();
          await page.keyboard.press("Escape");
          assert.equal(await guide().isVisible(), false);
          assert.equal(await page.locator("[data-kidx-guide]").evaluate(e => e === document.activeElement), true);
        }
        if (width <= 390) {
          for (let block = 0; block < 6; block++) await page.locator("[data-ev3-block='forward']").click();
          const readout = await inspectKidxProgramView(page);
          assert.equal(readout.chips.length, 6);
          assert.ok(readout.allVisible, `all six instructions stay readable without scrolling: ${JSON.stringify(readout)}`);
          assert.deepEqual((await state()).program.blocks, Array(6).fill("forward"));
          assert.ok((await robotView()).coveredFraction <= .05, "six visible blocks still leave the robot unobstructed");
          await capture(`${width}-six-blocks-robot-visible`);
          console.log(`ok: all six program blocks and real CAD visible at ${width}px`);
          await page.locator("[data-ev3-run]").click();
          await page.evaluate(() => window.advanceTime(3500));
          const painted = await page.evaluate(() => window.__GRAPHYSX_HOST__.frameCount);
          await page.waitForFunction(n => window.__GRAPHYSX_HOST__.frameCount > n + 2, painted);
          assert.equal((await state()).mission.phase, "complete");
          const completeView = await robotView();
          assert.ok(completeView.coveredFraction <= .05, `completion still leaves the robot visible: ${JSON.stringify({ width, height, ...completeView })}`);
          assert.ok((await inspectKidxProgramView(page)).allVisible, "completion retains all six readable instructions");
          await capture(`${width}-six-blocks-complete`);
        }
      }
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.reload({ waitUntil: "domcontentloaded" });
      await guide().waitFor();
      await page.locator("[data-ev3-block='stop']").click();
      assert.deepEqual((await state()).program.blocks, ["stop"], "Stop queues an instruction instead of stopping or starting an attempt");
      assert.equal((await state()).program.running, false);
      assert.equal(await page.locator("[data-kidx-stop]").isDisabled(), true);
      await page.locator("[data-ev3-undo]").click();
      await page.locator("[data-guide-close]").click();
      assert.equal(await guide().isVisible(), false);
      assert.equal(await page.locator("[data-kidx-guide]").evaluate(e => e === document.activeElement), true);
      await page.locator("[data-kidx-guide]").click();
      await page.locator("[data-kidx-lab]").click();
      await highlighted("[data-code-example]");
      assert.match(await page.locator("[data-guide-lab-hint]").innerText(), /Utiliser l’exemple/);
      await page.locator("[data-lab-close]").click();
      await highlighted("[data-ev3-block='forward']");
    }
    if (part === "all" || part === "attempt") {
      await page.locator("[data-ev3-block='forward']").click();
      assert.match(await guide().innerText(), /1\/3.*ordre 2/s);
      await page.locator("[data-ev3-block='left']").click();
      assert.equal((await state()).guidance.stage, "explore");
      assert.deepEqual((await state()).program.blocks, ["forward", "left"], "guidance must preserve the child's own idea");
      await highlighted("[data-ev3-run]");
      await page.locator("[data-ev3-undo]").click();
      await highlighted("[data-ev3-block='forward']");
      // A short actual attempt produces review guidance, then Retry prepares a fresh attempt.
      await page.locator("[data-ev3-run]").click();
      assert.equal((await state()).guidance.expanded, false);
      assert.equal(await page.locator("[data-kidx-stop]").isEnabled(), true);
      await page.evaluate(() => window.advanceTime(100));
      await page.locator("[data-kidx-stop]").click();
      assert.equal((await state()).program.running, false);
      assert.deepEqual((await state()).program.blocks, ["forward"]);
      assert.deepEqual((await state()).rover.velocity, [0, 0, 0]);
      assert.equal(await page.locator("[data-kidx-stop]").isDisabled(), true);
      await page.locator("[data-ev3-run]").click();
      await page.evaluate(() => window.advanceTime(1400));
      assert.equal(await page.locator("[data-kidx-stop]").isDisabled(), true);
      await page.locator("[data-kidx-guide]").click();
      assert.equal((await state()).guidance.stage, "review");
      await page.locator("[data-kidx-lab]").click();
      await highlighted("[data-code-example]");
      await page.locator("[data-lab-close]").click();
      assert.equal((await state()).guidance.stage, "review");
      for (let i = 0; i < 2; i++) await page.locator("[data-ev3-block='forward']").click();
      await page.locator("[data-ev3-run]").click();
      await page.evaluate(() => window.advanceTime(3500));
      assert.equal((await state()).mission.phase, "complete");
      assert.equal(await page.locator("[data-kidx-stop]").isDisabled(), true);
      await page.locator("[data-kidx-guide]").click();
      assert.match(await guide().innerText(), /Défi réussi/);
      await capture("complete");
      await page.locator("[data-ev3-retry]").click();
      assert.equal((await state()).guidance.stage, "ready");
      await page.locator("[data-ev3-mode='drive']").click();
      assert.match(await guide().innerText(), /Maintiens.*relâche/s);
      await highlighted("[data-ev3='go']");
    }
    if (part === "all" || part === "laboratory") {
      if (part === "all") await page.locator(".gx-ev3-exit").click();
      await page.locator("[data-kidx-mission='sensor-retreat']").click();
      await page.evaluate(() => window.advanceTime(0));
      await highlighted("[data-kidx-lab]");
      await page.locator("[data-kidx-lab]").click();
      await highlighted("[data-code-example]");
      assert.equal(await page.locator("[data-code-stop]").isDisabled(), true);
      assert.match(await page.locator("[data-guide-lab-hint]").innerText(), /Utiliser l’exemple/);
      await page.locator("[data-code-load]").click();
      assert.equal((await state()).guidance.stage, "example", "an empty saved-program slot does not prepare a program");
      await page.locator("[data-code-example]").click();
      await highlighted("[data-code-run]");
      await page.setViewportSize({ width: 390, height: 844 });
      await reachable("[data-code-run]");
      await capture("laboratory");
      await page.locator("[data-code-run]").click();
      assert.equal((await state()).guidance.expanded, false);
      assert.equal((await state()).laboratory.running, true);
      assert.equal(await page.locator("[data-kidx-stop]").isEnabled(), true);
      assert.match(await page.locator("[data-kidx-stop]").innerText(), /Immédiat · garde tes blocs/);
      const codeBeforeStop = (await state()).laboratory.code;
      await capture("running-stop");
      await page.locator("[data-kidx-stop]").click();
      assert.equal((await state()).laboratory.running, false);
      assert.deepEqual((await state()).laboratory.code, codeBeforeStop);
      assert.deepEqual((await state()).rover.velocity, [0, 0, 0]);
      assert.equal(await page.locator("[data-kidx-stop]").isDisabled(), true);
    }
    assert.deepEqual(errors, []);
    console.log("KidX guidance scenario passed; no console or page errors.");
  } finally {
    if (browser) await browser.close();
    if (server) await server.close();
  }
}

/** Project native CAD meshes, not the chassis collider or DOM status. Also used for release reception. */
export function inspectKidxRobotView(page) {
  return page.evaluate(() => {
    const host = window.__GRAPHYSX_HOST__, canvas = host.renderer.domElement.getBoundingClientRect();
    const points = [];
    let meshes = 0;
    for (const id of ["ev3-drive-base:technic", "ev3-drive-base:wheel-left", "ev3-drive-base:wheel-right"]) {
      const object = host.world.getEntityObject(id);
      object.updateWorldMatrix(true, true);
      object.traverse(mesh => {
        if (!mesh.isMesh || !mesh.visible) return;
        mesh.geometry.computeBoundingBox();
        const { min, max } = mesh.geometry.boundingBox;
        meshes++;
        for (const x of [min.x, max.x]) for (const y of [min.y, max.y]) for (const z of [min.z, max.z]) {
          const p = mesh.position.clone().set(x, y, z).applyMatrix4(mesh.matrixWorld).project(host.camera);
          points.push({ x: canvas.left + (p.x + 1) * canvas.width / 2, y: canvas.top + (1 - p.y) * canvas.height / 2 });
        }
      });
    }
    const robot = { left: Math.min(...points.map(p => p.x)), right: Math.max(...points.map(p => p.x)),
      top: Math.min(...points.map(p => p.y)), bottom: Math.max(...points.map(p => p.y)) };
    const area = (robot.right - robot.left) * (robot.bottom - robot.top);
    const obstacles = [".gx-ev3-mission", ".gx-ev3", ".gx-ev3-exit"].map(selector => {
      const r = document.querySelector(selector).getBoundingClientRect();
      return { selector, left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    });
    const covered = obstacles.reduce((sum, r) => sum + Math.max(0, Math.min(robot.right, r.right) - Math.max(robot.left, r.left))
      * Math.max(0, Math.min(robot.bottom, r.bottom) - Math.max(robot.top, r.top)), 0);
    return { robot, meshes, obstacles, coveredFraction: covered / area };
  });
}

/** Check the visible readout, not just the saved/projected program array. */
export function inspectKidxProgramView(page) {
  return page.evaluate(() => {
    const list = document.querySelector(".gx-ev3-program-blocks"), bounds = list.getBoundingClientRect();
    const chips = [...list.querySelectorAll(".gx-ev3-program-chip")].map(chip => {
      const r = chip.getBoundingClientRect();
      return { text: chip.textContent, left: r.left, right: r.right, top: r.top, bottom: r.bottom,
        height: r.height, fontSize: Number.parseFloat(getComputedStyle(chip).fontSize) };
    });
    return { bounds: { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom }, chips,
      allVisible: chips.every(c => c.left >= bounds.left - .5 && c.right <= bounds.right + .5
        && c.top >= bounds.top - .5 && c.bottom <= bounds.bottom + .5 && c.height >= 16 && c.fontSize >= 10) };
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runKidxGuidance();
}
