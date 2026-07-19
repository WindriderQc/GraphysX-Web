// An end-to-end demonstration of the human/agent shared scene, run for real.
//
// Not a test — a proof. It stands up a store, opens the village in a browser the way a
// visitor would, has a human act in the scene, has an agent in a separate process change
// that same scene, and photographs each step. It also deliberately exercises the part that
// does NOT work yet, so the artifacts show the limit rather than hiding it.
//
//   node scripts/demo-collab.mjs        (requires a build in dist/)

import { chromium } from "playwright";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startSceneStore } from "../server/scene-store.mjs";
import { editScene, openScene, putScene } from "../tools/graphysx-scene-agent.mjs";
import { startStaticServer } from "./static-server.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "output", "collab");
await mkdir(OUT, { recursive: true });

const log = [];
const note = (step, detail) => { log.push({ step, detail }); console.log(`  ${step}: ${detail}`); };

const storeDir = await mkdtemp(path.join(tmpdir(), "graphysx-collab-"));
const store = await startSceneStore({ port: 0, dir: storeDir });
const site = await startStaticServer({ root: path.join(ROOT, "dist"), port: 0 });
const village = JSON.parse(await readFile(path.join(ROOT, "scenes", "dominus-village.json"), "utf8"));

const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(String(error)));

const shot = (name) => page.screenshot({ path: path.join(OUT, `${name}.png`) });
const settle = () => page.waitForFunction(
  () => {
    const models = window.__GRAPHYSX__.state().entities.filter((entity) => entity.type === "model");
    return models.length === 0 || models.every((model) => model.asset?.status !== "loading");
  },
  null,
  { timeout: 90000 },
).catch(() => {});

const result = {};
try {
  // --- 1. a scene exists on a server, not in a tab -----------------------------
  await putScene(store.url, "village", village, undefined, { actor: "port-tool", intent: "ported the village from the archive" });
  note("1 seeded", `village at ${store.url}, ${village.entities.length} entities`);

  // --- 2. a human opens it ------------------------------------------------------
  await page.goto(`${site.url}?scene=village&store=${encodeURIComponent(store.url)}`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForFunction(() => !!window.__GRAPHYSX_HOST__, { timeout: 20000 });
  await page.waitForFunction(() => window.__GRAPHYSX__.state()?.world.id === "dominus-village", null, { timeout: 30000 });
  await settle();
  await page.evaluate(() => {
    const host = window.__GRAPHYSX_HOST__;
    host.camera.position.set(24, 13, 34);
    host.camera.lookAt(0, 2, 0);
  });
  await page.waitForTimeout(900);
  await shot("1-human-opens");
  result.humanSees = await page.evaluate(() => window.__GRAPHYSX__.state().entities.length);
  note("2 human", `sees ${result.humanSees} entities`);

  // --- 3. the human acts in the scene -------------------------------------------
  // A thrown ball: real at runtime, never part of the document.
  await page.evaluate(() => {
    window.__GRAPHYSX__.spawn({
      id: "human-ball",
      type: "sphere",
      label: "Thrown by a human",
      transform: { position: [0, 9, 8] },
      geometry: { radius: 0.6 },
      material: { color: "#ff5470", emissive: "#3a0d18", emissiveIntensity: 0.5 },
      physics: { mode: "dynamic", mass: 1.2, material: "ball" },
      ephemeral: true,
    });
  });
  await page.waitForTimeout(1400);
  await shot("2-human-throws");
  result.humanBallPresent = await page.evaluate(() => window.__GRAPHYSX__.state().entities.some((entity) => entity.id === "human-ball"));
  note("3 human acts", `threw a ball, present in runtime: ${result.humanBallPresent}`);

  // --- 4. an agent, in another process, changes the same scene -------------------
  // Nothing browser-side is involved: this is the call a Telegram bot would make.
  const edit = await editScene(
    store.url,
    "village",
    [
      {
        op: "spawn",
        entity: {
          id: "hermes-campfire",
          type: "emitter",
          label: "Campfire",
          transform: { position: [0, 0.6, -29] },
          emitter: { preset: "campfire" },
        },
      },
      {
        op: "spawn",
        entity: {
          id: "hermes-gate",
          type: "box",
          label: "Village gate",
          transform: { position: [0, 1.6, 16] },
          geometry: { width: 6, height: 3.2, depth: 1 },
          material: { color: "#37b6d3", opacity: 0.35 },
          physics: { mode: "trigger" },
        },
      },
    ],
    { actor: "hermes", intent: "lit the camp and put a gate on the road" },
  );
  note("4 agent", `hermes wrote revision ${edit.revision} from a separate process`);
  result.agentRevision = edit.revision;

  // --- 5. it arrives in the human's tab on its own -------------------------------
  await page.waitForFunction(
    () => window.__GRAPHYSX__.state().entities.some((entity) => entity.id === "hermes-campfire"),
    null,
    { timeout: 20000 },
  );
  await settle();
  await page.waitForTimeout(1200);
  await shot("3-agent-change-arrives");

  result.agentChangeVisible = await page.evaluate(() =>
    window.__GRAPHYSX__.state().entities.some((entity) => entity.id === "hermes-campfire"));
  result.announcement = await page.evaluate(() => {
    const banner = document.querySelector(".gx-sb-live");
    return banner && !banner.hasAttribute("hidden") ? banner.textContent.replace(/\s+/g, " ").trim() : null;
  });
  note("5 arrives", `visible: ${result.agentChangeVisible}, panel says: "${result.announcement}"`);

  // --- 6. the honest part: what the human was doing did not survive --------------
  result.humanBallAfter = await page.evaluate(() =>
    window.__GRAPHYSX__.state().entities.some((entity) => entity.id === "human-ball"));
  note("6 limit", `human's thrown ball still there after the agent's edit: ${result.humanBallAfter}`);

  // --- 7. the document stayed clean ---------------------------------------------
  const stored = await openScene(store.url, "village");
  result.storedEntities = stored.definition.entities.length;
  result.storedHasHumanBall = stored.definition.entities.some((entity) => entity.id === "human-ball");
  result.storedHasAgentWork = stored.definition.entities.some((entity) => entity.id === "hermes-campfire");
  result.attribution = { actor: stored.actor, intent: stored.intent, revision: stored.revision };
  note("7 document", `${result.storedEntities} entities; agent's work stored: ${result.storedHasAgentWork}; human's ball stored: ${result.storedHasHumanBall}`);
  note("7 attributed", `rev ${stored.revision} by ${stored.actor} — "${stored.intent}"`);
} catch (error) {
  result.fatal = String(error);
  console.error(error);
} finally {
  await browser.close();
  await site.close();
  await store.close();
  await rm(storeDir, { recursive: true, force: true });
}

result.pageErrors = pageErrors;
console.log(`\n${JSON.stringify(result, null, 2)}`);
console.log(`\nartifacts: ${OUT}`);
