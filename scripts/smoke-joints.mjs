import { mkdirSync } from "node:fs";
import path from "node:path";
import { SMOKE_TIMEOUT, applySmokeTimeout, launchSmokeBrowser } from "./smoke-harness.mjs";
import { startStaticServer } from "./static-server.mjs";

const PORT = Number(process.env.SMOKE_PORT || 4544);
const SHARED_BASE = process.env.SMOKE_BASE || null;
const ART = process.env.SMOKE_ARTIFACTS || "output/verify";
mkdirSync(ART, { recursive: true });
const failures = [];
const check = (name, condition, detail) => {
  const pass = Boolean(condition);
  if (!pass) failures.push(`${name}: ${JSON.stringify(detail)}`);
  console.log(`${pass ? "  ok  " : "  FAIL"} ${name}${detail === undefined ? "" : ` ${JSON.stringify(detail)}`}`);
};
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

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
    const listed = gx.starters().find((starter) => starter.id === "constraint-workshop") ?? null;
    const loaded = gx.loadStarter("constraint-workshop");
    const initial = gx.state();
    const documentBefore = gx.exportDocument();
    const bridgeAudit = window.__GRAPHYSX_AGENT_BRIDGE__.audit();
    const bridgeMethods = window.__GRAPHYSX_AGENT_BRIDGE__.manifest().tools.map((tool) => tool.name);

    const hingeKick = gx.interact("hinge-plank", "swing");
    const fixedKick = gx.interact("fixed-block", "test-weld");
    const ropeKick = gx.interact("rope-ball", "swing");
    gx.step(2);
    const moved = gx.state();

    const patch = gx.updateJoint("rope-joint", { length: 2.7 });
    const afterPatch = gx.exportDocument();
    const removed = gx.removeJoint("rope-joint");
    const afterRemove = gx.state();
    const undone = gx.undo();
    const afterUndo = gx.state();
    const reloaded = gx.load(documentBefore);
    const afterReload = gx.state();

    const rejectedAxis = gx.addJoint({ id: "bad-axis", type: "revolute", bodyA: "hinge-anchor", bodyB: "hinge-plank", axis: [0, 0, 0] });
    const rejectedStatic = gx.addJoint({ id: "bad-static", type: "fixed", bodyA: "constraint-floor", bodyB: "hinge-anchor" });
    const rejectedMissing = gx.addJoint({ id: "bad-missing", type: "rope", bodyA: "rope-anchor", bodyB: "not-there", length: 2 });
    const textState = JSON.parse(window.render_game_to_text());
    return {
      listed,
      loaded,
      initial,
      documentBefore,
      bridgeAudit,
      bridgeMethods,
      interactions: [hingeKick, fixedKick, ropeKick],
      moved,
      patch,
      afterPatch,
      removed,
      afterRemove,
      undone,
      afterUndo,
      reloaded,
      afterReload,
      rejectedAxis,
      rejectedStatic,
      rejectedMissing,
      textState,
    };
  });

  const stateEntity = (state, id) => state.entities.find((entity) => entity.id === id);
  console.log("\n# discovery and shared API");
  check("Constraint Workshop is discoverable in starter vocabulary", result.listed?.entityCount === 9, result.listed);
  check("starter loads through the public API", result.loaded.ok && result.initial.world.id === "graphysx-constraint-workshop", result.loaded);
  check("fixed, revolute and rope joints are active", result.initial.jointCount === 3 && result.initial.joints.every((joint) => joint.active)
    && ["fixed", "revolute", "rope"].every((type) => result.initial.joints.some((joint) => joint.type === type)), result.initial.joints);
  check("tool bridge exposes joint mutation with no parity drift", result.bridgeAudit.missing.length === 0 && result.bridgeAudit.extra.length === 0
    && ["addJoint", "updateJoint", "removeJoint"].every((method) => result.bridgeMethods.includes(method)), result.bridgeAudit);
  check("render_game_to_text reports the same joints", result.textState.joints?.length === 3, result.textState);

  console.log("\n# solver behavior");
  check("all three human-equivalent interactions fired", result.interactions.every((receipt) => receipt.ok), result.interactions);
  const hinge = stateEntity(result.moved, "hinge-plank");
  const fixedAnchor = stateEntity(result.moved, "fixed-anchor");
  const fixedBlock = stateEntity(result.moved, "fixed-block");
  const ropeAnchor = stateEntity(result.moved, "rope-anchor");
  const ropeBall = stateEntity(result.moved, "rope-ball");
  check("revolute body swung while its pivot radius stayed constrained", Math.abs(hinge.position[2]) > 0.1
    && Math.abs(distance(hinge.position, [-6, 3.2, 0]) - 1) < 0.2, hinge.position);
  check("fixed joint resisted an impulse and preserved the welded offset", distance(
    [fixedBlock.position[0] - fixedAnchor.position[0], fixedBlock.position[1] - fixedAnchor.position[1], fixedBlock.position[2] - fixedAnchor.position[2]],
    [0, -1.8, 0],
  ) < 0.12, { anchor: fixedAnchor.position, block: fixedBlock.position });
  check("rope joint capped the wrecking-ball separation", distance(ropeAnchor.position, ropeBall.position) <= 3.25, {
    anchor: ropeAnchor.position, ball: ropeBall.position, distance: distance(ropeAnchor.position, ropeBall.position),
  });

  console.log("\n# patch, undo, reload, rejection");
  check("joint patch is serialized", result.patch.ok && result.afterPatch.joints.find((joint) => joint.id === "rope-joint")?.length === 2.7, result.afterPatch.joints);
  check("joint removal updates state", result.removed.ok && result.afterRemove.jointCount === 2, result.afterRemove.joints);
  check("undo restores the removed joint", result.undone.ok && result.afterUndo.jointCount === 3, result.afterUndo.joints);
  check("export -> load recreates all active joints", result.reloaded.ok && result.afterReload.jointCount === 3 && result.afterReload.joints.every((joint) => joint.active), result.afterReload.joints);
  check("zero revolute axis is rejected", result.rejectedAxis.ok === false, result.rejectedAxis);
  check("static-to-static joint is rejected", result.rejectedStatic.ok === false, result.rejectedStatic);
  check("missing body is rejected", result.rejectedMissing.ok === false, result.rejectedMissing);

  await page.screenshot({ path: path.join(ART, "constraint-workshop.png") });
} catch (error) {
  failures.push(String(error));
} finally {
  if (browser) await browser.close();
  if (server) await server.close();
}

check("no browser console errors", consoleErrors.length === 0, consoleErrors);
check("no page errors", pageErrors.length === 0, pageErrors);
if (failures.length > 0) {
  console.error(`\n${failures.length} joint smoke failure(s):\n${failures.join("\n")}`);
  process.exit(1);
}
console.log("\nJoint smoke passed. Screenshot: constraint-workshop.png");
