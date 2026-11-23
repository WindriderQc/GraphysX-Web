import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { applySmokeTimeout, launchPersistentSmokeContext, launchSmokeBrowser, useLightRender } from "./smoke-harness.mjs";
import { canonicalScene, drawStudio, namedSave, sceneCard, sceneDocument, studioState, readStoredScene, installSceneWriteFault, restoreSceneWrites } from "./studio-smoke-helpers.mjs";

const base = process.env.SMOKE_BASE || "http://127.0.0.1:4209/";
const output = path.resolve(process.env.SMOKE_ARTIFACTS || "output/playwright/cubz-storage");
const prefix = "graphysx.agent-world.v2.", expected = new Map(), errors = [], receipts = [];
const hash = raw => createHash("sha256").update(raw).digest("hex");
await mkdir(output, { recursive: true });
// Fresh test-owned disk profile; the smoke never reads or removes a user profile.
const profile = await mkdtemp(path.join(output, "cubz-profile-"));
let context, browser, page;
const attach = async context => {
  const page = applySmokeTimeout(await context.newPage());
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("response", response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  return page;
};
async function capture(name) { await drawStudio(page); await page.screenshot({ path: path.join(output, name + ".png") }); }
async function library() {
  await page.click("[data-studio-action=my-scenes]");
  await page.getByRole("dialog", { name: "Mes créations", exact: true }).waitFor();
}
async function open(name) {
  await library(); await sceneCard(page, name).getByRole("button", { name: "Modifier dans le Studio", exact: true }).click();
  await page.waitForFunction(() => !document.querySelector(".gx-personal"));
  await page.waitForFunction(name => JSON.parse(window.render_game_to_text()).studio.savedName === name, name);
  assert.deepEqual(canonicalScene(await sceneDocument(page)), canonicalScene(JSON.parse(expected.get(name))));
}
async function marker(label) {
  await page.evaluate(label => {
    const result = window.__GRAPHYSX__.transaction([{ op: "update", id: "storage-variant-marker", patch: { label } }]);
    if (!result.ok) throw new Error(result.error);
  }, label);
}
async function remember(name) {
  const raw = JSON.stringify(await sceneDocument(page));
  await namedSave(page, name);
  assert.equal(await readStoredScene(page, name), raw, "Save commits the entire authored document without rebuilding its meshes");
  expected.set(name, raw);
  assert.equal((await studioState(page)).dirty, false);
}
async function inventory() {
  return page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => { const r = indexedDB.open("graphysx.personal-scenes.v1", 1); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(["scenes", "summaries"], "readonly"), docs = tx.objectStore("scenes").getAll(), summaries = tx.objectStore("summaries").getAll();
        tx.oncomplete = async () => {
          const entries = await Promise.all(docs.result.map(async record => ({ key: record.key, bytes: new TextEncoder().encode(record.raw).length, utf16Bytes: record.raw.length * 2, sha256: Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(record.raw))), byte => byte.toString(16).padStart(2, "0")).join(""), revision: record.revision })));
          resolve({ entries, summaries: summaries.result });
        };
        tx.onabort = () => reject(tx.error);
      });
    } finally { db.close(); }
  });
}
async function assertInventory() {
  const result = await inventory();
  assert.equal(result.entries.length, expected.size);
  assert.equal(result.summaries.length, expected.size, "no partial or orphaned catalogue commits");
  for (const [name, raw] of expected) {
    const entry = result.entries.find(entry => entry.key === prefix + name);
    assert.equal(entry?.sha256, hash(raw), name + " exact durable bytes");
    const summary = result.summaries.find(summary => summary.key === entry.key);
    assert.equal(summary.revision, entry.revision);
    assert.equal(summary.entityCount, JSON.parse(raw).entities.length);
    assert.equal(Object.hasOwn(summary, "raw"), false, "catalogue does not retain megabytes per card");
    assert.equal(Object.hasOwn(summary, "definition"), false);
  }
  return result;
}

