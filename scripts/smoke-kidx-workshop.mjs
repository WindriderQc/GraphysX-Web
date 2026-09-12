import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { applySmokeTimeout, launchSmokeBrowser } from "./smoke-harness.mjs";
import { startStaticServer } from "./static-server.mjs";
import { createKidxDocumentRoute } from "./kidx-document-server.mjs";

export async function runKidxWorkshop({ reader = true, modelIds = ["track3r", "spike3r"] } = {}) {
  const ART = process.env.SMOKE_ARTIFACTS || "output/verify";
  mkdirSync(ART, { recursive: true });
  const catalog = JSON.parse(readFileSync("src/kidx-document-catalog.json", "utf8"));
  const builds = modelIds.map((id) => JSON.parse(readFileSync(`src/kidx-${id}-build.json`, "utf8")));
  // A self-authored, two-page PDF exercises offline file input on CI without shipping LEGO PDFs.
  function fixturePdf() {
    const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 300] /Contents 5 0 R >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 300] /Contents 6 0 R >>"];
    for (const color of ["0 .3 .8", ".9 .6 0"]) {
      const content = `${color} rg 25 25 350 250 re f\n`;
      objects.push(`<< /Length ${content.length} >>\nstream\n${content}endstream`);
    }
    let pdf = "%PDF-1.4\n"; const offsets = [0];
    objects.forEach((object, index) => { offsets.push(pdf.length); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
    const xref = pdf.length;
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return Buffer.from(pdf);
  }
  let browser, server;
  const errors = [];
  try {
    if (!process.env.SMOKE_BASE) server = await startStaticServer({ root: path.resolve("dist"), port: Number(process.env.SMOKE_PORT || 4587), routeRequest: await createKidxDocumentRoute() });
    const base = (process.env.SMOKE_BASE ?? server.url).replace(/\/$/, "");
    browser = await launchSmokeBrowser();
    const page = applySmokeTimeout(await browser.newPage({ viewport: { width: 1440, height: 900 }, hasTouch: true }));
    page.on("pageerror", (error) => errors.push(String(error)));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    const state = () => page.evaluate(() => JSON.parse(window.render_game_to_text()).application);
    const capture = (name) => page.screenshot({ path: path.join(ART, `kidx-${name}.png`) });
    const home = async (tab) => {
      const current = (await state()).screen;
      if (current === "mission") await page.locator(".gx-ev3-exit").click();
      else if (current === "build") await page.locator("[data-build-back]").click();
      else if (current === "reader") await page.locator("[data-reader-back]").click();
      await page.locator(`[data-kidx-${tab}]`).click();
    };
    await page.goto(`${base}/?app=ev3-lab&view=atelier`, { waitUntil: "domcontentloaded" });
    await page.locator("[data-kidx-mission='first-drive']").waitFor();
    if (reader) {
      await home("library");
      assert.equal(await page.locator("[data-kidx-document]").count(), catalog.length);
      await page.getByLabel("Chercher une notice", { exact: true }).fill("track3r");
      assert.equal(await page.locator("[data-kidx-document]").count(), 1);
      await page.getByLabel("Chercher une notice", { exact: true }).fill("no-such-robot");
      assert.equal(await page.locator(".kx-empty").count(), 1);
      await page.getByLabel("Chercher une notice", { exact: true }).fill("");
      await page.getByLabel("Type de notice", { exact: true }).selectOption("program");
      assert.equal(await page.locator("[data-kidx-document]").count(), catalog.filter((item) => item.kind === "program").length);
      await capture("program-notices");
      await page.getByLabel("Type de notice", { exact: true }).selectOption("");
      await page.locator("[data-kidx-document='31313-x-track3r']").click();
      // Static-only hosting has no local PDF mount. The same visible file-picker path remains usable.
      await page.waitForFunction(() => document.querySelector(".kx-reader")?.dataset.page || document.querySelector(".kx-reader input[type=file]"));
      if (await page.locator(".kx-reader input[type=file]").count()) {
        await page.locator(".kx-reader input[type=file]").setInputFiles({ name: "31313_X_TRACK3R.pdf", mimeType: "application/pdf", buffer: fixturePdf() });
      }
      await page.waitForFunction(() => document.querySelector(".kx-reader")?.dataset.page === "1");
      await page.locator("[data-page-next]").click();
      await page.waitForFunction(() => document.querySelector(".kx-reader")?.dataset.page === "2");
      const firstCanvas = await page.locator(".kx-paper canvas").evaluate((canvas) => ({ width: canvas.width, height: canvas.height, data: canvas.toDataURL() }));
      await page.locator("[data-page-zoom]").click();
      await page.waitForFunction(() => document.querySelector(".kx-reader")?.dataset.page === "2");
      assert.ok(await page.locator(".kx-paper canvas").evaluate((canvas, width) => canvas.width > width, firstCanvas.width));
      await page.locator("[data-page-zoom]").click();
      const pages = (await state()).reader.pages;
      await page.locator("[data-page-number]").fill(String(pages));
      await page.locator("[data-page-number]").press("Tab");
      await page.waitForFunction((last) => document.querySelector(".kx-reader")?.dataset.page === String(last), pages);
      assert.equal(await page.locator("[data-page-next]").isDisabled(), true);
      await page.locator("[data-page-prev]").click();
      await page.locator("[data-page-next]").click();
      await page.waitForFunction((last) => document.querySelector(".kx-reader")?.dataset.page === String(last), pages);
      await page.locator("[data-page-number]").fill("2");
      await page.locator("[data-page-number]").press("Tab");
      await page.waitForFunction(() => document.querySelector(".kx-reader")?.dataset.page === "2");
      await capture("notice");
      await home("library");
      assert.match(await page.locator(".kx-card").filter({ has: page.locator("[data-kidx-document='31313-x-track3r']") }).innerText(), /Reprendre à la page 2/);
      console.log("  ok  catalog/search/program filters, PDF rendering, rapid page changes, zoom, bounds and persistent reading progress");
    }
    await home("builds");
    await capture("build-catalog");
    for (const build of builds) {
      console.log(`  running ${build.id} construction guide`);
      await page.locator(`[data-kidx-build='${build.id}']`).click();
      const loaded = () => page.waitForFunction(() => {
        const models = window.__GRAPHYSX__.state().entities.filter((item) => item.tags.includes("kidx-build"));
        return models.length && models.every((item) => item.asset?.status === "ready");
      });
      await loaded();
      await page.locator("[data-build-next]").click(); await loaded();
      assert.equal((await state()).build.step, 2);
      await page.locator("[data-build-prev]").click();
      assert.equal((await state()).build.step, 1);
      assert.equal(await page.evaluate(() => window.__GRAPHYSX__.query({ ids: ["kidx-assembly-1"] })[0].visible), false);
      await capture(`${build.id}-step-1`);
      await page.locator("[data-build-complete]").click(); await loaded();
      assert.equal((await state()).build.step, build.steps.length);
      await page.waitForFunction((last) => window.__GRAPHYSX__.query({ ids: [`kidx-assembly-${last - 1}`] })[0].materialSlots.every((slot) => slot.overridden), build.steps.length);
      const native = await page.evaluate(() => {
        const groups = window.__GRAPHYSX__.state().entities.filter((item) => item.tags.includes("kidx-build"));
        let indexed = 0, meshes = 0;
        for (const group of groups) window.__GRAPHYSX_HOST__.world.getEntityObject(group.id).traverse((object) => {
          if (object.isMesh) { meshes++; if (object.geometry.index && object.geometry.attributes.normal) indexed++; }
        });
        return { indexed, meshes, rejected: window.__GRAPHYSX__.events().events.filter((event) => event.type === "transaction.rejected") };
      });
      assert.ok(native.meshes > 10 && native.indexed === native.meshes, JSON.stringify(native));
      assert.equal(native.rejected.length, 0);
      await capture(`${build.id}-complete`);
      await page.locator("[data-build-explode]").click();
      assert.equal((await state()).build.exploded, true);
      await page.waitForFunction(() => window.__GRAPHYSX__.query({ ids: ["kidx-assembly-1"] })[0].position.some(value => value !== 0));
      const exploded = await page.evaluate(() => window.__GRAPHYSX__.query({ ids: ["kidx-assembly-1"] })[0].position);
      assert.ok(exploded.some((value) => value !== 0));
      await page.locator("[data-build-explode]").click();
      await page.waitForFunction(() => window.__GRAPHYSX__.query({ ids: ["kidx-assembly-1"] })[0].position.every(value => value === 0));
      assert.deepEqual(await page.evaluate(() => window.__GRAPHYSX__.query({ ids: ["kidx-assembly-1"] })[0].position), [0, 0, 0]);
      await page.locator("[data-build-rotate]").click();
      assert.equal((await state()).build.angle, 80);
      await page.locator("[data-build-zoom-in]").click();
      await page.locator("[data-build-zoom-out]").click();
      await page.locator("[data-build-number]").fill("3");
      await page.locator("[data-build-number]").press("Tab");
      await home("builds");
      await page.locator(`[data-kidx-build='${build.id}']`).click(); await loaded();
      assert.equal((await state()).build.step, 3);
      await page.locator("[data-build-pdf]").click();
      await page.locator("[data-reader-back]").waitFor();
      assert.equal(await page.evaluate(() => window.__GRAPHYSX__.state().entities.filter((item) => item.tags.includes("kidx-build")).length), 0);
      await page.locator("[data-reader-back]").click(); await loaded();
      assert.equal((await state()).build.step, 3);
      for (const [width, height] of [[800, 480], [390, 844]]) {
        await page.setViewportSize({ width, height });
        for (const selector of ["[data-build-next]", "[data-build-back]", "[data-build-rotate]", "[data-build-pdf]"]) {
          assert.equal(await page.locator(selector).evaluate((element) => {
            const rect = element.getBoundingClientRect();
            const clear = [[.15, .15], [.85, .85], [.5, .5]].every(([x, y]) => {
              const hit = document.elementFromPoint(rect.x + rect.width * x, rect.y + rect.height * y);
              return element === hit || element.contains(hit);
            });
            return rect.height >= 44 && rect.x >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight && clear;
          }), true, `${build.id} ${selector} at ${width}x${height}`);
        }
        await capture(`${build.id}-${width}`);
      }
      await page.setViewportSize({ width: 1440, height: 900 });
      await home("builds");
    }
    if (builds.length) console.log("  ok  selected native CAD guides: loading, source normals, steps, highlight, explode/reassemble, rotate/zoom, resume and responsive controls");
    if (reader) {
      // Malformed optional normals fail before the renderer consumes them.
      await page.evaluate(() => {
        const payload = { meshes: [{ positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 2], normals: [0, 1] }] };
        window.__GRAPHYSX__.spawn({ id: "bad-normals", type: "model", asset: { url: `data:application/json,${encodeURIComponent(JSON.stringify(payload))}` } });
      });
      await page.waitForFunction(() => window.__GRAPHYSX__.query({ ids: ["bad-normals"] })[0]?.asset?.status === "error");
      assert.match(await page.evaluate(() => window.__GRAPHYSX__.query({ ids: ["bad-normals"] })[0].asset.error), /invalid normals/);
    }
    assert.deepEqual(errors, []);
    console.log("KidX workshop smoke passed; no console or page errors.");
  } finally {
    if (browser) await browser.close();
    if (server) await server.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runKidxWorkshop();
}
