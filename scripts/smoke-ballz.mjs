import { SMOKE_TIMEOUT, applySmokeTimeout, launchSmokeBrowser } from "./smoke-harness.mjs";
import { mkdirSync } from "node:fs";
import path from "node:path";

// Drives the level workbench's *play* half: an authored ASCII grid becomes a materialised,
// physically real v2 scene. Until `ballz-level-scene.ts` existed, `levels.play()` was a
// hardcoded failure, so this entire path was unverifiable.
//
// The assertions are about behaviour, not entity counts:
//   - the ball comes to REST on the floor. "Exists" and "is supported by something" are very
//     different claims; the terrain-collider bug shipped because only the first was checked.
//   - a wall actually STOPS it — a ball dropped on a wall rests on top rather than tunnelling.
//   - crossing the finish gate fires `trigger.enter` exactly once, not once per frame.
//   - a ring collects itself through its own toggle-visibility interaction.
//   - the whole thing survives export -> load, because a materialised level is claimed to be
//     an ordinary scene rather than a special play mode.
//
// Everything is driven by gravity plus `pause` + fixed `step`, never wall-clock: there is no
// impulse in the public API (impulses exist only as an entity's `apply-impulse` interaction),
// and fixed steps keep the result independent of the headless software-GL frame rate.

const EXECUTABLE = process.env.SMOKE_CHROMIUM || undefined;
const BASE = process.env.SMOKE_BASE || "http://127.0.0.1:4188/";
const ART = process.env.SMOKE_ARTIFACTS || "output/smoke";
mkdirSync(ART, { recursive: true });

const browser = await launchSmokeBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
applySmokeTimeout(page);

const consoleErrors = [];
const pageErrors = [];
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});
page.on("pageerror", (error) => pageErrors.push(String(error)));

const out = {};

