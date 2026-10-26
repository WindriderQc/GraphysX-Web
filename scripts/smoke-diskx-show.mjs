// The Janitor show: the animation list played over the city, on the synthetic demo (scene
// document compared before and after every scene) and inside a Core-like page with mocked GET
// routes (default list paused, a `play` list that tours groups, a live `play` change, a refused
// step, GET only and nothing asked of the page's own /assets).
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { applySmokeTimeout, launchSmokeBrowser } from "./smoke-harness.mjs";
import { startStaticServer } from "./static-server.mjs";

const output = "output/playwright/diskx-show";
mkdirSync(output, { recursive: true });
const app = () => typeof window.render_game_to_text === "function" ? JSON.parse(window.render_game_to_text()).application : null;
const server = await startStaticServer({ root: path.resolve("dist"), port: 0 });
const browser = await launchSmokeBrowser({ args: ["--no-sandbox", "--mute-audio", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const errors = [];
try {
  const origin = new URL(server.url).origin;

  // 1. Synthetic demo in the GraphysX app: every scene, the document never changes.
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
    applySmokeTimeout(page);
    page.on("pageerror", (error) => errors.push(String(error)));
    await page.route("**/*", (route) => (new URL(route.request().url()).origin !== origin ? route.abort() : route.continue()));
    await page.goto(`${server.url}?app=diskx&source=fixture&janitor=demo&play=duplicates,pairs,target,summary`);
    await page.waitForFunction(`(${app})()?.show?.coverage?.complete === true`);
    const before = await page.evaluate(() => JSON.stringify(window.__GRAPHYSX__.exportDocument()));
    await page.evaluate(() => document.querySelector('[data-show="toggle"]').textContent.includes("Pause") && document.querySelector('[data-show="toggle"]').click());
    for (const kind of ["duplicates", "pairs", "target", "summary"]) {
      await page.locator(".gx-show-steps button", { hasText: { duplicates: "Doublons seulement", pairs: "Copies reliées", target: "Vers la cible", summary: "Résumé" }[kind] }).click();
      await page.waitForFunction(`(${app})()?.show?.kind === ${JSON.stringify(kind)} && (${app})().show.layerVisible === true`);
      await page.evaluate(() => window.advanceTime?.(1500));
      assert.equal(await page.evaluate(() => JSON.stringify(window.__GRAPHYSX__.exportDocument())), before, `${kind} never edits the scene document`);
      await page.screenshot({ path: `${output}/demo-${kind}.png` });
    }
    const show = await page.evaluate(`(${app})().show`);
    assert.equal(show.coverage.groupsRead, 2);
    await page.getByRole("region", { name: "Résumé du rapport" }).waitFor();
    assert.match(await page.locator(".gx-show-summary").textContent(), /n’est pas une autorisation/);
    assert.match(await page.locator(".gx-show-summary").textContent(), /espace physique libéré n’est pas mesuré/);
    await page.close();
  }

  // 2. Core-like page with mocked routes.
  const ROOTS = ["/data", "/media"];
  const folders = ["/data/iso", "/data/backup", "/data/projects", "/media/films", "/media/music", "/media/photos"];
  const sha = (n) => n.toString(16).padStart(64, "0");
  // 70 groups, largest first like the report: two pages of 50 + 20.
  const GROUPS = Array.from({ length: 70 }, (_, index) => {
    const size = 1e9 - index * 1e7;
    const keep = `${folders[index % 3]}/f${index}.bin`;
    const extra = `${folders[3 + (index % 3)]}/f${index}.bin`;
    return { sha256: sha(index + 1), proof: "sha256-current-metadata", size, count: 2, provenSavingsBytes: size, filesOmitted: 0,
      policySurvivorPath: index % 10 === 9 ? null : keep, review: null, files: [{ path: keep }, { path: extra }] };
  });
  const SAVINGS = GROUPS.reduce((sum, group) => sum + group.size, 0);
  // Read by name only (outside the ledger pages): both copies in one folder below a root.
  const SAME_FOLDER = { sha256: sha(99), proof: "sha256-current-metadata", size: 5e8, count: 2, provenSavingsBytes: 5e8, filesOmitted: 0,
    policySurvivorPath: "/data/iso/a/same.bin", review: null, files: [{ path: "/data/iso/a/same.bin" }, { path: "/data/iso/b/same.bin" }] };
  const host = (attributes) => `<!doctype html><meta charset="utf-8"><title>Core DiskX</title>
    <style>html,body{margin:0;height:100%;background:#03060c}diskx-city{position:fixed;inset:0}</style>
    <script>window.events=[];for(const t of ["diskx-ready","diskx-report-read","diskx-group-shown","diskx-error","diskx-scene-changed","diskx-coverage","diskx-block-selected"])document.addEventListener(t,e=>window.events.push({type:t,detail:e.detail}));</script>
    <script type="module" src="/embed/diskx.js"></script>
    <diskx-city ${attributes}></diskx-city>`;
  const ok = (data) => ({ contentType: "application/json", body: JSON.stringify({ ok: true, status: "success", data }) });
  const requests = [];
  const handler = async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== origin) { requests.push(`EXTERNAL ${url.href}`); return route.abort(); }
    if (url.pathname.startsWith("/core/")) return route.fulfill({ contentType: "text/html", body: host(decodeURIComponent(url.pathname.slice(6))) });
    if (!url.pathname.startsWith("/api/data-toolbox/")) {
      if (url.pathname !== "/embed/diskx.js") requests.push(`OTHER ${request.method()} ${url.pathname}`);
      return route.continue();
    }
    requests.push(`${request.method()} ${url.pathname}${url.search}`);
    const name = url.pathname.slice("/api/data-toolbox/".length);
    if (name === "storage/summary") return route.fulfill(ok({ totalFiles: 600, totalSize: 6e11, lastScan: { finished_at: "2026-10-25T00:00:00Z" } }));
    if (name === "storage/tree") return route.fulfill(ok({ truncated: false, tree: folders.map((folder) => ({ path: folder, fileCount: 100, totalSize: 1e11 })) }));
    if (name === "storage/files") return route.fulfill(ok({ files: [] }));
    if (name === "janitor/strategy/latest") return route.fulfill(ok({ generatedAt: "2026-10-25T00:00:00Z", status: "ready_for_review",
      summary: { verifiedGroups: 70, provenSavingsBytes: SAVINGS, candidateGroups: 0, candidateBytes: 0, filesToHash: 0, bytesToHash: 0, executableActions: 0 } }));
    if (name === "janitor/strategy/latest/groups") {
      const report = { id: "r1", generatedAt: "2026-10-25T00:00:00Z", status: "ready_for_review" };
      const named = url.searchParams.get("sha256");
      if (named) return route.fulfill(ok({ report, total: 70, offset: 0, limit: 1, nextOffset: null, scanBoundReached: false, groups: [...GROUPS, SAME_FOLDER].filter((g) => g.sha256 === named) }));
      const offset = Number(url.searchParams.get("offset")), limit = Number(url.searchParams.get("limit"));
      const page = GROUPS.slice(offset, offset + limit);
      return route.fulfill(ok({ report, total: 70, offset, limit, nextOffset: offset + limit < 70 ? offset + limit : null, scanBoundReached: false, groups: page }));
    }
    return route.fulfill({ status: 404, body: "{}" });
  };
  const open = async (attributes, viewport = { width: 1440, height: 1000 }) => {
    const page = await browser.newPage({ viewport, reducedMotion: "reduce" });
    applySmokeTimeout(page);
    page.on("pageerror", (error) => errors.push(String(error)));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    await page.route("**/*", handler);
    await page.goto(`${origin}/core/${encodeURIComponent(attributes)}`);
    return page;
  };
  const events = (page, type) => page.evaluate((t) => window.events.filter((e) => e.type === t).map((e) => e.detail), type);
  const city = (page) => page.evaluate(() => document.querySelector("diskx-city").state());

  // 2a. janitor="latest" alone: the default list, paused on the overview; the ledger reads every page.
  {
    const page = await open(`roots="/data,/media" janitor="latest" actions-href="/data-toolbox"`);
    await page.waitForFunction(() => window.events.some((e) => e.type === "diskx-coverage"));
    const [coverage] = await events(page, "diskx-coverage");
    assert.deepEqual([coverage.groupsRead, coverage.groupsTotal, coverage.complete, coverage.bytesCovered], [70, 70, true, SAVINGS]);
    assert.ok(requests.includes("GET /api/data-toolbox/janitor/strategy/latest/groups?offset=50&limit=50"), "pages of 50");
    const first = (await events(page, "diskx-scene-changed"))[0];
    assert.deepEqual([first.kind, first.playing, first.count, first.script], ["overview", false, 5, "overview,duplicates,pairs,target,summary"]);
    assert.equal((await city(page)).show.mode, "world");
    assert.match(await page.locator(".gx-diskx-show").textContent(), /n’est pas une autorisation/);
    assert.equal(await page.locator("[data-show-actions]").getAttribute("href"), "/data-toolbox");
    await page.click('[data-show="next"]');
    await page.waitForFunction(() => document.querySelector("diskx-city").state().show.kind === "duplicates");
    await page.evaluate(() => document.querySelector("diskx-city").state() && null);
    const atAll = await city(page);
    assert.equal(atAll.show.layerVisible, true, "the show layer draws the city");
    assert.match(await page.locator("[data-show-caption]").textContent(), /copies en trop \(ambre\)/);
    // Dive into one disk through the list, then select a block with a real click on its roof.
    await page.locator('[data-list] button[data-path="/data"]').click();
    // Entering a live level also refreshes its observation. Read projected coordinates only
    // after that refresh and a rendered frame, so a rebuilt city cannot invalidate the click.
    await page.waitForFunction(() => {
      const state = document.querySelector("diskx-city").state();
      return state.focus.path === "/data" && !state.loading && !state.pendingDive && !state.show.loading
        && state.districts.some((d) => d.path === "/data/iso" && d.screen);
    });
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const clickState = await city(page);
    const target = clickState.districts.find((d) => d.path === "/data/iso");
    await page.mouse.click(target.screen[0], target.screen[1] + 6);
    try {
      await page.waitForFunction(() => window.events.some((e) => e.type === "diskx-block-selected"));
    } catch (error) {
      await page.screenshot({ path: `${output}/selection-failed.png` });
      writeFileSync(`${output}/selection-failed.json`, JSON.stringify({ clickState, after: await city(page),
        events: await page.evaluate(() => window.events) }, null, 2));
      throw error;
    }
    const [selectedBlock] = await events(page, "diskx-block-selected");
    assert.equal(selectedBlock.path, "/data/iso");
    assert.ok(selectedBlock.keepBytes > 0 && selectedBlock.groups > 0, JSON.stringify(selectedBlock));
    assert.equal((await city(page)).focus.path, "/data", "a click in the show selects, it does not dive");
    await page.getByRole("button", { name: "Soulever" }).click();
    assert.equal(await page.getByRole("button", { name: "Soulever" }).getAttribute("aria-pressed"), "true");
    await page.screenshot({ path: `${output}/core-selected.png` });
    for (const kind of ["pairs", "target", "summary"]) {
      await page.click('[data-show="next"]');
      await page.waitForFunction((k) => document.querySelector("diskx-city").state().show.kind === k, kind);
      await page.waitForTimeout(200);
      await page.screenshot({ path: `${output}/core-${kind}.png` });
    }
    assert.ok((await city(page)).show.pairs === 0, "pairs are drawn only in their scene");
    await page.click('[data-show="previous"]');
    await page.click('[data-show="previous"]');
    await page.waitForFunction(() => document.querySelector("diskx-city").state().show.kind === "pairs");
    assert.equal((await city(page)).show.pairs, 0, "inside /data every extra copy sits on the other disk: counted outside, no arc");
    assert.match(await page.locator("[data-show-caption]").textContent(), /hors de ce niveau/);
    await page.click('[data-action="up"]');
    await page.waitForFunction(() => document.querySelector("diskx-city").state().show.pairs > 0);
    await page.screenshot({ path: `${output}/core-pairs-all.png` });
    await page.getByRole("button", { name: "Tout remettre" }).click();
    await page.close();
  }

  // 2b. A play list from the host plays at once; a tour becomes group steps; `play` changes live.
  {
    const page = await open(`roots="/data,/media" janitor="latest" play="tour-2,pairs"`);
    await page.waitForFunction(() => window.events.some((e) => e.type === "diskx-group-shown"), null, { timeout: 30000 });
    const shown = (await events(page, "diskx-group-shown"))[0];
    assert.equal(shown.sha256, sha(1), "the tour starts with the largest group");
    const scenes = await events(page, "diskx-scene-changed");
    assert.equal(scenes[0].playing, true, "a given list plays at once");
    assert.ok(scenes.some((scene) => scene.kind === "group"), "the tour became group steps");
    // A group inside one folder dives into a live level whose refresh rebuilds the city and
    // re-anchors the group; the show keeps playing it to "after" (reduced motion: at once).
    await page.evaluate((g) => document.querySelector("diskx-city").setAttribute("play", `group-${g}`), SAME_FOLDER.sha256);
    await page.waitForFunction((g) => window.events.filter((e) => e.type === "diskx-group-shown" && e.detail.sha256 === g).length > 1
      && !document.querySelector("diskx-city").state().loading, SAME_FOLDER.sha256);
    assert.equal((await city(page)).janitor.preview.progress, 1, "a group the show opened plays after re-anchoring");
    await page.evaluate(() => document.querySelector("diskx-city").setAttribute("play", "target"));
    await page.waitForFunction(() => document.querySelector("diskx-city").state().show.kind === "target");
    await page.evaluate(() => document.querySelector("diskx-city").setAttribute("play", "delete-everything"));
    await page.waitForFunction(() => window.events.some((e) => e.type === "diskx-error" && e.detail.stage === "play"));
    assert.equal((await city(page)).show.kind, "target", "a refused list leaves the show as it was");
    await page.close();
  }

  // 2c. group="…" keeps opening that group; a bad play attribute is refused before mounting.
  {
    const page = await open(`roots="/data,/media" janitor="latest" group="${sha(3)}"`);
    await page.waitForFunction(() => window.events.some((e) => e.type === "diskx-group-shown"));
    assert.equal((await events(page, "diskx-group-shown"))[0].sha256, sha(3));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${output}/core-group-mobile.png` });
    await page.close();
    const refused = await open(`roots="/data" janitor="latest" play="move,delete"`);
    await refused.waitForFunction(() => window.events.some((e) => e.type === "diskx-error"));
    assert.equal((await events(refused, "diskx-error"))[0].stage, "attributes");
    await refused.close();
  }

  assert.ok(requests.every((line) => line.startsWith("GET /api/data-toolbox/")), `GET on Core routes only, nothing else asked of the page: ${requests.filter((line) => !line.startsWith("GET /api/")).join(" | ")}`);
  assert.deepEqual(errors, []);
  console.log("diskx-show: PASS (demo scenes leave the document unchanged; Core page: default list, ledger pages, scenes, selection, gestures, tour, live play, refusals, GET only)");
} finally {
  await browser.close();
  await server.close();
}
