import { mkdirSync } from "node:fs";
import path from "node:path";
import { SMOKE_TIMEOUT, applySmokeTimeout, launchSmokeBrowser } from "./smoke-harness.mjs";
import { startStaticServer } from "./static-server.mjs";

const PORT = Number(process.env.SMOKE_PORT || 4571);
const SHARED_BASE = process.env.SMOKE_BASE || null;
const ART = process.env.SMOKE_ARTIFACTS || "output/verify";
mkdirSync(ART, { recursive: true });

const failures = [];
const check = (name, condition, detail) => {
  const pass = Boolean(condition);
  if (!pass) failures.push(`${name}: ${JSON.stringify(detail)}`);
  console.log(`${pass ? "  ok  " : "  FAIL"} ${name}${detail === undefined ? "" : ` ${JSON.stringify(detail)}`}`);
};

let server;
let browser;
const consoleErrors = [];
const pageErrors = [];
try {
  if (!SHARED_BASE) server = await startStaticServer({ root: path.resolve("dist"), port: PORT });
  browser = await launchSmokeBrowser();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, hasTouch: true });
  applySmokeTimeout(page);
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  const base = SHARED_BASE ?? `http://127.0.0.1:${PORT}/`;
  await page.goto(`${base}?host=standalone`, { waitUntil: "domcontentloaded", timeout: SMOKE_TIMEOUT });
  await page.waitForFunction(() => Boolean(window.__GRAPHYSX__ && window.__GRAPHYSX_HOST__), { timeout: SMOKE_TIMEOUT });

  const result = await page.evaluate(() => {
    const gx = window.__GRAPHYSX__;
    gx.pause(true);
    const listed = gx.starters().find((starter) => starter.id === "ev3-robotics-lab") ?? null;
    const loaded = gx.loadStarter("ev3-robotics-lab");
    const initial = gx.state();
    const missionRules = gx.rules.get();
    const missionAtStart = gx.rules.status();
    const constructionRoots = initial.entities.filter((entity) => entity.tags.includes("construction"));
    const missionZones = initial.entities.filter((entity) => entity.tags.includes("mission-zone"));
    const roverBefore = initial.entities.find((entity) => entity.id === "ev3-drive-base") ?? null;
    const openBefore = initial.entities.find((entity) => entity.id === "ev3-gripper-bot:gripper-open")?.visible ?? null;
    const closedBefore = initial.entities.find((entity) => entity.id === "ev3-gripper-bot:gripper-closed")?.visible ?? null;
    const flameBefore = initial.entities.find((entity) => entity.id === "ev3-rocket-flame")?.visible ?? null;
    const outpostBefore = initial.entities.find((entity) => entity.id === "ev3-mars-outpost-light")?.visible ?? null;

    const gripper = gx.interact("ev3-gripper-bot:gripper-control", "toggle-gripper");
    const launch = gx.interact("ev3-launch-button", "initiate-launch");
    const afterInteractions = gx.state();

    gx.steer("ev3-drive-base", { headingDegrees: 0, thrust: 1 });
    gx.step(1.2);
    gx.steer("ev3-drive-base", { thrust: 0 });
    const afterDrive = gx.state();

    // Drive the first mission by moving the same dynamic subject through the declared trigger
    // volumes. The rules layer, not this smoke or the application surface, decides the outcome.
    gx.rules.reset();
    gx.update("ev3-drive-base", { transform: { position: [-5, 0.83, 12.5] } });
    gx.step(1 / 60);
    const missionAfterMiss = gx.rules.status();
    const missEvents = gx.events().events.filter((event) => event.type === "trigger.enter"
      && event.data.entityId === "ev3-drive-base"
      && String(event.data.triggerId).includes("first-mission-miss"));
    gx.rules.reset();
    gx.update("ev3-drive-base", { transform: { position: [0, 0.83, 10.5] } });
    gx.step(1 / 60);
    const missionAfterGoal = gx.rules.status();
    const brickMaterial = window.__GRAPHYSX_HOST__.world.getEntityObject("ev3-drive-base:brick")?.material ?? null;
    const childLookAfterParentTransforms = brickMaterial ? {
      color: `#${brickMaterial.color.getHexString()}`,
      opacity: brickMaterial.opacity,
    } : null;
    const document = gx.exportDocument();
    const reload = gx.load(document);
    const afterReload = gx.state();
    return {
      listed,
      loaded: { ok: loaded.ok, revision: loaded.revision, error: loaded.error ?? null },
      initialCount: initial.entityCount,
      constructionRoots: constructionRoots.map((entity) => entity.id),
      missionZones: missionZones.map((entity) => entity.id),
      missionRules,
      missionAtStart,
      missionAfterMiss,
      missionAfterGoal,
      childLookAfterParentTransforms,
      missEventCount: missEvents.length,
      roverBefore: roverBefore ? {
        position: roverBefore.position,
        physicsMode: roverBefore.physics.mode,
        hasSteering: Boolean(roverBefore.steering),
        agentDriveable: roverBefore.tags.includes("agent-driveable"),
      } : null,
      visibilityBefore: { open: openBefore, closed: closedBefore, flame: flameBefore, outpost: outpostBefore },
      interactions: { gripper, launch },
      visibilityAfter: {
        open: afterInteractions.entities.find((entity) => entity.id === "ev3-gripper-bot:gripper-open")?.visible ?? null,
        closed: afterInteractions.entities.find((entity) => entity.id === "ev3-gripper-bot:gripper-closed")?.visible ?? null,
        flame: afterInteractions.entities.find((entity) => entity.id === "ev3-rocket-flame")?.visible ?? null,
        outpost: afterInteractions.entities.find((entity) => entity.id === "ev3-mars-outpost-light")?.visible ?? null,
      },
      roverAfter: afterDrive.entities.find((entity) => entity.id === "ev3-drive-base")?.position ?? null,
      document: { id: document.id, entityCount: document.entities.length },
      reload: { ok: reload.ok, revision: reload.revision, error: reload.error ?? null },
      afterReloadCount: afterReload.entityCount,
    };
  });

  console.log("\n# discovery and scene composition");
  check("EV3 Robotics Mission Lab is discoverable", result.listed?.entityCount === result.initialCount, result.listed);
  check("starter loads through the public API", result.loaded.ok && result.initialCount >= 100, { loaded: result.loaded, count: result.initialCount });
  check("all seven construction families are scene roots", result.constructionRoots.length === 7, result.constructionRoots);
  check("all seven Robot Trainer mission zones are present", result.missionZones.length === 7, result.missionZones);
  check("drive base exposes shared agent steering without masquerading as a BallZ player", result.roverBefore?.physicsMode === "dynamic"
    && result.roverBefore?.hasSteering && result.roverBefore?.agentDriveable, result.roverBefore);

  console.log("\n# first playable mission");
  check("First Drive declares its subject, blue finish and 30 second clock in scene data",
    result.missionRules?.subjectId === "ev3-drive-base"
      && result.missionRules?.finish?.triggerId === "ev3-first-mission-finish"
      && result.missionRules?.timer?.limitSeconds === 30,
    result.missionRules);
  check("the mission arms when the starter loads", result.missionAtStart?.phase === "running", result.missionAtStart);
  check("crossing red is observable but does not counterfeit success",
    result.missEventCount >= 1 && result.missionAfterMiss?.phase === "running", {
      events: result.missEventCount,
      run: result.missionAfterMiss,
    });
  check("crossing the blue target completes the scene-native run",
    result.missionAfterGoal?.phase === "complete" && result.missionAfterGoal?.outcome === "complete",
    result.missionAfterGoal);
  check("transforming a composite parent preserves its child-authored materials",
    result.childLookAfterParentTransforms?.color === "#dce3e6"
      && result.childLookAfterParentTransforms?.opacity === 1, result.childLookAfterParentTransforms);

  console.log("\n# interactions and simulation");
  check("gripper starts open and toggles closed", result.visibilityBefore.open === true && result.visibilityBefore.closed === false
    && result.visibilityAfter.open === false && result.visibilityAfter.closed === true && result.interactions.gripper.ok, { before: result.visibilityBefore, after: result.visibilityAfter });
  check("launch control reveals flame and outpost activation", result.visibilityBefore.flame === false && result.visibilityBefore.outpost === false
    && result.visibilityAfter.flame === true && result.visibilityAfter.outpost === true && result.interactions.launch.ok, { before: result.visibilityBefore, after: result.visibilityAfter });
  check("drive base moves through the same steer API an agent uses", result.roverAfter[2] < result.roverBefore.position[2] - 0.2, { before: result.roverBefore.position, after: result.roverAfter });

  console.log("\n# document round-trip");
  check("scene exports every construction and mission as ordinary v2 data", result.document.id === "graphysx-ev3-robotics-lab"
    && result.document.entityCount === result.initialCount, result.document);
  check("exported scene reloads without loss", result.reload.ok && result.afterReloadCount === result.initialCount, { reload: result.reload, count: result.afterReloadCount });

  await page.evaluate(() => {
    const host = window.__GRAPHYSX_HOST__;
    host.frameWorld(0);
  });
  await page.waitForTimeout(800);
  await page.locator("#app canvas").first().screenshot({ path: path.join(ART, "ev3-robotics-lab.png") });

  // The application is a consumer of the same public evidence: it gives the goal to the child,
  // lets Nestor react to a miss, and celebrates only after the rules layer says complete.
  await page.setViewportSize({ width: 800, height: 480 });
  await page.goto(`${base}?app=ev3-lab`, { waitUntil: "domcontentloaded", timeout: SMOKE_TIMEOUT });
  await page.waitForSelector("[data-ev3-mission='first-drive']", { timeout: SMOKE_TIMEOUT });
  await page.waitForFunction(() => window.__GRAPHYSX_HOST__.world.getEntityObject("ev3-drive-base:technic")
    ?.getObjectByName("ev3-driving-base source model"), { timeout: SMOKE_TIMEOUT });
  await page.waitForFunction(() => ["left", "right"].every(side => window.__GRAPHYSX_HOST__.world.getEntityObject(`ev3-drive-base:wheel-${side}`)
    ?.getObjectByName(`ev3-driving-wheel-${side} source model`)), { timeout: SMOKE_TIMEOUT });
  const modelLook = await page.evaluate(() => {
    const host = window.__GRAPHYSX_HOST__;
    const model = host.world.getEntityObject("ev3-drive-base:technic");
    const mat = host.world.getEntityObject("ev3-first-drive-mat");
    const scene = window.__GRAPHYSX__.exportDocument();
    return { meshes: model.getObjectByName("ev3-driving-base source model").children.length,
      wheels: ["left", "right"].map(side => {
        const wheel = host.world.getEntityObject(`ev3-drive-base:wheel-${side}`);
        return { meshes: wheel.getObjectByName(`ev3-driving-wheel-${side} source model`).children.length,
          parent: wheel.parent === host.world.getEntityObject("ev3-drive-base:heading") };
      }),
      parent: model.parent === host.world.getEntityObject("ev3-drive-base:heading"),
      matTexture: Boolean(mat.material.map), mission: scene.rules.subjectId,
      unrelatedStations: scene.entities.filter(entity => entity.tags?.includes("construction-bay")).length };
  });
  check("First Drive loads the detailed EV3 assembly and a dedicated textured workbench",
    modelLook.meshes === 14 && modelLook.wheels.every(wheel => wheel.meshes === 2 && wheel.parent) && modelLook.parent && modelLook.matTexture
      && modelLook.mission === "ev3-drive-base" && modelLook.unrelatedStations === 0, modelLook);
  // Give optional host services time to answer. A connected scene store used to mount its
  // authoring panel over this kid-facing app after the mission surface had already appeared.
  await page.waitForTimeout(750);
  const appInitial = await page.evaluate(() => ({
    objective: document.querySelector("[data-ev3-objective]")?.textContent ?? "",
    nestor: document.querySelector("[data-ev3-nestor]")?.textContent ?? "",
    clock: document.querySelector("[data-ev3-clock]")?.textContent ?? "",
    mode: document.querySelector("[data-ev3-mission]")?.getAttribute("data-mode"),
    sceneBrowserVisible: (() => {
      const panel = document.querySelector("[aria-label='Stored scenes']");
      if (!(panel instanceof HTMLElement)) return false;
      const style = getComputedStyle(panel);
      return !panel.hidden && style.display !== "none" && style.visibility !== "hidden";
    })(),
    rendered: JSON.parse(window.render_game_to_text()).application,
    controls: [...document.querySelectorAll("[data-ev3]:not([hidden])")].map((button) => ({
      label: button.getAttribute("aria-label"),
      width: button.getBoundingClientRect().width,
      height: button.getBoundingClientRect().height,
    })),
  }));
  check("the child sees one explicit objective and a full 30 second clock",
    appInitial.objective === "Rejoins la zone bleue avant la fin du temps."
      && appInitial.clock === "0:30" && appInitial.nestor.includes("Ajoute trois blocs Avancer"), appInitial);
  check("First Drive opens in Build mode with empty text state that matches the screen",
    appInitial.mode === "program"
      && appInitial.rendered?.mode === "program"
      && appInitial.rendered?.program?.blocks?.length === 0
      && appInitial.rendered?.mission?.phase === "running", appInitial);
  check("the kid-facing application hides scene-store authoring chrome",
    appInitial.sceneBrowserVisible === false, appInitial.sceneBrowserVisible);
  check("the first program exposes eight thumb-sized controls and no hardware actions",
    appInitial.controls.length === 8
      && ["Ajouter un bloc Avancer", "Ajouter un bloc Reculer", "Ajouter un bloc Gauche", "Ajouter un bloc Droite", "Ajouter un bloc Arrêt", "Enlever le dernier bloc", "Démarrer le programme", "Piloter le robot"]
        .every((label) => appInitial.controls.some((control) => control.label === label))
      && appInitial.controls.every((control) => control.width >= 72 && control.height >= 72), appInitial.controls);
  // The application opens with a 0.9s camera move; evidence captured before it settles is a
  // picture of a transition, not the surface a child actually receives.
  await page.waitForTimeout(1_100);
  await page.screenshot({ path: path.join(ART, "ev3-first-mission-start-800x480.png"), fullPage: false });

  await page.evaluate(() => {
    const gx = window.__GRAPHYSX__;
    gx.pause(true);
    gx.update("ev3-drive-base", { transform: { position: [5, 0.83, 12.5] } });
    gx.step(1 / 60);
  });
  await page.waitForFunction(() => document.querySelector("[data-ev3-nestor]")?.textContent?.includes("Zone rouge"), {
    timeout: SMOKE_TIMEOUT,
  });
  const missUi = await page.evaluate(() => ({
    phase: document.querySelector("[data-ev3-mission]")?.getAttribute("data-phase"),
    misses: document.querySelector("[data-ev3-mission]")?.getAttribute("data-misses"),
    nestor: document.querySelector("[data-ev3-nestor]")?.textContent ?? "",
  }));
  check("Nestor reacts to a real red-zone crossing and keeps the attempt alive",
    missUi.phase === "running" && missUi.misses === "1" && missUi.nestor.includes("Reviens vers le bleu"), missUi);

  await page.evaluate(() => {
    const gx = window.__GRAPHYSX__;
    gx.update("ev3-drive-base", { transform: { position: [0, 0.83, 10.5] } });
    gx.step(1 / 60);
  });
  await page.waitForFunction(() => document.querySelector("[data-ev3-mission]")?.getAttribute("data-phase") === "complete", {
    timeout: SMOKE_TIMEOUT,
  });
  const completeUi = await page.evaluate(() => ({
    nestor: document.querySelector("[data-ev3-nestor]")?.textContent ?? "",
    retryVisible: !document.querySelector("[data-ev3-retry]")?.hidden,
    controlsDisabled: [...document.querySelectorAll("[data-ev3]")]
      .filter((button) => button.getAttribute("aria-label") !== "Réessayer")
      .every((button) => button.disabled),
  }));
  check("success stops the robot, earns Nestor's celebration and offers another attempt",
    completeUi.nestor.includes("Réussi !") && completeUi.retryVisible && completeUi.controlsDisabled, completeUi);
  await page.waitForTimeout(1_100);
  await page.screenshot({ path: path.join(ART, "ev3-first-mission-800x480.png"), fullPage: false });

  // Preserve the direct-drive escape hatch: reset, switch modes, hold the rendered Go control,
  // and wait for the dynamic rover to cross the finish under simulation.
  await page.evaluate(() => window.__GRAPHYSX__.pause(false));
  await page.locator("[data-ev3-retry]").click();
  await page.locator("[data-ev3-mode='drive']").click();
  const go = page.locator("[data-ev3='go']");
  // Success detaches the drive pad; retain this node to inspect the retired hold itself.
  const goElement = await go.elementHandle();
  const goBox = await go.boundingBox();
  if (!goBox) throw new Error("First Drive Go control has no hit box");
  await page.mouse.move(goBox.x + goBox.width / 2, goBox.y + goBox.height / 2);
  await page.mouse.down();
  try {
    await page.waitForFunction(() => document.querySelector("[data-ev3-mission]")?.getAttribute("data-phase") === "complete", {
      timeout: 10_000,
    });
    check("success clears held Go before the pointer is released",
      await goElement.evaluate((button) => button.dataset.held) === "false");
  } finally {
    await page.mouse.up();
  }
  const drivenSuccess = await page.evaluate(() => ({
    run: window.__GRAPHYSX__.rules.status(),
    rover: window.__GRAPHYSX__.query({ ids: ["ev3-drive-base"] })[0]?.position ?? null,
    nestor: document.querySelector("[data-ev3-nestor]")?.textContent ?? "",
  }));
  check("Pilotage libre still moves the rover through the real held-Go control",
    drivenSuccess.run?.phase === "complete"
      && drivenSuccess.rover?.[2] < 14
      && drivenSuccess.nestor.includes("Réussi !"), drivenSuccess);

  // Native touch must stay captured through a long hold and a slide outside the button.
  // Browser panning/selection used to cancel this gesture on the physical Mint touchscreen.
  await page.locator("[data-ev3-retry]").click();
  check("retry restores idle drive controls and a north-facing chassis", await page.evaluate(() => {
    const chassis = window.__GRAPHYSX__.query({ ids: ["ev3-drive-base:heading"] })[0];
    return [...document.querySelectorAll("[data-held]")].every((button) => button.dataset.held === "false")
      && Math.abs(chassis.rotationDegrees[1]) < 0.01;
  }));
  const left = page.locator("[data-ev3='left']");
  const leftBox = await left.boundingBox();
  if (!leftBox) throw new Error("First Drive Left control has no hit box");
  const touchSession = await page.context().newCDPSession(page);
  const contact = { x: leftBox.x + leftBox.width / 2, y: leftBox.y + leftBox.height / 2, id: 1 };
  try {
    await touchSession.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [contact] });
    await page.waitForTimeout(1_100);
    await touchSession.send("Input.dispatchTouchEvent", {
      type: "touchMove", touchPoints: [{ ...contact, x: contact.x + 300, y: contact.y - 130 }],
    });
    await page.waitForTimeout(150);
    const heldOutside = await left.evaluate((button) => ({
      held: button.dataset.held,
      heading: JSON.parse(window.render_game_to_text()).application.rover.headingDegrees,
      selection: String(window.getSelection()),
    }));
    check("long touch and slide outside keep steering without selecting the button label",
      heldOutside.held === "true" && heldOutside.heading !== 0 && heldOutside.selection === "", heldOutside);
  } finally {
    await touchSession.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await touchSession.detach();
  }
  await page.waitForFunction(() => {
    const rover = JSON.parse(window.render_game_to_text()).application.rover;
    return document.querySelector("[data-ev3='left']")?.getAttribute("data-held") === "false"
      && Math.hypot(rover.velocity[0], rover.velocity[2]) < 0.01;
  }, { timeout: 3_000 });
  check("releasing the touch outside stops the rover", true);

  await page.evaluate(() => {
    window.__ev3ContextMenus = [];
    document.addEventListener("contextmenu", (event) => {
      window.__ev3ContextMenus.push({ prevented: event.defaultPrevented, trusted: event.isTrusted });
    });
  });
  await left.click({ button: "right" });
  await page.locator("[data-ev3-mode='program']").click({ button: "right" });
  const contextMenus = await page.evaluate(() => window.__ev3ContextMenus);
  check("browser context menus are suppressed only on held driving controls",
    contextMenus.length === 2 && contextMenus.every((event) => event.trusted)
      && contextMenus[0].prevented && !contextMenus[1].prevented, contextMenus);
  await page.keyboard.press("Escape");
  await page.screenshot({ path: path.join(ART, "ev3-touch-release-800x480.png"), fullPage: false });

  // Build mode is the new product loop. Touch every block family, undo back to empty, prove the
  // six-block bound, then leave the known three-Forward solution in the tray.
  await page.locator("[data-ev3-mode='program']").click();
  for (const id of ["left", "right", "stop"]) await page.locator(`[data-ev3-block='${id}']`).click();
  const everyBlock = await page.evaluate(() => ({
    dom: [...document.querySelectorAll("[data-ev3-program-block]")].map((chip) => chip.getAttribute("data-ev3-program-block")),
    text: JSON.parse(window.render_game_to_text()).application?.program?.blocks ?? [],
  }));
  check("Left, Right and Stop author the same ordered program in DOM and text state",
    JSON.stringify(everyBlock.dom) === JSON.stringify(["left", "right", "stop"])
      && JSON.stringify(everyBlock.text) === JSON.stringify(everyBlock.dom), everyBlock);
  for (let index = 0; index < 3; index += 1) await page.locator("[data-ev3-undo]").click();
  await page.locator("[data-ev3-block='stop']").click();
  await page.locator("[data-ev3-run]").click();
  await page.waitForFunction(() => {
    const app = JSON.parse(window.render_game_to_text()).application;
    return app?.program?.running === false && app?.mission?.phase === "running";
  }, { timeout: 5_000 });
  const stoppedShort = await page.evaluate(() => JSON.parse(window.render_game_to_text()).application);
  check("Nestor explains a stationary program using the measured attempt",
    stoppedShort?.mission?.phase === "running"
      && stoppedShort?.program?.running === false
      && stoppedShort?.nestor?.includes("resté au départ")
      && stoppedShort?.nestor?.includes("Arrêt")
      && stoppedShort?.debrief?.outcome === "finished"
      && stoppedShort?.debrief?.segments?.length === 1
      && stoppedShort?.debrief?.segments[0].distance < .01
      && stoppedShort?.debrief?.segments[0].completed === true, stoppedShort);
  await page.locator("[data-ev3-undo]").click();
  await page.evaluate(() => {
    const forward = document.querySelector("[data-ev3-block='forward']");
    for (let index = 0; index < 7; index += 1) forward?.click();
  });
  const cappedProgram = await page.evaluate(() => ({
    blocks: JSON.parse(window.render_game_to_text()).application?.program?.blocks ?? [],
    atLimit: JSON.parse(window.render_game_to_text()).application?.program?.atLimit ?? false,
    addDisabled: [...document.querySelectorAll("[data-ev3-block]")].every((button) => button.disabled),
  }));
  check("the first language stops at six blocks and disables every add target",
    cappedProgram.blocks.length === 6 && cappedProgram.atLimit && cappedProgram.addDisabled, cappedProgram);
  for (let index = 0; index < 3; index += 1) await page.locator("[data-ev3-undo]").click();
  const readyProgram = await page.evaluate(() => ({
    blocks: JSON.parse(window.render_game_to_text()).application?.program?.blocks ?? [],
    chips: [...document.querySelectorAll("[data-ev3-program-block]")].map((chip) => ({
      id: chip.getAttribute("data-ev3-program-block"),
      active: chip.getAttribute("data-active"),
    })),
    runDisabled: document.querySelector("[data-ev3-run]")?.disabled ?? true,
    controls: [...document.querySelectorAll("[data-ev3]:not([hidden])")].map((button) => ({
      label: button.getAttribute("aria-label"),
      width: button.getBoundingClientRect().width,
      height: button.getBoundingClientRect().height,
    })),
  }));
  check("Undo leaves the known three-Forward solution ready to run",
    JSON.stringify(readyProgram.blocks) === JSON.stringify(["forward", "forward", "forward"])
      && readyProgram.chips.length === 3 && !readyProgram.runDisabled, readyProgram);
  check("Build mode remains thumb-sized after authoring",
    readyProgram.controls.length === 8
      && readyProgram.controls.every((control) => control.width >= 72 && control.height >= 72), readyProgram.controls);
  // SwiftShader can render the DOM several frames ahead of the WebGL canvas. Wait for the reset
  // start line to be painted so this is evidence of Build mode, not a stale frame from Drive.
  await page.waitForTimeout(1_100);
  await page.screenshot({ path: path.join(ART, "ev3-first-program-ready-800x480.png"), fullPage: false });

  await page.locator("[data-ev3-run]").click();
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).application?.program?.activeIndex === 1, {
    timeout: 5_000,
  });
  const runningProgram = await page.evaluate(() => ({
    text: JSON.parse(window.render_game_to_text()).application,
    activeChip: document.querySelector("[data-ev3-program-block][data-active='true']")?.getAttribute("data-ev3-program-block") ?? null,
    authoringDisabled: [...document.querySelectorAll("[data-ev3]:not([data-ev3-retry])")].every((button) => button.disabled),
  }));
  check("Run highlights the active block and disables authoring while motion is live",
    runningProgram.text?.program?.running
      && runningProgram.text.program.activeIndex === 1
      && runningProgram.activeChip === "forward"
      && runningProgram.authoringDisabled, runningProgram);
  await page.waitForTimeout(550);
  await page.screenshot({ path: path.join(ART, "ev3-first-program-running-800x480.png"), fullPage: false });
  await page.waitForFunction(() => document.querySelector("[data-ev3-mission]")?.getAttribute("data-phase") === "complete", {
    timeout: 10_000,
  });
  const programmedSuccess = await page.evaluate(() => ({
    text: JSON.parse(window.render_game_to_text()).application,
    run: window.__GRAPHYSX__.rules.status(),
    rover: window.__GRAPHYSX__.query({ ids: ["ev3-drive-base"] })[0]?.position ?? null,
    nestor: document.querySelector("[data-ev3-nestor]")?.textContent ?? "",
    retryVisible: !document.querySelector("[data-ev3-retry]")?.hidden,
  }));
  check("three rendered Forward blocks drive through physics to the scene-owned blue finish",
    programmedSuccess.text?.mission?.phase === "complete"
      && programmedSuccess.text?.program?.running === false
      && programmedSuccess.run?.phase === "complete"
      && programmedSuccess.rover?.[2] < 14
      && programmedSuccess.nestor.includes("Réussi !")
      && programmedSuccess.retryVisible, programmedSuccess);
  await page.waitForTimeout(1_100);
  await page.screenshot({ path: path.join(ART, "ev3-first-program-complete-800x480.png"), fullPage: false });

  // The required game-driver hook must advance the same program and physics without waiting on
  // wall-clock rAF timing. The program stays authored across retry by design.
  await page.locator("[data-ev3-retry]").click();
  await page.locator("[data-ev3-run]").click();
  const deterministicSuccess = await page.evaluate(() => ({
    stepped: window.advanceTime(3_000),
    rendered: JSON.parse(window.render_game_to_text()).application,
    run: window.__GRAPHYSX__.rules.status(),
  }));
  check("advanceTime deterministically runs the same program to the same verdict",
    deterministicSuccess.stepped?.mission?.phase === "complete"
      && deterministicSuccess.rendered?.mission?.phase === "complete"
      && deterministicSuccess.run?.phase === "complete", deterministicSuccess);

  // A language with named turn blocks has to prove routes, not only tray contents. Run the same
  // Left → Forward program twice from the public reset boundary, then its mirrored Right route.
  await page.locator("[data-ev3-retry]").click();
  for (let index = 0; index < 3; index += 1) await page.locator("[data-ev3-undo]").click();
  const runTurnProgram = async (screenshotName) => {
    await page.locator("[data-ev3-run]").click();
    const result = await page.evaluate(() => {
      const stepped = window.advanceTime(1_700);
      const rover = window.__GRAPHYSX__.query({ ids: ["ev3-drive-base"] })[0] ?? null;
      const indicator = window.__GRAPHYSX__.query({ ids: ["ev3-drive-base:heading"] })[0] ?? null;
      // Read actual rendered world-space directions, including the model and cone transforms.
      const world = window.__GRAPHYSX_HOST__.world;
      const model = world.getEntityObject("ev3-drive-base:technic");
      const indicatorObject = world.getEntityObject("ev3-drive-base:direction");
      const front = model.position.clone().set(0, 0, -1)
        .applyQuaternion(model.getWorldQuaternion(model.quaternion.clone()));
      const aim = indicatorObject.position.clone().set(0, 1, 0)
        .applyQuaternion(indicatorObject.getWorldQuaternion(indicatorObject.quaternion.clone()));
      model.updateWorldMatrix(true, false);
      const elements = model.matrixWorld.elements;
      return {
        stepped,
        position: rover?.position ?? null,
        headingDegrees: rover?.steering?.headingDegrees ?? null,
        visualDirections: { front: front.toArray(), aim: aim.toArray() },
        // The actual rendered chassis must face the physical steering direction.
        chassisHeading: (Math.atan2(-elements[8], elements[10]) * 180 / Math.PI + 360) % 360,
        indicator: indicator ? {
          visible: indicator.visible,
          position: indicator.position,
          rotationDegrees: indicator.rotationDegrees,
        } : null,
        rendered: JSON.parse(window.render_game_to_text()).application,
      };
    });
    await page.waitForTimeout(1_100);
    await page.screenshot({ path: path.join(ART, screenshotName), fullPage: false });
    return result;
  };
  await page.locator("[data-ev3-block='left']").click();
  await page.locator("[data-ev3-block='forward']").click();
  const leftFirst = await runTurnProgram("ev3-first-program-left-800x480.png");
  const leftSecond = await runTurnProgram("ev3-first-program-left-repeat-800x480.png");
  const repeatDelta = leftFirst.position && leftSecond.position
    ? Math.max(...leftFirst.position.map((value, index) => Math.abs(value - leftSecond.position[index])))
    : Number.POSITIVE_INFINITY;
  check("Left then Forward preserves the turn and exposes the same heading visually and in text",
    leftFirst.position?.[0] < -0.5
      && leftFirst.headingDegrees > 250 && leftFirst.headingDegrees < 290
      && leftFirst.rendered?.rover?.headingDegrees === leftFirst.headingDegrees
      && leftFirst.indicator?.visible
      && Math.abs(leftFirst.chassisHeading - leftFirst.headingDegrees) < 1
      && Math.abs(leftFirst.indicator.rotationDegrees?.[1] + leftFirst.headingDegrees) < 1,
    leftFirst);
  check("the same turn-containing program repeats from the same heading and spawn",
    repeatDelta < 0.03 && Math.abs(leftFirst.headingDegrees - leftSecond.headingDegrees) < 0.01,
    { repeatDelta, first: leftFirst, second: leftSecond });

  await page.locator("[data-ev3-undo]").click();
  await page.locator("[data-ev3-undo]").click();
  await page.locator("[data-ev3-block='right']").click();
  await page.locator("[data-ev3-block='forward']").click();
  const right = await runTurnProgram("ev3-first-program-right-800x480.png");
  for (const [name, pose] of [["Left", leftFirst], ["Right", right]]) {
    const radians = pose.headingDegrees * Math.PI / 180;
    const expected = [Math.sin(radians), 0, -Math.cos(radians)];
    check(`${name} visibly turns both the vehicle front and the direction marker`,
      [pose.visualDirections.front, pose.visualDirections.aim].every((direction) =>
        direction.every((value, index) => Math.abs(value - expected[index]) < 0.01)), pose.visualDirections);
  }
  check("Right then Forward produces the opposite physical route",
    right.position?.[0] > 0.5
      && Math.abs(right.chassisHeading - right.headingDegrees) < 1
      && right.headingDegrees > 70 && right.headingDegrees < 110
      && leftFirst.position?.[0] < 0,
    { left: leftFirst, right });

  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    const layout = await page.evaluate(() => {
      const rect = (element) => {
        const box = element.getBoundingClientRect();
        return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height };
      };
      return {
        buttons: [...document.querySelectorAll(".gx-ev3 button")].filter((button) => !button.hidden).map((button) => {
          const box = rect(button);
          const hit = document.elementFromPoint((box.left + box.right) / 2, (box.top + box.bottom) / 2);
          return { label: button.getAttribute("aria-label"), ...box, reachable: button === hit || button.contains(hit) };
        }),
        mission: rect(document.querySelector(".gx-ev3-mission")),
        exit: rect(document.querySelector(".gx-ev3-exit")),
      };
    });
    check(`all portrait controls remain visible and reachable at ${width}px`,
      layout.buttons.length === 8 && layout.buttons.every((button) => button.width >= 72 && button.height >= 72
        && button.left >= 0 && button.right <= width && button.bottom <= 844 && button.reachable)
        && layout.mission.top >= layout.exit.bottom && layout.mission.right <= width, layout);
    await page.screenshot({ path: path.join(ART, `ev3-first-program-ready-${width}x844.png`), fullPage: false });
  }
  await page.locator("[data-ev3-undo]").click();
  await page.locator("[data-ev3-undo]").click();
  for (let index = 0; index < 3; index += 1) await page.locator("[data-ev3-block='forward']").click();
  await page.locator("[data-ev3-run]").click();
  const portraitRun = await page.evaluate(() => window.advanceTime(3_000));
  check("portrait Run reaches the same First Drive verdict", portraitRun?.mission?.phase === "complete", portraitRun);
  await page.waitForTimeout(1_100);
  await page.screenshot({ path: path.join(ART, "ev3-first-program-complete-390x844.png"), fullPage: false });
} catch (error) {
  failures.push(String(error));
} finally {
  if (browser) await browser.close();
  if (server) await server.close();
}

check("no browser console errors", consoleErrors.length === 0, consoleErrors);
check("no page errors", pageErrors.length === 0, pageErrors);
if (failures.length > 0) {
  console.error(`\n${failures.length} EV3 lab smoke failure(s):\n${failures.join("\n")}`);
  process.exit(1);
}
console.log("\nEV3 Robotics Mission Lab smoke passed. Screenshots include Build ready/running/complete at 800x480.");
