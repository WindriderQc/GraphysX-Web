import { mkdirSync } from "node:fs";
import path from "node:path";
import { SMOKE_TIMEOUT, applySmokeTimeout, launchSmokeBrowser } from "./smoke-harness.mjs";
import { startStaticServer } from "./static-server.mjs";
import {
  ARCHIVE_PLAYGROUNDS,
  ARCHIVE_PLAYGROUNDS_NOT_REVIVED,
  ARCHIVE_PLAYGROUND_CONSTANTS,
  buildArchivePlayground,
} from "../src/archive-playgrounds.ts";

/**
 * Proves the two recovered Nature Lab playgrounds in `src/archive-playgrounds.ts` are living
 * scenes rather than valid data.
 *
 * ## How this drives the real module
 *
 * `archive-playgrounds.ts` has **no runtime imports** — only type imports, which Node erases —
 * so this script imports the shipped module directly and pushes the exact definition it
 * produces into the BUILT page through `window.__GRAPHYSX__.create()`. Nothing is re-typed
 * here, so a change to the scene is a change to what is asserted. Until the lead wires a
 * compose call into a front-door route the module is not in the bundle; the *scene* is
 * therefore fully verified and only its *reachability from the UI* is not.
 *
 * It serves `dist` on its own port (4495) rather than joining the gate's server, because the
 * gate runs its own fleet and two sessions sharing a port collide.
 *
 * ## What is asserted, and why each one
 *
 * - **The record matches the shipped scene.** Every faithful claim that is a number — planet
 *   radius, ring radius and rotation, attractor position, mass range, colour rule, walker
 *   count — is re-derived from `ARCHIVE_PLAYGROUND_CONSTANTS` and checked against what the
 *   runtime actually resolved. A scene that drifts from its own provenance fails the build.
 * - **The graduated presets really carry the archive numbers.** The strongest fidelity claim
 *   in the module is "the flock IS the recovered lesson, by preset reference". That is only
 *   true if `orbital-swarm` still resolves to count 60 / radius 5.25 / maxForce 0.58, so it
 *   is read back out of the shipped registry rather than trusted.
 * - **The simulation moves.** Flock members must actually travel (`averageSpeed` > 0 and a
 *   `leadPosition` that changes), and the flock-planet swarm must stay on its 5.25 shell —
 *   the sphere constraint is the whole lesson, so "it exists" is not the claim.
 * - **The fields do work.** `forceField.affectedCount` and `peakAcceleration` must be
 *   non-zero: an enabled field that silently touches nothing is the exact failure the
 *   runtime added those readings to expose.
 * - **The law is mass-independent.** Six probes of mass 0.55 to 3.0 start the same distance
 *   from the attractor with the same tangential speed. Under `G/d²` they must stay together
 *   whatever they weigh. This is the study's actual lesson, asserted as behaviour.
 * - **Interactions fire.** Nudging a probe through `api.interact()` must change its velocity.
 * - **Export -> load.** Both scenes claim to be ordinary v2 documents.
 * - **Zero console/page errors**, and a screenshot of each scene.
 *
 * Physics is driven with `api.pause(true)` + fixed `api.step(1/60)`, never wall clock, so
 * results do not depend on the harness's software-GL frame rate.
 */

const PORT = Number(process.env.SMOKE_PORT || 4495);
// Join the gate's server when it supplies one; only stand up our own when run standalone. Two
// static servers in one gate run is exactly the multi-fleet contention that produces false reds.
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

const consoleErrors = [];
const pageErrors = [];
let server;
let browser;

