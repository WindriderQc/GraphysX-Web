import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { applySmokeTimeout, launchSmokeBrowser } from "./smoke-harness.mjs";

const base = new URL("?intro=0", process.env.SMOKE_BASE || "http://127.0.0.1:4188/");
const artifacts = process.env.SMOKE_ARTIFACTS || path.resolve("output/smoke");
await mkdir(artifacts, { recursive: true });
const browser = await launchSmokeBrowser();
try {
  for (const [name, viewport, touch] of [
    ["desktop", { width: 1280, height: 800 }, false],
    ["phone", { width: 390, height: 844 }, true],
  ]) {
    const context = await browser.newContext({ viewport, isMobile: touch, hasTouch: touch, deviceScaleFactor: 1 });
    const page = applySmokeTimeout(await context.newPage());
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(base.href, { waitUntil: "domcontentloaded" });
    const start = page.getByRole("link", { name: /Créer une scène/ });
    await start.waitFor();
    const firstAction = await start.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
      return box.y >= 0 && box.bottom <= innerHeight && element.contains(hit);
    });
    assert.equal(firstAction, true, name + " creation is reachable on arrival");
    await start.click();
    const atelier = page.locator(".gx-creation");
    await atelier.getByRole("heading", { name: "Jardin des lucioles" }).waitFor();
    const iris = atelier.getByRole("button", { name: "Iris", exact: true });
    await iris.click();
    assert.equal(await iris.getAttribute("aria-pressed"), "true");
    const readScene = () => page.evaluate(() => {
      const scene = window.__GRAPHYSX__.exportDocument();
      const byId = Object.fromEntries(scene.entities.map((entity) => [entity.id, entity]));
      return {
        id: scene.id,
        light: byId["garden-lantern-light"].material.color,
        lantern: byId["garden-lantern"].material.emissive,
        sparks: byId["garden-sparks"].emitter.color,
      };
    });
    const authored = await readScene();
    assert.deepEqual(authored, { id: "lantern-garden", light: "#b69cff", lantern: "#b39afa", sparks: "#b39afa" });
    const sceneName = name === "desktop" ? "Jardin d’Iris" : "Jardin tactile";
    await atelier.getByLabel(/Donne un nom/).fill(sceneName);
    await atelier.getByRole("button", { name: "Enregistrer", exact: true }).click();
    await atelier.getByRole("status").getByText(/Scène enregistrée/).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: path.join(artifacts, "creation-" + name + ".jpg"), type: "jpeg", quality: 84 });
    await atelier.getByRole("button", { name: /Centre GraphysX/ }).click();
    const resume = page.getByRole("link", { name: "Reprendre · " + sceneName });
    await resume.waitFor();
    await resume.click();
    await atelier.getByRole("status").getByText(/Scène reprise/).waitFor();
    assert.equal(await iris.getAttribute("aria-pressed"), "true");
    assert.equal(await atelier.getByLabel(/Donne un nom/).inputValue(), sceneName);
    assert.deepEqual(await readScene(), authored);

    if (name === "desktop") {
      await atelier.getByRole("link", { name: /Ouvrir dans l’éditeur/ }).click();
      await page.locator(".gx-ed-toolbar").waitFor();
      assert.deepEqual(await readScene(), authored);
      await page.locator(".gx-ed-exit").click();
      await resume.waitFor();
      await start.click();
      await atelier.getByRole("heading", { name: "Jardin des lucioles" }).waitFor();
      await atelier.getByLabel(/Donne un nom/).fill(sceneName);
      await atelier.getByRole("button", { name: "Enregistrer", exact: true }).click();
      await atelier.getByRole("status").getByText(/Ce nom est déjà utilisé/).waitFor();
      const savedColor = await page.evaluate((slot) => JSON.parse(localStorage.getItem("graphysx.agent-world.v2." + slot))
        .entities.find((entity) => entity.id === "garden-lantern").material.emissive, sceneName);
      assert.equal(savedColor, authored.lantern, "starting again cannot overwrite the previous creation");
    }
    assert.deepEqual(errors, []);
    await context.close();
    console.log("PASS first creation on " + name + ": visible entry, authored palette, named save and resume.");
  }
} finally {
  await browser.close();
}
