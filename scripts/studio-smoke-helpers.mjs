import assert from "node:assert/strict";

/** Retain the advanced regressions after explicitly checking the new human entry. */
export async function enterCompleteStudio(page) {
  await page.locator(".gx-studio-simple:not([hidden])").waitFor();
  assert.equal(await page.evaluate(() => JSON.parse(window.render_game_to_text()).studio.experience), "simple");
  await page.click("[data-studio-action=complete]");
  await page.locator(".gx-ed-toolbar").waitFor();
  assert.equal(await page.evaluate(() => JSON.parse(window.render_game_to_text()).studio.experience), "complete");
  // Each later handoff checks the first-visit default again, independently of preference.
  await page.evaluate(() => localStorage.removeItem("graphysx.studio.experience.v1"));
}

export const studioState = page => page.evaluate(() => JSON.parse(window.render_game_to_text()).studio);
export const sceneDocument = page => page.evaluate(() => window.__GRAPHYSX__.exportDocument());
export const canonicalScene = document => ({ ...document, entities: document.entities.toSorted((a, b) => a.id.localeCompare(b.id)) });
export const sceneCard = (page, name) => page.locator("[data-personal-key=" + JSON.stringify("graphysx.agent-world.v2." + name) + "]");
export async function namedSave(page, name) {
  await page.click("[data-studio-action=save]");
  const dialog = page.getByRole("dialog", { name: "Enregistrer ma scène", exact: true });
  await dialog.getByLabel("Nom de la scène", { exact: true }).fill(name);
  await dialog.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await dialog.waitFor({ state: "detached" });
  await page.waitForFunction(name => JSON.parse(window.render_game_to_text()).studio.savedName === name, name);
  assert.equal(new URL(page.url()).searchParams.get("localScene"), name);
}
export async function selectStudioObject(page, id) {
  if (await page.locator(".gx-studio-mobile").isVisible()) await page.locator(".gx-studio-mobile").getByRole("button", { name: "Objets", exact: true }).click();
  await page.locator("[data-studio-entity=" + JSON.stringify(id) + "]").click();
}
export const drawStudio = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));

// Inspect committed browser bytes independently of the product repository. The
// fallback is intentional: pre-IndexedDB saves remain in their original namespace.
export async function storedSceneInBrowser(name) {
  const key = "graphysx.agent-world.v2." + name;
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open("graphysx.personal-scenes.v1", 1);
    request.onupgradeneeded = () => request.transaction.abort();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    const raw = await new Promise((resolve, reject) => {
      const tx = db.transaction("scenes", "readonly"), request = tx.objectStore("scenes").get(key);
      tx.oncomplete = () => resolve(request.result?.raw ?? null);
      tx.onabort = () => reject(tx.error);
    });
    return raw ?? localStorage.getItem(key);
  } finally { db.close(); }
}
export const readStoredScene = (page, name) => page.evaluate(storedSceneInBrowser, name);
export async function waitForStoredScene(page, name, raw) {
  const source = storedSceneInBrowser.toString();
  await page.waitForFunction(async ({ source, name, raw }) => {
    const stored = await (0, eval)("(" + source + ")")(name);
    return raw === undefined ? stored !== null : stored === raw;
  }, { source, name, raw });
  return readStoredScene(page, name);
}

export async function installSceneWriteFault(page, mode = "quota") {
  await page.evaluate(mode => {
    window.__studioOriginalPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(...args) {
      if (this.name !== "scenes" || this.transaction.db.name !== "graphysx.personal-scenes.v1") return window.__studioOriginalPut.apply(this, args);
      if (mode === "quota") throw new DOMException("Smoke quota", "QuotaExceededError");
      const request = window.__studioOriginalPut.apply(this, args);
      request.addEventListener("success", () => { window.__studioPutSucceeded = true; this.transaction.abort(); });
      return request;
    };
  }, mode);
}
export async function restoreSceneWrites(page) {
  await page.evaluate(() => { IDBObjectStore.prototype.put = window.__studioOriginalPut; delete window.__studioOriginalPut; });
}

/** Fixture representing a committed edit from a different database client. */
export async function overwriteStoredScene(page, name, definition) {
  return page.evaluate(async ({ name, definition }) => {
    const db = await new Promise((resolve, reject) => { const r = indexedDB.open("graphysx.personal-scenes.v1", 1); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    const key = "graphysx.agent-world.v2." + name, raw = JSON.stringify(definition), revision = crypto.randomUUID();
    const documentDigest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw))), byte => byte.toString(16).padStart(2, "0")).join("");
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(["scenes", "summaries"], "readwrite"), scenes = tx.objectStore("scenes"), summaries = tx.objectStore("summaries");
        const doc = scenes.get(key), summary = summaries.get(key);
        doc.onsuccess = () => scenes.put({ ...doc.result, raw, revision });
        summary.onsuccess = () => summaries.put({ ...summary.result, revision, documentDigest, label: definition.label ?? "", entityCount: definition.entities.length });
        tx.oncomplete = resolve; tx.onabort = () => reject(tx.error);
      });
      return raw;
    } finally { db.close(); }
  }, { name, definition });
}
