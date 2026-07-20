import { mkdirSync } from "node:fs";
import path from "node:path";
import { SMOKE_TIMEOUT, applySmokeTimeout, launchSmokeBrowser } from "./smoke-harness.mjs";
import { startStaticServer } from "./static-server.mjs";
import {
  ARCHIVE_MILKYWAY_CONSTANTS,
  ARCHIVE_MILKYWAY_NOT_REVIVED,
  ARCHIVE_MILKYWAY_SCENES,
  buildArchiveMilkyWay,
} from "../src/archive-milkyway.ts";

/**
 * Proves the recovered Voie Lactée vignette in `src/archive-milkyway.ts` is a living scene
 * rather than valid data.
 *
 * ## How this drives the real module
 *
 * `archive-milkyway.ts` has **no runtime imports** — only type imports, which Node erases —
 * so this script imports the shipped module directly and pushes the exact definition it
 * produces into the BUILT page through `window.__GRAPHYSX__.create()`. Nothing is re-typed
 * here, so a change to the scene is a change to what is asserted. Until the lead wires a
 * compose call into a front-door route the module is not in the bundle; the *scene* is
 * therefore fully verified and only its *reachability from the UI* is not.
 *
 * It joins the gate's static server when `SMOKE_BASE` is set, and only stands up its own on
 * port 4505 when run standalone — two static servers in one gate run is exactly the
 * multi-fleet contention that produces false reds.
 *
 * ## What is asserted, and why each one
 *
 * - **The record matches the shipped scene.** Every recovered number — five positions, five
 *   radii, the 23-degree tilt, the 1.2 / 3.6 deg/s spins, the 8-unit orbit at -3 deg/s — is
 *   re-derived from `ARCHIVE_MILKYWAY_CONSTANTS` and checked against what the runtime
 *   actually resolved. A scene that drifts from its own provenance fails the build.
 * - **The textures actually resolve.** Four of five bodies ARE their maps, so this is the
 *   claim the whole scene rests on. Checked three ways: the id is in the shipped registry,
 *   the live material carries it, and the browser fetched the JPEG with a 2xx. The third one
 *   is the check that would have caught the `dist/` pruning bug the garage hit — a texture
 *   that 404s still leaves a perfectly valid white sphere behind.
 * - **The presentation scale is on the root group alone**, which is what makes the recovered
 *   radii in the document the archive's own rather than pre-multiplied numbers, and what
 *   makes the ratios 6 : 6.1 : 2 : 12 : 4 exact by construction.
 * - **The Moon really orbits.** Its world position must move, must hold a horizontal radius
 *   of exactly 8 x the stage scale from the Earth, and must sweep *retrograde* at the
 *   archive's -3 deg/s. "It has an orbit behavior" is not the claim.
 * - **The Earth and its clouds really spin, at the archive's 1:3 ratio**, measured as a
 *   rotation delta over stepped time rather than read off the definition.
 * - **Export -> load.** The scene claims to be an ordinary v2 document.
 * - **Zero console/page errors**, and a screenshot.
 *
 * Time is driven with `api.pause(true)` + fixed `api.step(1/60)`, never wall clock, so
 * results do not depend on the harness's software-GL frame rate.
 */

const PORT = Number(process.env.SMOKE_PORT || 4505);
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
const near = (a, b, tolerance) => Number.isFinite(a) && Math.abs(a - b) <= tolerance;
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
/** Smallest signed difference between two angles in degrees, in (-180, 180]. */
const angleDelta = (from, to) => {
  let delta = (to - from) % 360;
  if (delta > 180) delta -= 360;
  if (delta <= -180) delta += 360;
  return delta;
};

const consoleErrors = [];
const pageErrors = [];
/** Every response the page took for a milky-way asset, so a silent 404 cannot pass. */
const assetResponses = new Map();
let server;
let browser;

