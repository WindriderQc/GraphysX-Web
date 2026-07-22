import { SMOKE_TIMEOUT, applySmokeTimeout, launchSmokeBrowser } from "./smoke-harness.mjs";
import { startStaticServer } from "./static-server.mjs";
import { mkdirSync } from "node:fs";
import path from "node:path";

// Physics correctness: the material presets must actually reach the solver.
//
// The v2 runtime always *validated* its six surface presets, but for a long time each body
// minted its own private cannon Material, so no contact pair ever resolved in the world's
// contact-material table and every collision fell back to cannon's defaults — restitution
// 0.0, a world where nothing bounces. This smoke is the regression guard for that fix:
//
// - **Two identical spheres, two different platforms.** A `ball`-preset sphere dropped on a
//   `ball`-preset box (pair restitution 0.68) rebounds past 25% of the drop height; its twin
//   dropped on a `ground`-preset box (pair √(0.68·0.05) ≈ 0.18) thuds under 12%. Dead
//   materials make the columns identical at ~zero; only a live, differentiating pair table
//   makes them diverge. Both bars sit far from the behaviors they separate.
// - **Driven deterministically** through pause/step, like smoke-triggers, so the assertion
//   is about the simulation and not the machine's frame rate.
// - **The contact really happened** — the ball is observed at the surface before it climbs,
//   and it never tunnels through the box.
// - **Zero console/page errors**, and a screenshot.

const PORT = Number(process.env.SMOKE_PORT || 4525);
const SHARED_BASE = process.env.SMOKE_BASE || null;
const ART = process.env.SMOKE_ARTIFACTS || "output/verify";
mkdirSync(ART, { recursive: true });

const failures = [];
function check(name, condition, detail) {
  const pass = Boolean(condition);
  if (!pass) failures.push(`${name}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`);
  console.log(`${pass ? "  ok  " : "  FAIL"} ${name}${detail === undefined ? "" : ` ${JSON.stringify(detail)}`}`);
  return pass;
}

const consoleErrors = [];
const pageErrors = [];
let server;
let browser;
let drop = null;

