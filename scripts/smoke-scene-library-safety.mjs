import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { applySmokeTimeout, launchSmokeBrowser, useLightRender } from "./smoke-harness.mjs";
import { canonicalScene, namedSave, readStoredScene, sceneCard, sceneDocument, studioState } from "./studio-smoke-helpers.mjs";

const base = process.env.SMOKE_BASE || "http://127.0.0.1:4209/";
const output = path.resolve(process.env.SMOKE_ARTIFACTS || "output/playwright/scene-library-safety");
const prefix = "graphysx.agent-world.v2.", errors = [], receipts = [];
await mkdir(output, { recursive: true });
const browser = await launchSmokeBrowser();
let page;
const attach = async context => {
  const result = applySmokeTimeout(await context.newPage());
  result.on("pageerror", error => errors.push(error.message));
  result.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  return result;
};
async function library() { await page.click("[data-studio-action=my-scenes]"); await page.getByRole("dialog", { name: "Mes créations", exact: true }).waitFor(); }
async function open(name) {
  await library(); await sceneCard(page, name).getByRole("button", { name: "Modifier dans le Studio", exact: true }).click();
  await page.waitForFunction(() => !document.querySelector(".gx-personal"));
}
async function make(id, label = id) {
  await page.evaluate(({ id, label }) => {
    const result = window.__GRAPHYSX__.load({ schema: "graphysx.agent-world/v2", id, label, entities: [{ id: "safety-cube", type: "box", transform: { position: [0, 1, 0] } }] });
    if (!result.ok) throw new Error(result.error);
    window.__GRAPHYSX__.pause(true);
    // Observe in the SAME task as load, before a coalesced UI refresh can hide a
    // stale association. A later Save must never default to the previous world.
    const immediate = JSON.parse(window.render_game_to_text()).studio;
    if (immediate.savedName !== null) throw new Error("World replacement kept the previous save target: " + immediate.savedName);
  }, { id, label });
  return sceneDocument(page);
}

// Delay only the next genuine IDB open success. Its database and subsequent
// transaction stay real; releasing it models slow storage without faking data.
async function holdNextOpen() {
  await page.evaluate(() => {
    window.__libraryOriginalOpen = IDBFactory.prototype.open;
    window.__libraryHoldNext = true; window.__libraryOpenHeld = false; window.__libraryReadFinished = false;
    IDBFactory.prototype.open = function(...args) {
      const request = window.__libraryOriginalOpen.apply(this, args);
      if (args[0] !== "graphysx.personal-scenes.v1" || !window.__libraryHoldNext) return request;
      window.__libraryHoldNext = false;
      let success;
      Object.defineProperty(request, "onsuccess", { get: () => success, set: handler => { success = handler; } });
      request.addEventListener("success", event => {
        const db = request.result, transaction = db.transaction.bind(db);
        db.transaction = (...args) => {
          const tx = transaction(...args);
          tx.addEventListener("complete", () => { window.__libraryReadFinished = true; });
          return tx;
        };
        window.__libraryOpenHeld = true;
        window.__libraryReleaseOpen = () => success?.call(request, event);
      });
      return request;
    };
  });
}
async function held() { await page.waitForFunction(() => window.__libraryOpenHeld === true); }
async function release() {
  await page.evaluate(() => {
    IDBFactory.prototype.open = window.__libraryOriginalOpen; delete window.__libraryOriginalOpen;
    const release = window.__libraryReleaseOpen; delete window.__libraryReleaseOpen; release();
  });
}

