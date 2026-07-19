import { chromium } from "playwright";
import { SMOKE_TIMEOUT, applySmokeTimeout } from "./smoke-timeout.mjs";
import { mkdirSync } from "node:fs";
import path from "node:path";

// Covers the BallZ level workbench end to end. The point of this surface is that a human
// and an agent author the same validated level, so every assertion here reads the result
// back out of `window.__GRAPHYSX__.levels` — the public API — rather than trusting the DOM:
// paint a cell, move a singleton gate, drag a rect fill, export ASCII, re-import it and
// prove the round trip is lossless, undo, create a level, and surface a bad import as an
// error in the UI instead of the console.

const EXE = process.env.SMOKE_CHROMIUM || undefined;
const BASE = process.env.SMOKE_BASE || "http://127.0.0.1:4188/";
const ART = process.env.SMOKE_ARTIFACTS || path.resolve("output/smoke");
mkdirSync(ART, { recursive: true });

const consoleErrors = [];
const pageErrors = [];
const browser = await chromium.launch({ executablePath: EXE, headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage();
applySmokeTimeout(page);
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
page.on("pageerror", (e) => pageErrors.push(String(e)));

const levelState = (id) => page.evaluate((levelId) => {
  const level = window.__GRAPHYSX__.levels.get(levelId);
  return level && { id: level.id, width: level.width, height: level.height, revision: level.revision, tiles: level.tiles };
}, id);
const tileAt = (level, x, y) => level.tiles[y * level.width + x];

const out = {};
try {
  await page.goto(BASE + "?host=standalone", { waitUntil: "domcontentloaded", timeout: SMOKE_TIMEOUT });
  await page.waitForFunction(() => !!window.__GRAPHYSX_HOST__, { timeout: SMOKE_TIMEOUT });
  await page.waitForSelector(".gx-ed-toolbar", { timeout: SMOKE_TIMEOUT });

  // The workbench is opened from the top bar and is closable — it must not be a fourth
  // permanent rail fighting the viewport.
  out.workbenchHiddenAtStart = await page.evaluate(() => {
    const panel = document.querySelector(".gx-ed-workbench");
    return !!panel && getComputedStyle(panel).display === "none";
  });
  await page.click('.gx-ed-toolbar button:has-text("Levels")');
  await page.waitForSelector(".gx-ed-workbench--open", { timeout: SMOKE_TIMEOUT });
  await page.waitForTimeout(250);

  // The editor shell's existing surfaces are untouched: still exactly three .gx-ed-panel.
  out.panelCount = await page.$$eval(".gx-ed-panel", (els) => els.length);
  out.swatchCount = await page.$$eval(".gx-lv-swatch", (els) => els.length);
  out.tileCount = await page.evaluate(() => window.__GRAPHYSX__.levels.tiles.length);
  out.cellCount = await page.$$eval(".gx-lv-cell", (els) => els.length);

  const activeId = await page.evaluate(() => window.__GRAPHYSX__.levels.active().id);
  out.activeId = activeId;
  const before = await levelState(activeId);
  out.gridMatchesLevel = out.cellCount === before.width * before.height;

  // ---- paint ----
  await page.click('.gx-lv-swatch:has-text("wall")');
  await page.click('.gx-lv-cell[data-x="3"][data-y="3"]');
  await page.waitForTimeout(200);
  const painted = await levelState(activeId);
  out.paintedTile = tileAt(painted, 3, 3);
  out.paintWasChange = tileAt(before, 3, 3) !== "wall";
  out.paintBumpedRevision = painted.revision > before.revision;

  // A singleton gate moves rather than duplicating — the API enforces it, the grid must
  // show it, so assert there is still exactly one `start` and it is where we clicked.
  await page.click('.gx-lv-swatch:has-text("start")');
  await page.click('.gx-lv-cell[data-x="2"][data-y="2"]');
  await page.waitForTimeout(200);
  const moved = await levelState(activeId);
  out.startAt = tileAt(moved, 2, 2);
  out.startCount = moved.tiles.filter((t) => t === "start").length;

  // ---- rect fill: drag from 5,5 to 7,7 ----
  await page.click('.gx-lv-tools .gx-ed-chip:text-is("Rect fill")');
  await page.click('.gx-lv-swatch:has-text("ice")');
  const box = async (x, y) => {
    const rect = await page.locator(`.gx-lv-cell[data-x="${x}"][data-y="${y}"]`).boundingBox();
    return [rect.x + rect.width / 2, rect.y + rect.height / 2];
  };
  const [sx, sy] = await box(5, 5);
  const [ex, ey] = await box(7, 7);
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move((sx + ex) / 2, (sy + ey) / 2, { steps: 4 });
  await page.mouse.move(ex, ey, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(250);
  const filled = await levelState(activeId);
  out.filledCells = [[5, 5], [6, 6], [7, 7], [5, 7], [7, 5]].map(([x, y]) => tileAt(filled, x, y));
  out.fillOk = out.filledCells.every((t) => t === "ice") && tileAt(filled, 8, 8) !== "ice";

  // ---- ASCII export → import round trip ----
  await page.click('.gx-lv-ascii .gx-ed-chip:text-is("Export")');
  await page.waitForTimeout(200);
  const exported = await page.inputValue(".gx-lv-text");
  out.asciiRows = exported.split("\n").length;
  out.asciiMatchesApi = await page.evaluate(([id, text]) => {
    const doc = window.__GRAPHYSX__.levels.exportAscii(id);
    return doc.ok && doc.value.rows.join("\n") === text;
  }, [activeId, exported]);

  await page.fill(".gx-lv-ascii input[type=text]", "smoke-roundtrip");
  await page.click('.gx-lv-ascii .gx-ed-chip:text-is("Import")');
  await page.waitForTimeout(300);
  const imported = await levelState("smoke-roundtrip");
  const source = await levelState(activeId);
  out.importCreated = !!imported;
  // The whole feature rests on this: same dimensions, same tiles, cell for cell.
  out.roundTripLossless = !!imported
    && imported.width === source.width
    && imported.height === source.height
    && imported.tiles.length === source.tiles.length
    && imported.tiles.every((tile, index) => tile === source.tiles[index]);
  // …and the workbench followed the import, so the grid on screen is the imported level.
  out.importSelected = await page.$$eval(".gx-lv-row--active .gx-lv-row-id", (els) => els.map((e) => e.textContent));

  // ---- undo (back on the source level) ----
  // Rows are labelled by label but carry the id in their tooltip, so select by id.
  await page.click(`.gx-lv-row[title^="${activeId} "]`);
  await page.waitForTimeout(250);
  out.reselected = await page.$eval(".gx-lv-row--active", (el) => el.getAttribute("title"));
  await page.click('.gx-lv-tools .gx-ed-chip:text-is("Paint")');
  await page.click('.gx-lv-swatch:has-text("hazard")');
  await page.click('.gx-lv-cell[data-x="4"][data-y="6"]');
  await page.waitForTimeout(200);
  const beforeUndo = await levelState(activeId);
  out.hazardPainted = tileAt(beforeUndo, 4, 6) === "hazard";
  await page.click('.gx-lv-tools .gx-ed-chip:text-is("Undo")');
  await page.waitForTimeout(250);
  const afterUndo = await levelState(activeId);
  out.undoRestoredTile = tileAt(afterUndo, 4, 6) === tileAt(source, 4, 6);
  out.undoKeptOtherEdits = tileAt(afterUndo, 3, 3) === "wall" && tileAt(afterUndo, 6, 6) === "ice";

  await page.screenshot({ path: path.join(ART, "levels-workbench.png"), fullPage: false });

  // ---- create a new level ----
  await page.fill(".gx-lv-side input[type=text]", "smoke-new-level");
  await page.fill(".gx-lv-form input[type=number] >> nth=0", "9");
  await page.fill(".gx-lv-form input[type=number] >> nth=1", "7");
  await page.click('.gx-lv-form .gx-ed-chip:text-is("+ New")');
  await page.waitForTimeout(300);
  const created = await levelState("smoke-new-level");
  out.createdDimensions = created && [created.width, created.height];
  out.createdAllFloor = !!created && created.tiles.every((t) => t === "floor");
  out.levelCount = await page.evaluate(() => window.__GRAPHYSX__.levels.list().length);
  out.gridFollowedCreate = await page.$$eval(".gx-lv-cell", (els) => els.length);

  // ---- resize, and prove a big grid stays usable (cells shrink, canvas scrolls) ----
  await page.fill(".gx-lv-tools input[type=number] >> nth=0", "44");
  await page.fill(".gx-lv-tools input[type=number] >> nth=1", "30");
  await page.click('.gx-lv-tools .gx-ed-chip:text-is("Apply")');
  await page.waitForTimeout(400);
  const resized = await levelState("smoke-new-level");
  out.resizedDimensions = resized && [resized.width, resized.height];
  out.resizedCells = await page.$$eval(".gx-lv-cell", (els) => els.length);
  out.bigGridFits = await page.evaluate(() => {
    const canvas = document.querySelector(".gx-lv-canvas");
    const grid = document.querySelector(".gx-lv-grid");
    return grid.scrollWidth <= canvas.clientWidth && grid.scrollHeight <= canvas.clientHeight;
  });
  await page.screenshot({ path: path.join(ART, "levels-large.png"), fullPage: false });

  // ---- a rejected op is reported in the UI, not just the console ----
  await page.fill(".gx-lv-text", "###\n#Q#\n###");
  await page.fill(".gx-lv-ascii input[type=text]", "smoke-bad-ascii");
  await page.click('.gx-lv-ascii .gx-ed-chip:text-is("Import")');
  await page.waitForTimeout(250);
  out.errorShown = await page.$$eval(".gx-lv-status--error", (els) => els.map((e) => e.textContent));
  out.badImportRejected = await page.evaluate(() => window.__GRAPHYSX__.levels.get("smoke-bad-ascii") === null);

  // ---- the workbench closes and hands the viewport back ----
  await page.click('.gx-ed-workbench .gx-ed-collapse');
  await page.waitForTimeout(300);
  out.closed = await page.evaluate(() => getComputedStyle(document.querySelector(".gx-ed-workbench")).display === "none");
  out.toolbarStillThere = (await page.$(".gx-ed-toolbar")) !== null;
  await page.screenshot({ path: path.join(ART, "levels-closed.png"), fullPage: false });

  // ---- Play: the human half of levels.play() ----
  // Deliberately LAST, so the assertions above exercise exactly the flow they always did — an
  // earlier placement reopened the panel mid-sequence and broke the close assertion.
  //
  // The agent path is covered by smoke-ballz.mjs. What is asserted here is that a *human*
  // control reaches the same API and produces the same scene: real entities, and the workbench
  // getting out of the way so the result is actually visible.
  await page.click('.gx-ed-toolbar button:text-is("Levels")');
  await page.waitForTimeout(300);
  out.playButtonExists = (await page.$(".gx-lv-play")) !== null;
  await page.click(".gx-lv-play");
  await page.waitForTimeout(500);
  out.played = await page.evaluate(() => {
    const ballz = window.__GRAPHYSX__.query({ tag: "ballz" });
    return {
      entities: ballz.length,
      // The active level here was resized to 44x30 and filled, so it has no start tile and
      // honestly spawns no ball. Asserting the floor proves materialisation without assuming
      // a layout this smoke never authored.
      hasFloor: ballz.some((entity) => entity.id === "ballz-floor"),
      workbenchClosed: getComputedStyle(document.querySelector(".gx-ed-workbench")).display === "none",
      // The inspector must agree with the world it is inspecting. A materialised level carries
      // a sky, so a dropdown still reading "No sky" over a visibly-skied viewport is a real
      // (if quiet) parity failure, and it regressed once already.
      skyDropdownAgrees:
        (document.querySelector(".gx-ed-panel select")?.value ?? null) ===
        (window.__GRAPHYSX__.state()?.environment?.sky ?? ""),
    };
  });
  await page.screenshot({ path: path.join(ART, "levels-played.png"), fullPage: false });
} catch (e) {
  out.fatal = String(e);
}

out.consoleErrors = consoleErrors;
out.pageErrors = pageErrors;
console.log(JSON.stringify(out, null, 2));
await browser.close();

const ok =
  out.workbenchHiddenAtStart &&
  out.panelCount === 3 &&
  out.swatchCount === out.tileCount &&
  out.gridMatchesLevel &&
  out.paintWasChange &&
  out.paintedTile === "wall" &&
  out.paintBumpedRevision &&
  out.startAt === "start" &&
  out.startCount === 1 &&
  out.fillOk &&
  out.asciiRows > 1 &&
  out.asciiMatchesApi &&
  out.importCreated &&
  out.roundTripLossless &&
  out.importSelected?.[0] === "smoke-roundtrip" &&
  out.reselected?.startsWith(out.activeId) &&
  out.hazardPainted &&
  out.undoRestoredTile &&
  out.undoKeptOtherEdits &&
  out.createdDimensions?.[0] === 9 &&
  out.createdDimensions?.[1] === 7 &&
  out.createdAllFloor &&
  out.gridFollowedCreate === 63 &&
  out.resizedDimensions?.[0] === 44 &&
  out.resizedDimensions?.[1] === 30 &&
  out.resizedCells === 44 * 30 &&
  out.bigGridFits &&
  out.errorShown?.length === 1 &&
  out.badImportRejected &&
  out.playButtonExists &&
  out.played?.entities > 0 &&
  out.played?.hasFloor &&
  out.played?.workbenchClosed &&
  out.played?.skyDropdownAgrees &&
  out.closed &&
  out.toolbarStillThere;
process.exit(out.fatal || pageErrors.length || !ok ? 1 : 0);

