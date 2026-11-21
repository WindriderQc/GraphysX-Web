// Run under with-verify-lock.mjs: two isolated production builds and one Studio browser.
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile, access } from "node:fs/promises";
import path from "node:path";
import { build } from "vite";
import { startStaticServer } from "./static-server.mjs";
import { applySmokeTimeout, launchSmokeBrowser } from "./smoke-harness.mjs";
import { canonicalScene, sceneDocument } from "./studio-smoke-helpers.mjs";
import { prepareReleaseAssets } from "./prepare-release-assets.mjs";

const output = path.resolve(process.env.SMOKE_ARTIFACTS || "output/playwright/release-continuity");
await mkdir(output, { recursive: true });
const fixture = await mkdtemp(path.join(output, "versions-"));
const a = path.join(fixture, "a");
const b = path.join(fixture, "b");
const lazyModule = "src/personal-scenes-view.ts";
const buildRelease = (outDir, release) => build({
  build: { outDir, manifest: true },
  logLevel: "warn",
  plugins: [{
    name: "graphysx-release-continuity-probe",
    transform(source, id) {
      if (!id.replaceAll("\\", "/").endsWith("/" + lazyModule)) return null;
      return source + `\ndocument.documentElement.dataset.releaseProbe = ${JSON.stringify(release)};\n`;
    },
  }],
});
const lazyChunk = async root => {
  const manifest = JSON.parse(await readFile(path.join(root, ".vite/manifest.json"), "utf8"));
  assert.ok(manifest[lazyModule]?.file, "Vite emitted the real late-loaded library");
  return "/" + manifest[lazyModule].file;
};

let browser, server, page;
const errors = [];
try {
  await buildRelease(a, "A");
  await buildRelease(b, "B");
  const fromA = await lazyChunk(a);
  const fromB = await lazyChunk(b);
  assert.notEqual(fromA, fromB);
  await assert.rejects(access(path.join(b, fromA.slice(1))), { code: "ENOENT" });
  let active = a;
  const draftKeyPrefix = "graphysx.editor.draft.v2.";
  server = await startStaticServer({ port: 0, resolveRoot: async () => active });
  browser = await launchSmokeBrowser();
  const context = await browser.newContext({ viewport: { width: 1000, height: 700 }, reducedMotion: "reduce" });
  const requests = [];
  const openPage = async () => {
    const tab = applySmokeTimeout(await context.newPage());
    tab.on("request", request => requests.push(new URL(request.url()).pathname));
    tab.on("pageerror", error => errors.push(error.message));
    return tab;
  };
  page = await openPage();
  await page.goto(new URL("?host=editor&studio=simple&paused=1&intro=0", server.url).href);
  await page.locator(".gx-studio-simple:not([hidden])").waitFor();
  await page.getByLabel("Ajouter un objet", { exact: true }).selectOption("sphere");
  const draft = await page.waitForFunction(prefix => {
    for (const key of Object.keys(localStorage)) {
      if (!key.startsWith(prefix)) continue;
      const raw = localStorage.getItem(key);
      if (JSON.parse(raw).definition.entities.some(entity => entity.type === "sphere")) return { key, raw };
    }
    return null;
  }, draftKeyPrefix).then(handle => handle.jsonValue());
  const original = canonicalScene(await sceneDocument(page));
  assert.deepEqual(canonicalScene(JSON.parse(draft.raw).definition), original);
  assert.ok(!requests.includes(fromA), "the initial tab has never requested its library module");

  const preparation = await prepareReleaseAssets(b, a);
  assert.ok(preparation.retained.includes(fromA));
  active = b;
  let navigations = 0;
  page.on("framenavigated", frame => { if (frame === page.mainFrame()) navigations += 1; });
  const lateResponse = page.waitForResponse(response => new URL(response.url()).pathname === fromA);
  await page.click("[data-studio-action=my-scenes]");
  await page.getByRole("dialog", { name: "Mes créations", exact: true }).waitFor();
  const loaded = await lateResponse;
  assert.equal(loaded.status(), 200);
  assert.deepEqual(await loaded.body(), await readFile(path.join(a, fromA.slice(1))));
  assert.equal(await page.locator("html").getAttribute("data-release-probe"), "A");
  assert.equal(navigations, 0);
  assert.deepEqual(canonicalScene(await sceneDocument(page)), original);
  assert.equal(await page.evaluate(key => localStorage.getItem(key), draft.key), draft.raw);
  await page.screenshot({ path: path.join(output, "old-tab-after-deploy.png") });

  const fresh = await openPage();
  await fresh.goto(new URL("?intro=0", server.url).href);
  await fresh.click(".gx-go-personal");
  await fresh.getByRole("dialog", { name: "Mes créations", exact: true }).waitFor();
  assert.equal(await fresh.locator("html").getAttribute("data-release-probe"), "B");
  await fresh.click("[data-personal-tab=draft]");
  const card = fresh.locator("[data-personal-key=" + JSON.stringify(draft.key) + "]");
  await card.getByRole("button", { name: "Reprendre le brouillon", exact: true }).click();
  await fresh.waitForFunction(() => new URL(location.href).searchParams.has("localDraft"));
  await fresh.locator(".gx-studio-simple:not([hidden])").waitFor();
  assert.deepEqual(canonicalScene(await sceneDocument(fresh)), original);
  assert.deepEqual(errors, []);
  await writeFile(path.join(output, "release-continuity.json"), JSON.stringify({
    fromA, fromB, preparation, lateResponse: loaded.status(), navigations,
    draftUnchanged: true, draftRestoredInB: true, errors,
  }, null, 2));
  console.log("PASS release continuity: the stale tab loaded its original module and the new build reopened its exact draft.");
} finally {
  await browser?.close();
  await server?.close();
}