try {
  context = await launchPersistentSmokeContext(profile, { viewport: { width: 1440, height: 960 }, reducedMotion: "reduce" });
  await useLightRender(context, { resolution: .5 }); // Storage/behaviour assertions; framing has its own full-render smoke.
  page = await attach(context);
  await page.goto(new URL("?app=cubx&intro=0", base).href);
  await page.locator('[data-cubz-choice="7"]').waitFor();
  await page.evaluate(() => {
    document.querySelector('[data-cubz-choice="7"]').click();
    window.__GRAPHYSX__.pause(true); window.__GRAPHYSX__.step(3);
  });
  await page.click("[data-cubz-studio]");
  await page.locator(".gx-studio-simple:not([hidden])").waitFor();
  await page.evaluate(async () => { await window.__GRAPHYSX_HOST__.editorReady(); });
  const native = await sceneDocument(page), legacyRaw = JSON.stringify(native);
  assert.ok(legacyRaw.length > 1_000_000, "use the actual large native CubZ pose, not a padded synthetic scene");
  const legacyDraft = JSON.stringify({ savedAt: "2026-10-01T12:00:00Z", definition: { schema: "graphysx.agent-world/v2", id: "retained-draft", entities: [] } });
  await page.evaluate(({ prefix, legacyRaw, legacyDraft }) => {
    for (const name of ["CubZ ancien A", "CubZ ancien B"]) localStorage.setItem(prefix + name, legacyRaw);
    localStorage.setItem("graphysx.editor.draft.v2.storage-history", legacyDraft);
    localStorage.setItem("graphysx.dna-creation.resume.v1", "retained-resume");
    localStorage.setItem("unrelated.private.storage-fixture", "retained-private-bytes");
  }, { prefix, legacyRaw, legacyDraft });
  await page.evaluate(() => {
    const result = window.__GRAPHYSX__.spawn({ id: "storage-variant-marker", type: "box", label: "Variant marker", transform: { position: [0, -4, 0] }, geometry: { width: .3, height: .3, depth: .3 } });
    if (!result.ok) throw new Error(result.error);
  });
  for (let index = 1; index <= 8; index++) {
    await marker("CubZ specimen " + index); await remember("CubZ variante " + index);
    console.log("PASS CubZ durable variant " + index + "/8");
  }
  const many = await assertInventory();
  assert.ok(many.entries.reduce((sum, entry) => sum + entry.utf16Bytes, 0) > 25_000_000, "one browser stores well beyond the old UTF-16 localStorage ceiling");
  await library();
  await sceneCard(page, "CubZ variante 1").getByRole("button", { name: "Créer une copie", exact: true }).click();
  const copy = page.getByRole("dialog", { name: "Créer une copie", exact: true });
  await copy.getByLabel("Nom de la scène", { exact: true }).fill("CubZ copie intacte");
  await copy.getByRole("button", { name: "Créer la copie", exact: true }).click();
  await sceneCard(page, "CubZ copie intacte").waitFor(); expected.set("CubZ copie intacte", expected.get("CubZ variante 1"));
  const downloadEvent = page.waitForEvent("download");
  await sceneCard(page, "CubZ variante 5").getByRole("button", { name: "Exporter", exact: true }).click();
  const exported = path.join(output, "cubz-variant-5.graphysx.json"); await (await downloadEvent).saveAs(exported);
  assert.equal(await readFile(exported, "utf8"), expected.get("CubZ variante 5"));
  await capture("cubz-many-scenes-desktop");
  await page.keyboard.press("Escape");
  await open("CubZ variante 3"); await marker("Updated third specimen"); await remember("CubZ variante 3");
  const updated = await assertInventory();
  assert.notEqual(updated.entries.find(entry => entry.key === prefix + "CubZ variante 3").sha256, many.entries.find(entry => entry.key === prefix + "CubZ variante 3").sha256);

  // Promote an old save without rewriting its legacy backup, drafts or resume pointers.
  expected.set("CubZ ancien A", legacyRaw);
  await open("CubZ ancien A");
  await remember("CubZ ancien A");
  await library();
  await sceneCard(page, "CubZ ancien A").waitFor();
  assert.equal(await page.locator('[data-personal-key^="graphysx.legacy-scene.v1."]').count(), 0, "unchanged legacy backup is not a duplicate card");
  await page.keyboard.press("Escape");
  const protectedLegacy = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage).filter(([key]) => key.startsWith("graphysx.agent-world.v2.") || key === "graphysx.editor.draft.v2.storage-history" || key === "graphysx.dna-creation.resume.v1" || key === "unrelated.private.storage-fixture")));
  assert.equal(protectedLegacy[prefix + "CubZ ancien A"], legacyRaw); assert.equal(protectedLegacy[prefix + "CubZ ancien B"], legacyRaw);
  assert.equal(Object.keys(protectedLegacy).length, 5, "new large saves do not consume localStorage");

  // Failure after an individual request succeeds must abort BOTH stores and keep
  // the previous committed version, its date, and the live unsaved document.
  await open("CubZ variante 2"); await marker("Uncommitted CubZ change");
  const unsaved = await sceneDocument(page), beforeAbort = await inventory();
  await installSceneWriteFault(page, "abort-after-put");
  await page.click("[data-studio-action=save]");
  const save = page.getByRole("dialog", { name: "Enregistrer ma scène", exact: true });
  await save.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await save.getByRole("status").getByText(/indisponible/).waitFor();
  assert.equal(await page.evaluate(() => window.__studioPutSucceeded), true, "the request really succeeded before transaction abort");
  assert.deepEqual(await inventory(), beforeAbort);
  assert.deepEqual(canonicalScene(await sceneDocument(page)), canonicalScene(unsaved));
  assert.equal((await studioState(page)).dirty, true);
  await restoreSceneWrites(page); await installSceneWriteFault(page);
  await save.getByLabel("Nom de la scène", { exact: true }).fill("CubZ refusée quota");
  await save.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await save.getByRole("status").getByText(/indisponible/).waitFor();
  assert.deepEqual(await inventory(), beforeAbort);
  assert.equal(await readStoredScene(page, "CubZ refusée quota"), null);
  await capture("cubz-storage-write-refused");
  await restoreSceneWrites(page); await page.keyboard.press("Escape");
  await remember("CubZ variante 2");
  await assertInventory();
  const restartURL = page.url();
  await context.close(); context = null;
  context = await launchPersistentSmokeContext(profile, { viewport: { width: 1440, height: 960 }, reducedMotion: "reduce" });
  await useLightRender(context, { resolution: .5 });
  page = await attach(context); await page.goto(restartURL);
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text?.() || "{}").studio?.savedName === "CubZ variante 2");
  await assertInventory();
  for (const name of expected.keys()) await open(name);
  assert.deepEqual(await page.evaluate(keys => Object.fromEntries(keys.map(key => [key, localStorage.getItem(key)])), Object.keys(protectedLegacy)), protectedLegacy);
  // Re-import the exported native document using the actual Studio file chooser.
  const chooser = page.waitForEvent("filechooser"); await page.locator(".gx-studio-file summary").click(); await page.click("[data-studio-action=import]");
  await (await chooser).setFiles(exported);
  await page.waitForFunction(() => window.__GRAPHYSX__.query({ ids: ["storage-variant-marker"] })[0]?.label === "CubZ specimen 5");
  assert.deepEqual(canonicalScene(await sceneDocument(page)), canonicalScene(JSON.parse(expected.get("CubZ variante 5"))));
  await remember("CubZ réimportée"); await assertInventory();
  for (const [width, height] of [[390, 844], [320, 740]]) {
    await page.setViewportSize({ width, height }); await library();
    await sceneCard(page, "CubZ réimportée").waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await capture("cubz-many-scenes-" + width);
    await page.keyboard.press("Escape");
  }
  receipts.push({ largeNativeVariants: 8, namedScenesAfterImport: expected.size, utf16EquivalentBytes: many.entries.reduce((sum, entry) => sum + entry.utf16Bytes, 0), copyExactBytes: true, oldSavePromotedWithoutDeletion: true, abortAfterSuccessfulRequest: true, quotaPreservesCommittedAndLiveData: true, diskProfileRestartAndEverySceneReopened: true, exportImportAllNativeFields: true, legacyBytesDraftsAndPointersPreserved: true, inventory: await assertInventory() });
  await context.close(); context = null;

  // The new library remains usable when localStorage access itself is blocked.
  browser = await launchSmokeBrowser();
  const isolated = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  await useLightRender(isolated, { resolution: .5 });
  await isolated.addInitScript(() => Object.defineProperty(window, "localStorage", { get() { throw new DOMException("Smoke denied legacy storage", "SecurityError"); } }));
  page = await attach(isolated); await page.goto(new URL("?host=editor&studio=simple&paused=1", base).href);
  await page.locator(".gx-studio-simple:not([hidden])").waitFor();
  await namedSave(page, "Sans ancien stockage");
  await page.reload(); await page.waitForFunction(() => JSON.parse(window.render_game_to_text?.() || "{}").studio?.savedName === "Sans ancien stockage");
  await library(); await sceneCard(page, "Sans ancien stockage").waitFor(); await capture("cubz-storage-independent-of-localstorage");
  await isolated.close();
  assert.deepEqual(errors, []);
  await writeFile(path.join(output, "cubz-storage.json"), JSON.stringify({ receipts, independentDatabaseWithBlockedLegacyStorage: true, profile, errors, completedAt: new Date().toISOString() }, null, 2));
  console.log("PASS CubZ storage: eight full native variants in one browser, atomic abort/quota guards, copy/update/export/import, legacy custody and actual browser restart.");
} catch (error) { await page?.screenshot({ path: path.join(output, "cubz-storage-failure.png") }).catch(() => {}); throw error; }
finally { await context?.close(); await browser?.close(); }
