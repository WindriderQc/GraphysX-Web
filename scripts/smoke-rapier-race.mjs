import { mkdirSync } from "node:fs";
import path from "node:path";
import { SMOKE_TIMEOUT, applySmokeTimeout, launchSmokeBrowser } from "./smoke-harness.mjs";
import { startStaticServer } from "./static-server.mjs";

// Rapier race-scene regression: load the archive's largest lazy vehicle chunk, then drive
// the real Piste Ovale controller through fixed 60 Hz slices. This catches finite-state,
// traction, steering, and browser-integration failures that the node-only probes cannot.
const PORT = Number(process.env.SMOKE_PORT || 4535);
const SHARED_BASE = process.env.SMOKE_BASE || null;
const ART = process.env.SMOKE_ARTIFACTS || path.resolve("output/verify");
mkdirSync(ART, { recursive: true });

const failures = [];
function check(name, condition, detail) {
  const pass = Boolean(condition);
  if (!pass) failures.push(`${name}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`);
  console.log(`${pass ? "  ok  " : "  FAIL"} ${name}${detail === undefined ? "" : ` ${JSON.stringify(detail)}`}`);
}

const finiteVector = (vector) => vector && [vector.x, vector.y, vector.z].every(Number.isFinite);
const distanceXZ = (left, right) => Math.hypot(right.x - left.x, right.z - left.z);

const consoleErrors = [];
const pageErrors = [];
let server;
let browser;
let result = null;

try {
  if (!SHARED_BASE) server = await startStaticServer({ root: path.resolve("dist"), port: PORT });
  browser = await launchSmokeBrowser();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  applySmokeTimeout(page);
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => pageErrors.push(String(error)));

  const base = SHARED_BASE ?? `http://127.0.0.1:${PORT}/`;
  await page.goto(`${base}?host=legacy`, { waitUntil: "domcontentloaded", timeout: SMOKE_TIMEOUT });
  await page.waitForFunction(() => !!window.__GRAPHYSX_DEBUG__ && typeof window.advanceTime === "function", null, { timeout: SMOKE_TIMEOUT });

  const selected = await page.evaluate(() => window.__GRAPHYSX_DEBUG__.selectRace("piste-ovale"));
  check("Piste Ovale is selectable through the shipped debug surface", selected);

  // cars-catalog.json is deliberately lazy and large. Give its parse a wider local deadline
  // than ordinary DOM waits; verify's outer per-smoke watchdog remains the ultimate bound.
  await page.waitForFunction(
    () => {
      const load = window.__GRAPHYSX_DEBUG__.snapshot().loadState;
      return load.ready || Boolean(load.error);
    },
    null,
    { timeout: Math.max(SMOKE_TIMEOUT, 180_000) },
  );

  result = await page.evaluate(() => {
    const debug = window.__GRAPHYSX_DEBUG__;
    const load = debug.snapshot().loadState;
    if (!load.ready) return { load, started: false };
    const started = debug.startRace();
    if (!started) return { load, started };

    // Keep each drive phase inside one synchronous browser task. The normal RAF cannot
    // interleave, so the deltas below depend on fixed engine steps rather than wall time.
    window.advanceTime(1000);
    const start = { snapshot: debug.snapshot(), vehicle: debug.vehicleState() };
    debug.setVirtualInput({ code: "KeyW", down: true });
    window.advanceTime(2500);
    const straight = { snapshot: debug.snapshot(), vehicle: debug.vehicleState() };
    debug.setVirtualInput({ code: "KeyD", down: true });
    window.advanceTime(1800);
    const steering = { snapshot: debug.snapshot(), vehicle: debug.vehicleState() };
    debug.setVirtualInput({ code: "KeyD", down: false });
    debug.setVirtualInput({ code: "KeyW", down: false });
    window.advanceTime(250);
    const released = { snapshot: debug.snapshot(), vehicle: debug.vehicleState() };
    return { load, started, start, straight, steering, released };
  });

  console.log("\n# Piste Ovale fixed-step trace");
  console.log(JSON.stringify(result, null, 2));
  check("archive car data loaded", result.load?.ready && !result.load?.error, result.load);
  check("race entered gameplay", result.started && result.straight?.snapshot.raceActive, {
    started: result.started,
    raceActive: result.straight?.snapshot.raceActive,
  });

  if (result.start && result.straight && result.steering && result.released) {
    const states = [result.start, result.straight, result.steering, result.released];
    check("all chassis and mirrored player states are finite",
      states.every((state) => finiteVector(state.snapshot.playerPosition) && finiteVector(state.vehicle?.position) && finiteVector(state.vehicle?.velocity)),
      states.map((state) => ({ player: state.snapshot.playerPosition, vehicle: state.vehicle })));
    check("player mirror follows the Rapier chassis",
      states.every((state) => distanceXZ(state.snapshot.playerPosition, state.vehicle.position) < 1e-4 && Math.abs(state.snapshot.playerPosition.y - state.vehicle.position.y) < 1e-4));
    const straightDistance = distanceXZ(result.start.vehicle.position, result.straight.vehicle.position);
    const steeringDistance = distanceXZ(result.straight.vehicle.position, result.steering.vehicle.position);
    const lateralDelta = Math.abs(result.steering.vehicle.position.x - result.straight.vehicle.position.x);
    check("rear-wheel drive moves the Rapier chassis", straightDistance > 1,
      { distance: Number(straightDistance.toFixed(3)) });
    check("steering phase keeps the chassis moving", steeringDistance > 0.5,
      { distance: Number(steeringDistance.toFixed(3)) });
    check("steering produces a lateral trajectory change", lateralDelta > 0.15,
      { lateralDelta: Number(lateralDelta.toFixed(3)) });
    check("virtual steering reached the race input axis",
      result.steering.snapshot.inputAxis?.forward === 1 && result.steering.snapshot.inputAxis?.turn === 1 &&
        result.steering.vehicle.wheels.some((wheel) => Math.abs(wheel.steering ?? 0) > 0.1),
      { input: result.steering.snapshot.inputAxis, wheels: result.steering.vehicle.wheels });
    check("input release reaches the controller", result.released.snapshot.inputAxis?.forward === 0 && result.released.snapshot.inputAxis?.turn === 0,
      result.released.snapshot.inputAxis);
  }

  await page.screenshot({ path: path.join(ART, "rapier-piste-race.png"), fullPage: false });
} catch (error) {
  failures.push(`fatal — ${String(error)}`);
  console.error(error);
} finally {
  if (browser) await browser.close();
  if (server) await server.close();
}

check("no console errors", consoleErrors.length === 0, consoleErrors);
check("no page errors", pageErrors.length === 0, pageErrors);
if (failures.length) {
  console.error(`\n${failures.length} Rapier race smoke failure(s):\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`\nRapier race smoke passed. Screenshot: ${path.join(ART, "rapier-piste-race.png")}`);
