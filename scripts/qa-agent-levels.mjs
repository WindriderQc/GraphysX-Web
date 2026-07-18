import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const url = process.env.GRAPHYSX_URL ?? "http://127.0.0.1:4177/";
const outputDir = path.resolve("output/playwright/agent-level-api-v1");
fs.mkdirSync(outputDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader"]
});
const context = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
const page = await context.newPage();
const errors = [];
page.on("console", (message) => {
  if (message.type() === "error") errors.push({ type: "console", text: message.text() });
});
page.on("pageerror", (error) => errors.push({ type: "page", text: String(error) }));

const assertions = [];
const states = {};
const assert = (condition, message) => {
  assertions.push({ pass: Boolean(condition), message });
  if (!condition) throw new Error(message);
};
const levels = (method, ...args) => page.evaluate(
  ({ method, args }) => window.__GRAPHYSX__.levels[method](...args),
  { method, args }
);
const levelAt = (id) => levels("get", id);
const textState = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const screenshot = (name) => page.screenshot({ path: path.join(outputDir, `${name}.png`), fullPage: true });

try {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__GRAPHYSX__?.levels && window.render_game_to_text);

  const contract = await page.evaluate(() => ({
    rootLevelSchema: window.__GRAPHYSX__.levelSchema,
    schema: window.__GRAPHYSX__.levels.schema,
    version: window.__GRAPHYSX__.levels.version,
    capabilities: window.__GRAPHYSX__.levels.capabilities,
    tiles: window.__GRAPHYSX__.levels.tiles,
    tileSemantics: window.__GRAPHYSX__.levels.tileSemantics,
    rootCapabilities: window.__GRAPHYSX__.capabilities
  }));
  assert(
    contract.rootLevelSchema === "graphysx.agent-level/v1" && contract.schema === "graphysx.agent-level-api/v1" && contract.version === "1.0",
    "Public GraphysX API identifies the canonical level schema and nested v1 level surface"
  );
  assert(
    contract.capabilities.includes("level.query-region") && contract.capabilities.includes("level.ascii.export") && contract.rootCapabilities.includes("level.play"),
    "Root and nested capability discovery advertise efficient level authoring"
  );
  assert(
    contract.tiles.includes("fire") && contract.tiles.includes("ice") && contract.tileSemantics.fire.includes("Repulsive") && contract.tileSemantics.ice.includes("momentum"),
    "Agents can discover the complete level tile vocabulary and force semantics from the API itself"
  );

  const initial = await levels("list");
  const funnySummary = initial.find((level) => level.id === "funny-zigzagger");
  assert(initial.length === 2 && initial[0].id === "starter-map" && initial[0].width === 11 && initial[0].height === 11, "Existing human editor draft migrates beside the built-in agent showcase");
  assert(funnySummary?.label === "The Funny Zigzagger" && funnySummary.width === 23 && funnySummary.height === 19, "The Funny Zigzagger ships as a normal named 23×19 level document");
  assert(funnySummary?.counts.fire === 9 && funnySummary.counts.ice === 8 && funnySummary.counts.ring === 17, "The showcase exposes its opposing forces and checkpoint route as semantic tile counts");

  const funnyAscii = await levels("exportAscii", "funny-zigzagger");
  assert(funnyAscii.ok && funnyAscii.value.rows.some((row) => row.includes("^")) && funnyAscii.value.rows.some((row) => row.includes("~")), "Fire and ice round-trip through the optional ASCII adapter as ^ and ~");

  const funnyPlayed = await levels("play", "funny-zigzagger");
  assert(funnyPlayed.ok, "An agent launches The Funny Zigzagger through the same level play API");
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === "gameplay");
  const fireEntered = await page.evaluate(() => window.__GRAPHYSX_DEBUG__.setPlayerState([-6.6, 0.93, 17.6]));
  assert(fireEntered.forceZone?.kind === "fire" && fireEntered.forceZonesTotal === 17, "Runtime telemetry identifies the active authored fire force");
  await page.evaluate(() => window.advanceTime(120));
  const fireMoved = await page.evaluate(() => window.__GRAPHYSX_DEBUG__.snapshot());
  assert(fireMoved.playerVelocity.y > 0.5, "Fire physically launches the BallZ actor rather than acting as decoration");

  const iceEntered = await page.evaluate(() => window.__GRAPHYSX_DEBUG__.setPlayerState([9.3, 0.93, -15.4]));
  assert(iceEntered.forceZone?.kind === "ice", "Runtime telemetry identifies the active authored ice force");
  await page.evaluate(() => window.advanceTime(120));
  const iceMoved = await page.evaluate(() => window.__GRAPHYSX_DEBUG__.snapshot());
  assert(iceMoved.playerVelocity.x < -0.1, "Ice physically pulls the BallZ actor toward its center while bypassing ordinary ground grip");
  await page.evaluate(() => window.__GRAPHYSX_DEBUG__.setRaceCamera(0.35, 0.78, 20));
  states.zigzagger = await textState();
  await screenshot("00-funny-zigzagger-forces");

  const created = await levels("create", { id: "moon-base", label: "Moon Base", width: 24, height: 18, cellSize: 2.8 });
  assert(created.ok && created.revision === 0 && created.value.tiles.length === 432, "Agent creates a named 24×18 level without an ASCII-size assumption");
  assert((await levels("list")).length === 3, "Level library retains multiple independently named drafts");

  const built = await levels("transaction", "moon-base", [
    { op: "fill", rect: { x: 0, y: 0, width: 24, height: 1 }, tile: "wall" },
    { op: "fill", rect: { x: 0, y: 17, width: 24, height: 1 }, tile: "wall" },
    { op: "fill", rect: { x: 0, y: 1, width: 1, height: 16 }, tile: "wall" },
    { op: "fill", rect: { x: 23, y: 1, width: 1, height: 16 }, tile: "wall" },
    { op: "patch", changes: [
      { x: 12, y: 16, tile: "start" },
      { x: 12, y: 2, tile: "half" },
      { x: 12, y: 17, tile: "finish" },
      { x: 7, y: 9, tile: "ring" },
      { x: 12, y: 9, tile: "ring" },
      { x: 17, y: 9, tile: "ring" },
      { x: 11, y: 8, tile: "hazard" }
    ] }
  ], { expectedRevision: 0 });
  assert(built.ok && built.revision === 1, "One atomic transaction composes borders, gates, pickups, and hazards into a single revision");
  const builtSummary = (await levels("list")).find((level) => level.id === "moon-base");
  assert(builtSummary.counts.wall === 79 && builtSummary.counts.ring === 3 && builtSummary.counts.start === 1 && builtSummary.counts.finish === 1, "Semantic counts describe the composed level without parsing ASCII");

  const region = await levels("region", "moon-base", { x: 9, y: 7, width: 7, height: 5 });
  assert(region.ok && region.value.rows.length === 5 && region.value.rows[0].length === 7 && region.value.revision === 1, "Agent observes only a requested map region with its source revision");
  assert(region.value.rows[1][2] === "hazard" && region.value.rows[2][3] === "ring", "Region query preserves semantic tile identities and coordinates");

  const exported = await levels("exportAscii", "moon-base");
  assert(exported.ok && exported.value.schema === "graphysx.agent-level-ascii/v1" && exported.value.rows.length === 18 && exported.value.rows.every((row) => row.length === 24), "ASCII export is a compact, exact adapter over the larger canonical level");
  assert(exported.value.rows[16][12] === "S" && exported.value.rows[17][12] === "F", "ASCII adapter retains singleton start and finish semantics");

  const beforeRejected = await levelAt("moon-base");
  const rejected = await levels("transaction", "moon-base", [
    { op: "patch", changes: [{ x: 5, y: 5, tile: "ring" }] },
    { op: "patch", changes: [{ x: 200, y: 5, tile: "wall" }] }
  ]);
  const afterRejected = await levelAt("moon-base");
  assert(!rejected.ok && rejected.error.includes("outside level") && afterRejected.revision === beforeRejected.revision && afterRejected.tiles[5 * 24 + 5] === "floor", "Invalid multi-operation edits roll back atomically");
  const conflict = await levels("patch", "moon-base", [{ x: 5, y: 5, tile: "ring" }], { expectedRevision: 0 });
  assert(!conflict.ok && conflict.error.includes("Revision conflict") && (await levelAt("moon-base")).revision === 1, "Stale LLM edits fail clearly without overwriting a newer revision");

  const imported = await levels("importAscii", {
    id: "tiny-trial",
    label: "Tiny Trial",
    cellSize: 2.2,
    rows: ["#######", "#..H..#", "#.o!..#", "#..S..#", "###F###"]
  });
  assert(imported.ok && imported.value.width === 7 && imported.value.height === 5 && imported.value.tiles.includes("hazard"), "Agent imports a compact ASCII level into the same canonical document model");
  assert((await levels("list")).length === 4, "Named library manages built-in, imported, and programmatically built levels together");

  const opened = await levels("open", "moon-base");
  assert(opened.ok, "Agent opens a named level in the shared human editor");
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === "map-editor");
  assert((await page.locator('[data-editor-level-id="moon-base"].is-selected').count()) === 1, "Visible level library selects the same level opened by the agent");
  assert((await page.locator("[data-editor-cell]").count()) === 432, "Human editor renders the active level's dynamic 24×18 dimensions");
  let visibleState = await textState();
  assert(visibleState.levelEditor.id === "moon-base" && visibleState.levelEditor.revision === 1 && visibleState.levelEditor.rows.length === 18, "Structured game state exposes the visible level revision and ASCII view");
  await page.evaluate(() => { document.querySelector(".panel").scrollTop = 0; });
  await screenshot("00-named-level-library");

  await page.locator('[data-editor-tool="ring"]').click();
  await page.locator('[data-editor-cell="125"]').click();
  let humanEdited = await levelAt("moon-base");
  assert(humanEdited.revision === 2 && humanEdited.tiles[125] === "ring", "A human grid click writes through the same revisioned level library used by agents");
  assert((await page.locator('[data-agent-level-revision="2"]').count()) === 1, "Visible editor refreshes to the human-authored revision");

  const undone = await levels("undo", "moon-base");
  assert(undone.ok && undone.revision === 3 && undone.value.tiles[125] === "floor", "Agent undo reverses the human edit as a new collaborative revision");
  const resized = await levels("resize", "moon-base", 30, 20, "floor", { expectedRevision: 3 });
  assert(resized.ok && resized.revision === 4 && resized.value.tiles.length === 600, "Agent expands a named level beyond its imported dimensions while preserving existing content");
  await page.waitForFunction(() => document.querySelectorAll("[data-editor-cell]").length === 600);
  assert((await page.locator('[data-editor-grid-width="30"][data-editor-grid-height="20"]').count()) === 1, "Human editor immediately follows an API-driven non-square resize");
  states.editor = await textState();
  await screenshot("01-agent-and-human-level-editor");

  const played = await levels("play", "moon-base");
  assert(played.ok, "Agent compiles and starts any named level through the existing playable race path");
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === "gameplay");
  const gameplay = await page.evaluate(() => window.__GRAPHYSX_DEBUG__.snapshot());
  assert(gameplay.raceName === "Moon Base" && gameplay.raceActive && gameplay.ringsTotal === 3, "Playable runtime receives the level label, active lifecycle, and authored ring objectives");
  states.gameplay = await textState();
  await screenshot("02-agent-level-playing");

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__GRAPHYSX__?.levels);
  const restored = await levels("get", "moon-base");
  assert(restored.width === 30 && restored.height === 20 && restored.revision === 4, "Named level library persists dimensions, content, and revision across reloads");
  assert((await levels("list")).length === 4, "All independently named levels persist across reloads");
  assert(errors.length === 0, "Agent Level API, shared editor, and playable compiler produce zero browser/page errors");
} finally {
  fs.writeFileSync(path.join(outputDir, "results.json"), JSON.stringify({ url, assertions, states, errors }, null, 2));
  await context.close();
  await browser.close();
}

console.log(JSON.stringify({ assertions: assertions.length, errors: errors.length, outputDir }, null, 2));
