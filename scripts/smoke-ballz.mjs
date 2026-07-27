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
// Everything is driven by gravity plus `pause` + fixed `step`, never wall-clock: forces enter
// only through an entity's `apply-impulse` interactions and its `steering` block (`api.steer`),
// and fixed steps keep the result independent of the headless software-GL frame rate. The one
// wall-clock section is the chase camera, which eases in real frames by design.

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
    // border, start bottom-centre, one ring mid-board, one ice patch, finish at the top.
    const imported = api.levels.importAscii({
      id: "smoke-ballz",
      label: "Smoke BallZ",
      cellSize: 2.6,
      rows: ["#######", "#..F..#", "#.~...#", "#..o..#", "#.....#", "#..S..#", "#######"],
    });
    if (!imported.ok) return { importError: imported.error };

    const played = api.levels.play("smoke-ballz");
    if (!played.ok) return { playError: played.error };

    const ids = api.query({ tag: "ballz" }).map((entity) => entity.id);
    const ball = api.query({ ids: ["ballz-ball"] })[0];
    const finish = api.query({ ids: ["ballz-finish-gate"] })[0];
    const ice = api.query({ tag: "ice" })[0];
    const assets = api.assets();

    return {
      materialised: ids.length,
      hasBall: !!ball,
      hasFinish: !!finish,
      finishIsTrigger: finish?.physics?.mode === "trigger",
      // A 7x7 grid with a solid border is 24 wall cells.
      wallCount: ids.filter((id) => id.startsWith("ballz-wall-")).length,
      ringCount: ids.filter((id) => id.startsWith("ballz-ring-")).length,
      hasStartPad: ids.includes("ballz-start-pad"),
      countdownStages: api.query({ tag: "ballz-countdown-stage" }).length,
      recoveredGlyphAssets: assets.filter((asset) => asset.category === "glyph").length,
      recoveredTvmAssets: assets.filter((asset) => asset.category === "archive-prop").length,
      ice: ice ? {
        id: ice.id,
        roughness: ice.material.roughness,
        opacity: ice.material.opacity,
        physicsMaterial: ice.physics?.material,
      } : null,
    };
  });

  // --- Is the visual pass scene data, and did the host actually render it? --------------
  // This used to be the explicit §14.5 gap: no post-processing field existed, and the level
  // relied on its visible sky for both backdrop and reflections. Wait for the real HDR decode
  // and PMREM conversion, then prove bloom + image lighting are authored, renderer-bound, and
  // independent from the Lost Valley cube background.
  await page.waitForFunction(() => {
    const host = window.__GRAPHYSX_HOST__;
    const look = window.__GRAPHYSX__.state().environment;
    return look.lighting?.source === "hdri"
      && look.lighting.hdri === "lilienstein"
      && !!host.composer
      && !!host.bloomPass
      && host.scene.environment !== host.roomEnvironmentTarget.texture;
  }, null, { timeout: SMOKE_TIMEOUT });
  out.look = await page.evaluate(() => {
    const api = window.__GRAPHYSX__;
    const host = window.__GRAPHYSX_HOST__;
    const environment = api.state().environment;
    const exported = api.export().environment;
    return {
      sky: environment.sky,
      lighting: environment.lighting,
      post: environment.post,
      exportedLighting: exported.lighting,
      exportedPost: exported.post,
      composer: !!host.composer,
      bloom: host.bloomPass ? {
        strength: host.bloomPass.strength,
        threshold: host.bloomPass.threshold,
        radius: host.bloomPass.radius,
      } : null,
      cubeBackground: host.scene.background?.isCubeTexture === true,
      separateReflectionSource: host.scene.environment !== host.scene.background,
      hdriCached: host.hdriCache?.has("/assets/hdri/lilienstein_1k.hdr") === true,
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
    const environment = api.state().environment;
    return {
      before,
      after,
      survived: before === after && before > 0,
      stillTrigger: finish?.physics?.mode === "trigger",
      lighting: environment.lighting,
      post: environment.post,
    };
  });

  // --- The classic levels run their archived three laps ---------------------------------
  // `levelList.xml` sets `nbrTour` = 3; the materialiser now honours it, retiring the
  // recorded `laps-reduced-to-one` deviation. Hand-painted grids stay one lap.
  out.laps = await page.evaluate(() => {
    const api = window.__GRAPHYSX__;
    const played = api.levels.play("archive-ballz-level1");
    if (!played.ok) return { playError: played.error };
    const digits = api.query({ tag: "ballz-lap-digit" });
    return {
      archiveLaps: api.rules.get()?.laps ?? null,
      hasRecoveredCounter: api.query({ ids: ["ballz-lap-display"] }).length === 1,
      digitCount: digits.length,
      visibleDigits: digits.filter((entity) => entity.visible).map((entity) => entity.id),
      recoveredGlyphModels: api.query({ tag: "archive-glyph" }).filter((entity) => entity.type === "model").length,
    };
  });

  await page.waitForFunction(() => {
    const counter = window.__GRAPHYSX__.query({ tag: "lap-counter" });
    const models = counter.filter((entity) => entity.type === "model");
    return models.length === 6 && models.every((entity) => entity.asset?.status === "ready");
  }, null, { timeout: SMOKE_TIMEOUT });
  await page.evaluate(() => {
    const api = window.__GRAPHYSX__;
    const host = window.__GRAPHYSX_HOST__;
    const counter = api.query({ ids: ["ballz-lap-display"] })[0];
    host.setMode("scene");
    host.camera.position.set(counter.position[0], counter.position[1] + 0.4, counter.position[2] + 12);
    host.controls.target.set(...counter.position);
    host.camera.lookAt(host.controls.target);
  });
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(ART, "ballz-lap-counter-3d.png") });

  // --- The two-body player: steering, the fire-arrow, and the per-direction cap ---------
  // The original BallZ control model as scene vocabulary: `api.steer` aims a heading and
  // thrusts along it inside the deterministic step, the caged ball is the physics subject,
  // and the fire-arrow entity is anchored to it by the runtime. Everything below is the SAME
  // call an agent makes — that is the entire point of the vocabulary.
  out.steer = await page.evaluate(() => {
    const api = window.__GRAPHYSX__;
    api.levels.play("smoke-ballz");
    api.pause(true);
    for (let i = 0; i < 120; i += 1) api.step(1 / 60); // settle onto the floor
    const spawned = api.query({ ids: ["ballz-ball"] })[0];
    const shell = api.query({ ids: ["ballz-ball-shell"] })[0];
    const aim = api.query({ ids: ["ballz-aim-arrow"] })[0];
    const result = {
      hasSteering: !!spawned.steering,
      arrowId: spawned.steering?.arrowId ?? null,
      hasArrow: !!aim,
      // The recovered 2011 ball: the shell mesh parented to the collider, the FireArrow
      // controller ball as the anchored aim — models, not invented primitives.
      shellIsRecoveredModel: shell?.type === "model" && shell?.parentId === "ballz-ball",
      aimIsRecoveredModel: aim?.type === "model",
      colliderNearInvisible: (spawned.material.opacity ?? 1) < 0.1,
    };

    // Give the run some runway: the smoke grid is only 7 cells wide, and a capped ball
    // crosses it in ~1.5 s. Start against the west side and drive east along the open row.
    api.update("ballz-ball", { transform: { position: [-5, 0.7, 5.2] } });
    for (let i = 0; i < 40; i += 1) api.step(1 / 60);
    const ball = api.query({ ids: ["ballz-ball"] })[0];

    // Aim east and thrust: the ball must accelerate along +x and the arrow must both yaw to
    // the heading and stay anchored at the ball while it moves.
    const aimed = api.steer("ballz-ball", { headingDegrees: 90, thrust: 1 });
    result.aimReceipt = aimed.ok ? aimed.value.headingDegrees : aimed.error;
    for (let i = 0; i < 48; i += 1) api.step(1 / 60);
    const after = api.query({ ids: ["ballz-ball"] })[0];
    const arrow = api.query({ ids: ["ballz-aim-arrow"] })[0];
    result.movedEast = after.position[0] - ball.position[0];
    result.driftZ = Math.abs(after.position[2] - ball.position[2]);
    result.arrowYaw = arrow.rotationDegrees[1];
    result.arrowAnchored = Math.hypot(arrow.position[0] - after.position[0], arrow.position[2] - after.position[2]) < 0.05;

    // The cap is enforced PER DIRECTION: sustained thrust must not exceed speedCap along the
    // heading, and the brake must still bite at top speed (the global-cap failure mode).
    for (let i = 0; i < 30; i += 1) api.step(1 / 60);
    const capped = api.query({ ids: ["ballz-ball"] })[0];
    result.speedAtCap = capped.physics.linearVelocity[0];
    result.speedCap = capped.steering.speedCap;
    api.steer("ballz-ball", { thrust: -1 });
    for (let i = 0; i < 45; i += 1) api.step(1 / 60);
    const braked = api.query({ ids: ["ballz-ball"] })[0];
    result.speedAfterBrake = braked.physics.linearVelocity[0];
    result.brakeBites = result.speedAfterBrake < result.speedAtCap - 1;
    api.steer("ballz-ball", { thrust: 0 });

    // The kick: a one-shot impulse along the heading (the golf launch). Aim north, kick, and
    // read the velocity change straight off the receipt.
    const beforeKick = api.query({ ids: ["ballz-ball"] })[0].physics.linearVelocity[2];
    const kicked = api.steer("ballz-ball", { headingDegrees: 0, kick: 1 });
    result.kickReceiptVz = kicked.ok ? kicked.value.linearVelocity[2] : null;
    result.kickImpulseTookVz = kicked.ok ? beforeKick - kicked.value.linearVelocity[2] : 0; // north is -z
    // Steering must round-trip: the document carries pose + tuning, never live inputs.
    const exported = api.export().entities.find((entity) => entity.id === "ballz-ball");
    result.exportedSteering = exported?.steering ?? null;
    return result;
  });

  // --- The chase camera lives behind the ball, in the one shared loop --------------------
  // Park the ball at centre (a transform patch rebuilds the body, zeroing velocity), aim the
  // heading east, and let real frames run: the follow camera must ease behind the ball
  // (camera west of it), keep it near frame centre, and keep the orbit target synced.
  await page.evaluate(() => {
    const api = window.__GRAPHYSX__;
    api.update("ballz-ball", { transform: { position: [0, 0.7, 0] } });
    api.steer("ballz-ball", { headingDegrees: 90, thrust: 0, turn: 0 });
  });
  await page.waitForTimeout(1400);
  out.chase = await page.evaluate(() => {
    const host = window.__GRAPHYSX_HOST__;
    const ball = host.world.getEntityObject("ballz-ball");
    if (!ball) return { noBall: true };
    const ndc = ball.position.clone().project(host.camera);
    return {
      mode: host.mode,
      cameraWestOfBall: host.camera.position.x < ball.position.x - 2,
      cameraAbove: host.camera.position.y > ball.position.y + 2,
      ballCentered: Math.abs(ndc.x) < 0.35 && ndc.y > -0.6 && ndc.y < 0.6,
      orbitTargetNearBall: host.orbitTarget.distanceTo(ball.position) < 4,
    };
  });

  // --- Is it actually PLAYABLE by hand? --------------------------------------------------
  // The level materialising is not the same claim as a person being able to play it. This
  // asserts the whole chain for the keyboard: a real ArrowUp keydown -> the play layer's
  // api.steer -> the runtime's thrust integration -> the ball is somewhere else. Hold the
  // key across the steps: thrust is continuous input, not an impulse per keypress.
  out.control = await page.evaluate(() => {
    const api = window.__GRAPHYSX__;
    api.levels.play("smoke-ballz");
    api.pause(true);
    for (let i = 0; i < 120; i += 1) api.step(1 / 60);
    const before = api.query({ ids: ["ballz-ball"] })[0].position;
    return { before: before.map((v) => Number(v.toFixed(3))) };
  });
  // A genuine key event on the page, not a direct api call — that is the point.
  await page.keyboard.down("ArrowUp");
  out.control.after = await page.evaluate(() => {
    const api = window.__GRAPHYSX__;
    for (let i = 0; i < 90; i += 1) api.step(1 / 60);
    return api.query({ ids: ["ballz-ball"] })[0].position.map((v) => Number(v.toFixed(3)));
  });
  await page.keyboard.up("ArrowUp");
  // ArrowUp thrusts along the default heading 0, which is north (-z), so z must decrease.
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
  // Wait for the HUD's own poll to repaint against the freshly armed run, not a wall-clock
  // guess: under software GL the main thread starves timers, and a fixed 600 ms saw the
  // mount-time snapshot of the *previous* run still on screen.
  await page.waitForFunction(() => /0 \/ 1/.test(document.querySelector(".gx-bz-status")?.textContent ?? ""), null, { timeout: SMOKE_TIMEOUT });

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
      // The level was just re-materialised, so the HUD must describe THIS level rather than
      // carrying the previous run's tally. A replay opening on "1 / 1 rings · FINISH" is stale.
      statusText: document.querySelector(".gx-bz-status")?.textContent ?? "",
    };
  });
  out.hudResetOnReplay = out.modes.statusText.includes("0 / 1") && !out.modes.statusText.includes("FINISH");

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

  // --- Multiplayer: per-subject runs from one trigger stream ----------------------------
  // `rules.subjects` gives every racer its own run. A rival ball is spawned as an ordinary
  // steerable entity, the rules are re-set with two subjects, and the rival is driven
  // through ring → halfway → finish: ITS run must bank and complete while the primary's
  // stays running (gates are strictly attributed), the ring must count for BOTH (a taken
  // ring hides for everyone — rings are co-op, the race is the laps), and `standings()`
  // must rank the finisher first. All deterministic pause+step.
  out.race = await page.evaluate(() => {
    const api = window.__GRAPHYSX__;
    api.levels.play("smoke-ballz");
    api.pause(true);
    for (let i = 0; i < 60; i += 1) api.step(1 / 60);
    const spawned = api.spawn({
      id: "rival-ball",
      type: "sphere",
      label: "Rival",
      transform: { position: [2.6, 0.7, 5.2] },
      geometry: { radius: 0.55 },
      material: { color: "#ffd27a", wireframe: true },
      physics: { mode: "dynamic", material: "ball", mass: 1.7 },
      steering: { headingDegrees: 0 },
      tags: ["ballz", "player"],
    });
    if (!spawned.ok) return { spawnError: spawned.error };
    const rules = api.rules.get();
    const set = api.rules.set({
      ...rules,
      subjectId: "ballz-ball",
      subjects: [
        { id: "ballz-ball", label: "P1" },
        { id: "rival-ball", label: "Rival", spawn: { position: [2.6, 0.7, 5.2] } },
      ],
    });
    if (!set.ok) return { setError: set.error };

    const teleport = (id, position) => {
      api.update(id, { transform: { position } });
      for (let i = 0; i < 18; i += 1) api.step(1 / 60);
    };
    const ring = api.query({ tag: "collectible" })[0];
    teleport("rival-ball", ring.position);
    const primaryAfterRing = api.rules.status();
    const standingsAfterRing = api.rules.standings();
    const gate = api.query({ ids: ["ballz-finish-gate"] })[0];
    teleport("rival-ball", gate.position);
    const primaryAfterRivalFinish = api.rules.status();
    const standings = api.rules.standings();
    const rival = standings?.find((entry) => entry.subjectId === "rival-ball");
    const primary = standings?.find((entry) => entry.subjectId === "ballz-ball");
    return {
      racers: standings?.length ?? 0,
      // The shared ring: taken by the rival, banked in BOTH runs.
      ringSharedToPrimary: primaryAfterRing?.collected.length === 1,
      ringSharedToRival: standingsAfterRing?.find((entry) => entry.subjectId === "rival-ball")?.run.collected.length === 1,
      // Strict gate attribution: the rival finishing must not finish the primary.
      rivalComplete: rival?.run.phase === "complete",
      primaryStillRunning: primary?.run.phase === "running" && primaryAfterRivalFinish?.phase === "running",
      rivalRankedFirst: standings?.[0]?.subjectId === "rival-ball",
      rivalLabel: rival?.label,
      // The race round-trips: subjects are ordinary rules data in the document.
      exportedSubjects: api.export().rules?.subjects?.length ?? 0,
    };
  });

  // --- Winning the level: rings THEN finish, and not before -----------------------------
  // The win rule has to be real, not a "reached the finish" rubber stamp: crossing the finish
  // with rings still out must NOT win, and collecting them all then returning must. Driven with
  // real teleports + steps; the win itself is judged by the play layer's own 200 ms poll, so
  // each check waits for a poll cycle rather than reading a promise back synchronously.
  await page.evaluate(() => { window.__GRAPHYSX__.levels.play("smoke-ballz"); window.__GRAPHYSX__.pause(true); });
  await page.waitForTimeout(120);

  // Negative: hit the finish while the ring is still uncollected.
  await page.evaluate(() => {
    const api = window.__GRAPHYSX__;
    const g = api.query({ ids: ["ballz-finish-gate"] })[0].position;
    api.update("ballz-ball", { transform: { position: [g[0], g[1], g[2]] } });
    for (let i = 0; i < 30; i += 1) api.step(1 / 60);
  });
  await page.waitForTimeout(600);
  // The runtime's own verdict backs the DOM check: the run must still be running, so the
  // absence of a win panel is "the rule held", never "the starved poll hasn't drawn it yet".
  out.wonWithRingsOut = (await page.$(".gx-bz-win")) !== null;
  out.phaseWithRingsOut = await page.evaluate(() => window.__GRAPHYSX__.rules.status()?.phase ?? null);

  // Now collect every ring, then return to the finish.
  await page.evaluate(() => {
    const api = window.__GRAPHYSX__;
    for (const ring of api.query({ tag: "collectible" })) {
      const [rx, ry, rz] = ring.position;
      api.update("ballz-ball", { transform: { position: [rx, ry, rz] } });
      for (let i = 0; i < 24; i += 1) api.step(1 / 60);
    }
    const g = api.query({ ids: ["ballz-finish-gate"] })[0].position;
    api.update("ballz-ball", { transform: { position: [g[0], g[1], g[2]] } });
    for (let i = 0; i < 30; i += 1) api.step(1 / 60);
  });
  await page.waitForFunction(() => !!document.querySelector(".gx-bz-win"), null, { timeout: SMOKE_TIMEOUT });
  out.win = await page.evaluate(() => {
    const panel = document.querySelector(".gx-bz-win");
    return {
      shown: !!panel,
      title: panel?.querySelector(".gx-bz-win-title")?.textContent ?? "",
      hasReplay: !!panel?.querySelector(".gx-bz-win-again"),
      hudGone: !document.querySelector(".gx-bz-hud"),
    };
  });
  await page.screenshot({ path: path.join(ART, "ballz-win.png") });
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
  out.play?.countdownStages === 4 &&
  out.play?.recoveredGlyphAssets === 36 &&
  out.play?.recoveredTvmAssets === 14 &&
  out.play?.ice?.roughness === 0.06 &&
  out.play?.ice?.opacity === 0.82 &&
  out.play?.ice?.physicsMaterial === "finish" &&
  out.look?.sky === "lostvalley" &&
  out.look?.lighting?.source === "hdri" &&
  out.look?.lighting?.hdri === "lilienstein" &&
  out.look?.lighting?.intensity === 0.92 &&
  out.look?.lighting?.yawDegrees === 24 &&
  out.look?.post?.bloom?.strength === 0.38 &&
  out.look?.post?.bloom?.threshold === 0.72 &&
  out.look?.post?.bloom?.radius === 0.24 &&
  JSON.stringify(out.look?.exportedLighting) === JSON.stringify(out.look?.lighting) &&
  JSON.stringify(out.look?.exportedPost) === JSON.stringify(out.look?.post) &&
  out.look?.composer === true &&
  out.look?.bloom?.strength === 0.38 &&
  out.look?.bloom?.threshold === 0.72 &&
  out.look?.bloom?.radius === 0.24 &&
  out.look?.cubeBackground === true &&
  out.look?.separateReflectionSource === true &&
  out.look?.hdriCached === true &&
  out.rest?.supported === true &&
  out.wall?.stoppedByWall === true &&
  out.finish?.firedOnce === true &&
  out.finish?.crossedBy === "ballz-ball" &&
  out.finish?.didNotResist === true &&
  out.ring?.collected === true &&
  out.roundTrip?.survived === true &&
  out.roundTrip?.stillTrigger === true &&
  out.roundTrip?.lighting?.source === "hdri" &&
  out.roundTrip?.lighting?.hdri === "lilienstein" &&
  out.roundTrip?.post?.bloom?.strength === 0.38 &&
  out.laps?.archiveLaps === 3 &&
  out.laps?.hasRecoveredCounter === true &&
  out.laps?.digitCount === 3 &&
  JSON.stringify(out.laps?.visibleDigits) === JSON.stringify(["ballz-lap-digit-1"]) &&
  out.laps?.recoveredGlyphModels === 11 &&
  out.steer?.hasSteering === true &&
  out.steer?.arrowId === "ballz-aim-arrow" &&
  out.steer?.hasArrow === true &&
  out.steer?.shellIsRecoveredModel === true &&
  out.steer?.aimIsRecoveredModel === true &&
  out.steer?.colliderNearInvisible === true &&
  out.steer?.aimReceipt === 90 &&
  out.steer?.movedEast > 0.5 &&
  out.steer?.driftZ < 0.6 &&
  Math.abs((out.steer?.arrowYaw ?? 0) - -90) < 1.5 &&
  out.steer?.arrowAnchored === true &&
  out.steer?.speedAtCap <= (out.steer?.speedCap ?? 0) + 0.6 &&
  out.steer?.speedAtCap > (out.steer?.speedCap ?? 99) * 0.75 &&
  out.steer?.brakeBites === true &&
  out.steer?.kickImpulseTookVz > 2 &&
  out.steer?.exportedSteering?.thrust === undefined &&
  out.steer?.exportedSteering?.turn === undefined &&
  typeof out.steer?.exportedSteering?.headingDegrees === "number" &&
  out.chase?.mode === "play" &&
  out.chase?.cameraWestOfBall === true &&
  out.chase?.cameraAbove === true &&
  out.chase?.ballCentered === true &&
  out.chase?.orbitTargetNearBall === true &&
  out.control?.movedNorth === true &&
  out.hudVisible?.present === true &&
  out.hudVisible?.sized === true &&
  out.hudVisible?.occludedBy === null &&
  // The HUD is rendered by the generic rules layer now, so it names what it counts
  // ("collected") rather than what BallZ happens to call them ("rings"). The assertion that
  // matters is unchanged: the tally is on screen and labelled, not a bare fraction.
  /collected/.test(out.hudText ?? "") &&
  /\d+:\d\d/.test(out.hudText ?? "") &&
  out.outliner?.showsLevel === true &&
  out.outliner?.showsDemoWorld === false &&
  out.outliner?.agreesOnCount === true &&
  out.modes?.mode === "play" &&
  out.modes?.toolbarShown === false &&
  out.modes?.panelShown === false &&
  out.modes?.hudShown === true &&
  out.hudResetOnReplay === true &&
  out.afterExit?.mode === "editor" &&
  out.afterExit?.toolbarShown === true &&
  out.afterExit?.hudGone === true &&
  out.race?.racers === 2 &&
  out.race?.ringSharedToPrimary === true &&
  out.race?.ringSharedToRival === true &&
  out.race?.rivalComplete === true &&
  out.race?.primaryStillRunning === true &&
  out.race?.rivalRankedFirst === true &&
  out.race?.rivalLabel === "Rival" &&
  out.race?.exportedSubjects === 2 &&
  out.wonWithRingsOut === false &&
  out.phaseWithRingsOut === "running" &&
  out.win?.shown === true &&
  /Complete/.test(out.win?.title ?? "") &&
  out.win?.hasReplay === true &&
  out.win?.hudGone === true;

process.exit(out.fatal || pageErrors.length || consoleErrors.length || !ok ? 1 : 0);


