/**
 * Ad-hoc probe: does a dynamic sphere dropped on the showroom terrain come to REST?
 *
 * This is the bug the terrain graduation exists to fix. Before it, the showroom hid the flat
 * ground plane and drew terrain as host decoration with no collider, so a sphere spawned at
 * y=8 fell to y=-12.59 and kept going. "The entity exists" was never the question.
 *
 *   node scripts/probe-terrain-rest.mjs            (against a running dist server)
 *   SMOKE_BASE=http://127.0.0.1:4188/ node scripts/probe-terrain-rest.mjs
 */
import { chromium } from "playwright";

const BASE = process.env.SMOKE_BASE || "http://127.0.0.1:4188/";

const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage();
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(String(e)));

await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForFunction(() => !!window.__GRAPHYSX_HOST__, { timeout: 20000 });
await page.waitForTimeout(800);

const result = await page.evaluate(async () => {
  const api = window.__GRAPHYSX__;
  const terrain = api.state().entities.find((e) => e.type === "terrain");
  const spawn = api.spawn({
    id: "probe-drop",
    type: "sphere",
    geometry: { radius: 0.5 },
    transform: { position: [6, 18, 6] },
    physics: { mode: "dynamic", mass: 1, material: "ball", restitution: 0.3 },
    ephemeral: true,
  });
  const at = () => api.state().entities.find((e) => e.id === "probe-drop")?.position ?? null;
  const track = [];
  // Step the simulation deterministically rather than waiting on wall-clock frames, so the
  // probe measures physics rather than headless frame rate.
  for (let i = 0; i < 30; i += 1) {
    api.step(0.5);
    track.push(Number(at()?.[1].toFixed(3)));
  }
  const entity = api.state().entities.find((e) => e.id === "probe-drop");
  return {
    spawnOk: spawn.ok,
    terrain: terrain ? { id: terrain.id, physics: terrain.physics, terrain: terrain.terrain } : null,
    track,
    finalY: entity?.position[1] ?? null,
    velocity: entity?.physics?.linearVelocity ?? null,
    sleeping: entity?.physics?.sleeping ?? null,
  };
});

console.log(JSON.stringify(result, null, 2));
console.log("pageErrors:", pageErrors);
await browser.close();
