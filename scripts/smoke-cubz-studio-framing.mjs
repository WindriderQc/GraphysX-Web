import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { applySmokeTimeout, launchSmokeBrowser } from "./smoke-harness.mjs";
import { canonicalScene, drawStudio, namedSave, sceneCard, sceneDocument, studioState } from "./studio-smoke-helpers.mjs";

const base = process.env.SMOKE_BASE || "http://127.0.0.1:4209/";
const artifacts = process.env.SMOKE_ARTIFACTS || path.resolve("output/playwright/cubz-studio-framing");
await mkdir(artifacts, { recursive: true });
const browser = await launchSmokeBrowser(), receipts = [];

async function settled(page) {
  await page.locator(".gx-studio-simple:not([hidden])").waitFor();
  await page.evaluate(async () => { await window.__GRAPHYSX_HOST__.editorReady(); });
  await page.waitForFunction(() => window.__GRAPHYSX__.state()?.entities.every(entity => entity.type !== "model" || entity.asset?.status !== "loading"));
  await drawStudio(page);
}

// Measure the rendered meshes independently of the framing helper. Environment
// decoration remains visible but must not make the saved subject a tiny speck.
async function composition(page) {
  return page.evaluate(() => {
    const host = window.__GRAPHYSX_HOST__, points = [], sourceMeshes = [];
    const sourceIds = new Set(window.__GRAPHYSX__.query({ tag: "cubz-source-mesh" }).map(entity => entity.id));
    host.world.group.updateWorldMatrix(true, true);
    host.world.group.traverseVisible(object => {
      const id = host.world.findEntityId(object);
      if (!id || !object.isMesh || !object.geometry) return;
      if (sourceIds.has(id)) sourceMeshes.push(id);
      object.geometry.computeBoundingBox(); const box = object.geometry.boundingBox;
      for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
        const point = object.localToWorld(object.position.clone().set(x, y, z)).project(host.camera);
        points.push([(point.x + 1) * innerWidth / 2, (1 - point.y) * innerHeight / 2, point.z]);
      }
    });
    const rect = selector => document.querySelector(selector).getBoundingClientRect();
    const root = rect(".gx-studio-simple"), mobile = document.querySelector(".gx-studio-mobile"), compact = mobile.getClientRects().length > 0;
    const region = {
      left: compact ? root.left + 12 : rect(".gx-studio-objects").right + 12,
      right: compact ? root.right - 12 : rect(".gx-studio-inspector").left - 12,
      top: Math.max(rect(".gx-studio-header").bottom, rect(".gx-studio-tools").bottom) + 12,
      bottom: compact ? mobile.getBoundingClientRect().top - 12 : root.bottom - 16,
    };
    const subject = { left: Math.min(...points.map(p => p[0])), right: Math.max(...points.map(p => p[0])), top: Math.min(...points.map(p => p[1])), bottom: Math.max(...points.map(p => p[1])) };
    return { subject, region, sourceMeshes: sourceMeshes.sort(), depth: [Math.min(...points.map(p => p[2])), Math.max(...points.map(p => p[2]))],
      widthRatio: (subject.right - subject.left) / (region.right - region.left), heightRatio: (subject.bottom - subject.top) / (region.bottom - region.top),
      camera: host.camera.position.toArray(), target: host.orbitTarget.toArray(), overflow: document.documentElement.scrollWidth > innerWidth };
  });
}

function assertFramed(result, label) {
  const { subject: b, region: r } = result;
  assert.ok(Object.values(b).every(Number.isFinite), `${label}: real subject geometry is rendered`);
  assert.ok(result.depth[0] > -1 && result.depth[1] < 1, `${label}: all geometry is in front of the camera and inside its clip planes`);
  assert.ok(b.left >= r.left && b.right <= r.right && b.top >= r.top && b.bottom <= r.bottom, `${label}: subject clears Studio controls: ${JSON.stringify(result)}`);
  assert.ok(Math.max(result.widthRatio, result.heightRatio) >= .3, `${label}: subject occupies at least 30% of a usable axis, rather than framing the decorative ground: ${JSON.stringify(result)}`);
  assert.equal(result.overflow, false, `${label}: no horizontal page overflow`);
}

