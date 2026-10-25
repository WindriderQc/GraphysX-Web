// The built `<diskx-city>` module alone, the way an AgentX Core page uses it: one script from the
// page's own origin, Core's Data Toolbox routes answered on that origin (mocked here), nothing
// else on the network. Checks the ready and group receipts, GET-only reads and refusals.
import assert from "node:assert/strict";
import { mkdirSync, statSync } from "node:fs";
import path from "node:path";
import { applySmokeTimeout, launchSmokeBrowser } from "./smoke-harness.mjs";
import { startStaticServer } from "./static-server.mjs";

const output = "output/playwright/diskx-embed";
mkdirSync(output, { recursive: true });
const moduleBytes = statSync(path.resolve("dist/embed/diskx.js")).size;
// Core relays scripts with a size cap; the DiskX relay is sized for this module (see docs/DISKX_EMBED.md).
assert.ok(moduleBytes < 6 * 1024 * 1024, `diskx.js stays under 6 MiB, got ${moduleBytes}`);

const SHA = "c".repeat(64);
const server = await startStaticServer({ root: path.resolve("dist"), port: 0 });
const browser = await launchSmokeBrowser({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: "reduce" });
  applySmokeTimeout(page);
  const errors = [];
  const requests = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  const origin = new URL(server.url).origin;
  const host = (attributes) => `<!doctype html><meta charset="utf-8"><title>Core DiskX</title>
    <style>html,body{margin:0;height:100%;background:#03060c}diskx-city{position:fixed;inset:0}</style>
    <script>window.events=[];for(const t of ["diskx-ready","diskx-group-shown","diskx-error"])document.addEventListener(t,e=>window.events.push({type:t,detail:e.detail}));</script>
    <script type="module" src="/embed/diskx.js"></script>
    <diskx-city ${attributes}></diskx-city>`;
  const ok = (data) => ({ contentType: "application/json", body: JSON.stringify({ ok: true, status: "success", data }) });
  const handler = async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== origin) { requests.push(`EXTERNAL ${url.href}`); return route.abort(); }
    if (url.pathname.startsWith("/core/")) return route.fulfill({ contentType: "text/html", body: host(decodeURIComponent(url.pathname.slice(6))) });
    if (url.pathname.startsWith("/api/data-toolbox/")) {
      requests.push(`${request.method()} ${url.pathname}${url.search}`);
      const name = url.pathname.slice("/api/data-toolbox/".length);
      if (name === "storage/summary") return route.fulfill(ok({ totalFiles: 30, totalSize: 3000, lastScan: { finished_at: "2026-10-25T00:00:00Z" } }));
      if (name === "storage/tree") return route.fulfill(ok({ truncated: false, tree: [
        { path: "/data/a", fileCount: 10, totalSize: 1000 }, { path: "/data/b", fileCount: 10, totalSize: 1000 }, { path: "/data/c", fileCount: 10, totalSize: 1000 },
      ] }));
      if (name === "storage/files") return route.fulfill(ok({ files: [] }));
      if (name === "janitor/strategy/latest") return route.fulfill(ok({ generatedAt: "2026-10-25T00:00:00Z", status: "ready_for_review",
        summary: { verifiedGroups: 1, provenSavingsBytes: 100, candidateGroups: 0, candidateBytes: 0, filesToHash: 0, bytesToHash: 0, executableActions: 0 } }));
      if (name === "janitor/strategy/latest/groups") return route.fulfill(ok({
        report: { id: "r1", generatedAt: "2026-10-25T00:00:00Z", status: "ready_for_review" }, total: 1, offset: 0, limit: 20, nextOffset: null, scanBoundReached: false,
        groups: [{ sha256: SHA, proof: "sha256-current-metadata", size: 100, count: 2, provenSavingsBytes: 100, filesOmitted: 0, policySurvivorPath: "/data/a/x.bin", review: null,
          files: [{ path: "/data/a/x.bin" }, { path: "/data/c/x.bin" }] }] }));
      return route.fulfill({ status: 404, body: "{}" });
    }
    // A Core page serves this one module and its own routes, none of GraphysX's assets
    // (skies, textures, fonts): anything else the module asks for would be a 404 there.
    if (url.pathname === "/embed/diskx.js") return route.continue();
    requests.push(`UNEXPECTED ${request.method()} ${url.pathname}`);
    return route.fulfill({ status: 404, body: "" });
  };
  await page.route("**/*", handler);
  // Each refusal case opens its own page: navigating away from a live WebGL page is slow in CI.
  const refusal = async (attributes) => {
    const other = await browser.newPage({ viewport: { width: 800, height: 600 } });
    applySmokeTimeout(other);
    other.on("pageerror", (error) => errors.push(String(error)));
    await other.route("**/*", handler);
    await other.goto(`${origin}/core/${encodeURIComponent(attributes)}`);
    await other.waitForFunction(() => window.events?.some((e) => e.type === "diskx-error"));
    const stage = await other.evaluate(() => window.events.find((e) => e.type === "diskx-error").detail.stage);
    await other.getByRole("alert").waitFor();
    await other.close();
    return stage;
  };

  // 1. Core page asking for the latest report and one named group.
  await page.goto(`${origin}/core/${encodeURIComponent(`api-base="/api/data-toolbox" roots="/data" janitor="latest" group="${SHA}"`)}`);
  await page.waitForFunction(() => window.events?.some((e) => e.type === "diskx-group-shown"));
  const events = await page.evaluate(() => window.events);
  const ready = events.find((e) => e.type === "diskx-ready");
  assert.equal(ready.detail.source, "live");
  assert.deepEqual(ready.detail.roots, ["/data"]);
  const shown = events.find((e) => e.type === "diskx-group-shown");
  assert.deepEqual([shown.detail.sha256, shown.detail.places, shown.detail.links, shown.detail.outside], [SHA, 2, 1, 0]);
  const box = await page.evaluate(() => document.querySelector("diskx-city canvas").getBoundingClientRect().toJSON());
  assert.ok(box.width >= 1200 && box.height >= 760, `the host page's own CSS sizes the city: ${JSON.stringify(box)}`);
  await page.getByRole("heading", { name: /Vos disques/ }).waitFor();
  const state = await page.evaluate(() => document.querySelector("diskx-city").state());
  assert.equal(state.source, "live");
  assert.equal(state.janitor.group.keep, true);
  assert.equal(await page.locator('[data-action="exit"]').isHidden(), true, "no exit button inside a host page");
  assert.equal(await page.locator("[data-janitor-demo-link]").isHidden(), true, "no demo link inside a host page");
  assert.ok(!(await page.content()).includes("Démonstration synthétique"), "no synthetic city on a Core page");
  await page.screenshot({ path: `${output}/core-group.png` });
  if (process.env.DISKX_EMBED_DEBUG) console.log(JSON.stringify(await page.evaluate(() => {
    const el = document.querySelector("diskx-city"); const c = el.querySelector("canvas"); const hud = el.querySelector(".gx-diskx");
    return { el: el.getBoundingClientRect().toJSON(), canvas: c && { w: c.width, h: c.height, css: c.getBoundingClientRect().toJSON(), display: getComputedStyle(c).display }, hud: hud && { hidden: [...hud.children].filter(n => n.hidden).length, children: hud.children.length, display: getComputedStyle(hud).display, z: getComputedStyle(hud).zIndex }, mode: document.documentElement.dataset.gxMode, kids: [...el.firstElementChild.children].map(n => n.tagName + "." + n.className).slice(0, 10) };
  })));
  assert.ok(requests.every((line) => line.startsWith("GET /api/data-toolbox/")), `GET on Core routes only, no GraphysX asset: ${requests.join(" | ")}`);
  assert.ok(requests.includes(`GET /api/data-toolbox/janitor/strategy/latest/groups?sha256=${SHA}`), "the named group is read by its SHA-256");

  // 2. Bad attributes are refused with a visible message and an error receipt, not guessed.
  assert.equal(await refusal('roots="/data" group="not-a-hash"'), "attributes");
  assert.equal(await refusal('api-base="https://elsewhere.example/api" roots="/data"'), "attributes");
  assert.equal(await refusal('roots="relative/path"'), "attributes");
  await page.close();

  assert.deepEqual(errors, []);
  console.log(`diskx-embed: PASS (module ${(moduleBytes / 1024 / 1024).toFixed(2)} MiB, Core routes GET only, ready + group receipts, refusals)`);
} finally {
  await browser.close();
  await server.close();
}