try {
  if (!SHARED_BASE) server = await startStaticServer({ root: path.resolve("dist"), port: PORT });
  browser = await launchSmokeBrowser();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  applySmokeTimeout(page);
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  page.on("response", (response) => {
    const url = new URL(response.url()).pathname;
    if (url.startsWith("/assets/archives/milky-way/")) assetResponses.set(url, response.status());
  });

  const base = SHARED_BASE ?? `http://127.0.0.1:${PORT}/`;
  await page.goto(`${base}?host=standalone`, { waitUntil: "load", timeout: SMOKE_TIMEOUT });
  await page.waitForFunction(() => !!window.__GRAPHYSX_HOST__ && !!window.__GRAPHYSX__, { timeout: SMOKE_TIMEOUT });

  const K = ARCHIVE_MILKYWAY_CONSTANTS;
  const record = ARCHIVE_MILKYWAY_SCENES[0];

  // ---- 0. The record itself is well formed -------------------------------------------
  console.log("\n# provenance record");
  check("one scene recorded", ARCHIVE_MILKYWAY_SCENES.length === 1, ARCHIVE_MILKYWAY_SCENES.map((s) => s.id));
  check("fidelity is labelled three ways",
    record.fidelity.faithful.length > 0 && record.fidelity.inferred.length > 0 && record.fidelity.deliberatelyAbsent.length > 0,
    { faithful: record.fidelity.faithful.length, inferred: record.fidelity.inferred.length, absent: record.fidelity.deliberatelyAbsent.length });
  check("deviations are machine-readable",
    record.deviations.length > 0 && record.deviations.every((d) => typeof d.code === "string" && d.code.length > 0 && typeof d.detail === "string" && d.detail.length > 80),
    record.deviations.map((d) => d.code));
  check("both staging factors are declared as deviations, not buried",
    record.deviations.some((d) => d.code === "presentation-scale") &&
    record.deviations.some((d) => d.code === "presentation-rotation"));
  check("the missing Mars/Venus orbits are declared, not omitted",
    record.deviations.some((d) => d.code === "no-orbits-for-mars-and-venus"));
  check("names the five registered textures it leans on",
    record.provenance.graduatedTextures.length === 5,
    record.provenance.graduatedTextures.map((t) => t.texture));
  check("not-revived record is populated and every entry gives a verdict and a reason",
    ARCHIVE_MILKYWAY_NOT_REVIVED.length >= 4 &&
    ARCHIVE_MILKYWAY_NOT_REVIVED.every((r) => r.verdict && r.why && r.why.length > 80),
    ARCHIVE_MILKYWAY_NOT_REVIVED.length);

  // ---- 1. The registered textures the whole fidelity claim rests on ---------------------
  console.log("\n# the textures four of five bodies ARE");
  const registry = await page.evaluate(() => Object.fromEntries(
    window.__GRAPHYSX__.textures().map((t) => [t.id, t.url])));
  for (const { texture, archiveFile, body } of record.provenance.graduatedTextures) {
    check(`${body}: '${texture}' is in the shipped texture registry`, typeof registry[texture] === "string", registry[texture]);
    check(`${body}: '${texture}' still points at the recovered milky-way bytes`,
      typeof registry[texture] === "string" && registry[texture].startsWith("/assets/archives/milky-way/"),
      { texture, url: registry[texture], archiveFile });
  }

  // ---- 2. The scene ---------------------------------------------------------------------
  console.log("\n# archive-voie-lactee");
  const definition = buildArchiveMilkyWay("archive-voie-lactee");
  await page.evaluate((scene) => window.__GRAPHYSX__.create(scene), definition);
  // The cloud map is 7.4 MB, so give the loader real time before asserting it arrived.
  await page.waitForTimeout(2500);

  const state = await page.evaluate(() => {
    const live = window.__GRAPHYSX__.state();
    return {
      worldId: live.world.id,
      environment: live.environment,
      count: live.entities.length,
      byId: Object.fromEntries(live.entities.map((e) => [e.id, e])),
    };
  });

  check("scene loaded under its own id", state.worldId === "archive-voie-lactee", state.worldId);
  check("every authored entity materialised", state.count === definition.entities.length,
    { live: state.count, authored: definition.entities.length });
  check("the starfield is the all-round night set, not the one with a horizon silhouette",
    state.environment.sky === "clearnight", state.environment.sky);
  check("no ground plane and no grid under bodies in space",
    state.environment.ground.visible === false && state.environment.ground.grid === false);
  check("the envelope clears the staged system instead of fogging Venus",
    state.environment.envelope !== null && state.environment.envelope.fogNear > 200 && state.environment.envelope.cameraFar > 1000,
    state.environment.envelope);

  // Every texture arrived over the wire. This is the check the garage's pruning bug needed:
  // an unregistered or pruned map 404s and leaves a perfectly valid white sphere behind.
  console.log("\n# the maps actually arrived");
  for (const { texture, body } of record.provenance.graduatedTextures) {
    const pathname = registry[texture];
    const status = assetResponses.get(pathname);
    check(`${body}: the browser fetched ${pathname} successfully`,
      typeof status === "number" && status >= 200 && status < 400, { status: status ?? "never requested" });
  }

  // ---- 3. The recovered numbers ---------------------------------------------------------
  console.log("\n# recovered geometry");
  const authored = Object.fromEntries(definition.entities.filter((e) => e.id).map((e) => [e.id, e]));
  const BODIES = [
    ["voie-lactee-earth", "earth", "earth-surface"],
    ["voie-lactee-clouds", "clouds", "earth-clouds"],
    ["voie-lactee-moon", "moon", "moon"],
    ["voie-lactee-mars", "mars", "mars"],
    ["voie-lactee-venus", "venus", "venus"],
  ];
  for (const [id, key, texture] of BODIES) {
    check(`${key}: radius is the archive's ${K[key].radius}`,
      near(state.byId[id]?.geometry?.radius, K[key].radius, 1e-9), state.byId[id]?.geometry?.radius);
    check(`${key}: the live material carries the recovered '${texture}' map`,
      state.byId[id]?.material?.texture?.id === texture, state.byId[id]?.material?.texture);
  }
  // The Earth and its shell are authored at the origin of the tilt group, so their archive
  // position is asserted on the group that carries it.
  check("earth and clouds sit at the archive's (-10, 15, 10), via the tilt group",
    authored["voie-lactee-earth-axis"].transform.position.every((v, i) => near(v, K.earth.position[i], 1e-9)) &&
    authored["voie-lactee-earth"].transform.position.every((v) => v === 0) &&
    authored["voie-lactee-clouds"].transform.position.every((v) => v === 0),
    authored["voie-lactee-earth-axis"].transform.position);
  for (const [id, key] of [["voie-lactee-moon", "moon"], ["voie-lactee-mars", "mars"], ["voie-lactee-venus", "venus"]]) {
    check(`${key}: authored at the archive's (${K[key].position.join(", ")})`,
      authored[id].transform.position.every((v, i) => near(v, K[key].position[i], 1e-9)),
      authored[id].transform.position);
  }
  check("the 23-degree Earth tilt is on the axis group, so the spin is about the tilted pole",
    near(authored["voie-lactee-earth-axis"].transform.rotationDegrees[2], K.earth.tiltDegrees, 1e-9) &&
    authored["voie-lactee-earth"].behaviors.every((b) => b.type !== "spin" || b.axis === "y"),
    authored["voie-lactee-earth-axis"].transform.rotationDegrees);
  check("the moon orbit ring draws the record's own radius 8",
    near(state.byId["voie-lactee-moon-orbit-ring"]?.geometry?.radius, K.moon.orbitRadius, 1e-9),
    state.byId["voie-lactee-moon-orbit-ring"]?.geometry?.radius);

  // ---- 4. The stage: one factor, one place, ratios exact --------------------------------
  console.log("\n# the presentation scale");
  {
    const stage = state.byId["voie-lactee-system"]?.scale;
    check("the presentation scale is uniform and on the root group alone",
      Array.isArray(stage) && stage[0] === stage[1] && stage[1] === stage[2] && near(stage[0], K.stage.scale, 1e-6), stage);
    const staged = definition.entities.filter((e) => e.parentId);
    check("every recovered entity hangs off the stage (directly or through the tilt group), unscaled itself",
      staged.length >= 7 &&
      staged.every((e) => e.parentId === "voie-lactee-system" || e.parentId === "voie-lactee-earth-axis") &&
      staged.every((e) => e.transform?.scale === undefined || e.transform.scale.every((v) => v === 1)),
      staged.map((e) => e.id));
    // The point of scaling at the root: the recovered ratios survive it exactly.
    check("the archive ratios 6 : 6.1 : 2 : 12 : 4 are exact in the document",
      near(K.clouds.radius / K.earth.radius, 6.1 / 6, 1e-12) &&
      near(K.mars.radius / K.earth.radius, 2, 1e-12) &&
      near(K.venus.radius / K.moon.radius, 2, 1e-12) &&
      near(K.moon.orbitRadius / K.earth.radius, 8 / 6, 1e-12),
      K.radiiInOrder);
    check("the archive's own 74-unit extent is what the scale is declared against",
      near(K.archiveExtentUnits, 74, 1e-9), K.archiveExtentUnits);
    // The stage transform is derived from the archive centre, not hand-tuned.
    check("the stage transform puts the archive's centre on the host's orbit target",
      [0, 1, 2].every((i) => near(K.stage.position[i] + K.stage.scale * K.stage.yawedCentre[i], K.stage.origin[i], 1e-9)),
      K.stage.position);
    // The yaw is a rigid rotation of the whole system, so it must live on the root and
    // nowhere else — a per-body rotation would change the angles between bodies.
    check("the presentation yaw is on the root group alone",
      near(state.byId["voie-lactee-system"]?.rotationDegrees?.[1], K.stage.yawDegrees, 1e-3) &&
      definition.entities.filter((e) => e.parentId && e.transform?.rotationDegrees)
        .every((e) => e.id === "voie-lactee-earth-axis" || e.id === "voie-lactee-moon-orbit-ring"),
      state.byId["voie-lactee-system"]?.rotationDegrees);
    // A rigid rotation preserves distance, so the recovered separations survive it exactly.
    check("the yaw preserves the recovered body separations, at the staged scale",
      near(distance(state.byId["voie-lactee-mars"].position, state.byId["voie-lactee-venus"].position),
        distance(K.mars.position, K.venus.position) * K.stage.scale, 1e-3),
      { live: Number(distance(state.byId["voie-lactee-mars"].position, state.byId["voie-lactee-venus"].position).toFixed(4)),
        expected: Number((distance(K.mars.position, K.venus.position) * K.stage.scale).toFixed(4)) });
  }

  // ---- 5. Behaviour: the thing is alive -------------------------------------------------
  console.log("\n# motion over stepped time");
  const STEPS = 900; // 15 seconds at 60 Hz: 45 degrees of moon orbit, 18 of Earth spin.
  const motion = await page.evaluate((steps) => {
    const api = window.__GRAPHYSX__;
    const read = () => {
      const map = Object.fromEntries(api.state().entities.map((e) => [e.id, e]));
      return {
        earth: map["voie-lactee-earth"].position,
        moon: map["voie-lactee-moon"].position,
        mars: map["voie-lactee-mars"].position,
        venus: map["voie-lactee-venus"].position,
        earthSpinY: map["voie-lactee-earth"].rotationDegrees[1],
        cloudSpinY: map["voie-lactee-clouds"].rotationDegrees[1],
        marsSpinY: map["voie-lactee-mars"].rotationDegrees[1],
      };
    };
    api.pause(true);
    api.step(1 / 60);
    const before = read();
    for (let i = 0; i < steps; i += 1) api.step(1 / 60);
    const after = read();
    api.pause(false);
    return { before, after, seconds: steps / 60 };
  }, STEPS);

  const scale = K.stage.scale;
  const horizontal = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
  const bearing = (a, b) => (Math.atan2(a[2] - b[2], a[0] - b[0]) * 180) / Math.PI;

  check("the moon actually travelled", distance(motion.before.moon, motion.after.moon) > 1,
    Number(distance(motion.before.moon, motion.after.moon).toFixed(3)));
  check("the moon holds the archive's 8-unit orbital radius throughout, at the staged scale",
    near(horizontal(motion.before.moon, motion.before.earth), K.moon.orbitRadius * scale, 1e-3) &&
    near(horizontal(motion.after.moon, motion.after.earth), K.moon.orbitRadius * scale, 1e-3),
    { start: Number(horizontal(motion.before.moon, motion.before.earth).toFixed(4)),
      end: Number(horizontal(motion.after.moon, motion.after.earth).toFixed(4)),
      expected: Number((K.moon.orbitRadius * scale).toFixed(4)) });
  check("the moon rides one staged unit below the Earth's centre, as authored",
    near(motion.after.moon[1] - motion.after.earth[1], (K.moon.position[1] - K.earth.position[1]) * scale, 1e-3),
    Number((motion.after.moon[1] - motion.after.earth[1]).toFixed(4)));
  {
    // The orbit is RETROGRADE at -3 deg/s. A prograde orbit at the right speed would pass an
    // "it moved" test, so the sign is asserted, not just the magnitude.
    const swept = angleDelta(bearing(motion.before.moon, motion.before.earth), bearing(motion.after.moon, motion.after.earth));
    const expected = K.moon.orbitDegreesPerSecond * motion.seconds; // -45
    check("the moon sweeps retrograde at the archive's -3 deg/s",
      near(swept, expected, 0.35) && swept < 0, { sweptDegrees: Number(swept.toFixed(3)), expected });
  }
  {
    const earthSwept = angleDelta(motion.before.earthSpinY, motion.after.earthSpinY);
    const cloudSwept = angleDelta(motion.before.cloudSpinY, motion.after.cloudSpinY);
    check("the Earth spins at the archive's 0.02 deg/update (1.2 deg/s)",
      near(earthSwept, K.earth.spinDegreesPerSecond * motion.seconds, 0.2),
      { swept: Number(earthSwept.toFixed(3)), expected: K.earth.spinDegreesPerSecond * motion.seconds });
    check("the cloud shell spins at the archive's 0.06, exactly three times the surface",
      near(cloudSwept, K.clouds.spinDegreesPerSecond * motion.seconds, 0.4) &&
      near(cloudSwept / earthSwept, 3, 0.02),
      { swept: Number(cloudSwept.toFixed(3)), ratio: Number((cloudSwept / earthSwept).toFixed(4)) });
  }
  // The honest counterpart: Mars and Venus spin but do NOT orbit, because the record has no
  // orbit for them. Asserted so the deviation record cannot drift away from the scene.
  check("mars and venus hold their authored positions — nothing revolves around an invented centre",
    distance(motion.before.mars, motion.after.mars) < 1e-6 && distance(motion.before.venus, motion.after.venus) < 1e-6,
    { mars: motion.after.mars, venus: motion.after.venus });
  check("mars still turns on its own axis, so the row is not a static diorama",
    Math.abs(angleDelta(motion.before.marsSpinY, motion.after.marsSpinY)) > 1,
    Number(angleDelta(motion.before.marsSpinY, motion.after.marsSpinY).toFixed(3)));

  // ---- 6. Interactions ------------------------------------------------------------------
  console.log("\n# interactions");
  const toggled = await page.evaluate(() => {
    const api = window.__GRAPHYSX__;
    const visible = (id) => api.state().entities.find((e) => e.id === id).visible;
    const before = [visible("voie-lactee-clouds"), visible("voie-lactee-moon-orbit-ring")];
    api.interact("voie-lactee-clouds", "toggle-clouds");
    api.interact("voie-lactee-moon-orbit-ring", "toggle-guides");
    const after = [visible("voie-lactee-clouds"), visible("voie-lactee-moon-orbit-ring")];
    api.interact("voie-lactee-clouds", "toggle-clouds");
    api.interact("voie-lactee-moon-orbit-ring", "toggle-guides");
    return { before, after, restored: [visible("voie-lactee-clouds"), visible("voie-lactee-moon-orbit-ring")] };
  });
  check("the cloud shell and the orbit guide both toggle off, and back on",
    toggled.before.every(Boolean) && toggled.after.every((v) => v === false) && toggled.restored.every(Boolean),
    toggled);

  // ---- 7. Export -> load ------------------------------------------------------------------
  console.log("\n# export -> load");
  const roundTrip = await page.evaluate(() => {
    const api = window.__GRAPHYSX__;
    const exported = api.export();
    api.load(exported);
    const live = api.state();
    const map = Object.fromEntries(live.entities.map((e) => [e.id, e]));
    const moon = exported.entities.find((e) => e.id === "voie-lactee-moon");
    return {
      exportedEntities: exported.entities.length,
      reloadedEntities: live.entities.length,
      sky: live.environment.sky,
      stageScale: map["voie-lactee-system"].scale,
      tilt: map["voie-lactee-earth-axis"].rotationDegrees,
      earthTexture: map["voie-lactee-earth"].material.texture?.id,
      cloudTexture: map["voie-lactee-clouds"].material.texture?.id,
      cloudOpacity: map["voie-lactee-clouds"].material.opacity,
      moonOrbit: moon?.behaviors?.find((b) => b.type === "orbit") ?? null,
    };
  });
  check("the vignette survives export -> load with its stage, tilt, maps and orbit intact",
    roundTrip.reloadedEntities === state.count && roundTrip.sky === "clearnight" &&
    near(roundTrip.stageScale[0], K.stage.scale, 1e-6) && near(roundTrip.tilt[2], K.earth.tiltDegrees, 1e-3) &&
    roundTrip.earthTexture === "earth-surface" && roundTrip.cloudTexture === "earth-clouds" &&
    roundTrip.cloudOpacity < 1 &&
    roundTrip.moonOrbit !== null && near(roundTrip.moonOrbit.radius, K.moon.orbitRadius, 1e-9) &&
    near(roundTrip.moonOrbit.speedDegrees, K.moon.orbitDegreesPerSecond, 1e-9) &&
    near(roundTrip.moonOrbit.phaseDegrees, K.moon.orbitPhaseDegrees, 1e-6),
    roundTrip);

  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(ART, "archive-voie-lactee.png") });
  // A second, tight crop on the Earth pair. The one claim no assertion can settle is whether
  // the surface map and the translucent cloud shell read as two layers rather than as one
  // washed-out ball — the JPEG has no alpha channel, so the opacity is a judgement call and
  // this frame is the evidence for it. The clip is in the staged framing's screen space.
  await page.screenshot({
    path: path.join(ART, "archive-voie-lactee-earth.png"),
    clip: { x: 740, y: 380, width: 240, height: 190 },
  });
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
console.log(`\nsmoke-milkyway: ${failures.length ? "FAIL" : "PASS"}`);
process.exit(failures.length ? 1 : 0);
