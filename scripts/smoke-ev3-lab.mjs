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
    const document = gx.exportDocument();
    const reload = gx.load(document);
    const afterReload = gx.state();
    return {
      listed,
      loaded: { ok: loaded.ok, revision: loaded.revision, error: loaded.error ?? null },
      initialCount: initial.entityCount,
      constructionRoots: constructionRoots.map((entity) => entity.id),
      missionZones: missionZones.map((entity) => entity.id),
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
console.log("\nEV3 Robotics Mission Lab smoke passed. Screenshot: ev3-robotics-lab.png");
