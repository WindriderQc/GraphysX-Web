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
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
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
  const appInitial = await page.evaluate(() => ({
    objective: document.querySelector("[data-ev3-objective]")?.textContent ?? "",
    nestor: document.querySelector("[data-ev3-nestor]")?.textContent ?? "",
    clock: document.querySelector("[data-ev3-clock]")?.textContent ?? "",
    controls: [...document.querySelectorAll("[data-ev3]:not([hidden])")].map((button) => ({
      label: button.getAttribute("aria-label"),
      width: button.getBoundingClientRect().width,
      height: button.getBoundingClientRect().height,
    })),
  }));
  check("the child sees one explicit objective and a full 30 second clock",
    appInitial.objective === "Reach the blue target before time runs out."
      && appInitial.clock === "0:30" && appInitial.nestor.includes("Blue is straight ahead"), appInitial);
  check("First Drive keeps three thumb-sized controls and no unrelated mission actions",
    appInitial.controls.length === 3
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
  await page.waitForFunction(() => document.querySelector("[data-ev3-nestor]")?.textContent?.includes("red zone"), {
    timeout: SMOKE_TIMEOUT,
  });
  const missUi = await page.evaluate(() => ({
    phase: document.querySelector("[data-ev3-mission]")?.getAttribute("data-phase"),
    misses: document.querySelector("[data-ev3-mission]")?.getAttribute("data-misses"),
    nestor: document.querySelector("[data-ev3-nestor]")?.textContent ?? "",
  }));
  check("Nestor reacts to a real red-zone crossing and keeps the attempt alive",
    missUi.phase === "running" && missUi.misses === "1" && missUi.nestor.includes("Steer back toward blue"), missUi);

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
      .filter((button) => button.getAttribute("aria-label") !== "Try again")
      .every((button) => button.disabled),
  }));
  check("success stops the robot, earns Nestor's celebration and offers another attempt",
    completeUi.nestor.includes("You did it!") && completeUi.retryVisible && completeUi.controlsDisabled, completeUi);
  await page.waitForTimeout(1_100);
  await page.screenshot({ path: path.join(ART, "ev3-first-mission-800x480.png"), fullPage: false });

  // Finally prove the child path itself, not just the evaluator: reset, hold the rendered Go
  // control, and wait for the dynamic rover to cross the finish under simulation.
  await page.evaluate(() => window.__GRAPHYSX__.pause(false));
  await page.locator("[data-ev3-retry]").click();
  const go = page.locator("[data-ev3='go']");
  const goBox = await go.boundingBox();
  if (!goBox) throw new Error("First Drive Go control has no hit box");
  await page.mouse.move(goBox.x + goBox.width / 2, goBox.y + goBox.height / 2);
  await page.mouse.down();
  try {
    await page.waitForFunction(() => document.querySelector("[data-ev3-mission]")?.getAttribute("data-phase") === "complete", {
      timeout: 10_000,
    });
  } finally {
    await page.mouse.up();
  }
  const drivenSuccess = await page.evaluate(() => ({
    run: window.__GRAPHYSX__.rules.status(),
    rover: window.__GRAPHYSX__.query({ ids: ["ev3-drive-base"] })[0]?.position ?? null,
    nestor: document.querySelector("[data-ev3-nestor]")?.textContent ?? "",
  }));
  check("holding the real Go control drives the rover into a real successful finish",
    drivenSuccess.run?.phase === "complete"
      && drivenSuccess.rover?.[2] < 14
      && drivenSuccess.nestor.includes("You did it!"), drivenSuccess);
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
console.log("\nEV3 Robotics Mission Lab smoke passed. Screenshots: ev3-robotics-lab.png, ev3-first-mission-start-800x480.png, ev3-first-mission-800x480.png");
