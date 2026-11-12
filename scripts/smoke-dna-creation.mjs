import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { applySmokeTimeout, launchSmokeBrowser } from "./smoke-harness.mjs";

const base = process.env.SMOKE_BASE || "http://127.0.0.1:4188/";
const artifacts = process.env.SMOKE_ARTIFACTS || path.resolve("output/smoke");
const prefix = "graphysx.agent-world.v2.";
const resumeKey = "graphysx.dna-creation.resume.v1";
await mkdir(artifacts, { recursive: true });
const browser = await launchSmokeBrowser();
const receipts = [];
const read = (page) => page.evaluate(() => JSON.parse(window.render_game_to_text()).application);
const documentOf = (page) => page.evaluate(() => window.__GRAPHYSX__.exportDocument());
// Loading resolves entities in dependency order; every authored field must survive,
// while the API does not promise its entity array has the original insertion order.
const canonical = (document) => ({ ...document, entities: document.entities.toSorted((a, b) => a.id.localeCompare(b.id)) });
const draw = (page) => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const reachable = (locator) => locator.evaluate((element) => {
  const box = element.getBoundingClientRect();
  return box.width >= 24 && box.height >= 44 && box.top >= 0 && box.bottom <= innerHeight && box.left >= 0 && box.right <= innerWidth && element.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
});
try {
  for (const [device, width, height] of [["desktop", 1440, 960], ["phone", 390, 844], ["small-phone", 320, 740]]) {
    const context = await browser.newContext({ viewport: { width, height }, isMobile: width < 740, hasTouch: width < 740, deviceScaleFactor: 1, reducedMotion: "reduce" });
    const page = applySmokeTimeout(await context.newPage());
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push({ text: message.text(), location: message.location() }); });
    page.on("response", (response) => { if (response.status() >= 400) errors.push(response.status() + " " + response.url()); });
    await page.goto(new URL("?intro=0", base).href, { waitUntil: "domcontentloaded" });
    const entry = page.getByRole("link", { name: "Créer une variante ADN ↗", exact: true });
    await entry.waitFor();
    assert.equal(await reachable(entry), true, device + " primary DNA action is visible and reachable");
    await page.screenshot({ path: path.join(artifacts, `dna-welcome-${device}.png`) });
    await entry.click();
    const app = page.locator(".gx-dna");
    await app.getByRole("heading", { name: "Une mutation, un monde." }).waitFor();
    assert.equal((await read(page)).paused, true, "no automatic physics under reduced motion");
    assert.equal(await page.evaluate(() => JSON.parse(window.render_game_to_text()).discovery.cameraMoving), false, "reduced motion skips the camera arrival");
    const initial = await documentOf(page);
    const reference = initial.entities.find((entity) => entity.id === "dna-reference");
    const referenceHeight = (await read(page)).measurements.reference.height;
    for (const [label, gene, value] of [["Plus ouvert", "branchAngle", 0.85], ["Plus ramifié", "splitChance", 0.82], ["Plus haut", "trunkLength", 1.75]]) {
      await app.getByRole("button", { name: "1 · Muter", exact: true }).click();
      const radio = app.getByRole("radio", { name: new RegExp(label) });
      await radio.check();
      assert.equal(await radio.isChecked(), true);
      const document = await documentOf(page);
      assert.deepEqual(document.entities.find((entity) => entity.id === "dna-reference"), reference, "reference remains authored-identical");
      const genome = document.entities.find((entity) => entity.id === "dna-variant").dna.genome;
      assert.equal(genome[gene], value);
      assert.deepEqual(Object.keys(genome).filter((key) => genome[key] !== reference.dna.genome[key]), [gene], "one actual gene changes at a time");
      assert.equal((await read(page)).canTune, true);
    }
    const mutated = await documentOf(page);
    const selected = app.getByRole("radio", { name: /Plus haut/ });
    await selected.press("ArrowDown");
    assert.equal((await read(page)).mutation, "spread", "native radio keyboard navigation changes the actual genome");
    await app.getByRole("radio", { name: /Plus ouvert/ }).press("ArrowUp");
    assert.equal((await read(page)).mutation, "height");
    assert.deepEqual(canonical(await documentOf(page)), canonical(mutated));
    const before = await read(page);
    assert.ok(before.measurements.variant.height > referenceHeight * 1.5);
    assert.equal(before.measurements.reference.branches, before.measurements.variant.branches, "height gene preserves topology");
    await app.getByRole("button", { name: "2 · Observer", exact: true }).click();
    await page.evaluate(() => {
      document.querySelector("[data-dna-drop]").click();
      window.advanceTime(250);
      document.querySelector("[data-dna-pause]").click();
    });
    const frozen = await page.evaluate(() => ({ time: window.__GRAPHYSX__.state().elapsedSeconds, seeds: window.__GRAPHYSX__.query({ ids: ["dna-seed-reference", "dna-seed-variant"] }).map((seed) => seed.position) }));
    const invalidTime = await page.evaluate(() => {
      window.advanceTime(1000);
      return [-100, Infinity].map((value) => { try { window.advanceTime(value); return false; } catch (error) { return error instanceof RangeError; } });
    });
    assert.deepEqual(invalidTime, [true, true], "public time control rejects invalid durations");
    assert.deepEqual(await page.evaluate(() => ({ time: window.__GRAPHYSX__.state().elapsedSeconds, seeds: window.__GRAPHYSX__.query({ ids: ["dna-seed-reference", "dna-seed-variant"] }).map((seed) => seed.position) })), frozen, "paused and invalid time advances cannot move seeds");
    assert.deepEqual(await documentOf(page), mutated, "physics does not rewrite the authored scene");
    await page.evaluate(() => { document.querySelector("[data-dna-pause]").click(); window.advanceTime(3500); });
    const observed = await read(page);
    assert.equal(observed.phase, "complete");
    assert.equal(observed.paused, true);
    assert.ok(observed.drops.variant.peak > observed.drops.reference.peak * 1.45, "higher launch gives a higher real bounce");
    for (const drop of Object.values(observed.drops)) {
      assert.equal(drop.bounced, true); assert.equal(drop.complete, true); assert.ok(drop.impactSpeed > 6);
    }
    await draw(page);
    await page.screenshot({ path: path.join(artifacts, `dna-bounce-${device}.png`) });
    await app.getByRole("button", { name: "Replacer les graines", exact: true }).click();
    assert.equal((await read(page)).phase, "ready");
    assert.equal((await read(page)).drops.reference.peak, null);
    assert.deepEqual(await documentOf(page), mutated, "reset preserves the chosen genome");
    await app.getByRole("button", { name: "3 · Garder", exact: true }).click();
    const name = "ADN " + device;
    await app.getByLabel("3 Garde ta variante").fill(name);
    await app.getByRole("button", { name: "Enregistrer", exact: true }).click();
    await app.locator("[data-dna-notice]").getByText(/Variante enregistrée/).waitFor();
    const studio = app.getByRole("link", { name: "Ouvrir ma variante dans le Studio ↗", exact: true });
    assert.equal(await reachable(studio), true, "Studio action is shown after verified save");
    assert.deepEqual(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), prefix + name), mutated, "save contains exact DNA and authored physics apparatus");
    assert.equal(await page.evaluate((key) => localStorage.getItem(key), resumeKey), name);
    await draw(page);
    await page.screenshot({ path: path.join(artifacts, `dna-saved-${device}.png`) });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(await app.locator(".gx-dna-card").evaluate((element) => element.scrollWidth <= element.clientWidth), true);
    await studio.click();
    await page.locator(".gx-ed-toolbar").waitFor();
    assert.equal(await page.evaluate(() => window.__GRAPHYSX__.state().paused), true);
    assert.deepEqual(canonical(await documentOf(page)), canonical(mutated), "Studio opens every authored field of the saved document");
    if (device === "desktop") {
      const edited = await page.evaluate(() => {
        const result = window.__GRAPHYSX__.update("dna-variant", { transform: { position: [4.2, 0.25, -1.2] }, label: "Studio specimen" });
        if (!result.ok) throw new Error(result.error);
        return window.__GRAPHYSX__.exportDocument();
      });
      page.once("dialog", (dialog) => dialog.accept(name));
      await page.locator(".gx-ed-toolbar").getByRole("button", { name: "Save", exact: true }).click();
      await page.waitForFunction(({ key, value }) => localStorage.getItem(key) === value, { key: prefix + name, value: JSON.stringify(edited) });
      await page.locator(".gx-ed-exit").click();
      await page.getByRole("link", { name: "Reprendre l’ADN · " + name, exact: true }).click();
      await app.locator("[data-dna-notice]").getByText(/Variante reprise/).waitFor();
      assert.deepEqual(canonical(await documentOf(page)), canonical(edited), "resume retains Studio edits rather than rebuilding a template");
      assert.equal((await read(page)).canTune, false);
      assert.equal(await app.getByRole("radio", { name: /Plus haut/ }).isDisabled(), true);
      assert.equal(await app.locator("[data-dna-drop]").isDisabled(), true);
      await app.getByRole("button", { name: "← Accueil", exact: true }).click();
      await page.getByRole("link", { name: "Créer une variante ADN ↗", exact: true }).click();
      await app.getByRole("radio", { name: /Plus ouvert/ }).check();
      await app.getByRole("button", { name: "3 · Garder", exact: true }).click();
      await app.getByLabel("3 Garde ta variante").fill(name);
      await app.getByRole("button", { name: "Enregistrer", exact: true }).click();
      await app.locator("[data-dna-notice]").getByText(/Ce nom est déjà utilisé/).waitFor();
      assert.deepEqual(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), prefix + name), edited);
      await app.getByLabel("3 Garde ta variante").fill("Storage blocked");
      await page.evaluate(() => { window.__dnaSetItem = Storage.prototype.setItem; Storage.prototype.setItem = function () { throw new DOMException("Blocked", "QuotaExceededError"); }; });
      await app.getByRole("button", { name: "Enregistrer", exact: true }).click();
      await app.locator("[data-dna-notice]").getByText(/enregistrement est indisponible/).waitFor();
      assert.equal((await read(page)).dirty, true);
      assert.equal(await studio.isVisible(), false);
      await page.evaluate(() => { Storage.prototype.setItem = window.__dnaSetItem; delete window.__dnaSetItem; });
      await app.getByRole("button", { name: "Enregistrer", exact: true }).click();
      await studio.waitFor();
      const conflicted = await page.evaluate((key) => {
        const value = JSON.parse(localStorage.getItem(key)); value.label = "Other tab";
        const raw = JSON.stringify(value); localStorage.setItem(key, raw); return raw;
      }, prefix + "Storage blocked");
      await app.getByRole("button", { name: "1 · Muter", exact: true }).click();
      await app.getByRole("radio", { name: /Plus ramifié/ }).check();
      await app.getByRole("button", { name: "3 · Garder", exact: true }).click();
      await app.getByRole("button", { name: "Mettre à jour", exact: true }).click();
      await app.locator("[data-dna-notice]").getByText(/scène a changé dans un autre onglet/).waitFor();
      assert.equal(await page.evaluate((key) => localStorage.getItem(key), prefix + "Storage blocked"), conflicted);
    } else {
      await page.locator(".gx-ed-exit").click();
      await page.getByRole("link", { name: "Reprendre l’ADN · " + name, exact: true }).click();
      await app.locator("[data-dna-notice]").getByText(/Variante reprise/).waitFor();
      assert.deepEqual(canonical(await documentOf(page)), canonical(mutated));
      assert.equal((await read(page)).mutation, "height");
      assert.equal((await read(page)).paused, true);
    }
    assert.deepEqual(errors, [], device + " has no browser, shader or HTTP errors");
    receipts.push({ device, observed, errors });
    await context.close();
    console.log("PASS DNA " + device + ": real mutation, physics, pause/reset, save and Studio/resume.");
  }
  const recovery = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: "reduce" });
  await recovery.addInitScript(({ key, pointer }) => { localStorage.setItem(key, "{not-json"); localStorage.setItem(pointer, "Broken DNA"); }, { key: prefix + "Broken DNA", pointer: resumeKey });
  const page = applySmokeTimeout(await recovery.newPage());
  await page.goto(new URL("?app=dna&resume=1", base).href);
  await page.locator("[data-dna-notice]").getByText(/dernière variante est indisponible/).waitFor();
  assert.equal(await page.evaluate((key) => localStorage.getItem(key), prefix + "Broken DNA"), "{not-json", "malformed saved data remains untouched");
  assert.equal((await read(page)).canTune, true);
  await recovery.close();
  await writeFile(path.join(artifacts, "dna-receipt.json"), JSON.stringify(receipts, null, 2));
} finally { await browser.close(); }
