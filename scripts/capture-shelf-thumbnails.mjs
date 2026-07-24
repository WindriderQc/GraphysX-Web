import { mkdirSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";

const OUTPUT = path.resolve("public/assets/shelf-thumbnails");
const PORT = Number(process.env.SHELF_THUMBNAIL_PORT || 4197);
const BASE = `http://127.0.0.1:${PORT}/?intro=0`;
const BROWSE_IDS = [
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
  await page.addStyleTag({ content: "#app > :not(canvas){display:none!important}" });
  await page.locator("#app canvas").first().screenshot({
    path: path.join(OUTPUT, `${id}.jpg`),
    type: "jpeg",
    quality: 84,
  });
  console.log(`captured ${id}`);
  await page.close();
}

try {
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
