import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { applySmokeTimeout, launchSmokeBrowser } from "./smoke-harness.mjs";
import { enterCompleteStudio, studioState, sceneDocument, canonicalScene, namedSave, selectStudioObject, drawStudio } from "./studio-smoke-helpers.mjs";

const base = process.env.SMOKE_BASE || "http://127.0.0.1:4210/";
const output = path.resolve(process.env.SMOKE_ARTIFACTS || "output/playwright/studio-simple");
await mkdir(output, { recursive: true });
const browser = await launchSmokeBrowser(), receipts = [];
let active;
const capture = async (page, name) => { await drawStudio(page); await page.screenshot({ path: path.join(output, "studio-simple-" + name + ".png") }); };
try {
  for (const [width, height] of [[1440, 960], [390, 844], [320, 640], [844, 390]]) {
    console.log("Studio viewport", width, height);
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: width < 760, isMobile: width < 760, reducedMotion: "reduce" });
    const page = applySmokeTimeout(await context.newPage()), errors = []; active = page;
    let phase = "arrival";
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") { errors.push(message.text()); console.error("Studio browser error", { width, phase, location: message.location(), message: message.text() }); } });
    try {
      await page.goto(new URL(width === 1440 ? "?intro=0" : "?host=editor&studio=simple&paused=1&intro=0", base).href);
      if (width === 1440) await page.click(".gx-go-editor");
      await page.locator(".gx-studio-simple:not([hidden])").waitFor();
      assert.equal((await studioState(page)).experience, "simple");
      assert.equal(await page.evaluate(() => window.__GRAPHYSX__.state().paused), true);
      await capture(page, "arrival-" + width);
      phase = "edit";
      await page.getByLabel("Ajouter un objet", { exact: true }).selectOption("box");
      const id = await page.evaluate(() => window.__GRAPHYSX__.state().selectedIds[0]);
      await selectStudioObject(page, id);
      await page.getByLabel("Nom de l’objet", { exact: true }).fill("Mon cube orange");
      // Commit on blur directly into a real button. That first click must survive.
      await page.getByRole("button", { name: "Tourner", exact: true }).click();
      assert.equal(await page.getByRole("button", { name: "Tourner", exact: true }).getAttribute("aria-pressed"), "true");
      await page.getByLabel("Position X", { exact: true }).fill("1.75");
      await page.getByLabel("Position X", { exact: true }).press("Tab");
      await page.locator("[data-studio-color]").evaluate(input => { input.value = "#ea923f"; input.dispatchEvent(new Event("input", { bubbles: true })); });
      await page.waitForFunction(id => { const entity = window.__GRAPHYSX__.query({ ids: [id] })[0]; return entity.label === "Mon cube orange" && entity.position[0] === 1.75 && entity.material.color === "#ea923f"; }, id);
      const edited = await sceneDocument(page);
      await page.getByRole("button", { name: "Cadrer l’objet", exact: true }).click();
      assert.deepEqual(await sceneDocument(page), edited, "Framing is presentation only");
      await drawStudio(page);
      const projected = await page.evaluate(id => {
        const host = window.__GRAPHYSX_HOST__, object = host.world.getEntityObject(id);
        const camera = host.camera, center = object.getWorldPosition(camera.position.clone()).project(camera);
        const x = (center.x + 1) * innerWidth / 2, y = (1 - center.y) * innerHeight / 2;
        const hit = document.elementFromPoint(x, y);
        return { x, y, visible: Boolean(hit?.closest("canvas")) };
      }, id);
      assert.equal(projected.visible, true, "Framed object is in the uncovered 3D viewport");
      await capture(page, "edited-" + width);
      phase = "history-and-simulation";
      await page.click("[data-studio-action=undo]");
      assert.notEqual((await page.evaluate(id => window.__GRAPHYSX__.query({ ids: [id] })[0], id)).material.color, "#ea923f");
      await page.click("[data-studio-action=redo]");
      assert.deepEqual(canonicalScene(await sceneDocument(page)), canonicalScene(edited));
      await page.click("[data-studio-action=play]"); assert.equal(await page.evaluate(() => window.__GRAPHYSX__.state().paused), false);
      await page.click("[data-studio-action=play]"); assert.equal(await page.evaluate(() => window.__GRAPHYSX__.state().paused), true);
      phase = "named-save";
      const name = "Mon monde " + width; await namedSave(page, name);
      const saved = await sceneDocument(page);
      phase = "library-reopen";
      await page.click("[data-studio-action=my-scenes]");
      await page.getByRole("dialog", { name: "Mes créations", exact: true }).waitFor();
      await capture(page, "library-" + width);
      await page.getByRole("button", { name: "Modifier dans le Studio", exact: true }).click();
      await page.waitForFunction(() => !document.querySelector(".gx-personal"));
      phase = "cold-reload";
      await page.reload(); await page.waitForFunction(name => JSON.parse(window.render_game_to_text?.() || "{}").studio?.savedName === name, name);
      assert.deepEqual(canonicalScene(await sceneDocument(page)), canonicalScene(saved));
      assert.equal((await studioState(page)).dirty, false);
      if (width === 1440) {
        phase = "shortcut-and-complete";
        await selectStudioObject(page, id);
        await page.getByLabel("Nom de l’objet", { exact: true }).focus();
        await page.keyboard.press("Control+s");
        await page.getByRole("dialog", { name: "Enregistrer ma scène", exact: true }).waitFor();
        await page.keyboard.press("Escape");
        await enterCompleteStudio(page);
        assert.deepEqual(canonicalScene(await sceneDocument(page)), canonicalScene(saved));
        assert.equal(await page.locator(".gx-ed-toolbar").getByRole("button", { name: "Save", exact: true }).isVisible(), true);
        await page.locator(".gx-ed-toolbar").getByRole("button", { name: "Mode simple", exact: true }).click();
        const downloadEvent = page.waitForEvent("download");
        await page.locator(".gx-studio-file summary").click(); await page.click("[data-studio-action=export]");
        const file = path.join(output, "studio-export.json"); await (await downloadEvent).saveAs(file);
        assert.deepEqual(canonicalScene(JSON.parse(await readFile(file, "utf8"))), canonicalScene(saved));
        phase = "file-import";
        const chooseFile = page.waitForEvent("filechooser"); await page.locator(".gx-studio-file summary").click(); await page.click("[data-studio-action=import]");
        await (await chooseFile).setFiles(file);
        await page.waitForFunction(() => document.querySelector(".gx-studio-status")?.textContent.includes("imported"));
        assert.deepEqual(canonicalScene(await sceneDocument(page)), canonicalScene(saved));
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.deepEqual(errors, []); receipts.push({ width, height, name, projected, errors });
    } catch (error) {
      console.error(error);
      await page.screenshot({ path: path.join(output, "studio-simple-failure-" + width + ".png") }).catch(() => {});
      throw error;
    } finally { await context.close(); }
  }
  // Actual native-model handoff: retain all source slots and unrelated authored data.
  const page = applySmokeTimeout(await browser.newPage({ viewport: { width: 1440, height: 960 }, reducedMotion: "reduce" })); active = page;
  await page.goto(new URL("?app=maison&intro=0", base).href);
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text?.() || "{}").application?.ready);
  await page.click("[data-maison-studio]"); await page.getByLabel("Pièce à colorer", { exact: true }).waitFor();
  assert.equal(await page.getByLabel("Pièce à colorer", { exact: true }).locator("option").count(), 24);
  const plane = await page.evaluate(() => window.__GRAPHYSX__.query({ ids: ["maison-source-model"] })[0].materialSlots.find(slot => slot.meshName === "Plane").id);
  await page.getByLabel("Pièce à colorer", { exact: true }).selectOption(plane);
  const before = await sceneDocument(page);
  const chosen = await page.getByLabel("Pièce à colorer", { exact: true }).inputValue();
  const slotsBefore = await page.evaluate(() => window.__GRAPHYSX__.query({ ids: ["maison-source-model"] })[0].materialSlots);
  assert.ok(slotsBefore.find(slot => slot.id === chosen).opacity > 0, "Start with a visible source material rather than a transparent archive slot");
  await page.locator("[data-studio-color]").evaluate(input => { input.value = "#cc6d56"; input.dispatchEvent(new Event("input", { bubbles: true })); });
  const after = await sceneDocument(page);
  const slotsAfter = await page.evaluate(() => window.__GRAPHYSX__.query({ ids: ["maison-source-model"] })[0].materialSlots);
  assert.equal(slotsAfter.find(slot => slot.id === chosen).color, "#cc6d56");
  assert.equal(slotsAfter.find(slot => slot.id === chosen).opacity, slotsBefore.find(slot => slot.id === chosen).opacity);
  assert.deepEqual(slotsAfter.filter(slot => slot.id !== chosen), slotsBefore.filter(slot => slot.id !== chosen));
  assert.equal(after.entities.length, before.entities.length);
  assert.deepEqual(after.entities.find(entity => entity.id === "cuisine-model"), before.entities.find(entity => entity.id === "cuisine-model"));
  assert.notDeepEqual(after.entities.find(entity => entity.id === "maison-source-model"), before.entities.find(entity => entity.id === "maison-source-model"));
  await page.getByRole("button", { name: "Cadrer l’objet", exact: true }).click();
  await namedSave(page, "Ma maison colorée"); await capture(page, "native-maison");
  receipts.push({ nativeSlots: 24, entities: after.entities.length });
  await page.close();
  await writeFile(path.join(output, "studio-simple.json"), JSON.stringify({ receipts, completedAt: new Date().toISOString() }, null, 2));
  console.log("PASS Simple Studio: human entry, transforms, first-click blur, framing, undo/redo, simulation, named save/open/reload, complete mode, JSON import/export and native Maison.");
} catch (error) { await active?.screenshot({ path: path.join(output, "studio-simple-failure.png") }).catch(() => {}); throw error; }
finally { await browser.close(); }