try {
  await page.goto(`${BASE}?host=standalone`, { waitUntil: "load" });
  await page.waitForFunction(() => !!window.__GRAPHYSX__, null, { timeout: SMOKE_TIMEOUT });

  out.play = await page.evaluate(() => {
    const api = window.__GRAPHYSX__;

    // A small level this test fully controls, rather than the fallback starter. 7x7, walled
    // border, start bottom-centre, one ring mid-board, finish at the top.
    const imported = api.levels.importAscii({
      id: "smoke-ballz",
      label: "Smoke BallZ",
      cellSize: 2.6,
      rows: ["#######", "#..F..#", "#.....#", "#..o..#", "#.....#", "#..S..#", "#######"],
    });
    if (!imported.ok) return { importError: imported.error };

    const played = api.levels.play("smoke-ballz");
    if (!played.ok) return { playError: played.error };

    const ids = api.query({ tag: "ballz" }).map((entity) => entity.id);
    const ball = api.query({ ids: ["ballz-ball"] })[0];
    const finish = api.query({ ids: ["ballz-finish-gate"] })[0];

    return {
      materialised: ids.length,
      hasBall: !!ball,
      hasFinish: !!finish,
      finishIsTrigger: finish?.physics?.mode === "trigger",
      // A 7x7 grid with a solid border is 24 wall cells.
      wallCount: ids.filter((id) => id.startsWith("ballz-wall-")).length,
      ringCount: ids.filter((id) => id.startsWith("ballz-ring-")).length,
      hasStartPad: ids.includes("ballz-start-pad"),
    };
  });

  // --- Does the ball come to rest, or fall through the floor? --------------------------
  out.rest = await page.evaluate(() => {
    const api = window.__GRAPHYSX__;
    api.pause(true);
    for (let i = 0; i < 240; i += 1) api.step(1 / 60);
    const ball = api.query({ ids: ["ballz-ball"] })[0];
    const y = ball.position[1];
    // Ball radius is cellSize * 0.18 = 0.468, floor top at y = 0, so a resting ball sits
    // near 0.47. Anything below zero has sunk; anything far above is still falling.
    return { restY: Number(y.toFixed(3)), supported: y > 0.2 && y < 1 };
  });

  // --- Does a wall stop it, or does it tunnel through a static body? -------------------
  out.wall = await page.evaluate(() => {
    const api = window.__GRAPHYSX__;
    const wall = api.query({ tag: "wall" })[0];
    const [wx, , wz] = wall.position;
    const wallTop = wall.position[1] + 0.806; // wallHeight/2, wallHeight = 2.6*0.62
    api.update("ballz-ball", { transform: { position: [wx, wallTop + 4, wz] } });
    for (let i = 0; i < 300; i += 1) api.step(1 / 60);
    const y = api.query({ ids: ["ballz-ball"] })[0].position[1];
    // Resting on top of the wall is ~1.612 + 0.468 = 2.08. Passing through would leave it
    // near the floor (~0.47) or below.
    return { y: Number(y.toFixed(3)), stoppedByWall: y > 1.3 };
  });

  // --- Does crossing the finish gate fire exactly one trigger.enter? -------------------
  out.finish = await page.evaluate(() => {
    const api = window.__GRAPHYSX__;
    const before = api.events().sequence;
    const gate = api.query({ ids: ["ballz-finish-gate"] })[0];
    const [gx, gy, gz] = gate.position;
    // Drop through the gate from above. This asserts the trigger, not the steering — and a
    // trigger must not resist, so the ball should end up on the floor beneath it.
    api.update("ballz-ball", { transform: { position: [gx, gy + 5, gz] } });
    for (let i = 0; i < 300; i += 1) api.step(1 / 60);

    const stream = api.events(before);
    const enters = stream.events.filter(
      (event) => event.type === "trigger.enter" && event.data?.triggerId === "ballz-finish-gate"
    );
    const y = api.query({ ids: ["ballz-ball"] })[0].position[1];
    return {
      enterCount: enters.length,
      firedOnce: enters.length === 1,
      crossedBy: enters[0]?.data?.entityId ?? null,
      passedThroughY: Number(y.toFixed(3)),
      // A trigger that resisted would have caught the ball at gate height instead.
      didNotResist: y < 1,
    };
  });

  // --- Does a ring collect itself? -----------------------------------------------------
  out.ring = await page.evaluate(() => {
    const api = window.__GRAPHYSX__;
    const ring = api.query({ tag: "collectible" })[0];
    if (!ring) return { skipped: "no ring" };
    const visibleBefore = ring.visible;
    const [rx, ry, rz] = ring.position;
    api.update("ballz-ball", { transform: { position: [rx, ry + 5, rz] } });
    for (let i = 0; i < 300; i += 1) api.step(1 / 60);
    const after = api.query({ ids: [ring.id] })[0];
    return {
      id: ring.id,
      visibleBefore,
      visibleAfter: after.visible,
      collected: visibleBefore === true && after.visible === false,
    };
  });

  // --- Is a materialised level really an ordinary scene? -------------------------------
  out.roundTrip = await page.evaluate(() => {
    const api = window.__GRAPHYSX__;
    const exported = api.export();
    const before = api.query({ tag: "ballz" }).length;
    const loaded = api.load(exported);
    if (!loaded.ok) return { loadError: loaded.error };
    const after = api.query({ tag: "ballz" }).length;
    const finish = api.query({ ids: ["ballz-finish-gate"] })[0];
    return {
      before,
      after,
      survived: before === after && before > 0,
      stillTrigger: finish?.physics?.mode === "trigger",
    };
  });

  // --- Is it actually PLAYABLE? --------------------------------------------------------
  // The level materialising is not the same claim as a person being able to play it. Steering
  // lives on the ball as `apply-impulse` interactions, so this asserts the whole chain: a real
  // arrow keydown -> api.interact -> impulse -> the ball is somewhere else.
  out.control = await page.evaluate(() => {
    const api = window.__GRAPHYSX__;
    api.levels.play("smoke-ballz");
    api.pause(true);
    for (let i = 0; i < 120; i += 1) api.step(1 / 60);
    const before = api.query({ ids: ["ballz-ball"] })[0].position;
    return { before: before.map((v) => Number(v.toFixed(3))) };
  });
  // A genuine key event on the page, not a direct api.interact — that is the point.
  await page.keyboard.press("ArrowUp");
  out.control.after = await page.evaluate(() => {
    const api = window.__GRAPHYSX__;
    for (let i = 0; i < 90; i += 1) api.step(1 / 60);
    return api.query({ ids: ["ballz-ball"] })[0].position.map((v) => Number(v.toFixed(3)));
  });
  // ArrowUp pushes north (-z), so z must decrease.
  out.control.movedNorth = out.control.after[2] < out.control.before[2] - 0.25;
  // Presence is not visibility. The HUD first shipped at bottom-centre, where it was in the DOM,
  // correctly styled, and completely hidden behind the editor's Library panel — a `page.$` check
  // passed the whole time. Hit-test the status line's own centre instead.
  out.hudVisible = await page.evaluate(() => {
    const status = document.querySelector(".gx-bz-status");
    if (!status) return { present: false };
    const box = status.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return { present: true, sized: false };
    const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    return {
      present: true,
      sized: true,
      // The HUD is pointer-events:none, so the hit lands on whatever is *behind* it. What
      // matters is that nothing opaque is stacked in front — a panel would report itself.
      occludedBy: hit && hit.closest(".gx-ed-workbench, .gx-ed-panel, .gx-ed-library")
        ? String(hit.className)
        : null,
      text: status.textContent,
    };
  });
  out.hudText = out.hudVisible?.text ?? null;

  await page.evaluate(() => {
    const api = window.__GRAPHYSX__;
    // Re-materialise so the screenshot shows an uncollected, un-teleported level.
    api.levels.play("smoke-ballz");
    api.pause(false);
  });
  await page.waitForTimeout(600);

  // --- Are playing and editing actually different surfaces? ----------------------------
  // The route booted into the editor; materialising a playable level must switch the host to
  // `play` and take the authoring chrome away. Before modes existed, a game HUD sat between a
  // scene tree and a library palette and the two read as the same screen.
  out.modes = await page.evaluate(() => {
    const host = window.__GRAPHYSX_HOST__;
    const shown = (selector) => {
      const el = document.querySelector(selector);
      return !!el && getComputedStyle(el).display !== "none" && el.getBoundingClientRect().height > 0;
    };
    return {
      mode: host.mode,
      toolbarShown: shown(".gx-ed-toolbar"),
      panelShown: shown(".gx-ed-panel"),
      hudShown: shown(".gx-bz-hud"),
    };
  });

  // Play mode as the visitor sees it: the level, a HUD, and no authoring chrome at all.
  await page.screenshot({ path: path.join(ART, "ballz-play.png") });

  // …and play is a place you can leave, back to where you came from.
  await page.click(".gx-bz-exit");
  await page.waitForTimeout(400);
  out.afterExit = await page.evaluate(() => {
    const host = window.__GRAPHYSX_HOST__;
    const shown = (selector) => {
      const el = document.querySelector(selector);
      return !!el && getComputedStyle(el).display !== "none" && el.getBoundingClientRect().height > 0;
    };
    return { mode: host.mode, toolbarShown: shown(".gx-ed-toolbar"), hudGone: !document.querySelector(".gx-bz-hud") };
  });

  // --- Does the human's scene tree reflect an API-driven world? ------------------------
  // Everything above went through the API rather than an editor control, which used to leave
  // the outliner showing whatever it last rendered — the viewport displaying a played level
  // while the tree still listed the demo world at rev 0. The panel must track the runtime.
  out.outliner = await page.evaluate(() => {
    const rows = [...document.querySelectorAll(".gx-ed-panel, .gx-ed-tree")]
      .map((el) => el.textContent ?? "")
      .join(" ");
    const readout = document.querySelector(".gx-ed-readout")?.textContent ?? "";
    return {
      // Demo-world entities that must NOT still be listed after a level replaced the world.
      showsDemoWorld: /orbiter-\d|luminous|halo/.test(rows),
      showsLevel: /ballz-/.test(rows),
      readout,
      agreesOnCount: readout.includes(String(window.__GRAPHYSX__.state().entities.length)),
    };
  });
  // The same world back in the editor, for comparison against ballz-play.png above.
  await page.screenshot({ path: path.join(ART, "ballz-level.png") });
} catch (error) {
  out.fatal = String(error);
}