try {
  if (!SHARED_BASE) server = await startStaticServer({ root: path.resolve("dist"), port: PORT });
  browser = await launchSmokeBrowser();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  applySmokeTimeout(page);
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
  page.on("pageerror", (e) => pageErrors.push(String(e)));

  const base = SHARED_BASE ?? `http://127.0.0.1:${PORT}/`;
  await page.goto(`${base}?host=standalone`, { waitUntil: "load", timeout: SMOKE_TIMEOUT });
  await page.waitForFunction(() => !!window.__GRAPHYSX_HOST__ && !!window.__GRAPHYSX__, { timeout: SMOKE_TIMEOUT });

  // ---- 0. The record itself is well formed -------------------------------------------
  console.log("\n# provenance records");
  check("two playgrounds recorded", ARCHIVE_PLAYGROUNDS.length === 2, ARCHIVE_PLAYGROUNDS.map((p) => p.id));
  for (const record of ARCHIVE_PLAYGROUNDS) {
    check(`${record.id}: fidelity is labelled three ways`,
      record.fidelity.faithful.length > 0 && record.fidelity.inferred.length > 0 && record.fidelity.deliberatelyAbsent.length > 0,
      { faithful: record.fidelity.faithful.length, inferred: record.fidelity.inferred.length, absent: record.fidelity.deliberatelyAbsent.length });
    check(`${record.id}: deviations are machine-readable`,
      record.deviations.length > 0 && record.deviations.every((d) => typeof d.code === "string" && d.code.length > 0 && typeof d.detail === "string"),
      record.deviations.map((d) => d.code));
    check(`${record.id}: names the presets it leans on`, record.provenance.graduatedPresets.length > 0,
      record.provenance.graduatedPresets.map((p) => p.preset));
  }
  check("not-revived record is populated", ARCHIVE_PLAYGROUNDS_NOT_REVIVED.length >= 6,
    ARCHIVE_PLAYGROUNDS_NOT_REVIVED.length);
  check("every not-revived entry gives a verdict and a reason",
    ARCHIVE_PLAYGROUNDS_NOT_REVIVED.every((r) => r.verdict && r.why && r.why.length > 80));

  // ---- 1. The graduated presets still carry the archive numbers ------------------------
  console.log("\n# the presets the fidelity claims rest on");
  const registry = await page.evaluate(() => {
    const api = window.__GRAPHYSX__;
    return {
      swarm: api.flocks().find((f) => f.id === "orbital-swarm")?.defaults ?? null,
      well: api.forceFields().find((f) => f.id === "gravity-well")?.defaults ?? null,
      flow: api.forceFields().find((f) => f.id === "flow-garden")?.defaults ?? null,
    };
  });
  const K = ARCHIVE_PLAYGROUND_CONSTANTS;
  check("orbital-swarm is still nature-lab's sphere lesson",
    registry.swarm?.bounds === "sphere" && registry.swarm?.count === 60 &&
    near(registry.swarm?.radius, K.flockPlanet.flockShellRadius, 1e-6) && near(registry.swarm?.maxForce, 0.58, 1e-6),
    registry.swarm && { bounds: registry.swarm.bounds, count: registry.swarm.count, radius: registry.swarm.radius, maxForce: registry.swarm.maxForce });
  check("gravity-well is still attractor.js",
    registry.well?.kind === "attractor" && near(registry.well?.minimumDistance, 1.18, 1e-6),
    registry.well && { kind: registry.well.kind, minimumDistance: registry.well.minimumDistance });
  check("flow-garden is still flowfield.js",
    registry.flow?.kind === "flow" && registry.flow?.affectsParticles === true,
    registry.flow && { kind: registry.flow.kind, affectsParticles: registry.flow.affectsParticles });

  // =====================================================================================
  // SCENE 1 — Flock Planet
  // =====================================================================================
  console.log("\n# archive-flock-planet");
  const planetDefinition = buildArchivePlayground("archive-flock-planet");
  await page.evaluate((definition) => window.__GRAPHYSX__.create(definition), planetDefinition);
  await page.waitForTimeout(600);

  const planetState = await page.evaluate(() => {
    const state = window.__GRAPHYSX__.state();
    const byId = Object.fromEntries(state.entities.map((e) => [e.id, e]));
    return { worldId: state.world.id, environment: state.environment, count: state.entities.length, byId };
  });

  check("scene loaded under its own id", planetState.worldId === "archive-flock-planet", planetState.worldId);
  check("starfield substitute is the all-round night set, not the one with a horizon",
    planetState.environment.sky === "clearnight", planetState.environment.sky);
  check("no ground plane under a planet", planetState.environment.ground.visible === false);
  check("every authored entity materialised", planetState.count === planetDefinition.entities.length,
    { live: planetState.count, authored: planetDefinition.entities.length });
  // The stage scale must live on the root group and nowhere else: that is what makes the
  // recovered radii in the document the archive's own rather than pre-multiplied numbers.
  {
    const stage = planetState.byId["flock-planet-system"]?.scale;
    const scaled = ["flock-planet-surface", "flock-planet-atmosphere", "flock-planet-ring-equatorial",
      "flock-planet-ring-inclined", "flock-planet-swarm"];
    check("the presentation scale is uniform and on the root group alone",
      Array.isArray(stage) && stage.length === 3 && stage[0] === stage[1] && stage[1] === stage[2] && stage[0] > 1,
      stage);
    check("every recovered entity hangs off the stage, unscaled itself",
      scaled.every((id) => planetDefinition.entities.find((e) => e.id === id).parentId === "flock-planet-system") &&
      scaled.every((id) => {
        const authored = planetDefinition.entities.find((e) => e.id === id).transform?.scale;
        return authored === undefined || authored.every((v) => v === 1);
      }));
    // The point of scaling at the root: the recovered ratios survive it exactly.
    check("the archive ratios 4.4 : 4.54 : 4.72 : 5.25 are exact in the document",
      near(K.flockPlanet.atmosphereRadius / K.flockPlanet.planetRadius, 4.54 / 4.4, 1e-12) &&
      near(K.flockPlanet.flockShellRadius / K.flockPlanet.planetRadius, 5.25 / 4.4, 1e-12));
  }
  check("planet radius is the archive's 4.4",
    near(planetState.byId["flock-planet-surface"]?.geometry?.radius, K.flockPlanet.planetRadius, 1e-6),
    planetState.byId["flock-planet-surface"]?.geometry?.radius);
  check("atmosphere shell radius is the archive's 4.54",
    near(planetState.byId["flock-planet-atmosphere"]?.geometry?.radius, K.flockPlanet.atmosphereRadius, 1e-6),
    planetState.byId["flock-planet-atmosphere"]?.geometry?.radius);
  check("both orbit rings sit at the archive's 4.72",
    ["flock-planet-ring-equatorial", "flock-planet-ring-inclined"]
      .every((id) => near(planetState.byId[id]?.geometry?.radius, K.flockPlanet.orbitRingRadius, 1e-6)));
  {
    // Guarded explicitly: `(undefined ?? []).every(...)` is a vacuous pass, which is how the
    // first draft of this file "verified" a field that did not exist.
    const rotation = planetState.byId["flock-planet-ring-inclined"]?.rotationDegrees;
    check("the inclined ring carries the archive's verbatim (0.72, 0.25, 0.2) radians",
      Array.isArray(rotation) && rotation.length === 3 &&
        rotation.every((value, index) => near((value * Math.PI) / 180, [0.72, 0.25, 0.2][index], 1e-3)),
      rotation);
  }
  check("planet spin is the archive's 0.055 rad/s",
    near((planetState.byId["flock-planet-surface"]?.behaviors?.length ?? 0), 1, 0) &&
    near((planetDefinition.entities.find((e) => e.id === "flock-planet-surface").behaviors[0].speedDegrees * Math.PI) / 180,
      K.flockPlanet.planetSpinRadiansPerSecond, 1e-6));
  check("atmosphere spin is the archive's 0.082 rad/s",
    near((planetDefinition.entities.find((e) => e.id === "flock-planet-atmosphere").behaviors[0].speedDegrees * Math.PI) / 180,
      K.flockPlanet.atmosphereSpinRadiansPerSecond, 1e-6));

  const swarm = planetState.byId["flock-planet-swarm"]?.flock;
  check("the swarm resolved to the graduated preset's own numbers",
    swarm?.preset === "orbital-swarm" && swarm?.bounds === "sphere" && swarm?.count === registry.swarm.count &&
    near(swarm?.radius, registry.swarm.radius, 1e-6) && near(swarm?.maxForce, registry.swarm.maxForce, 1e-6),
    swarm && { preset: swarm.preset, bounds: swarm.bounds, count: swarm.count, radius: swarm.radius });
  check("trails restored to the archive's 45 samples",
    swarm?.trails === true && swarm?.trailLength === K.flockPlanet.trailSamples,
    { trails: swarm?.trails, trailLength: swarm?.trailLength });

  // Behaviour: the murmuration must actually murmur, and it must stay on its shell.
  const swarmMotion = await page.evaluate(async () => {
    const api = window.__GRAPHYSX__;
    api.pause(true);
    const read = () => api.state().entities.find((e) => e.id === "flock-planet-swarm").flock;
    const before = read();
    for (let i = 0; i < 180; i += 1) api.step(1 / 60);
    const after = read();
    api.pause(false);
    return {
      averageSpeed: after.averageSpeed,
      memberCount: after.memberCount,
      leadBefore: before.leadPosition,
      leadAfter: after.leadPosition,
    };
  });
  check("the swarm is moving", swarmMotion.averageSpeed > 0.2, swarmMotion.averageSpeed);
  check("all 60 members are simulated", swarmMotion.memberCount === registry.swarm.count, swarmMotion.memberCount);
  check("the lead member actually travelled over three seconds",
    distance(swarmMotion.leadBefore, swarmMotion.leadAfter) > 0.5,
    Number(distance(swarmMotion.leadBefore, swarmMotion.leadAfter).toFixed(3)));
  // The sphere constraint IS the lesson: after 3s of steering the lead must still be on the shell.
  {
    // Measured, not assumed: `flock.leadPosition` is reported in the flock entity's own local
    // space, so it is unaffected by the 1.9x stage scale even though the members visibly are.
    // (Every other entity's `position` in `state()` is a *world* position, so this one field
    // is the odd one out — worth knowing before writing a test against a parented flock.)
    const radius = Math.hypot(...swarmMotion.leadAfter);
    const shellError = Math.abs(radius - K.flockPlanet.flockShellRadius);
    check("members are still riding the archive's 5.25 shell after simulating", shellError < 0.35,
      { stageScale: planetState.byId["flock-planet-system"].scale[0], localRadius: Number(radius.toFixed(3)), error: Number(shellError.toFixed(3)) });
  }

  // Interaction: the shell toggle actually hides three entities.
  const toggled = await page.evaluate(() => {
    const api = window.__GRAPHYSX__;
    const ids = ["flock-planet-atmosphere", "flock-planet-ring-equatorial", "flock-planet-ring-inclined"];
    const visible = () => ids.map((id) => api.state().entities.find((e) => e.id === id).visible);
    const before = visible();
    api.interact("flock-planet-atmosphere", "toggle-shell");
    const after = visible();
    api.interact("flock-planet-atmosphere", "toggle-shell");
    return { before, after, restored: visible() };
  });
  check("the shell toggle hides all three, and restores them",
    toggled.before.every(Boolean) && toggled.after.every((v) => v === false) && toggled.restored.every(Boolean),
    toggled);

  const planetRoundTrip = await page.evaluate(() => {
    const api = window.__GRAPHYSX__;
    const exported = api.export();
    api.load(exported);
    const state = api.state();
    const flock = state.entities.find((e) => e.id === "flock-planet-swarm")?.flock;
    return {
      exportedEntities: exported.entities.length,
      reloadedEntities: state.entities.length,
      sky: state.environment.sky,
      flockPreset: flock?.preset,
      trailLength: flock?.trailLength,
    };
  });
  check("flock planet survives export -> load",
    planetRoundTrip.reloadedEntities === planetState.count &&
    planetRoundTrip.sky === "clearnight" && planetRoundTrip.flockPreset === "orbital-swarm" &&
    planetRoundTrip.trailLength === K.flockPlanet.trailSamples,
    planetRoundTrip);

  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(ART, "playground-flock-planet.png") });

  // =====================================================================================
  // SCENE 2 — Forces & Flow Garden
  // =====================================================================================
  console.log("\n# archive-forces-garden");
  const gardenDefinition = buildArchivePlayground("archive-forces-garden");
  await page.evaluate((definition) => window.__GRAPHYSX__.create(definition), gardenDefinition);
  await page.waitForTimeout(600);

  const gardenState = await page.evaluate(() => {
    const state = window.__GRAPHYSX__.state();
    const byId = Object.fromEntries(state.entities.map((e) => [e.id, e]));
    return { worldId: state.world.id, environment: state.environment, count: state.entities.length, byId };
  });

  check("scene loaded under its own id", gardenState.worldId === "archive-forces-garden", gardenState.worldId);
  check("all sixteen entities materialised", gardenState.count === gardenDefinition.entities.length,
    { live: gardenState.count, authored: gardenDefinition.entities.length });
  check("world gravity is zero — the attractor is the only force",
    gardenState.environment.physics.gravity.every((v) => v === 0), gardenState.environment.physics.gravity);

  // The floor relief is the archive formula, not a lookalike heightmap.
  const ground = gardenState.byId["forces-ground"]?.terrain;
  check("floor is an inline authored height field, not a registry map",
    ground?.heightmap === null && Array.isArray(ground?.heights) && ground.heights.length === 1089,
    { heightmap: ground?.heightmap, samples: ground?.heights?.length });
  check("height scale/offset restore the archive's exact +/-0.16 range",
    near(ground?.heightScale, 0.32, 1e-9) && near(ground?.heightOffset, -0.16, 1e-9),
    { heightScale: ground?.heightScale, heightOffset: ground?.heightOffset });
  // Re-derive the corner sample from the archive formula and compare against what shipped.
  {
    const samples = 33; const size = 24;
    const expected = ground.heights.map((_, index) => {
      const x = ((index % samples) / (samples - 1) - 0.5) * size;
      const z = (Math.floor(index / samples) / (samples - 1) - 0.5) * size;
      return (Math.sin(x * 0.42) * 0.08 + Math.cos(z * 0.51) * 0.08 + 0.16) / 0.32;
    });
    const worst = Math.max(...ground.heights.map((h, i) => Math.abs(h - expected[i])));
    check("every one of the 1089 samples matches sin(x*0.42)*0.08 + cos(z*0.51)*0.08", worst < 1e-12, worst);
  }
  check("terrain carries a collider", gardenState.byId["forces-ground"]?.physics !== null,
    gardenState.byId["forces-ground"]?.physics?.mode);
  // The legibility decisions are recorded as deviations, so assert they are actually applied —
  // a documented departure that is not in the scene is worse than an undocumented one.
  check("shadows are off scene-wide, as the deviation record claims",
    gardenDefinition.entities.filter((e) => e.castShadow === true).length === 0,
    gardenDefinition.entities.filter((e) => e.castShadow === true).map((e) => e.id));
  check("the mist overrides energy-orb's 0.5s archive lifetime, as the deviation record claims",
    ["forces-mist-light", "forces-mist-heavy"]
      .every((id) => gardenDefinition.entities.find((e) => e.id === id).emitter.lifetimeSeconds === 2.4));

  const attractor = gardenState.byId["forces-attractor-field"]?.forceField;
  const flow = gardenState.byId["forces-flow-field"]?.forceField;
  {
    const at = gardenState.byId["forces-attractor-core"]?.position;
    check("the attractor sits at the archive's (0, 2.55, 0)",
      Array.isArray(at) && at.length === 3 && at.every((v, i) => near(v, K.forcesGarden.attractorPosition[i], 1e-6)), at);
  }
  check("attractor core radius is the archive's 0.92",
    near(gardenState.byId["forces-attractor-core"]?.geometry?.radius, K.forcesGarden.attractorRadius, 1e-9));
  check("attractor ring is the archive's 1.36 / 0.035",
    near(gardenState.byId["forces-attractor-ring"]?.geometry?.radius, K.forcesGarden.attractorRingRadius, 1e-9) &&
    near(gardenState.byId["forces-attractor-ring"]?.geometry?.tube, K.forcesGarden.attractorRingTube, 1e-9));
  check("attractor field resolved as attractor.js's inverse-square law",
    attractor?.kind === "attractor" && near(attractor?.minimumDistance, registry.well.minimumDistance, 1e-9),
    { kind: attractor?.kind, minimumDistance: attractor?.minimumDistance });
  check("flow field resolved as flowfield.js at the archive's +/-10 / +/-7 extent",
    flow?.kind === "flow" && near(flow?.size?.[0], K.forcesGarden.flowHalfExtents[0], 1e-9) &&
    near(flow?.size?.[2], K.forcesGarden.flowHalfExtents[1], 1e-9),
    { kind: flow?.kind, size: flow?.size });
  check("visualiser pitch is within 0.05 of the archive's 1.4 step",
    near((K.forcesGarden.flowHalfExtents[0] * 2) / (flow.visualizeResolution - 1), K.forcesGarden.flowGridStep, 0.05),
    Number(((K.forcesGarden.flowHalfExtents[0] * 2) / (flow.visualizeResolution - 1)).toFixed(4)));

  // The mass probes carry the archive's authored range, colour rule and scale rule.
  const probes = Object.values(gardenState.byId).filter((e) => (e.tags ?? []).includes("mass-probe"));
  check("six mass probes", probes.length === 6, probes.length);
  const masses = probes.map((p) => p.physics.mass).sort((a, b) => a - b);
  check("mass range spans the archive's authored 0.55 .. 3.0",
    near(masses[0], K.forcesGarden.massRange[0], 1e-9) && near(masses[masses.length - 1], K.forcesGarden.massRange[1], 1e-9),
    masses);
  check("the archive colour rule holds on every probe",
    probes.every((p) => p.material.color.toLowerCase() ===
      (p.physics.mass < K.forcesGarden.massColourThreshold ? K.forcesGarden.massLightColour : K.forcesGarden.massHeavyColour)),
    probes.map((p) => [p.physics.mass, p.material.color]));
  check("every probe radius follows the archive scale rule 0.72 + mass*0.24",
    probes.every((p) => near(p.geometry.radius, Number((0.384 * K.forcesGarden.massScaleRule(p.physics.mass)).toFixed(3)), 1e-9)),
    probes.map((p) => [p.physics.mass, p.geometry.radius]));

  const walkers = gardenState.byId["forces-walkers"]?.flock;
  check("eighteen walkers, at the archive's member size and path-memory colour",
    walkers?.count === K.forcesGarden.walkerCount && near(walkers?.memberSize, K.forcesGarden.walkerSize, 1e-9) &&
    walkers?.trailColor.toLowerCase() === K.forcesGarden.walkerTrailColour,
    { count: walkers?.count, memberSize: walkers?.memberSize, trailColor: walkers?.trailColor });
  check("walkers are vehicles, not boids: alignment and cohesion zeroed",
    walkers?.alignment === 0 && walkers?.cohesion === 0,
    { alignment: walkers?.alignment, cohesion: walkers?.cohesion });
  check("the 420-sample path memory is capped at the platform's 48, as declared",
    walkers?.trailLength === 48 && K.forcesGarden.archiveWalkerTrailSamples === 420, walkers?.trailLength);

  // ---- Behaviour: the fields do work, and the law is mass-independent -------------------
  console.log("\n# forces-garden behaviour");
  const simulation = await page.evaluate(() => {
    const api = window.__GRAPHYSX__;
    const probeIds = api.state().entities.filter((e) => (e.tags ?? []).includes("mass-probe")).map((e) => e.id);
    const attractorAt = [0, 2.55, 0];
    const radiusOf = (position) => Math.hypot(position[0] - attractorAt[0], position[1] - attractorAt[1], position[2] - attractorAt[2]);
    const snapshot = () => {
      const state = api.state();
      const map = Object.fromEntries(state.entities.map((e) => [e.id, e]));
      return {
        radii: probeIds.map((id) => radiusOf(map[id].position)),
        masses: probeIds.map((id) => map[id].physics.mass),
        speeds: probeIds.map((id) => Math.hypot(...map[id].physics.linearVelocity)),
        attractorReading: {
          affected: map["forces-attractor-field"].forceField.affectedCount,
          peak: map["forces-attractor-field"].forceField.peakAcceleration,
        },
        flowReading: {
          affected: map["forces-flow-field"].forceField.affectedCount,
          peak: map["forces-flow-field"].forceField.peakAcceleration,
        },
        walkerSpeed: map["forces-walkers"].flock.averageSpeed,
        walkerLead: map["forces-walkers"].flock.leadPosition,
      };
    };
    api.pause(true);
    api.step(1 / 60);
    const start = snapshot();
    for (let i = 0; i < 240; i += 1) api.step(1 / 60);
    const end = snapshot();
    api.pause(false);
    return { probeIds, start, end };
  });

  check("the attractor field is actually touching bodies",
    simulation.end.attractorReading.affected >= 6 && simulation.end.attractorReading.peak > 0,
    simulation.end.attractorReading);
  check("the flow field is actually touching the walkers",
    simulation.end.flowReading.affected > 0 && simulation.end.flowReading.peak > 0,
    simulation.end.flowReading);
  check("every probe is still in the attractor's grip after four seconds",
    simulation.end.radii.every((r) => r > 0.5 && r < 11), simulation.end.radii.map((r) => Number(r.toFixed(2))));
  check("the probes are genuinely in motion",
    simulation.end.speeds.every((s) => s > 0.3), simulation.end.speeds.map((s) => Number(s.toFixed(2))));
  // THE lesson: acceleration is G/d^2 with no mass term, so probes launched identically must
  // stay together regardless of what they weigh. A mass-dependent law would fan them out.
  {
    const spread = Math.max(...simulation.end.radii) - Math.min(...simulation.end.radii);
    const massSpan = Math.max(...simulation.end.masses) - Math.min(...simulation.end.masses);
    check("the law is mass-independent: a 5.5x mass span leaves the probes on one orbit",
      spread < 0.35 && massSpan > 2,
      { orbitSpread: Number(spread.toFixed(4)), massSpan: Number(massSpan.toFixed(2)) });
  }
  check("the walkers are being steered by the flow field",
    simulation.end.walkerSpeed > 0.2 && distance(simulation.start.walkerLead, simulation.end.walkerLead) > 0.5,
    { averageSpeed: simulation.end.walkerSpeed, travelled: Number(distance(simulation.start.walkerLead, simulation.end.walkerLead).toFixed(3)) });

  // Interaction: a nudge must change a probe's velocity.
  const nudge = await page.evaluate(() => {
    const api = window.__GRAPHYSX__;
    api.pause(true);
    api.step(1 / 60);
    const read = () => api.state().entities.find((e) => e.id === "forces-mass-0").physics.linearVelocity;
    const before = read();
    api.interact("forces-mass-0", "nudge-mass-0");
    api.step(1 / 60);
    const after = read();
    api.pause(false);
    return { before, after };
  });
  check("nudging a probe changes its velocity",
    distance(nudge.before, nudge.after) > 1, Number(distance(nudge.before, nudge.after).toFixed(3)));

  const gardenRoundTrip = await page.evaluate(() => {
    const api = window.__GRAPHYSX__;
    const exported = api.export();
    api.load(exported);
    const state = api.state();
    const map = Object.fromEntries(state.entities.map((e) => [e.id, e]));
    return {
      reloadedEntities: state.entities.length,
      gravity: state.environment.physics.gravity,
      heights: map["forces-ground"].terrain.heights.length,
      attractorKind: map["forces-attractor-field"].forceField.kind,
      flowSize: map["forces-flow-field"].forceField.size,
      walkerAlignment: map["forces-walkers"].flock.alignment,
    };
  });
  check("forces garden survives export -> load, inline heights and all",
    gardenRoundTrip.reloadedEntities === gardenState.count &&
    gardenRoundTrip.gravity.every((v) => v === 0) && gardenRoundTrip.heights === 1089 &&
    gardenRoundTrip.attractorKind === "attractor" && gardenRoundTrip.walkerAlignment === 0,
    gardenRoundTrip);

  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(ART, "playground-forces-garden.png") });
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
console.log(`\nsmoke-playgrounds: ${failures.length ? "FAIL" : "PASS"}`);
process.exit(failures.length ? 1 : 0);
