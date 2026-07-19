import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { startSceneStore } from "../server/scene-store.mjs";
import { editScene, openScene, putScene } from "../tools/graphysx-scene-agent.mjs";

// Milestone A end to end: an agent edits a stored scene from outside the browser, and the
// tab looking at that scene picks the change up on its own. This is the whole point of the
// scene store, so it is asserted as one flow rather than as unit tests of the pieces.

const EXE = process.env.SMOKE_CHROMIUM || undefined;
const BASE = process.env.SMOKE_BASE || "http://127.0.0.1:4188/";
const ART = process.env.SMOKE_ARTIFACTS || path.resolve("output/smoke");
mkdirSync(ART, { recursive: true });

const SCENE = "smoke-scene";

/** A deliberately tiny world: enough to be unambiguous, small enough to eyeball. */
const seedDefinition = {
  schema: "graphysx.agent-world/v2",
  id: "smoke-scene",
  label: "Scene store smoke",
  environment: { background: "#0b1015", ground: { visible: true, size: 40, color: "#16202a", grid: true } },
  entities: [
    { id: "seed-ground-light", type: "ambient-light", intensity: 0.8 },
    { id: "seed-key-light", type: "directional-light", intensity: 1.1, transform: { position: [6, 10, 6] } },
    { id: "seed-plinth", type: "box", transform: { position: [0, 0.25, 0] }, geometry: { width: 4, height: 0.5, depth: 4 }, physics: { mode: "static" } },
    { id: "seed-block", type: "box", transform: { position: [0, 1.4, 0] }, material: { color: "#7de6c3" }, physics: { mode: "dynamic", mass: 1 } },
  ],
};

const consoleErrors = [];
const pageErrors = [];
const out = {};

let store = null;
let dir = null;
let browser = null;