async function reopen(page, name, saved, label) {
  const key = "graphysx.agent-world.v2." + name;
  const bytes = await page.evaluate(key => localStorage.getItem(key), key);
  await page.click("[data-studio-action=my-scenes]");
  await page.getByRole("dialog", { name: "Mes créations", exact: true }).waitFor();
  await sceneCard(page, name).getByRole("button", { name: "Modifier dans le Studio", exact: true }).click();
  await page.waitForFunction(() => !document.querySelector(".gx-personal"));
  await settled(page);
  const library = await composition(page); assertFramed(library, label + " library");
  assert.deepEqual(canonicalScene(await sceneDocument(page)), canonicalScene(saved), "library framing preserves the whole authored scene, including the ground");
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(name => JSON.parse(window.render_game_to_text?.() || "{}").studio?.savedName === name, name);
  await settled(page);
  const cold = await composition(page); assertFramed(cold, label + " cold");
  assert.deepEqual(canonicalScene(await sceneDocument(page)), canonicalScene(saved), "cold framing preserves the whole authored scene");
  assert.equal(await page.evaluate(key => localStorage.getItem(key), key), bytes, "opening never rewrites the original saved bytes");
  assert.equal((await studioState(page)).dirty, false);
  await page.screenshot({ path: path.join(artifacts, "cubz-studio-" + label + ".png") });
  return { library, cold, savedBytesPreserved: true, documentPreserved: true };
}

try {
  for (const viewport of [{ width: 1440, height: 960 }, { width: 390, height: 844 }, { width: 320, height: 740 }, { width: 844, height: 390 }]) {
    for (const pose of ["closed", "opening", "opened", ...(viewport.width === 1440 ? ["authored-floor"] : [])]) {
      // Each inline archive pose is several MB. Isolate cases so this camera
      // regression does not fill the browser quota with unrelated saved copies.
      const context = await browser.newContext({ viewport, reducedMotion: "reduce" });
      try {
        const page = applySmokeTimeout(await context.newPage()), errors = [];
        page.on("pageerror", error => errors.push(error.message));
        page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
        page.on("response", response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
        const sourcePose = pose === "authored-floor" ? "opened" : pose;
        await page.goto(new URL("?app=cubx&intro=0", base).href, { waitUntil: "domcontentloaded" });
        await page.locator('[data-cubz-choice="7"]').waitFor();
        await page.evaluate(pose => {
          if (pose !== "closed") document.querySelector('[data-cubz-choice="7"]').click();
          window.__GRAPHYSX__.pause(true);
          if (pose !== "closed") window.__GRAPHYSX__.step(pose === "opening" ? 1.6 : 3);
        }, sourcePose);
        await drawStudio(page);
        assert.equal(await page.evaluate(() => JSON.parse(window.render_game_to_text()).application.phase), sourcePose === "closed" ? "idle" : sourcePose);
        await page.click("[data-cubz-studio]"); await settled(page);
        // A user-authored floor is a subject, even with the environment's name.
        if (pose === "authored-floor") {
          const result = await page.evaluate(() => window.__GRAPHYSX__.spawn({ id: "AgentWorldGround", label: "My authored floor", type: "box", transform: { position: [28, .5, 0] }, geometry: { width: 30, height: .2, depth: 30 } }));
          assert.equal(result.ok, true);
        }
        const label = `${pose}-${viewport.width}x${viewport.height}`, name = "CubZ cadrage " + label;
        await namedSave(page, name); const saved = await sceneDocument(page);
        assert.equal(saved.environment.ground.visible, true); assert.equal(saved.environment.ground.size, 50);
        const result = await reopen(page, name, saved, label);
        assert.equal(result.cold.sourceMeshes.length, 44, "hidden source actors cannot enlarge the framing");
        assert.deepEqual(result.cold.sourceMeshes, result.library.sourceMeshes);
        receipts.push({ label, viewport, ...result });
        console.log("PASS saved CubZ framing: " + label);
        assert.deepEqual(errors, [], "no browser or HTTP errors");
      } finally { await context.close(); }
    }
  }
  await writeFile(path.join(artifacts, "cubz-studio-framing-result.json"), JSON.stringify({ base, receipts }, null, 2));
  console.log("PASS saved Studio: all three CubZ poses at four viewports, library and cold reopening, visible geometry size/margins, exact document and saved-byte custody, and authored-floor inclusion.");
} finally { await browser.close(); }
