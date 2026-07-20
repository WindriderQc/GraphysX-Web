import { SMOKE_TIMEOUT, applySmokeTimeout, launchSmokeBrowser } from "./smoke-harness.mjs";
import { mkdirSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { startSceneStore } from "../server/scene-store.mjs";

// The media library end to end: a datalake folder is browsable, a texture import lands in
// `api.textures()` and applies to an entity, a foreign-format model converts IN THE BROWSER
// to graphysx-mesh-json and spawns, and the editor's Media tab + import dialog drive the
// same path a human would. The smoke builds its own tiny datalake — the real one
// (E:\Media\Datalake) is machine-local and CI must not know about it.

const EXE = process.env.SMOKE_CHROMIUM || undefined;
const BASE = process.env.SMOKE_BASE || "http://127.0.0.1:4188/";
const ART = process.env.SMOKE_ARTIFACTS || path.resolve("output/smoke");
mkdirSync(ART, { recursive: true });

/** 1×1 opaque teal PNG. Small is the point — the pixel value is never asserted. */
const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNsaGj4DwAFhAKAr8ZBIgAAAABJRU5ErkJggg==",
  "base64",
);

/** A unit tetrahedron: the smallest OBJ that converts to real, closed geometry. */
const OBJ_TEXT = `# smoke tetrahedron
v 0 0 0
v 1 0 0
v 0 1 0
v 0 0 1
f 1 3 2
f 1 2 4
f 1 4 3
f 2 3 4
`;

const consoleErrors = [];
const pageErrors = [];
const out = {};

let store = null;
let storeDir = null;
let datalakeDir = null;
let browser = null;

