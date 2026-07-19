import { SMOKE_TIMEOUT, applySmokeTimeout, launchSmokeBrowser } from "./smoke-harness.mjs";
import { mkdirSync } from "node:fs";
import path from "node:path";

// The front door as a loop, not as a set of parts: showroom -> Games & Playgrounds -> a level
// you are actually playing -> back to the showroom.
//
// Every piece of this existed before and none of it was reachable. A playable level could only
// be got at by opening the editor, opening the Levels workbench and pressing Play, which made
// playing a side door off authoring — exactly the confusion the mode split was meant to end.
// So what is asserted here is reachability and return, not physics: physics is smoke-ballz's job.
//
// The return leg matters most. Playing REPLACES the world, so "back" cannot mean un-hiding
// chrome — the showroom's entities are gone and its host-mounted set went with them. If the
// recompose is wrong you land in a chrome-less view of the level you just finished, with no way
// onward, and nothing but this assertion would notice.

const BASE = process.env.SMOKE_BASE || "http://127.0.0.1:4188/";
const ART = process.env.SMOKE_ARTIFACTS || path.resolve("output/smoke");
mkdirSync(ART, { recursive: true });

const consoleErrors = [];
const pageErrors = [];
const browser = await launchSmokeBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
applySmokeTimeout(page);
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
page.on("pageerror", (e) => pageErrors.push(String(e)));

const shown = (selector) => page.evaluate((sel) => {
  const el = document.querySelector(sel);
  return !!el && getComputedStyle(el).display !== "none" && el.getBoundingClientRect().height > 0;
}, selector);

const out = {};
try {
  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: SMOKE_TIMEOUT });
  await page.waitForFunction(() => !!window.__GRAPHYSX_HOST__, { timeout: SMOKE_TIMEOUT });
  await page.waitForSelector(".gx-welcome", { timeout: SMOKE_TIMEOUT });

  // ---- the front door offers §5's three destinations ----
  out.frontDoor = {
    editorButton: (await page.$(".gx-welcome .gx-go-editor")) !== null,
    gamesButton: (await page.$(".gx-welcome .gx-go-games")) !== null,
    browseButton: (await page.$(".gx-welcome .gx-go-browse")) !== null,
    mode: await page.evaluate(() => window.__GRAPHYSX_HOST__.mode),
  };

  // ---- Games & Playgrounds ----
  await page.click(".gx-welcome .gx-go-games");
  await page.waitForSelector(".gx-shelf", { timeout: SMOKE_TIMEOUT });
  out.shelf = await page.evaluate(() => {
    const rows = [...document.querySelectorAll(".gx-shelf-row")];
    return {
      rowCount: rows.length,
      // The seeded course must be there on a first visit, or the shelf opens on the bare
      // fallback starter and reads as empty.
      hasFirstCourse: rows.some((row) => row.dataset.levelId === "first-course"),
      // A row should say what it contains before you commit to it.
      firstCourseMeta: rows.find((row) => row.dataset.levelId === "first-course")
        ?.querySelector(".gx-shelf-meta")?.textContent ?? null,
      welcomeGone: !document.querySelector(".gx-welcome"),
    };
  });
  await page.screenshot({ path: path.join(ART, "games-shelf.png"), fullPage: false });

  // ---- play it ----
  await page.click('.gx-shelf-row[data-level-id="first-course"]');
  await page.waitForTimeout(1400);
  out.playing = {
    mode: await page.evaluate(() => window.__GRAPHYSX_HOST__.mode),
    hudShown: await shown(".gx-bz-hud"),
    shelfGone: (await page.$(".gx-shelf")) === null,
    // No authoring chrome on a game surface.
    toolbarShown: await shown(".gx-ed-toolbar"),
    levelEntities: await page.evaluate(() => window.__GRAPHYSX__.query({ tag: "ballz" }).length),
    // The showroom's own entities must be gone: a course sitting inside the showroom's hills
    // would mean the world was added to rather than replaced.
    showroomEntities: await page.evaluate(() => window.__GRAPHYSX__.query({ tag: "showroom" }).length),
  };

  // Play frames the level rather than inheriting the showroom's off-axis overview: the orbit
  // pivot should be on the level centre (near the origin for a centred course), not the
  // showroom target of [-0.5, 3.4, -5], and the ease should have settled.
  out.framing = await page.evaluate(() => {
    const host = window.__GRAPHYSX_HOST__;
    const t = host.orbitTarget;
    return { targetX: t.x, targetY: t.y, targetZ: t.z, settled: !host.focusing };
  });
  out.framedOnLevel =
    out.framing.settled &&
    Math.abs(out.framing.targetX) < 3 &&
    Math.abs(out.framing.targetZ) < 3 &&
    Math.abs(out.framing.targetY - 3.4) > 0.5;

  // The level is playable, not just displayed. One real key event is enough here — the physics
  // of it is smoke-ballz's job.
  const before = await page.evaluate(() => window.__GRAPHYSX__.query({ ids: ["ballz-ball"] })[0]?.position ?? null);
  await page.keyboard.press("ArrowUp");
  await page.waitForTimeout(700);
  const after = await page.evaluate(() => window.__GRAPHYSX__.query({ ids: ["ballz-ball"] })[0]?.position ?? null);
  out.ballResponds = !!before && !!after && (before[0] !== after[0] || before[2] !== after[2]);
  await page.screenshot({ path: path.join(ART, "games-playing.png"), fullPage: false });

  // ---- and back out to the front door ----
  await page.click(".gx-bz-exit");
  await page.waitForTimeout(1200);
  out.returned = await page.evaluate(() => ({
    mode: window.__GRAPHYSX_HOST__.mode,
    welcomeBack: !!document.querySelector(".gx-welcome"),
    hudGone: !document.querySelector(".gx-bz-hud"),
    // The showroom is recomposed, not merely revealed.
    showroomEntities: window.__GRAPHYSX__.query({ tag: "showroom" }).length,
    levelEntities: window.__GRAPHYSX__.query({ tag: "ballz" }).length,
  }));
  await page.screenshot({ path: path.join(ART, "games-returned.png"), fullPage: false });

  // ---- Browse Scenes: the third destination, back at the front door ----
  // Loading a curated scene must open it in the EDITOR (Browse is "load a scene to work on it"),
  // not play mode — the distinction the mode split exists to preserve.
  await page.click(".gx-welcome .gx-go-browse");
  await page.waitForSelector(".gx-browse", { timeout: SMOKE_TIMEOUT });
  out.browse = await page.evaluate(() => {
    const rows = [...document.querySelectorAll(".gx-browse-row")];
    return {
      rowCount: rows.length,
      // Curated starters are the gallery; at least the physics sketchbook should be listed.
      hasPhysics: rows.some((r) => r.dataset.starterId === "physics-sketchbook"),
      // The Living Systems showcase — the graduated vocabulary in one scene.
      hasLiving: rows.some((r) => r.dataset.starterId === "living-systems"),
      firstMeta: rows[0]?.querySelector(".gx-browse-meta")?.textContent ?? "",
      welcomeGone: !document.querySelector(".gx-welcome"),
    };
  });
  await page.screenshot({ path: path.join(ART, "browse-scenes.png"), fullPage: false });

  await page.click('.gx-browse-row[data-starter-id="physics-sketchbook"]');
  await page.waitForTimeout(700);
  out.opened = await page.evaluate(() => {
    const host = window.__GRAPHYSX_HOST__;
    const shown = (sel) => {
      const el = document.querySelector(sel);
      return !!el && getComputedStyle(el).display !== "none" && el.getBoundingClientRect().height > 0;
    };
    return {
      mode: host.mode,
      // Loaded scene, not play, not the showroom.
      toolbarShown: shown(".gx-ed-toolbar"),
      browseGone: (document.querySelector(".gx-browse")) === null,
      hasSketchbookEntity: window.__GRAPHYSX__.query({ ids: ["ramp-ball"] }).length === 1,
      showroomEntities: window.__GRAPHYSX__.query({ tag: "showroom" }).length,
    };
  });
  await page.screenshot({ path: path.join(ART, "browse-opened.png"), fullPage: false });
} catch (e) {
  out.fatal = String(e);
}

