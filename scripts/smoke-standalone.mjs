import { SMOKE_TIMEOUT, applySmokeTimeout, launchSmokeBrowser } from "./smoke-harness.mjs";
import { mkdirSync } from "node:fs";
import path from "node:path";

const EXE = process.env.SMOKE_CHROMIUM || undefined;
const BASE = process.env.SMOKE_BASE || "http://127.0.0.1:4188/";
const ART = process.env.SMOKE_ARTIFACTS || path.resolve("output/smoke");
mkdirSync(ART, { recursive: true });

const consoleErrors = [];
const pageErrors = [];

const browser = await launchSmokeBrowser();
const page = await browser.newPage();
applySmokeTimeout(page);
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
page.on("pageerror", (e) => pageErrors.push(String(e)));

const out = {};
try {
  await page.goto(BASE + "?host=standalone", { waitUntil: "domcontentloaded", timeout: SMOKE_TIMEOUT });
  await page.waitForFunction(() => !!window.__GRAPHYSX_HOST__, { timeout: SMOKE_TIMEOUT });
  // The editor layer is a lazy import on this route too.
  await page.waitForSelector(".gx-ed-toolbar", { timeout: SMOKE_TIMEOUT });
  await page.waitForTimeout(500);

  out.hasCanvas = (await page.$("canvas")) !== null;
  const first = await page.evaluate(() => window.__GRAPHYSX_HOST__.frameCount);
  await page.waitForTimeout(800);
  const probe = await page.evaluate(() => {
    const h = window.__GRAPHYSX_HOST__;
    const s = h.world.getState();
    return { frameCount: h.frameCount, revision: s.revision, entityCount: Array.isArray(s.entities) ? s.entities.length : null };
  });
  out.firstFrame = first;
  out.laterFrame = probe.frameCount;
  out.loopRunning = probe.frameCount > first;
  out.revision = probe.revision;
  out.entityCount = probe.entityCount;

  // Agent parity: drive the full public API + bridge exactly as an agent would.
  out.api = await page.evaluate(() => {
    const gx = window.__GRAPHYSX__;
    const bridge = window.__GRAPHYSX_AGENT_BRIDGE__;
    const before = gx.state().entities.length;
    const spawn = gx.spawn({
      id: "smoke-box",
      type: "box",
      geometry: { width: 1, height: 1, depth: 1 },
      transform: { position: [0, 6, 0] },
      physics: { mode: "dynamic", mass: 1 },
    });
    const after = gx.state().entities.length;
    const manifest = bridge && typeof bridge.manifest === "function" ? bridge.manifest() : null;
    // Manifest parity: the bridge must describe every callable path on the API — no drift.
    const parity = bridge && typeof bridge.audit === "function" ? bridge.audit() : null;
    const levelCreate = gx.levels.create({ id: "smoke-level", label: "Smoke Level", width: 8, height: 8 });
    return {
      hasGlobal: typeof gx === "object" && gx !== null,
      hasBridge: typeof bridge === "object" && bridge !== null,
      spawnOk: !!(spawn && spawn.ok),
      entitiesBefore: before,
      entitiesAfter: after,
      assetCount: gx.assets().length,
      textureCount: gx.textures().length,
      manifestSchema: manifest && manifest.schema,
      toolCount: manifest && Array.isArray(manifest.tools) ? manifest.tools.length : null,
      parityMissing: parity ? parity.missing : null,
      parityExtra: parity ? parity.extra : null,
      levelCreateOk: !!(levelCreate && levelCreate.ok),
      levelCount: gx.levels.list().length,
    };
  });
  // Human editor layer: DOM present, and a toolbar action mutates the shared world.
  out.editor = await page.evaluate(() => {
    const hasToolbar = !!document.querySelector(".gx-ed-toolbar");
    const hasPanel = !!document.querySelector(".gx-ed-panel");
    // The editor shell is three surfaces now: scene-tree rail, inspector rail, library drawer.
    const panelCount = document.querySelectorAll(".gx-ed-panel").length;
    const before = window.__GRAPHYSX__.state().entities.length;
    const addBox = [...document.querySelectorAll(".gx-ed-toolbar button")].find((b) => b.textContent.includes("Box"));
    if (addBox) addBox.click();
    const after = window.__GRAPHYSX__.state().entities.length;
    return {
      hasToolbar,
      hasPanel,
      panelCount,
      rowCount: document.querySelectorAll(".gx-ed-row").length,
      entitiesBefore: before,
      entitiesAfter: after,
    };
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(ART, "standalone.png"), fullPage: false });
} catch (e) {
  out.fatal = String(e);
}

out.consoleErrors = consoleErrors;
out.pageErrors = pageErrors;
console.log(JSON.stringify(out, null, 2));
await browser.close();
const apiOk = out.api && out.api.spawnOk && out.api.entitiesAfter > out.api.entitiesBefore && out.api.levelCreateOk && out.api.toolCount > 0;
const parityOk = out.api && Array.isArray(out.api.parityMissing) && out.api.parityMissing.length === 0 && out.api.parityExtra.length === 0;
if (!parityOk) console.log("bridge parity drift:", JSON.stringify({ missing: out.api?.parityMissing, extra: out.api?.parityExtra }));
const editorOk = out.editor && out.editor.hasToolbar && out.editor.hasPanel && out.editor.panelCount === 3 && out.editor.entitiesAfter > out.editor.entitiesBefore && out.editor.rowCount > 0;
process.exit(out.fatal || pageErrors.length || !out.loopRunning || !apiOk || !parityOk || !editorOk ? 1 : 0);