try {
  storeDir = await mkdtemp(path.join(tmpdir(), "graphysx-media-store-"));
  datalakeDir = await mkdtemp(path.join(tmpdir(), "graphysx-media-lake-"));
  await mkdir(path.join(datalakeDir, "Textures"), { recursive: true });
  await writeFile(path.join(datalakeDir, "smoke-tetra.obj"), OBJ_TEXT, "utf8");
  await writeFile(path.join(datalakeDir, "Textures", "smoke-teal.png"), PNG_BYTES);

  store = await startSceneStore({
    port: 0,
    dir: path.join(storeDir, "scenes"),
    assetDir: path.join(storeDir, "assets"),
    datalakeDir,
  });
  out.storeUrl = store.url;

  // --- server side, no browser ---------------------------------------------------
  const health = await fetch(`${store.url}/health`).then((r) => r.json());
  out.healthAssets = health.assetCount;
  out.healthDatalake = typeof health.datalake === "string";

  const rootListing = await fetch(`${store.url}/datalake`).then((r) => r.json());
  out.rootFolders = rootListing.folders.map((f) => f.name);
  out.rootFiles = rootListing.files.map((f) => `${f.name}:${f.kind}`);

  // Path traversal must be refused, not resolved.
  out.traversalRejected = await fetch(`${store.url}/datalake?path=..%2F..%2Fsecrets`).then((r) => r.status === 400);

  const imported = await fetch(`${store.url}/assets/import`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: "Textures/smoke-teal.png" }),
  }).then((r) => r.json());
  out.importedId = imported.id;
  out.importedKind = imported.kind;
  out.importedSource = imported.source;
  const served = await fetch(`${store.url}${imported.url}`);
  out.importedServed = served.status === 200 && Number(served.headers.get("content-length")) === PNG_BYTES.length;

  // --- browser: the same library through the API and the editor GUI ---------------
  browser = await launchSmokeBrowser();
  const page = await browser.newPage();
  applySmokeTimeout(page);
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
  page.on("pageerror", (e) => pageErrors.push(String(e)));

  const url = `${BASE}${BASE.includes("?") ? "&" : "?"}host=editor&store=${encodeURIComponent(store.url)}`;
  out.navigationAttempts = 0;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    out.navigationAttempts = attempt;
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: SMOKE_TIMEOUT });
      break;
    } catch (error) {
      if (!/net::ERR_/.test(String(error)) || attempt === 4) throw error;
      await new Promise((resolve) => setTimeout(resolve, 750 * attempt));
    }
  }
  await page.waitForFunction(() => !!window.__GRAPHYSX__, { timeout: SMOKE_TIMEOUT });

  // The manifest pull registers the server-side import into the texture registry.
  out.refresh = await page.evaluate(async () => {
    const result = await window.__GRAPHYSX__.media.refresh();
    return { ok: result.ok, count: result.value ?? null, status: window.__GRAPHYSX__.media.status() };
  });
  out.textureRegistered = await page.evaluate(() =>
    window.__GRAPHYSX__.textures().some((t) => t.id === "smoke-teal" && t.category === "imported"));

  // An imported texture is usable exactly like a curated one.
  out.applied = await page.evaluate(() => {
    const api = window.__GRAPHYSX__;
    const spawn = api.spawn({ id: "media-box", type: "box", transform: { position: [0, 2, 0] } });
    const update = api.update("media-box", { material: { texture: { id: "smoke-teal" } } });
    return {
      spawnOk: spawn.ok,
      updateOk: update.ok,
      textureId: update.value?.material?.texture?.id ?? null,
    };
  });

  // An imported image doubles as a landform: decode → inline `terrain.heights` → spawn.
  out.terrain = await page.evaluate(async () => {
    const api = window.__GRAPHYSX__;
    const decoded = await api.media.terrainHeights("smoke-teal", 33);
    if (!decoded.ok || !decoded.value) return { ok: false, error: decoded.error ?? null };
    const spawn = api.spawn({
      id: "media-terrain",
      type: "terrain",
      terrain: { heights: decoded.value.heights, size: 40, segments: 32, heightScale: 5 },
    });
    const entity = api.state().entities.find((e) => e.id === "media-terrain");
    return {
      ok: true,
      samples: decoded.value.samples,
      length: decoded.value.heights.length,
      spawnOk: spawn.ok,
      hasTerrain: !!entity?.terrain,
    };
  });

  // Foreign-format model: fetched from the datalake, converted in-browser, uploaded,
  // registered, spawnable, and its payload actually loads (asset.status → ready).
  out.modelImport = await page.evaluate(async () => {
    const api = window.__GRAPHYSX__;
    const result = await api.media.import("smoke-tetra.obj");
    if (!result.ok || !result.value) return { ok: false, error: result.error ?? null };
    const spawn = api.spawn({ id: "media-model", type: "model", asset: { id: result.value.id }, transform: { position: [3, 1, 0] } });
    return { ok: true, id: result.value.id, format: result.value.format ?? null, spawnOk: spawn.ok };
  });
  await page
    .waitForFunction(() => window.__GRAPHYSX__.state().entities.find((e) => e.id === "media-model")?.asset?.status === "ready", null, { timeout: SMOKE_TIMEOUT })
    .catch(() => {});
  out.modelReady = await page.evaluate(() =>
    window.__GRAPHYSX__.state().entities.find((e) => e.id === "media-model")?.asset?.status ?? "missing");
  out.modelListed = await page.evaluate(() =>
    window.__GRAPHYSX__.assets().some((a) => a.id === "smoke-tetra" && a.category === "imported"));

  // --- the human path: Media tab and the import dialog ----------------------------
  out.mediaTabCards = await page.evaluate(() => {
    const tab = [...document.querySelectorAll(".gx-ed-tab")].find((t) => t.textContent === "Media");
    if (!tab) return null;
    tab.click();
    return [...document.querySelectorAll(".gx-ed-grid--drawer .gx-ed-thumb .gx-ed-thumb-label")].map((l) => l.textContent);
  });

  await page.evaluate(() => {
    [...document.querySelectorAll(".gx-ed-chip")].find((c) => c.textContent.includes("Import from Datalake"))?.click();
  });
  await page.waitForFunction(() => document.querySelectorAll(".gx-md-files .gx-ed-thumb").length > 0, null, { timeout: SMOKE_TIMEOUT }).catch(() => {});
  out.dialogOpen = await page.evaluate(() => document.querySelector(".gx-md-dialog")?.classList.contains("gx-ed-workbench--open") ?? false);
  out.dialogFiles = await page.evaluate(() =>
    [...document.querySelectorAll(".gx-md-files .gx-ed-thumb .gx-ed-thumb-label")].map((l) => l.textContent));

  // Import through the GUI: select the OBJ card, press the import button, await the status.
  out.guiImport = await page.evaluate(() => {
    const card = [...document.querySelectorAll(".gx-md-files .gx-ed-thumb")].find((c) =>
      c.querySelector(".gx-ed-thumb-label")?.textContent === "smoke-tetra.obj");
    if (!card) return { selected: false };
    card.click();
    const button = document.querySelector(".gx-md-foot .gx-lv-play");
    const label = button?.textContent ?? null;
    button?.click();
    return { selected: true, label };
  });
  await page
    .waitForFunction(() => (document.querySelector(".gx-md-dialog .gx-lv-status")?.textContent ?? "").startsWith("Imported"), null, { timeout: SMOKE_TIMEOUT })
    .catch(() => {});
  out.guiImportStatus = await page.evaluate(() => document.querySelector(".gx-md-dialog .gx-lv-status")?.textContent ?? null);
  // The GUI import ran after the API one, so the store holds a second copy under a new id.
  out.guiImportedListed = await page.evaluate(() =>
    window.__GRAPHYSX__.media.list("model").filter((m) => m.id.startsWith("smoke-tetra")).length >= 2);

  await page.screenshot({ path: path.join(ART, "media-library.png"), fullPage: false });
} catch (e) {
  out.fatal = String(e);
} finally {
  if (browser) await browser.close();
  if (store) await store.close();
  if (storeDir) await rm(storeDir, { recursive: true, force: true });
  if (datalakeDir) await rm(datalakeDir, { recursive: true, force: true });
}