try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: "reduce" });
  await useLightRender(context, { resolution: .5 });
  page = await attach(context); await page.goto(new URL("?host=editor&studio=simple&paused=1", base).href);
  await page.locator(".gx-studio-simple:not([hidden])").waitFor();
  const a = await make("safety-a"); await namedSave(page, "Safety A");
  await make("safety-b"); await namedSave(page, "Safety B");

  await library(); await sceneCard(page, "Safety A").waitFor(); await holdNextOpen();
  await sceneCard(page, "Safety A").getByRole("button", { name: "Modifier dans le Studio", exact: true }).click();
  await held(); const foreign = await make("foreign-during-open"); await release();
  await page.getByRole("dialog", { name: "Mes créations", exact: true }).getByRole("status").getByText(/interrompue|changé/).waitFor();
  assert.deepEqual(canonicalScene(await sceneDocument(page)), canonicalScene(foreign));
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector(".gx-personal"));
  receipts.push({ lateReadCannotReplaceForeignWorld: true });

  await library(); await sceneCard(page, "Safety A").waitFor(); await holdNextOpen();
  await sceneCard(page, "Safety A").getByRole("button", { name: "Modifier dans le Studio", exact: true }).click();
  await held(); const url = page.url();
  await page.getByRole("dialog", { name: "Mes créations", exact: true }).getByRole("button", { name: "Fermer", exact: true }).click();
  await release();
  // Wait for that actual read to finish, rather than racing its callback.
  await page.waitForFunction(() => window.__libraryReadFinished === true);
  assert.deepEqual(canonicalScene(await sceneDocument(page)), canonicalScene(foreign)); assert.equal(page.url(), url);
  receipts.push({ closedLibraryCannotOpenLater: true });

  await open("Safety A");
  const sameId = await make("safety-a", "New document reusing the same ID");
  assert.equal((await studioState(page)).savedName, null);
  assert.deepEqual(canonicalScene(await sceneDocument(page)), canonicalScene(sameId));
  await open("Safety A");
  await page.evaluate(() => {
    const api = window.__GRAPHYSX__;
    for (const result of [api.spawn({ id: "undo-association", type: "box" }), api.undo(), api.redo(), api.undo()]) {
      if (!result.ok) throw new Error(result.error);
    }
    if (JSON.parse(window.render_game_to_text()).studio.savedName !== "Safety A") throw new Error("Undo/redo lost the current save target");
  });
  receipts.push({ sameIdReplacementDropsOldSaveTargetImmediately: true, ordinaryUndoRedoRetainsCurrentSaveTarget: true });

  await open("Safety A"); await holdNextOpen(); await page.click("[data-studio-action=save]");
  let save = page.getByRole("dialog", { name: "Enregistrer ma scène", exact: true });
  await save.getByRole("button", { name: "Enregistrer", exact: true }).click(); await held();
  assert.equal(await save.locator("form").getAttribute("aria-busy"), "true");
  assert.equal(await save.getByRole("button", { name: "Enregistrer", exact: true }).isDisabled(), true);
  await page.keyboard.press("Control+s"); await page.keyboard.press("Escape");
  assert.equal(await save.isVisible(), true, "pending commit cannot be submitted twice or dismissed as though it finished");
  await page.evaluate(() => { const result = window.__GRAPHYSX__.spawn({ id: "newer-edit", type: "sphere" }); if (!result.ok) throw new Error(result.error); });
  const newer = await sceneDocument(page); await release(); await save.waitFor({ state: "detached" });
  assert.deepEqual(canonicalScene(JSON.parse(await readStoredScene(page, "Safety A"))), canonicalScene(a));
  assert.deepEqual(canonicalScene(await sceneDocument(page)), canonicalScene(newer)); assert.equal((await studioState(page)).dirty, true);
  receipts.push({ immutableSaveSnapshot: true, laterEditsRemainDirty: true, pendingDuplicateSubmissionGuard: true });

  await holdNextOpen(); await page.click("[data-studio-action=save]");
  await save.getByRole("button", { name: "Enregistrer", exact: true }).click(); await held();
  const nextOwner = await make("foreign-during-save");
  await page.evaluate(() => history.replaceState(null, "", "?host=editor&studio=simple&owner=foreign-during-save"));
  const ownerURL = page.url(); await release(); await save.waitFor({ state: "detached" });
  assert.deepEqual(canonicalScene(await sceneDocument(page)), canonicalScene(nextOwner));
  assert.equal(page.url(), ownerURL, "late save receipt cannot claim a later world's URL");
  assert.equal((await studioState(page)).savedName, null); assert.equal((await studioState(page)).dirty, true);
  assert.deepEqual(canonicalScene(JSON.parse(await readStoredScene(page, "Safety A"))), canonicalScene(newer), "the earlier snapshot is still safely committed");
  receipts.push({ lateSaveCannotMarkOrRenameForeignWorld: true });

  // An explicit legacy update promotes the document but keeps the exact source.
  const old = { ...nextOwner, id: "legacy-promoted", label: "Legacy promotion specimen" }, oldRaw = JSON.stringify(old, null, 2);
  await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), { key: prefix + "Ancienne version", raw: oldRaw });
  await open("Ancienne version"); await namedSave(page, "Ancienne version");
  const promotedRaw = await readStoredScene(page, "Ancienne version");
  assert.equal(await page.evaluate(key => localStorage.getItem(key), prefix + "Ancienne version"), oldRaw);
  await library(); await sceneCard(page, "Ancienne version").waitFor();
  assert.equal(await page.locator('[data-personal-key^="graphysx.legacy-scene.v1."]').count(), 0);
  await page.keyboard.press("Escape");
  const late = { ...old, label: "Retained old-tab edit" }, lateRaw = JSON.stringify(late, null, 2);
  await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), { key: prefix + "Ancienne version", raw: lateRaw });
  await library();
  const alternate = page.locator('[data-personal-key=' + JSON.stringify("graphysx.legacy-scene.v1." + prefix + "Ancienne version") + ']');
  await alternate.waitFor();
  assert.equal(await readStoredScene(page, "Ancienne version"), promotedRaw, "late legacy writer cannot replace the database primary");
  const downloadEvent = page.waitForEvent("download"); await alternate.getByRole("button", { name: "Exporter", exact: true }).click();
  const rescue = path.join(output, "retained-old-tab.graphysx.json"); await (await downloadEvent).saveAs(rescue);
  assert.equal(await readFile(rescue, "utf8"), lateRaw);
  await alternate.getByRole("button", { name: "Modifier dans le Studio", exact: true }).click();
  await page.waitForFunction(() => !document.querySelector(".gx-personal"));
  assert.ok(new URL(page.url()).searchParams.get("localVersion"));
  await page.reload(); await page.waitForFunction(() => window.__GRAPHYSX__?.state().world.label === "Retained old-tab edit");
  assert.deepEqual(canonicalScene(await sceneDocument(page)), canonicalScene(late));
  assert.equal(await readStoredScene(page, "Ancienne version"), promotedRaw);
  await namedSave(page, "Ancien onglet conservé"); assert.equal(await readStoredScene(page, "Ancien onglet conservé"), JSON.stringify(await sceneDocument(page)));
  assert.equal(await page.evaluate(key => localStorage.getItem(key), prefix + "Ancienne version"), lateRaw);
  receipts.push({ legacyPromotionPreservesOriginalBytes: true, lateLegacyWriterExposedAndExportable: true, alternateColdURLAndCopy: true });
  await page.screenshot({ path: path.join(output, "scene-library-safety.png") });

  // Two actual windows race to create the same name; only one transaction wins.
  const contenderA = await make("contender-a");
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).studio.savedName === null);
  const other = await attach(context); await other.goto(new URL("?host=editor&studio=simple&paused=1", base).href);
  await other.locator(".gx-studio-simple:not([hidden])").waitFor();
  await other.evaluate(() => {
    const result = window.__GRAPHYSX__.load({ schema: "graphysx.agent-world/v2", id: "contender-b", label: "Contender B", entities: [{ id: "other-cube", type: "box" }] });
    if (!result.ok) throw new Error(result.error);
    window.__GRAPHYSX__.pause(true);
  });
  const contenderB = await sceneDocument(other), common = "Nom disputé entre onglets";
  const dialogs = [page, other].map(tab => tab.getByRole("dialog", { name: "Enregistrer ma scène", exact: true }));
  for (const [index, tab] of [page, other].entries()) {
    await tab.click("[data-studio-action=save]"); await dialogs[index].getByLabel("Nom de la scène", { exact: true }).fill(common);
  }
  await Promise.all(dialogs.map(dialog => dialog.getByRole("button", { name: "Enregistrer", exact: true }).click()));
  await Promise.all([page, other].map(tab => tab.waitForFunction(name => {
    const dialog = document.querySelector('.gx-personal-dialog[aria-label="Enregistrer ma scène"]');
    return dialog ? dialog.querySelector('[role="status"]')?.textContent.includes("existe déjà") : JSON.parse(window.render_game_to_text()).studio.savedName === name;
  }, common)));
  const winnerA = (await studioState(page)).savedName === common, winnerB = (await studioState(other)).savedName === common;
  assert.equal(Number(winnerA) + Number(winnerB), 1);
  assert.deepEqual(canonicalScene(JSON.parse(await readStoredScene(page, common))), canonicalScene(winnerA ? contenderA : contenderB));
  assert.deepEqual(canonicalScene(await sceneDocument(winnerA ? other : page)), canonicalScene(winnerA ? contenderB : contenderA));
  assert.equal((await studioState(winnerA ? other : page)).dirty, true);
  receipts.push({ simultaneousCreateHasOneWinner: true, losingTabKeepsItsDocument: true });
  await other.close();
  for (const paused of [null, "0", "1"]) {
    const target = new URL("?host=editor&localScene=Safety%20A", base);
    if (paused !== null) target.searchParams.set("paused", paused);
    await page.goto(target.href); await page.waitForFunction(() => JSON.parse(window.render_game_to_text?.() || "{}").studio?.savedName === "Safety A");
    assert.equal(await page.evaluate(() => window.__GRAPHYSX__.state().paused), paused === "1", "cold Complete links retain their pause policy");
  }
  receipts.push({ coldCompletePausePolicyPreserved: true });
  await context.close();

  const blocked = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  await useLightRender(blocked, { resolution: .5 });
  await blocked.addInitScript(({ key, raw }) => {
    localStorage.setItem(key, raw);
    Object.defineProperty(window, "indexedDB", { get() { throw new DOMException("Smoke denied database", "SecurityError"); } });
  }, { key: prefix + "Ancienne scène accessible", raw: oldRaw });
  page = await attach(blocked); await page.goto(new URL("?host=editor&studio=simple&paused=1", base).href);
  await page.locator(".gx-studio-simple:not([hidden])").waitFor();
  await open("Ancienne scène accessible");
  assert.deepEqual(canonicalScene(await sceneDocument(page)), canonicalScene(old));
  await page.click("[data-studio-action=save]");
  save = page.getByRole("dialog", { name: "Enregistrer ma scène", exact: true });
  await save.getByLabel("Nom de la scène", { exact: true }).fill("Écriture indisponible"); await save.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await save.getByRole("status").getByText(/indisponible/).waitFor();
  assert.equal(await page.evaluate(key => localStorage.getItem(key), prefix + "Ancienne scène accessible"), oldRaw);
  assert.equal(await page.evaluate(key => localStorage.getItem(key), prefix + "Écriture indisponible"), null);
  assert.deepEqual(canonicalScene(await sceneDocument(page)), canonicalScene(old));
  await page.screenshot({ path: path.join(output, "scene-library-database-blocked.png") });
  await blocked.close(); receipts.push({ blockedDatabaseKeepsLegacyOpenAndExportable: true, failedSaveCannotEraseLegacy: true });
  assert.deepEqual(errors, []);
  await writeFile(path.join(output, "scene-library-safety.json"), JSON.stringify({ receipts, errors, completedAt: new Date().toISOString() }, null, 2));
  console.log("PASS scene library safety: delayed reads/saves retain their owner, newer edits stay dirty, legacy versions remain recoverable and blocked storage never claims success.");
} catch (error) { await page?.screenshot({ path: path.join(output, "scene-library-safety-failure.png") }).catch(() => {}); throw error; }
finally { await browser.close(); }
