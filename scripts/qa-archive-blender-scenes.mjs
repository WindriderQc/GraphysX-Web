import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const url = process.env.GRAPHYSX_URL ?? "http://127.0.0.1:4198/";
const outputDir = path.resolve("output/playwright/archive-blender-scenes");
fs.mkdirSync(outputDir, { recursive: true });

const files = [
  ["E:/Media/Datalake/blenderModel/Levels/Level1.blend", "0AA62FF04FA06988F7DFF71B429D980B2766A985F1CF6BB13A160278F38B4E9E"],
  ["public/assets/ballz-blender-level1/level1-best.fbx", "A7C248041E5E2CCFD0B9455B68535A4F7EF09BD47D9972D3D2BCC718F8C727D6"],
  ["E:/Media/Datalake/blenderModel/Maison/maison.blend", "8C9E95FDC5DE981BA451F0C05ACA9B94D347FE0DEE701D557F4CEDA595AC9237"],
  ["public/assets/maison-explorer/maison-best.fbx", "43CB7E5206F56D71ED6BF7986662B3EB504634616FDDA1ED7BFA8875427F8DB7"],
  ["E:/Media/Datalake/blenderModel/Maison/Cuisine.blend", "C0441E2AC52CC05329A569DC31B056314B9EA5535460EFDDFADBB8B86B966855"],
  ["public/assets/maison-explorer/cuisine-best.fbx", "24846D8EC083477F87E91F46ED31DA952A575B7F7CD3B234B6D11A4603B5B14E"]
];

const result = { url, assertions: [], errors: [], states: {} };
const assert = (condition, message) => {
  result.assertions.push({ pass: Boolean(condition), message });
  if (!condition) throw new Error(message);
};
for (const [file, expected] of files) {
  const actual = crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex").toUpperCase();
  assert(actual === expected, `${file} matches its locked SHA-256`);
}

const browser = await chromium.launch({ headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
page.on("console", (message) => {
  if (message.type() === "error") result.errors.push({ type: "console", text: message.text() });
});
page.on("pageerror", (error) => result.errors.push({ type: "page", text: String(error) }));

const debug = (method, argument) => page.evaluate(({ method, argument }) => window.__GRAPHYSX_DEBUG__[method](argument), { method, argument });
const state = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const shot = (name) => page.screenshot({ path: path.join(outputDir, `${name}.png`), fullPage: true });

try {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__GRAPHYSX_DEBUG__ && window.render_game_to_text);

  assert(await debug("openBallzBlenderLevel1"), "BallZ / Blender Level 1 opens from the canonical main app");
  await page.waitForFunction(() => window.__GRAPHYSX_DEBUG__.ballzBlenderLevel1State()?.ready, undefined, { timeout: 30000 });
  result.states.levelOverview = await state();
  const level = result.states.levelOverview.ballzBlenderLevel1;
  assert(level.restorationStatus === "RESTORED", "Level 1 is complete at its honest authored-geometry scope");
  assert(level.source.authored.vertices === 356 && level.source.authored.polygons === 354, "Level 1 preserves the best .blend source geometry totals");
  assert(level.runtime.meshes === 1 && level.runtime.cameras === 1 && level.runtime.lights === 1, "Level 1 runtime retains its mesh, source camera, and point light");
  assert(level.camera.profile === "overview", "Level 1 opens on the readable disclosed overview");
  assert(result.states.levelOverview.player === undefined && result.states.levelOverview.race === undefined, "Level 1 visit does not invent a BallZ player or race");
  await shot("00-level1-overview");
  assert(await debug("setBallzBlenderLevel1Camera", "source"), "Level 1 preserves the authored Blender camera as an evidence view");
  result.states.levelSource = await state();
  assert(result.states.levelSource.ballzBlenderLevel1.camera.profile === "source", "Level 1 text state identifies the saved source camera");
  await shot("01-level1-source-camera");
  assert(await debug("setBallzBlenderLevel1Camera", "overview"), "Level 1 returns to the disclosed overview camera");
  assert(await debug("orbitBallzBlenderLevel1", 0.35), "Level 1 overview supports deterministic orbit inspection");
  result.states.levelOverview = await state();
  assert(result.states.levelOverview.ballzBlenderLevel1.camera.profile === "overview", "Level 1 text state matches the visible overview");
  await shot("02-level1-overview-orbit");

  assert(await debug("openMaisonExplorer"), "Maison Explorer opens from the canonical main app");
  await page.waitForFunction(() => window.__GRAPHYSX_DEBUG__.maisonExplorerState()?.ready, undefined, { timeout: 30000 });
  result.states.house = await state();
  let maison = result.states.house.maisonExplorer;
  assert(maison.restorationStatus === "RESTORED" && maison.subspaces.length === 2, "Maison is complete as one House/Kitchen explorer");
  const house = maison.subspaces.find((entry) => entry.id === "house");
  const kitchen = maison.subspaces.find((entry) => entry.id === "kitchen");
  assert(house.source.authored.objects === 31 && house.source.authored.meshes === 24 && house.source.authored.lights === 6, "House retains all 31 objects, 24 meshes, and six lights");
  assert(kitchen.source.authored.objects === 87 && kitchen.source.authored.meshes === 76 && kitchen.source.authored.empties === 7, "Kitchen retains all 87 objects, 76 meshes, and seven hierarchy empties");
  assert(maison.activeSubspace === "house" && maison.camera.profile === "overview", "Maison opens in House with a readable disclosed overview");
  assert(result.states.house.player === undefined && result.states.house.race === undefined, "Maison remains isolated from BallZ progression");
  await shot("03-maison-house-overview");
  assert(await debug("setMaisonCamera", "source"), "House preserves its saved camera as an evidence view");
  result.states.houseSource = await state();
  assert(result.states.houseSource.maisonExplorer.camera.profile === "source", "Maison text state identifies the House source camera");
  await shot("04-maison-house-source-camera");

  assert(await debug("selectMaisonSubspace", "kitchen"), "Maison switches to the exact Kitchen subspace");
  result.states.kitchenOverview = await state();
  maison = result.states.kitchenOverview.maisonExplorer;
  assert(maison.activeSubspace === "kitchen" && maison.subspaces.find((entry) => entry.id === "kitchen").visible, "Only Kitchen is visible after subspace selection");
  assert(maison.camera.profile === "overview", "Kitchen selection opens on its readable overview");
  assert(maison.sourceDependencyBoundary.includes("unpacked Desktop JPG"), "Kitchen exposes the one genuinely absent external image instead of substituting it");
  await shot("05-maison-kitchen-overview");
  assert(await debug("setMaisonCamera", "source"), "Kitchen preserves its saved camera as an evidence view");
  result.states.kitchenSource = await state();
  await shot("06-maison-kitchen-source-camera");
  assert(await debug("setMaisonCamera", "overview"), "Kitchen returns to the disclosed overview camera");
  assert(await debug("orbitMaisonExplorer", -0.3), "Kitchen overview supports deterministic orbit inspection");
  result.states.kitchenOverview = await state();
  assert(result.states.kitchenOverview.maisonExplorer.camera.profile === "overview", "Maison text state matches the visible Kitchen overview");
  await shot("07-maison-kitchen-overview-orbit");

  assert(result.errors.length === 0, "Both restored Blender scenes run without console or page errors");
} finally {
  fs.writeFileSync(path.join(outputDir, "results.json"), JSON.stringify(result, null, 2));
  await browser.close();
}

console.log(JSON.stringify({ assertions: result.assertions.length, errors: result.errors.length, outputDir }, null, 2));