out.consoleErrors = consoleErrors;
out.pageErrors = pageErrors;
console.log(JSON.stringify(out, null, 2));

const ok =
  out.healthAssets === 0 &&
  out.healthDatalake &&
  out.rootFolders?.includes("Textures") &&
  out.rootFiles?.includes("smoke-tetra.obj:model") &&
  out.traversalRejected &&
  out.importedId === "smoke-teal" &&
  out.importedKind === "texture" &&
  out.importedSource === "Datalake/Textures/smoke-teal.png" &&
  out.importedServed &&
  out.refresh?.ok &&
  out.refresh?.count === 1 &&
  out.refresh?.status?.online &&
  out.textureRegistered &&
  out.applied?.spawnOk &&
  out.applied?.updateOk &&
  out.applied?.textureId === "smoke-teal" &&
  out.terrain?.ok &&
  out.terrain?.samples === 33 &&
  out.terrain?.length === 33 * 33 &&
  out.terrain?.spawnOk &&
  out.terrain?.hasTerrain &&
  out.modelImport?.ok &&
  out.modelImport?.format === "graphysx-mesh-json" &&
  out.modelImport?.spawnOk &&
  out.modelReady === "ready" &&
  out.modelListed &&
  Array.isArray(out.mediaTabCards) &&
  out.mediaTabCards.includes("Smoke teal") &&
  out.dialogOpen &&
  out.dialogFiles?.includes("smoke-tetra.obj") &&
  out.guiImport?.selected &&
  typeof out.guiImportStatus === "string" && out.guiImportStatus.startsWith("Imported") &&
  out.guiImportedListed;
process.exit(out.fatal || pageErrors.length || !ok ? 1 : 0);