try {
  if (!SHARED_BASE) server = await startStaticServer({ root: path.resolve("dist"), port: PORT });
  browser = await launchSmokeBrowser();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  applySmokeTimeout(page);
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
  page.on("pageerror", (e) => pageErrors.push(String(e)));

  const base = SHARED_BASE ?? `http://127.0.0.1:${PORT}/`;
  await page.goto(`${base}?host=standalone`, { waitUntil: "domcontentloaded", timeout: SMOKE_TIMEOUT });
  await page.waitForFunction(() => !!window.__GRAPHYSX_HOST__ && !!window.__GRAPHYSX__, { timeout: SMOKE_TIMEOUT });

  drop = await page.evaluate(() => {
    const gx = window.__GRAPHYSX__;
    // Freeze the host loop first, then drive time by hand: every number below is a function
    // of step() calls, not of how long the evaluate itself took.
    const paused = gx.pause(true);
    // A fresh world, so the demo scene's entities cannot wander into the drop column.
    const cleared = gx.clear("smoke-physics", "Physics Smoke");
    // Two platforms, two identical spheres: the pair table has to *differentiate*, not just
    // exist. ball×ball (geometric mean 0.68) is lively; ball×ground (√(0.68·0.05) ≈ 0.18)
    // is a dead thud. Dead materials make both columns behave identically at ~zero rebound.
    const ground = gx.spawn({
      id: "phys-ground",
      type: "box",
      geometry: { width: 10, height: 1, depth: 10 },
      transform: { position: [-8, 0.5, 0] },
      material: { color: "#2c4a44" },
      physics: { mode: "static", material: "ground" },
    });
    const bouncy = gx.spawn({
      id: "phys-bouncy",
      type: "box",
      geometry: { width: 10, height: 1, depth: 10 },
      transform: { position: [8, 0.5, 0] },
      material: { color: "#44304a" },
      physics: { mode: "static", material: "ball" },
    });
    const ball = gx.spawn({
      id: "phys-ball",
      type: "sphere",
      geometry: { radius: 0.5 },
      transform: { position: [-8, 6, 0] },
      material: { color: "#ff8066" },
      physics: { mode: "dynamic", mass: 1, material: "ball" },
    });
    const ballB = gx.spawn({
      id: "phys-ball-b",
      type: "sphere",
      geometry: { radius: 0.5 },
      transform: { position: [8, 6, 0] },
      material: { color: "#ffd166" },
      physics: { mode: "dynamic", mass: 1, material: "ball" },
    });
    // Box top (y = 1) plus the ball radius: where the ball's centre sits at contact.
    const surfaceY = 1.5;
    const dropHeight = 6 - surfaceY;
    // One 60 Hz slice per step keeps every frame observable; the quarter-second samples are
    // the human-readable trace, the per-frame trace is what the apex is measured on.
    const frames = [];
    const framesB = [];
    const samples = [];
    const totalFrames = 240; // 4 simulated seconds
    for (let frame = 1; frame <= totalFrames; frame += 1) {
      gx.step(1 / 60);
      const state = gx.query({ ids: ["phys-ball"] })[0];
      const stateB = gx.query({ ids: ["phys-ball-b"] })[0];
      const y = state ? state.position[1] : NaN;
      frames.push(y);
      framesB.push(stateB ? stateB.position[1] : NaN);
      if (frame % 15 === 0) samples.push({ t: Number((frame / 60).toFixed(2)), y, yBouncy: stateB ? stateB.position[1] : NaN });
    }
    const ballState = gx.query({ ids: ["phys-ball"] })[0] ?? null;
    return {
      pausedOk: !!(paused && paused.ok),
      clearedOk: !!(cleared && cleared.ok),
      groundOk: !!(ground && ground.ok),
      bouncyOk: !!(bouncy && bouncy.ok),
      ballOk: !!(ball && ball.ok),
      ballBOk: !!(ballB && ballB.ok),
      groundMaterial: ground && ground.ok ? ground.value.physics.material : null,
      ballMaterial: ball && ball.ok ? ball.value.physics.material : null,
      surfaceY,
      dropHeight,
      frames,
      framesB,
      samples,
      finalPhysics: ballState ? ballState.physics : null,
    };
  });

  console.log("\n# deterministic drop, sphere y every 0.25s (dead column / bouncy column)");
  for (const sample of drop.samples) console.log(`  t=${sample.t.toFixed(2)}s  y=${Number(sample.y).toFixed(3)}  yBouncy=${Number(sample.yBouncy).toFixed(3)}`);

  console.log("\n# setup");
  check("host loop paused", drop.pausedOk);
  check("world cleared for the drop", drop.clearedOk);
  check("ground box spawned with the 'ground' preset", drop.groundOk && drop.groundMaterial === "ground", drop.groundMaterial);
  check("bouncy box spawned with the 'ball' preset", drop.bouncyOk);
  check("both spheres spawned with the 'ball' preset", drop.ballOk && drop.ballBOk && drop.ballMaterial === "ball", drop.ballMaterial);

  console.log("\n# fall and contact");
  const ys = drop.frames.filter((y) => Number.isFinite(y));
  check("every frame reported a finite y", ys.length === drop.frames.length, drop.frames.length - ys.length);
  const contactIndex = drop.frames.findIndex((y) => y <= drop.surfaceY + 0.1);
  const minY = Math.min(...ys);
  check("the sphere fell to the ground and made contact", contactIndex >= 0, { minY: Number(minY.toFixed(3)), surfaceY: drop.surfaceY });
  check("the sphere never tunnelled through the box", minY >= drop.surfaceY - 0.35, Number(minY.toFixed(3)));

  console.log("\n# restitution is live, and the pair table differentiates");
  const contactIndexB = drop.framesB.findIndex((y) => y <= drop.surfaceY + 0.1);
  const afterContact = contactIndex >= 0 ? drop.frames.slice(contactIndex) : [];
  const afterContactB = contactIndexB >= 0 ? drop.framesB.slice(contactIndexB) : [];
  const apexY = afterContact.length ? Math.max(...afterContact) : NaN;
  const apexYB = afterContactB.length ? Math.max(...afterContactB) : NaN;
  const deadRatio = Number.isFinite(apexY) ? (apexY - drop.surfaceY) / drop.dropHeight : 0;
  const bouncyRatio = Number.isFinite(apexYB) ? (apexYB - drop.surfaceY) / drop.dropHeight : 0;
  // With dead contact materials (cannon's default restitution 0.0) BOTH columns stay near
  // zero. With the registered pairs, ball×ball (0.68) rebounds past 25% while ball×ground
  // (√(0.68·0.05) ≈ 0.18) stays a thud under 12% — the gap is the proof the *pair* resolves,
  // not some global restitution.
  check("bouncy column: rebound apex reached >= 25% of the drop height", bouncyRatio >= 0.25,
    { apexY: Number(apexYB.toFixed(3)), reboundRatio: Number(bouncyRatio.toFixed(3)) });
  check("dead column: rebound apex stayed <= 12% of the drop height", deadRatio <= 0.12,
    { apexY: Number(apexY.toFixed(3)), reboundRatio: Number(deadRatio.toFixed(3)) });
  check("the pair table differentiates (bouncy clears dead by 2x)", bouncyRatio > deadRatio * 2,
    { deadRatio: Number(deadRatio.toFixed(3)), bouncyRatio: Number(bouncyRatio.toFixed(3)) });
  check("the ball's contact behaviour is reported as the 'ball' preset", drop.finalPhysics?.material === "ball", drop.finalPhysics);

  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(ART, "physics-drop.png") });
} catch (error) {
  failures.push(`fatal — ${String(error)}`);
  console.error(error);
} finally {
  if (browser) await browser.close();
  if (server) await server.close();
}

console.log("\n# page health");
check("no console errors", consoleErrors.length === 0, consoleErrors.slice(0, 5));
check("no page errors", pageErrors.length === 0, pageErrors.slice(0, 5));

if (failures.length) {
  console.log(`\n${failures.length} failure(s):`);
  for (const failure of failures) console.log(`  - ${failure}`);
}
console.log(`\nsmoke-physics: ${failures.length ? "FAIL" : "PASS"}`);
process.exit(failures.length ? 1 : 0);
