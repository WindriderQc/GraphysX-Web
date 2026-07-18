import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const url = process.env.GRAPHYSX_URL ?? "http://127.0.0.1:4198/";
const outputDir = path.resolve("output/playwright/arena-archive");
fs.mkdirSync(outputDir, { recursive: true });

const files = [
  ["E:/Media/Datalake/bckup/Unity Projects/Arena/Assets/Arena.unity", "8DAB1C507DA98E94CA13CA68192DF6DAA98B6C442630A6251F76797934D02CAB"],
  ["E:/Media/Datalake/bckup/Unity Projects/Arena/Assets/Models/Arena.obj", "AE582845AC6EAB09C65430EED51E866AD40E787CBF4B652DE0B4A9DBE620BE45"],
  ["public/assets/arena-archive/Arena.obj", "AE582845AC6EAB09C65430EED51E866AD40E787CBF4B652DE0B4A9DBE620BE45"],
  ["public/assets/arena-archive/Arena.mtl", "547D290E4DC5B7826667B2DFB59F8918E97B1980599C99B9CF54819436316668"],
  ["public/assets/arena-archive/arena.mat", "D12CDD3744F38A1D86C62EBD3B01247ECD6E7C7B5F668B0117B1828D07FCDC55"],
  ["public/assets/arena-archive/arena.png", "B643EBC1B13BA2C04F8D32DF35B2874CF3717F7057BCC36CEFD2F3C321572245"]
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
  assert(await debug("openArenaArchive"), "Unity Arena opens through the canonical main app");
  await page.waitForFunction(() => window.__GRAPHYSX_DEBUG__.arenaArchiveState()?.loadStatus === "ready", undefined, { timeout: 30000 });
  result.states.overview = await state();
  const arena = result.states.overview.arenaArchive;
  assert(arena.restorationStatus === "RESTORED", "Arena is complete at its surviving scriptless authored scope");
  assert(arena.source.authored.vertices === 48 && arena.source.authored.faces === 44, "Arena exposes the source OBJ totals");
  assert(arena.runtime.meshes === 1 && arena.runtime.material.atlasLoaded, "Arena renders one exact textured mesh");
  assert(arena.camera.profile === "overview", "Arena defaults to the disclosed readable overview");
  assert(result.states.overview.player === undefined && result.states.overview.race === undefined, "Arena remains isolated from BallZ actors and progression");
  await shot("00-arena-overview");

  assert(await debug("setArenaArchiveCamera", "source"), "Arena preserves its authored Unity camera");
  result.states.source = await state();
  assert(result.states.source.arenaArchive.camera.sourceTransformExact, "Source-camera state is explicitly exact");
  assert(result.states.source.camera.position.join(",") === "0,1,-10", "Source camera retains Unity position 0,1,-10");
  await shot("01-arena-source-camera");

  assert(await debug("resetArenaArchive"), "Arena reset restores the readable overview");
  assert((await state()).arenaArchive.camera.profile === "overview", "Reset state matches the visible overview");
  assert(result.errors.length === 0, "Arena runs without browser console or page errors");
} finally {
  fs.writeFileSync(path.join(outputDir, "results.json"), JSON.stringify(result, null, 2));
  await browser.close();
}

console.log(JSON.stringify({ assertions: result.assertions.length, errors: result.errors.length, outputDir }, null, 2));