out.consoleErrors = consoleErrors;
out.pageErrors = pageErrors;
console.log(JSON.stringify(out, null, 2));
await browser.close();

const ok =
  out.frontDoor?.editorButton === true &&
  out.frontDoor?.gamesButton === true &&
  out.frontDoor?.browseButton === true &&
  out.frontDoor?.mode === "scene" &&
  out.shelf?.rowCount > 0 &&
  out.shelf?.hasFirstCourse === true &&
  /ring/.test(out.shelf?.firstCourseMeta ?? "") &&
  out.shelf?.welcomeGone === true &&
  out.playing?.mode === "play" &&
  out.playing?.hudShown === true &&
  out.playing?.shelfGone === true &&
  out.playing?.toolbarShown === false &&
  out.playing?.levelEntities > 20 &&
  out.playing?.showroomEntities === 0 &&
  out.ballResponds === true &&
  out.framedOnLevel === true &&
  out.returned?.mode === "scene" &&
  out.returned?.welcomeBack === true &&
  out.returned?.hudGone === true &&
  out.returned?.showroomEntities > 0 &&
  out.returned?.levelEntities === 0 &&
  out.browse?.rowCount > 0 &&
  out.browse?.hasPhysics === true &&
  out.browse?.hasLiving === true &&
  /entities/.test(out.browse?.firstMeta ?? "") &&
  out.browse?.welcomeGone === true &&
  out.opened?.mode === "editor" &&
  out.opened?.toolbarShown === true &&
  out.opened?.browseGone === true &&
  out.opened?.hasSketchbookEntity === true &&
  out.opened?.showroomEntities === 0;

process.exit(out.fatal || pageErrors.length || consoleErrors.length || !ok ? 1 : 0);