out.consoleErrors = consoleErrors;
out.pageErrors = pageErrors;
console.log(JSON.stringify(out, null, 2));
await browser.close();

const ok =
  out.play?.hasBall === true &&
  out.play?.hasFinish === true &&
  out.play?.finishIsTrigger === true &&
  out.play?.hasStartPad === true &&
  out.play?.wallCount === 24 &&
  out.play?.ringCount === 1 &&
  out.rest?.supported === true &&
  out.wall?.stoppedByWall === true &&
  out.finish?.firedOnce === true &&
  out.finish?.crossedBy === "ballz-ball" &&
  out.finish?.didNotResist === true &&
  out.ring?.collected === true &&
  out.roundTrip?.survived === true &&
  out.roundTrip?.stillTrigger === true &&
  out.control?.movedNorth === true &&
  out.hudVisible?.present === true &&
  out.hudVisible?.sized === true &&
  out.hudVisible?.occludedBy === null &&
  /rings/.test(out.hudText ?? "") &&
  out.outliner?.showsLevel === true &&
  out.outliner?.showsDemoWorld === false &&
  out.outliner?.agreesOnCount === true &&
  out.modes?.mode === "play" &&
  out.modes?.toolbarShown === false &&
  out.modes?.panelShown === false &&
  out.modes?.hudShown === true &&
  out.afterExit?.mode === "editor" &&
  out.afterExit?.toolbarShown === true &&
  out.afterExit?.hudGone === true;

process.exit(out.fatal || pageErrors.length || consoleErrors.length || !ok ? 1 : 0);


