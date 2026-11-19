import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { launchSmokeBrowser, applySmokeTimeout } from "./smoke-harness.mjs";

const base = process.env.SMOKE_BASE || "http://127.0.0.1:4210/";
const output = path.resolve(process.env.SMOKE_ARTIFACTS || "output/playwright/ux-navigation");
await mkdir(output, { recursive: true });
const browser = await launchSmokeBrowser(), receipts = [];
let activePage, activeErrors;
const capture = (page, name) => page.screenshot({ path: path.join(output, "ux-navigation-" + name + ".png") });
const focus = (page, selector) => page.waitForFunction(selector => document.activeElement?.matches(selector), selector);
const preferences = page => page.evaluate(() => JSON.parse(localStorage.getItem("graphysx.shelf.preferences.v1")));
const trap = async page => {
  const controls = page.locator('.gx-browse button:visible:not(:disabled),.gx-browse input:visible:not(:disabled)');
  await controls.last().focus(); await page.keyboard.press("Tab"); assert.equal(await controls.first().evaluate(element => element === document.activeElement), true);
  await page.keyboard.press("Shift+Tab"); assert.equal(await controls.last().evaluate(element => element === document.activeElement), true);
};
const scopedCount = async page => {
  const values = await page.evaluate(() => {
    const id = document.querySelector('.gx-browse [data-collection][aria-pressed=true]').dataset.collection;
    const all = [...document.querySelectorAll('.gx-browse [data-shelf-key]')];
    return { id, total: all.filter(row => id === "all" || row.dataset.shelfCollection === id).length,
      visible: all.filter(row => row.getClientRects().length).length, text: document.querySelector('.gx-browse .gx-shelf-count').textContent };
  });
  assert.equal(values.text, `${values.visible} sur ${values.total} scènes`); return values;
};
try {
  for (const width of [1440, 390, 320]) {
    const context = await browser.newContext({ viewport: { width, height: width === 320 ? 640 : 900 }, reducedMotion: "reduce" });
    await context.addInitScript(() => {
      const key = "graphysx.shelf.preferences.v1";
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ favorites: ["browse:glow-garden"], recent: { "browse:glow-garden": 1234 } }));
    });
    const page = applySmokeTimeout(await context.newPage()), errors = [];
    activePage = page; activeErrors = errors;
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    page.on("response", response => { if (response.status() >= 400) errors.push(response.status() + " " + response.url()); });
    page.on("requestfailed", request => { if (request.failure()?.errorText !== "net::ERR_ABORTED") errors.push(request.failure()?.errorText + " " + request.url()); });
    await page.goto(new URL("?intro=0", base).href); await page.locator(".gx-welcome--center").waitFor();
    await capture(page, "home-" + width);
    await page.locator(".gx-center-apps > summary").click();
    assert.deepEqual(await page.locator(".gx-center-apps-list h3").allTextContents(), ["Créer et apprendre", "Explorer en 3D", "Données AgentX"]);
    assert.equal(await page.locator(".gx-go-quest3").getAttribute("href"), new URL("?app=quest3", base).pathname + "?app=quest3");
    assert.match(await page.locator(".gx-go-quest3").textContent(), /écran ou en VR/);
    const links = page.locator(".gx-center-apps-list a,.gx-center-apps-list button"); assert.equal(await links.count(), 10);
    for (const item of await links.all()) {
      await item.scrollIntoViewIfNeeded(); const box = await item.boundingBox(); assert.ok(box.height >= 44 && box.width >= 44);
      assert.equal(await item.evaluate(element => { const r = element.getBoundingClientRect(); return element.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); }), true);
    }
    await page.locator(".gx-center-apps-list").evaluate(element => { element.scrollTop = 0; });
    await capture(page, "workshops-" + width); await page.keyboard.press("Escape"); await focus(page, ".gx-center-apps > summary");
    await page.click(".gx-go-browse"); await page.locator(".gx-browse").waitFor(); await focus(page, ".gx-shelf-search");
    assert.equal(await page.locator(".gx-display-settings").isVisible(), false, "An outside setting must not cover the modal catalogue");
    if (width === 320) assert.ok((await page.locator(".gx-browse-list").boundingBox()).height >= 220, "Small screens retain enough space to inspect an actual scene card");
    await trap(page); await scopedCount(page);
    const nacre = page.locator('[data-scene-id="nacre-quest3"]'); assert.equal(await nacre.count(), 1);
    assert.equal(await nacre.evaluate(element => element.classList.contains("gx-browse-row--featured")), true);
    const image = nacre.locator("img"); await image.waitFor(); await image.evaluate(element => element.decode());
    assert.match(await image.getAttribute("src"), /nacre-quest3\.jpg$/); assert.equal(await image.evaluate(element => element.naturalWidth), 640);
    assert.match(await nacre.locator(".gx-browse-action").textContent(), /Explorer la station/);
    const before = await preferences(page);
    await page.fill(".gx-shelf-search", "no-such-graphysx-scene"); await scopedCount(page);
    await page.locator(".gx-shelf-clear-search").click(); await focus(page, ".gx-shelf-search");
    assert.deepEqual(await preferences(page), before, "Clearing a failed search retains favorites and recents");
    assert.equal(await page.locator('.gx-browse [data-collection=creations][aria-pressed=true]').count(), 1);
    const item = page.locator('.gx-shelf-item:has(> [data-scene-id="nacre-quest3"])');
    await item.locator(".gx-shelf-favorite").click(); assert.ok((await preferences(page)).favorites.includes("browse:nacre-quest3"));
    if (width < 640) { const box = await item.locator(".gx-shelf-favorite").boundingBox(); assert.ok(box.width >= 44 && box.height >= 44); }
    await page.click('[data-collection=archive]'); const archive = await scopedCount(page);
    assert.match(await page.locator('[data-scene-id=archive-maison] .gx-browse-action').textContent(), /Visiter les deux scènes/);
    assert.match(await page.locator('[data-scene-id=archive-impreza-worlds] .gx-browse-action').textContent(), /Prendre le volant/);
    await page.click('[data-collection=lab]'); const lab = await scopedCount(page);
    assert.equal(await page.locator('[data-scene-id=archive-cubz-tracks]').isVisible(), true);
    await page.click('[data-collection=creations]'); await capture(page, "creations-" + width);
    await page.keyboard.press("Escape"); await focus(page, ".gx-go-browse");
    await page.click(".gx-go-archive"); await page.locator(".gx-browse").waitFor(); await scopedCount(page); await capture(page, "archives-" + width);
    await page.keyboard.press("Escape"); await focus(page, ".gx-go-archive");
    await page.click(".gx-go-games"); await page.locator(".gx-shelf-search").waitFor(); await capture(page, "games-" + width);
    await page.keyboard.press("Escape"); await focus(page, ".gx-go-games");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
    assert.deepEqual(errors, []); receipts.push({ width, focusReturned: ["creations", "archives", "games"], trap: true, groups: 3, archive, lab, searchPreservesPreferences: true, realNacrePreview: true, errors });
    await context.close(); console.log("PASS UX navigation: " + width + "px, collections, preferences, keyboard, entry actions, real thumbnail and workshop targets.");
  }
  await writeFile(path.join(output, "ux-navigation-receipt.json"), JSON.stringify(receipts, null, 2));
} catch (error) {
  if (activePage && !activePage.isClosed()) {
    await capture(activePage, "failure"); await writeFile(path.join(output, "ux-navigation-failure.json"), JSON.stringify({ error: String(error), errors: activeErrors,
      focus: await activePage.evaluate(() => document.activeElement?.outerHTML), url: activePage.url() }, null, 2));
  }
  throw error;
} finally { await browser.close(); }