try {
  dir = await mkdtemp(path.join(tmpdir(), "graphysx-store-"));
  // Port 0 → the OS picks a free one, so the smoke never collides with a running store.
  store = await startSceneStore({ port: 0, dir });
  out.storeUrl = store.url;

  // --- store + agent path, no browser involved ---------------------------------
  await putScene(store.url, SCENE, seedDefinition);
  const seeded = await openScene(store.url, SCENE);
  out.seededRevision = seeded.revision;
  out.seededEntities = seeded.definition.entities.length;

  // Optimistic concurrency: a stale write must be refused rather than clobbering.
  out.staleWriteRejected = await putScene(store.url, SCENE, seedDefinition, 0).then(
    () => false,
    (error) => error.status === 409,
  );

  // --- browser opens the stored scene ------------------------------------------
  browser = await chromium.launch({ executablePath: EXE, headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
  page.on("pageerror", (e) => pageErrors.push(String(e)));

  const url = `${BASE}${BASE.includes("?") ? "&" : "?"}scene=${SCENE}&store=${encodeURIComponent(store.url)}`;
  // Retry the first navigation on a *transport* failure only.
  //
  // This smoke runs last in `verify`, against a static server that has already served five
  // browsers, and it intermittently caught `net::ERR_CONNECTION_RESET` on the initial
  // document — before any application code had run, so it proved nothing about the scene
  // store and failed roughly one run in three. Note what this does NOT do: it does not
  // retry assertions, swallow page errors, or extend any timeout. If the page loads and
  // then misbehaves, that still fails exactly as loudly as before. Only "we never got the
  // HTML" is retried — the observed codes were ERR_CONNECTION_RESET and, under machine
  // load, ERR_CONNECTION_TIMED_OUT, so the guard matches the whole `net::ERR_` family
  // rather than playing whack-a-mole with individual codes.
  out.navigationAttempts = 0;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    out.navigationAttempts = attempt;
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      break;
    } catch (error) {
      if (!/net::ERR_/.test(String(error)) || attempt === 4) throw error;
      await new Promise((resolve) => setTimeout(resolve, 750 * attempt));
    }
  }
  await page.waitForFunction(() => !!window.__GRAPHYSX_HOST__, { timeout: 20000 });

  // The scene browser only mounts when a store answers, so its presence is itself the
  // assertion that discovery worked.
  await page.waitForSelector(".gx-sb", { timeout: 20000 }).catch(() => {});
  out.browserMounted = (await page.$(".gx-sb")) !== null;
  out.browserOnline = await page.evaluate(() =>
    document.querySelector(".gx-sb-dot")?.getAttribute("data-online") === "true");
  out.browserListsScene = await page.evaluate((name) =>
    !!document.querySelector(`.gx-sb-row[data-scene="${name}"]`), SCENE);

  // The stored world replaces the showroom once the pull lands.
  await page
    .waitForFunction(() => window.__GRAPHYSX__.state()?.world.id === "smoke-scene", null, { timeout: 20000 })
    .catch(() => {});
  out.storedSceneLoaded = await page.evaluate(() => window.__GRAPHYSX__.state()?.world.id === "smoke-scene");
  out.loadedEntities = await page.evaluate(() => window.__GRAPHYSX__.state().entities.length);

  await page.screenshot({ path: path.join(ART, "scene-store.png"), fullPage: false });

  // --- the actual milestone: an outside agent changes what is on screen ---------
  const edit = await editScene(
    store.url,
    SCENE,
    [
      {
        op: "spawn",
        entity: {
          id: "hermes-cube",
          type: "box",
          label: "Hermes cube",
          transform: { position: [1.6, 3.2, 0] },
          material: { color: "#ff5470" },
          physics: { mode: "dynamic", mass: 1.1 },
        },
      },
    ],
    { actor: "hermes", intent: "added a red cube" },
  );
  out.agentRevision = edit.revision;
  out.agentSpawnedId = edit.outputs[0]?.id ?? null;

  // No push channel at milestone A — the page polls every 2s, so this waits for the poll.
  await page
    .waitForFunction(() => window.__GRAPHYSX__.state().entities.some((e) => e.id === "hermes-cube"), null, { timeout: 20000 })
    .catch(() => {});
  out.agentChangeVisible = await page.evaluate(() =>
    window.__GRAPHYSX__.state().entities.some((e) => e.id === "hermes-cube"));

  // The tab adopted the agent's revision rather than re-pulling forever.
  out.sessionRevision = await page.evaluate(() => window.__GRAPHYSX_SCENE_BROWSER__?.session()?.revision() ?? null);

  // The change is attributed on screen: who did it, not just that something happened.
  out.liveAnnouncement = await page.evaluate(() => {
    const banner = document.querySelector(".gx-sb-live");
    return banner && !banner.hasAttribute("hidden") ? banner.textContent.replace(/\s+/g, " ").trim() : null;
  });
  out.announcesActor = typeof out.liveAnnouncement === "string" && out.liveAnnouncement.includes("hermes");

  await page.screenshot({ path: path.join(ART, "scene-store-after-agent.png"), fullPage: false });

  // --- removal propagates too ---------------------------------------------------
  await editScene(store.url, SCENE, [{ op: "remove", id: "hermes-cube" }]);
  await page
    .waitForFunction(() => !window.__GRAPHYSX__.state().entities.some((e) => e.id === "hermes-cube"), null, { timeout: 20000 })
    .catch(() => {});
  out.agentRemovalVisible = await page.evaluate(() =>
    !window.__GRAPHYSX__.state().entities.some((e) => e.id === "hermes-cube"));

  // --- living a scene is not authoring it ---------------------------------------
  // Something spawned while inhabiting the scene must be present in the runtime, absent
  // from the document, and therefore gone after a reload.
  out.livedSpawn = await page.evaluate(() => {
    const result = window.__GRAPHYSX__.spawn({
      id: "thrown-ball",
      type: "sphere",
      transform: { position: [0, 6, 0] },
      physics: { mode: "dynamic", mass: 1 },
      ephemeral: true,
    });
    const api = window.__GRAPHYSX__;
    return {
      ok: result.ok,
      inRuntime: api.state().entities.some((e) => e.id === "thrown-ball"),
      inFullExport: api.export().entities.some((e) => e.id === "thrown-ball"),
      inDocument: api.exportDocument().entities.some((e) => e.id === "thrown-ball"),
      flagged: api.state().entities.find((e) => e.id === "thrown-ball")?.ephemeral === true,
    };
  });

  // Saving from the panel must store the document, not the debris.
  await page.click(".gx-sb-foot [data-action=save]");
  await page.waitForFunction(() => /Saved/.test(document.querySelector(".gx-sb-status")?.textContent ?? ""), null, { timeout: 20000 }).catch(() => {});
  const pushed = await openScene(store.url, SCENE);
  out.pushedEntities = pushed.definition.entities.map((e) => e.id);
  out.thrownBallNotStored = !out.pushedEntities.includes("thrown-ball");

  // And the store refuses session state outright, so a client that pushes the wrong export
  // gets an error rather than silently polluting the scene.
  out.ephemeralWriteRejected = await putScene(store.url, SCENE, {
    ...seedDefinition,
    entities: [...seedDefinition.entities, { id: "junk", type: "sphere", ephemeral: true }],
  }).then(() => false, (error) => error.status === 400);

  // The lived spawn does not survive the reload that a remote change triggers.
  await editScene(store.url, SCENE, [{ op: "spawn", entity: { id: "later-cube", type: "box" } }]);
  await page
    .waitForFunction(() => window.__GRAPHYSX__.state().entities.some((e) => e.id === "later-cube"), null, { timeout: 20000 })
    .catch(() => {});
  out.thrownBallGoneAfterReload = await page.evaluate(() =>
    !window.__GRAPHYSX__.state().entities.some((e) => e.id === "thrown-ball"));

  // Switching scenes from the panel is the other half of what it is for.
  await putScene(store.url, "second-scene", { ...seedDefinition, id: "second-scene", label: "Second scene" }, undefined, {
    actor: "hermes",
    intent: "created a second scene",
  });
  await page.waitForFunction(() => !!document.querySelector('.gx-sb-row[data-scene="second-scene"]'), null, { timeout: 20000 }).catch(() => {});
  out.secondSceneListed = await page.evaluate(() => !!document.querySelector('.gx-sb-row[data-scene="second-scene"]'));
  await page.click('.gx-sb-row[data-scene="second-scene"]');
  await page
    .waitForFunction(() => window.__GRAPHYSX__.state()?.world.id === "second-scene", null, { timeout: 20000 })
    .catch(() => {});
  out.switchedScene = await page.evaluate(() => window.__GRAPHYSX__.state()?.world.id === "second-scene");

  await page.screenshot({ path: path.join(ART, "scene-browser.png"), fullPage: false });
} catch (e) {
  out.fatal = String(e);
} finally {
  if (browser) await browser.close();
  if (store) await store.close();
  if (dir) await rm(dir, { recursive: true, force: true });
}

out.consoleErrors = consoleErrors;
out.pageErrors = pageErrors;
console.log(JSON.stringify(out, null, 2));

const ok =
  out.seededRevision === 1 &&
  out.seededEntities === 4 &&
  out.staleWriteRejected &&
  out.storedSceneLoaded &&
  out.loadedEntities === 4 &&
  out.agentSpawnedId === "hermes-cube" &&
  out.agentChangeVisible &&
  out.sessionRevision === out.agentRevision &&
  out.agentRemovalVisible &&
  out.livedSpawn?.ok &&
  out.livedSpawn?.inRuntime &&
  out.livedSpawn?.inFullExport &&
  !out.livedSpawn?.inDocument &&
  out.livedSpawn?.flagged &&
  out.thrownBallNotStored &&
  out.ephemeralWriteRejected &&
  out.thrownBallGoneAfterReload &&
  out.browserMounted &&
  out.browserOnline &&
  out.browserListsScene &&
  out.announcesActor &&
  out.secondSceneListed &&
  out.switchedScene;
process.exit(out.fatal || pageErrors.length || !ok ? 1 : 0);
