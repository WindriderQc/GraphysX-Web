import { mkdirSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";

const OUTPUT = path.resolve("public/assets/shelf-thumbnails");
const PORT = Number(process.env.SHELF_THUMBNAIL_PORT || 4197);
const BASE = `http://127.0.0.1:${PORT}/?intro=0`;
const BROWSE_IDS = [
  "ev3-robotics-lab",
  "archive-maison",
  "archive-math-lab",
  "archive-voie-lactee",
  "archive-flock-planet",
  "archive-forces-garden",
  "archive-garage",
  "living-systems",
  "quarantine",
  "prefab-plaza",
  "glow-garden",
  "signal-outpost",
  "signal-trail",
  "physics-sketchbook",
];
const GAME_IDS = ["archive-great-slide", "archive-level1-2011", "archive-map1", "archive-skybox-spiral", "archive-world1"];
const requestedIds = new Set((process.env.SHELF_THUMBNAIL_IDS ?? "").split(",").map((id) => id.trim()).filter(Boolean));
const shouldCapture = (id) => requestedIds.size === 0 || requestedIds.has(id);

mkdirSync(OUTPUT, { recursive: true });
const server = await createServer({
  server: {
    host: "127.0.0.1",
    port: PORT,
    strictPort: true,
    // A development worktree may share the main checkout's dependency directory through a
    // junction. Vite resolves that real path before serving font files, so admit both roots.
    fs: { allow: [process.cwd(), path.resolve("../GraphysX-Web/node_modules")] },
  },
});
await server.listen();
const browser = await chromium.launch({ headless: true, args: ["--use-angle=swiftshader-webgl"] });

async function capture(id, shelf, selector) {
  const page = await browser.newPage({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 1 });
  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForFunction(() => Boolean(window.__GRAPHYSX_HOST__), null, { timeout: 60_000 });
  await page.click(`.gx-welcome .gx-go-${shelf}`);
  await page.waitForSelector(selector, { timeout: 60_000 });
  // Dispatch the click on the element rather than through pointer hit-testing: the shelves
  // have grown past the 360-pixel capture viewport, and a row inside the shelf's own scroll
  // container can be unreachable by Playwright's viewport check while being perfectly real.
  // Genuine clickability is the games/browse smokes' assertion, not this snapshot harness's.
  await page.$eval(selector, (element) => element.click());
  await page.waitForFunction(() => window.__GRAPHYSX__.query({}).length > 0, null, { timeout: 60_000 });
  // The Quarantine's whole subject is the infection spreading, and it does not begin until
  // the crowd's 3s conversion grace elapses — a 2.5s shot would be an all-pale crowd. Give it
  // long enough that several pursuers have converted and the green is visible.
  const settleMs = id === "quarantine" ? 7_000
    : id === "archive-world1" || id === "archive-map1" || id === "archive-level1-2011" || id === "archive-garage" ? 4_500
    : 2_500;
  await page.waitForTimeout(settleMs);
  // The editor is deliberately mounted over the same renderer after Browse opens a scene.
  // Capture the scene, not its authoring chrome: the renderer canvas is the one direct app
  // child we keep. This also strips the play HUD and win panel for course previews.
  await page.addStyleTag({ content: "#app > :not(canvas),.gx-display-settings{display:none!important}" });
  await page.locator("#app canvas").first().screenshot({
    path: path.join(OUTPUT, `${id}.jpg`),
    type: "jpeg",
    quality: 84,
  });
  console.log(`captured ${id}`);
  await page.close();
}

/**
 * Cyber Race 1992 is a separate page with its own renderer, so its preview is taken from that
 * page rather than the platform canvas: the film's green tunnel with Peter just ahead of Jobe,
 * HUD hidden. Everything on screen is the game's own procedural rendering.
 */
async function captureCyberRace() {
  const id = "cyber-race-1992";
  const page = await browser.newPage({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 1 });
  await page.goto(`http://127.0.0.1:${PORT}/cyber-race.html`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForFunction(() => Boolean(window.cyberRace), null, { timeout: 60_000 });
  await page.evaluate(() => {
    const c = window.cyberRace;
    Object.assign(c.settings, { plan: 0, course: 1, level: 1, mode: 1, crosshair: false, sound: false });
    c.start();
    c.pilots[0].autopilot = true;
    c.advance(9);
    // Frame Peter a few lengths ahead, slightly off-axis, both on the race line.
    const [jobe, peter] = c.pilots;
    Object.assign(peter, { s: jobe.s + 6, prevS: jobe.s + 6, ox: jobe.ox + 3, oy: jobe.oy + 1.6, vx: 0, vy: 0 });
    for (const p of c.pilots) p.hud.clearMessage();
    c.advance(0.05);
    c.freeze(true);
    c.advance(0.01);
  });
  await page.addStyleTag({ content: "#huds,#divider,#toast,#film{display:none!important}" });
  await page.waitForTimeout(800);
  await page.locator("#race-canvas").screenshot({ path: path.join(OUTPUT, `${id}.jpg`), type: "jpeg", quality: 84 });
  console.log(`captured ${id}`);
  await page.close();
}

try {
  if (shouldCapture("cyber-race-1992")) await captureCyberRace();
  for (const id of BROWSE_IDS) {
    if (!shouldCapture(id)) continue;
    const selector = id.startsWith("archive-") && id !== "archive-great-slide"
      ? `.gx-browse-row[data-scene-id="${id}"]`
      : `.gx-browse-row[data-starter-id="${id}"]`;
    await capture(id, "browse", selector);
  }
  for (const id of GAME_IDS) {
    if (!shouldCapture(id)) continue;
    await capture(id, "games", `.gx-shelf-row[data-course-id="${id}"]`);
  }
} finally {
  await browser.close();
  await server.close();
}
