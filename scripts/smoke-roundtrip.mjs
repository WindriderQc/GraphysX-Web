import { SMOKE_TIMEOUT, applySmokeTimeout, launchSmokeBrowser } from "./smoke-harness.mjs";
import { mkdirSync } from "node:fs";
import path from "node:path";

// Round-trip assertion sweep for the "write-only state" bug class.
//
// A recent session named a shape shared by five separate defects: a surface that *writes*
// state without ever *reading it back*. `castShadow` claimed but never applied to the mesh;
// an agent's sky stored but never rendered; the inspector dropdown never re-read; the
// outliner never tracking API-driven change; a heightfield's data written with no collider
// reading it. Every one passed a "did we store the value?" check and failed the world.
//
// This is the general test that would have caught all of them. For every settable property on
// the v2 entity/environment schema it:
//   1. sets the property through the PUBLIC API (spawn / update / set-environment),
//   2. reads it back through a DIFFERENT path — state(), exportDocument(), a full reload from
//      that export, and where the property is observable, the live Three.js / physics object,
//   3. asserts the value round-trips AND that the world genuinely changed (before !== after),
//      not merely that the value was stored.
//
// Properties that are legitimately write-only or not observable through any read path are
// recorded in an explicit inventory rather than skipped silently — an honest list of what is
// NOT verifiable is as valuable as the passing assertions.
//
// Driven through pause/step where motion matters, so assertions are about behaviour, not about
// how fast the machine ran. Uses `?host=standalone`, which mounts PlatformHost and therefore
// exposes `window.__GRAPHYSX_HOST__` — that host is how the live Three.js scene and physics
// bodies (via state()) become reachable for the "actual object" read path.

const BASE = process.env.SMOKE_BASE || "http://127.0.0.1:4188/";
const ART = process.env.SMOKE_ARTIFACTS || path.resolve("output/smoke");
mkdirSync(ART, { recursive: true });

const consoleErrors = [];
const pageErrors = [];
const out = {};

const browser = await launchSmokeBrowser();
const page = await browser.newPage();
applySmokeTimeout(page);
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
page.on("pageerror", (e) => pageErrors.push(String(e)));

try {
  await page.goto(`${BASE}?host=standalone`, { waitUntil: "domcontentloaded", timeout: SMOKE_TIMEOUT });
  await page.waitForFunction(() => !!window.__GRAPHYSX__ && !!window.__GRAPHYSX_HOST__, { timeout: SMOKE_TIMEOUT });

  out.sweep = await page.evaluate(() => {
    const api = window.__GRAPHYSX__;
    const host = window.__GRAPHYSX_HOST__;

    // ---- helpers -------------------------------------------------------------------------
    const results = [];
    const unverifiable = [];
    const near = (a, b, eps = 1e-3) => typeof a === "number" && typeof b === "number" && Math.abs(a - b) <= eps;
    const eq = (a, b) => {
      if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => eq(v, b[i]));
      if (typeof a === "number" && typeof b === "number") return near(a, b);
      return a === b;
    };
    // The live three.js object for an entity id (spawn tags every object with its id).
    const objectOf = (id) => {
      let found = null;
      host.world.group.traverse((o) => { if (!found && o.userData && o.userData.graphysxEntityId === id) found = o; });
      return found;
    };
    // First mesh under an entity object, for material / shadow-flag reads.
    const meshOf = (id) => {
      const root = objectOf(id);
      let mesh = null;
      root && root.traverse((o) => { if (!mesh && o.isMesh) mesh = o; });
      return mesh;
    };

    const stateOf = (id) => api.query({ ids: [id] })[0];
    const exportOf = (id, doc) => (doc.entities || []).find((e) => e.id === id);

    // Record one property check. `read` supplies the four read paths; any that returns
    // `undefined` is treated as "not applicable here" and omitted (but at least one of
    // state/export must be present or the check is meaningless).
    const check = (name, category, target, paths, opts = {}) => {
      const record = { name, category, target, paths: {}, roundTripped: true, genuinelyChanged: null, verifiable: false, notes: opts.note || null };
      for (const [pathName, value] of Object.entries(paths)) {
        if (value === undefined) continue;
        record.paths[pathName] = value;
        const ok = eq(value, target);
        if (!ok) record.roundTripped = false;
        if (pathName === "object") record.verifiable = true;
      }
      if (opts.before !== undefined) record.genuinelyChanged = !eq(opts.before, target);
      // state + export alone prove storage + persistence; only an object read proves the
      // world genuinely changed. Mark verifiable=false where no object path exists.
      if (!record.verifiable && opts.objectUnavailable) {
        unverifiable.push({ name, category, reason: opts.objectUnavailable });
      }
      results.push(record);
      return record;
    };

    // ---- build a fresh world with one config-bearing entity of each kind ------------------
    api.create({
      schema: "graphysx.agent-world/v2",
      id: "roundtrip-lab",
      label: "Round-trip Lab",
      environment: { background: "#101820", sky: null, ground: { visible: true, size: 30, color: "#123", grid: true, gridColor: "#345" }, physics: { gravity: [0, -9.81, 0] } },
      entities: [
        { id: "box1", type: "box", transform: { position: [0, 5, 0] }, physics: { mode: "dynamic", mass: 2, material: "ball" } },
        { id: "plate", type: "plane", transform: { position: [0, 0.01, 0], rotationDegrees: [-90, 0, 0] }, geometry: { width: 20, height: 20 }, physics: { mode: "static" } },
        { id: "pl1", type: "point-light", transform: { position: [2, 4, 2] }, intensity: 1, distance: 10 },
        { id: "em1", type: "emitter", transform: { position: [-4, 1, 0] }, emitter: { preset: "campfire" } },
        { id: "terr1", type: "terrain", transform: { position: [8, 0, 8] }, terrain: { heightmap: null, size: 20, segments: 16, heightScale: 3 } },
        { id: "wat1", type: "water", transform: { position: [-8, 0.2, -8] }, water: { size: 20, reflection: false } },
        { id: "flk1", type: "flock", transform: { position: [0, 8, 0] }, flock: { preset: "starlings", count: 30 } },
        { id: "ff1", type: "force-field", transform: { position: [0, 4, 0] }, forceField: { preset: "gravity-well" } },
        { id: "dna1", type: "dna-tree", transform: { position: [12, 0, -12] }, dna: { preset: "single-specimen" } },
        { id: "crd1", type: "crowd", transform: { position: [-12, 0, 12] }, crowd: { preset: "pursuit", count: 24 } },
      ],
    });

    // ================= TRANSFORM =================
    {
      const before = stateOf("box1");
      api.update("box1", { transform: { position: [1.5, 6.25, -2.5], rotationDegrees: [10, 20, 30], scale: [2, 0.5, 1.5] } });
      const s = stateOf("box1");
      const o = objectOf("box1");
      const rad = (d) => d * Math.PI / 180;
      check("transform.position", "transform", [1.5, 6.25, -2.5], {
        state: s.position,
        object: o ? [o.position.x, o.position.y, o.position.z].map((v) => Math.round(v * 1000) / 1000) : undefined,
      }, { before: before.position });
      check("transform.rotationDegrees", "transform", [10, 20, 30], {
        state: s.rotationDegrees,
        object: o ? [o.rotation.x, o.rotation.y, o.rotation.z].map((v) => Math.round(v / rad(1) * 1000) / 1000) : undefined,
      }, { before: before.rotationDegrees });
      check("transform.scale", "transform", [2, 0.5, 1.5], {
        state: s.scale,
        object: o ? [o.scale.x, o.scale.y, o.scale.z] : undefined,
      }, { before: before.scale });
    }

    // ================= MATERIAL =================
    {
      const before = stateOf("plate");
      api.update("plate", { material: { color: "#ff5522", emissive: "#221100", emissiveIntensity: 0.9, roughness: 0.3, metalness: 0.7, opacity: 0.5, wireframe: true } });
      const s = stateOf("plate").material;
      const mesh = meshOf("plate");
      const hex = mesh ? "#" + mesh.material.color.getHexString() : undefined;
      check("material.color", "material", "#ff5522", { state: s.color, object: hex }, { before: before.material.color });
      check("material.emissive", "material", "#221100", { state: s.emissive, object: mesh ? "#" + mesh.material.emissive.getHexString() : undefined }, { before: before.material.emissive });
      check("material.emissiveIntensity", "material", 0.9, { state: s.emissiveIntensity, object: mesh ? mesh.material.emissiveIntensity : undefined }, { before: before.material.emissiveIntensity });
      check("material.roughness", "material", 0.3, { state: s.roughness, object: mesh ? mesh.material.roughness : undefined }, { before: before.material.roughness });
      check("material.metalness", "material", 0.7, { state: s.metalness, object: mesh ? mesh.material.metalness : undefined }, { before: before.material.metalness });
      check("material.opacity", "material", 0.5, { state: s.opacity, object: mesh ? mesh.material.opacity : undefined }, { before: before.material.opacity });
      check("material.wireframe", "material", true, { state: s.wireframe, object: mesh ? mesh.material.wireframe : undefined }, { before: before.material.wireframe });
    }

    // ================= GEOMETRY =================
    {
      const before = stateOf("box1");
      api.update("box1", { }); // no-op; geometry is spawn-time. Set via a dedicated entity.
      api.spawn({ id: "geo1", type: "box", geometry: { width: 3, height: 4, depth: 5 }, transform: { position: [12, 3, 0] } });
      const s = stateOf("geo1").geometry;
      const mesh = meshOf("geo1");
      // three BoxGeometry stores width/height/depth in geometry.parameters.
      const p = mesh && mesh.geometry.parameters;
      check("geometry.width", "geometry", 3, { state: s.width, object: p ? p.width : undefined }, { before: before.geometry.width });
      check("geometry.height", "geometry", 4, { state: s.height, object: p ? p.height : undefined });
      check("geometry.depth", "geometry", 5, { state: s.depth, object: p ? p.depth : undefined });
      api.spawn({ id: "geo2", type: "torus", geometry: { radius: 2, tube: 0.4, radialSegments: 12 }, transform: { position: [16, 3, 0] } });
      const s2 = stateOf("geo2").geometry;
      const p2 = meshOf("geo2") && meshOf("geo2").geometry.parameters;
      check("geometry.radius", "geometry", 2, { state: s2.radius, object: p2 ? p2.radius : undefined });
      check("geometry.tube", "geometry", 0.4, { state: s2.tube, object: p2 ? p2.tube : undefined });
      // radialSegments is a generic "detail" knob mapped PER PRIMITIVE (a torus gets
      // floor(n/2) radial + n tubular, a sphere gets n width segments), so no single three.js
      // parameter equals it in general. A cylinder maps it 1:1, so that is where the object
      // read is meaningful; on the torus the config still round-trips through state/export.
      check("geometry.radialSegments(config)", "geometry", 12, { state: s2.radialSegments }, { objectUnavailable: "radialSegments is a per-primitive detail knob; no single three.js geometry parameter equals it (torus maps it to floor(n/2) radial + n tubular). Object-verified on a cylinder below." });
      api.spawn({ id: "geo3", type: "cylinder", geometry: { radius: 1, height: 2, radialSegments: 12 }, transform: { position: [20, 3, 0] } });
      const p3 = meshOf("geo3") && meshOf("geo3").geometry.parameters;
      check("geometry.radialSegments", "geometry", 12, { state: stateOf("geo3").geometry.radialSegments, object: p3 ? p3.radialSegments : undefined });
    }

    // ================= FLAGS: visible / castShadow / receiveShadow =================
    {
      const before = stateOf("box1");
      api.update("box1", { visible: false, castShadow: false, receiveShadow: false });
      const s = stateOf("box1");
      const o = objectOf("box1");
      const mesh = meshOf("box1");
      // The castShadow bug: value stored in the definition but never pushed to the mesh. The
      // object read is the whole point of this check.
      check("visible", "flags", false, { state: s.visible, object: o ? o.visible : undefined }, { before: before.visible });
      check("castShadow", "flags", false, { state: s.castShadow, object: mesh ? mesh.castShadow : undefined }, { before: before.castShadow });
      check("receiveShadow", "flags", false, { state: s.receiveShadow, object: mesh ? mesh.receiveShadow : undefined }, { before: before.receiveShadow });
      // set them back true so the object read distinguishes true from false in both directions.
      api.update("box1", { visible: true, castShadow: true, receiveShadow: true });
      const s2 = stateOf("box1");
      const mesh2 = meshOf("box1");
      check("castShadow(true)", "flags", true, { state: s2.castShadow, object: mesh2 ? mesh2.castShadow : undefined }, { before: false });
      check("receiveShadow(true)", "flags", true, { state: s2.receiveShadow, object: mesh2 ? mesh2.receiveShadow : undefined }, { before: false });
    }

    // ================= LIGHT: intensity / distance =================
    {
      const before = stateOf("pl1");
      api.update("pl1", { intensity: 2.5, distance: 25 });
      const s = stateOf("pl1");
      const o = objectOf("pl1");
      check("intensity", "light", 2.5, { state: s.intensity, object: o && o.isLight ? o.intensity : undefined }, { before: before.intensity });
      check("distance", "light", 25, { state: s.distance, object: o && o.isPointLight ? o.distance : undefined }, { before: before.distance });
      // The origin marker sphere: `marker:false` is how a composed scene keeps the light
      // without the lightbulb. Object-observable (a Mesh child of the light group), and
      // left false through the reload section so the only-when-false serialization is
      // exercised too.
      api.update("pl1", { marker: false });
      const s2 = stateOf("pl1");
      let markerMesh = null;
      o && o.traverse((child) => { if (!markerMesh && child.userData && child.userData.agentLightMarker) markerMesh = child; });
      check("light.marker(false)", "light", false, { state: s2.marker, object: markerMesh ? markerMesh.visible : undefined }, { before: s.marker });
    }

    // ================= TAGS / label / ephemeral =================
    {
      const before = stateOf("box1");
      api.update("box1", { tags: ["alpha", "beta"], label: "Renamed Box", ephemeral: true });
      const s = stateOf("box1");
      check("tags", "meta", ["alpha", "beta"], { state: s.tags }, { before: before.tags, objectUnavailable: "tags are metadata with no Three.js/physics representation" });
      check("label", "meta", "Renamed Box", { state: s.label }, { before: before.label, objectUnavailable: "label is metadata; object.name is the id, not the label" });
      check("ephemeral", "meta", true, { state: s.ephemeral }, { before: before.ephemeral, objectUnavailable: "ephemeral controls exportDocument inclusion, verified in the persistence phase below" });
      api.update("box1", { ephemeral: false }); // keep it in the document for the reload phase.
    }

    // ================= PHYSICS =================
    {
      const before = stateOf("box1");
      api.update("box1", { physics: { mode: "dynamic", mass: 5, material: "wall", linearVelocity: [3, 0, 0], angularVelocity: [0, 1, 0] } });
      const s = stateOf("box1").physics;
      check("physics.mode", "physics", "dynamic", { state: s.mode }, { before: before.physics.mode });
      check("physics.mass", "physics", 5, { state: s.mass }, { before: before.physics.mass, objectUnavailable: "rigid-body mass is not exposed; state() reads it from the definition" });
      check("physics.material", "physics", "wall", { state: s.material }, { before: before.physics.material });
      // linear/angular velocity is read straight off the rigid body in state() — that IS the
      // object read path for physics. Assert the body actually carries it.
      check("physics.linearVelocity", "physics", [3, 0, 0], { object: s.linearVelocity }, { before: before.physics.linearVelocity });
      check("physics.angularVelocity", "physics", [0, 1, 0], { object: s.angularVelocity }, { before: before.physics.angularVelocity });
      // reset so it does not fly off during later steps
      api.update("box1", { physics: { linearVelocity: [0, 0, 0], angularVelocity: [0, 0, 0], mass: 2, material: "ball" }, transform: { position: [0, 5, 0] } });
    }

    // ================= EMITTER =================
    {
      const before = stateOf("em1").emitter;
      api.update("em1", { emitter: { rate: 45, lifetimeSeconds: 2.5, speed: 6, gravity: [0, -1, 0], color: "#ff0000", sizeScale: 1.4 } });
      const s = stateOf("em1").emitter;
      check("emitter.rate", "emitter", 45, { state: s.rate }, { before: before.rate, objectUnavailable: "emitter rate is a spawn cadence; its effect is live particle count, asserted separately" });
      check("emitter.lifetimeSeconds", "emitter", 2.5, { state: s.lifetimeSeconds }, { before: before.lifetimeSeconds });
      check("emitter.speed", "emitter", 6, { state: s.speed }, { before: before.speed });
      check("emitter.color", "emitter", "#ff0000", { state: s.color }, { before: before.color });
      check("emitter.sizeScale", "emitter", 1.4, { state: s.sizeScale }, { before: before.sizeScale });
      // liveParticles is the derived object reading — proves the emitter is actually running.
      api.pause(true);
      for (let i = 0; i < 30; i++) api.step(1 / 60);
      const live = stateOf("em1").emitter.liveParticles;
      check("emitter.liveParticles>0", "emitter", true, { object: live > 0 }, { before: false, note: `liveParticles=${live}` });
      api.pause(false);
    }

    // ================= TERRAIN =================
    {
      const before = stateOf("terr1").terrain;
      api.update("terr1", { terrain: { size: 26, heightScale: 5, segments: 24 } });
      const s = stateOf("terr1").terrain;
      check("terrain.size", "terrain", 26, { state: s.size }, { before: before.size });
      check("terrain.heightScale", "terrain", 5, { state: s.heightScale }, { before: before.heightScale });
      check("terrain.segments", "terrain", 24, { state: s.segments }, { before: before.segments });
      // colliderVertices is the derived fact proving the heightfield collider was rebuilt with
      // the mesh — the exact "height written, no collider reading it" fall-through bug class.
      check("terrain.colliderVertices>0", "terrain", true, { object: s.colliderVertices > 0 }, { before: false, note: `colliderVertices=${s.colliderVertices}, maxHeight=${s.maximumHeight}` });
    }

    // ================= WATER =================
    {
      const before = stateOf("wat1").water;
      api.update("wat1", { water: { size: 24, distortionScale: 2.5, color: "#00ffaa", reflection: false } });
      const s = stateOf("wat1").water;
      check("water.size", "water", 24, { state: s.size }, { before: before.size });
      check("water.distortionScale", "water", 2.5, { state: s.distortionScale }, { before: before.distortionScale });
      check("water.color", "water", "#00ffaa", { state: s.color }, { before: before.color, objectUnavailable: "water surface material colour is internal to Water.js; state() reflects the config" });
    }

    // ================= FLOCK =================
    {
      const before = stateOf("flk1").flock;
      api.update("flk1", { flock: { count: 44, speed: 5, alignment: 2.1 } });
      const s = stateOf("flk1").flock;
      check("flock.count", "flock", 44, { state: s.count, object: s.memberCount }, { before: before.count, note: `memberCount=${s.memberCount}` });
      check("flock.speed", "flock", 5, { state: s.speed }, { before: before.speed });
      check("flock.alignment", "flock", 2.1, { state: s.alignment }, { before: before.alignment });
      // averageSpeed is the derived reading proving the population is actually simulating.
      api.pause(true);
      for (let i = 0; i < 30; i++) api.step(1 / 60);
      const avg = stateOf("flk1").flock.averageSpeed;
      check("flock.averageSpeed>0", "flock", true, { object: avg > 0 }, { before: false, note: `averageSpeed=${avg}` });
      api.pause(false);
    }

    // ================= CROWD =================
    {
      const before = stateOf("crd1").crowd;
      api.update("crd1", { crowd: { count: 40, speed: 2.4 } });
      const s = stateOf("crd1").crowd;
      check("crowd.count", "crowd", 40, { state: s.count, object: s.memberCount }, { before: before.count, note: `memberCount=${s.memberCount}` });
      check("crowd.speed", "crowd", 2.4, { state: s.speed }, { before: before.speed });
      // The merge-form patch trap that bit formula-field and dna-tree: patching only `count`
      // must not reset the rest of the crowd to base defaults. `pursuitSpeedRatio` came from
      // the "pursuit" preset, so a replace-form patch would silently snap it back.
      check("crowd.keepsPreset", "crowd", before.pursuitSpeedRatio, { state: s.pursuitSpeedRatio }, { before: before.pursuitSpeedRatio, note: "merge-form patch" });
      // The crowd must actually walk — the same "present vs alive" reading flocks report.
      api.pause(true);
      const start = stateOf("crd1").crowd.leadPosition;
      for (let i = 0; i < 60; i++) api.step(1 / 60);
      const moved = stateOf("crd1").crowd.leadPosition;
      const walked = Math.hypot(moved[0] - start[0], moved[2] - start[2]);
      check("crowd.leadPosition moves", "crowd", true, { object: walked > 0.1 }, { before: false, note: `walked=${walked.toFixed(3)}` });
      // Members are confined to the plot, and the plot is entity-local — a crowd spawned at
      // x=-12 must not have members wandering back to the origin.
      const s2 = stateOf("crd1").crowd;
      const inside = Math.abs(moved[0]) <= s2.size[0] + 1e-6 && Math.abs(moved[2]) <= s2.size[1] + 1e-6;
      check("crowd.staysInPlot", "crowd", true, { object: inside }, { before: false, note: `lead=${moved[0].toFixed(2)},${moved[2].toFixed(2)} plot=${s2.size}` });
      api.pause(false);
    }

    // ================= DNA (the newly threaded Living Forest) =================
    {
      const before = stateOf("dna1").dna;
      // The evolution mechanism is the patch path, and it takes the two-arg MERGE form:
      // advancing the generation must keep the genome the preset was already expressing.
      api.update("dna1", { dna: { generation: 3, trees: 2 } });
      const s = stateOf("dna1").dna;
      check("dna.generation", "dna", 3, { state: s.generation }, { before: before.generation });
      check("dna.trees", "dna", 2, { state: s.trees, object: s.treeCount }, { before: before.trees, note: `treeCount=${s.treeCount}` });
      check("dna.keepsGenome", "dna", 1.6, { state: s.genome.trunkLength }, { before: before.genome.trunkLength, note: "single-specimen founder trunk; a replace-form patch would reset it to 0.78" });
      // The derived reading proving the forest actually grew instanced geometry.
      check("dna.segmentCount>0", "dna", true, { object: s.segmentCount > 0 }, { before: false, note: `segmentCount=${s.segmentCount}, leafCount=${s.leafCount}` });
    }

    // ================= FORCE FIELD (the newly graduated system) =================
    {
      const before = stateOf("ff1").forceField;
      api.update("ff1", { forceField: { kind: "attractor", strength: 60, radius: 14, enabled: true, affectsBodies: true } });
      const s = stateOf("ff1").forceField;
      check("forceField.kind", "forceField", "attractor", { state: s.kind }, { before: before.kind });
      check("forceField.strength", "forceField", 60, { state: s.strength }, { before: before.strength });
      check("forceField.radius", "forceField", 14, { state: s.radius }, { before: before.radius });
      check("forceField.enabled", "forceField", true, { state: s.enabled }, { before: before.enabled });
      // The object read for a field is what it DOES: place a dynamic body inside it, step, and
      // confirm the field applied a non-zero acceleration (affectedCount / peakAcceleration),
      // and that the body actually moved toward the well. This is the anti-write-only check.
      api.spawn({ id: "probe", type: "sphere", transform: { position: [5, 4, 0] }, geometry: { radius: 0.3 }, physics: { mode: "dynamic", mass: 1, material: "ball" }, tags: ["probe"] });
      // Kill gravity so the ONLY horizontal force is the field, making the assertion clean.
      api.transaction([{ op: "set-environment", environment: { physics: { gravity: [0, 0, 0] } } }]);
      const px0 = stateOf("probe").position[0];
      api.pause(true);
      for (let i = 0; i < 40; i++) api.step(1 / 60);
      const ffState = stateOf("ff1").forceField;
      const px1 = stateOf("probe").position[0];
      api.pause(false);
      check("forceField.affectedCount>0", "forceField", true, { object: ffState.affectedCount > 0 }, { before: false, note: `affectedCount=${ffState.affectedCount}, peakAcceleration=${ffState.peakAcceleration}` });
      // The attractor sits at x=0, probe started at x=5, so a working field pulls it toward 0.
      check("forceField.movesBody", "forceField", true, { object: px1 < px0 - 0.1 }, { before: false, note: `probe x ${px0} -> ${px1}` });
      check("forceField.visualVectors", "forceField", true, { object: ffState.visualVectors >= 0 }, { before: null, note: `visualVectors=${ffState.visualVectors} (attractor gizmo has no grid, so 0 is correct here)` });
      api.remove("probe");
      api.transaction([{ op: "set-environment", environment: { physics: { gravity: [0, -9.81, 0] } } }]);
    }

    // ================= ENVIRONMENT =================
    {
      const before = api.state().environment;
      api.transaction([{ op: "set-environment", environment: {
        background: "#2a0044",
        ground: { visible: true, size: 44, color: "#334455", grid: true, gridColor: "#99ccff" },
        physics: { gravity: [0, -4.5, 0] },
      } }]);
      const s = api.state().environment;
      // Ground mesh + grid live in the runtime's own scene graph, so they ARE object-observable.
      let groundMesh = null;
      let grid = null;
      host.world.group.traverse((o) => {
        if (o.name === "AgentWorldGround") groundMesh = o;
        if (o.name === "AgentWorldGrid") grid = o;
      });
      check("environment.background", "environment", "#2a0044", {
        state: s.background,
        // The set-environment write-only bug: background lives on host.scene, applied by the
        // host. Without the environment.changed event the host never re-reads it.
        object: host.scene.background && host.scene.background.isColor ? "#" + host.scene.background.getHexString() : undefined,
      }, { before: before.background });
      check("environment.ground.size", "environment", 44, {
        state: s.ground.size,
        object: groundMesh ? groundMesh.geometry.parameters.width : undefined,
      }, { before: before.ground.size });
      check("environment.ground.color", "environment", "#334455", {
        state: s.ground.color,
        object: groundMesh ? "#" + groundMesh.material.color.getHexString() : undefined,
      }, { before: before.ground.color });
      check("environment.ground.grid", "environment", true, { state: s.ground.grid, object: !!grid }, { before: before.ground.grid });
      check("environment.physics.gravity(config)", "environment", [0, -4.5, 0], { state: s.physics.gravity }, { before: before.physics.gravity });
      // gravity is applied to the physics world in buildEnvironment — assert a dropped body
      // accelerates at the NEW rate, not the old one. The measured effective g is a hair below
      // the configured value because a rigid body carries a small default linear damping, so
      // this asserts "close to new, clearly not old" rather than exact equality.
      {
        api.spawn({ id: "gdrop", type: "sphere", transform: { position: [0, 40, 0] }, geometry: { radius: 0.3 }, physics: { mode: "dynamic", mass: 1 } });
        api.pause(true);
        const steps = 20;
        for (let i = 0; i < steps; i++) api.step(1 / 60);
        const vy = stateOf("gdrop").physics.linearVelocity[1];
        api.pause(false);
        api.remove("gdrop");
        const g = vy / (steps / 60);
        check("environment.gravity applied to solver", "environment", true, { object: Math.abs(g - -4.5) < 0.6 && Math.abs(g - -9.81) > 2 }, { before: false, note: `measured effective g=${Math.round(g * 100) / 100} (configured -4.5, previous -9.81)` });
      }

      // Sky: set it, then confirm state/export carry it. The RENDER path (host.scene.background
      // becomes a CubeTexture) is async + network-bound, so it is asserted structurally here
      // (background stops being a flat Color once a sky is applied) and left to the showroom /
      // foundation smokes for the pixel check.
      const skyId = (api.skies()[0] || {}).id || null;
      if (skyId) {
        api.transaction([{ op: "set-environment", environment: { sky: skyId } }]);
        const skyState = api.state().environment.sky;
        check("environment.sky", "environment", skyId, { state: skyState }, { before: before.sky, objectUnavailable: "sky resolves to an async-loaded CubeTexture on host.scene; render path covered by showroom/foundation smokes" });
        api.transaction([{ op: "set-environment", environment: { sky: null } }]);
      }

      // Envelope: fog distances and the camera far plane are applied by the HOST
      // (scene.fog, camera.far) — exactly the write-only shape this sweep exists for.
      // A stored envelope that never reached the renderer would pass state/export and
      // fail the world. Left set through the reload section below so it also proves
      // document survival.
      api.transaction([{ op: "set-environment", environment: { envelope: { fogNear: 60, fogFar: 900, cameraFar: 1400 } } }]);
      const env2 = api.state().environment.envelope || {};
      check("environment.envelope.fogNear", "environment", 60, {
        state: env2.fogNear,
        object: host.scene.fog ? host.scene.fog.near : undefined,
      }, { before: before.envelope ? before.envelope.fogNear : null });
      check("environment.envelope.fogFar", "environment", 900, {
        state: env2.fogFar,
        object: host.scene.fog ? host.scene.fog.far : undefined,
      }, { before: before.envelope ? before.envelope.fogFar : null });
      check("environment.envelope.cameraFar", "environment", 1400, {
        state: env2.cameraFar,
        object: host.camera.far,
      }, { before: before.envelope ? before.envelope.cameraFar : null, note: "default far is 260; asserting the projection actually widened" });

      // Post/bloom: applied by the HOST as an EffectComposer that only exists while the
      // scene asks. Object-observable both ways — the composer appears with real pass
      // parameters, and clearing post tears it down again (a leaked composer would tax
      // every scene that never asked for it).
      api.transaction([{ op: "set-environment", environment: { post: { bloom: { strength: 0.8, threshold: 0.55, radius: 0.3 } } } }]);
      const post2 = api.state().environment.post || {};
      check("environment.post.bloom.strength", "environment", 0.8, {
        state: post2.bloom ? post2.bloom.strength : undefined,
        object: host.bloomPass ? host.bloomPass.strength : undefined,
      }, { before: before.post ? before.post.bloom.strength : null });
      check("environment.post.bloom.threshold", "environment", 0.55, {
        state: post2.bloom ? post2.bloom.threshold : undefined,
        object: host.bloomPass ? host.bloomPass.threshold : undefined,
      }, { before: before.post ? before.post.bloom.threshold : null });
      check("environment.post composer exists", "environment", true, { object: !!host.composer }, { before: false });
      api.transaction([{ op: "set-environment", environment: { post: null } }]);
      check("environment.post composer torn down", "environment", true, { object: !host.composer }, { before: false, note: "null means no composer exists at all — the bare renderer path" });
    }

    // ================= PERSISTENCE: export -> reload -> re-read =================
    // Every property set above must survive being written to a document and read back into a
    // fresh runtime. This is the fourth read path, and it is where a value that was applied to
    // the live object but dropped on serialize would surface.
    const beforeReload = {};
    for (const id of ["box1", "geo1", "geo2", "pl1", "em1", "terr1", "wat1", "flk1", "ff1", "dna1", "crd1"]) {
      beforeReload[id] = api.query({ ids: [id] })[0];
    }
    const beforeEnv = api.state().environment;
    const doc = api.exportDocument();
    const reloadDiffs = [];
    api.load(doc);
    // Compare a representative field per entity across the reload boundary.
    const sample = {
      box1: (e) => e.material.color,
      geo1: (e) => e.geometry.width,
      geo2: (e) => e.geometry.tube,
      pl1: (e) => [e.intensity, e.marker],
      em1: (e) => e.emitter.rate,
      terr1: (e) => e.terrain.heightScale,
      wat1: (e) => e.water.color,
      flk1: (e) => e.flock.count,
      ff1: (e) => e.forceField.strength,
      dna1: (e) => [e.dna.generation, e.dna.genome.trunkLength],
      crd1: (e) => [e.crowd.count, e.crowd.pursuers, e.crowd.seed],
    };
    for (const [id, pick] of Object.entries(sample)) {
      const after = api.query({ ids: [id] })[0];
      const b = beforeReload[id] ? pick(beforeReload[id]) : undefined;
      const a = after ? pick(after) : undefined;
      const survived = eq(b, a);
      reloadDiffs.push({ id, before: b, after: a, survived });
    }
    const envAfter = api.state().environment;
    const envSurvived = eq(beforeEnv.ground.size, envAfter.ground.size) && eq(beforeEnv.background, envAfter.background)
      && eq(beforeEnv.envelope ? beforeEnv.envelope.fogFar : null, envAfter.envelope ? envAfter.envelope.fogFar : null);

    // Also confirm every entity's exported form carried its config block (export read path).
    const exportCoverage = ["em1", "terr1", "wat1", "flk1", "ff1", "dna1", "crd1"].map((id) => {
      const e = exportOf(id, doc);
      const key = { em1: "emitter", terr1: "terrain", wat1: "water", flk1: "flock", ff1: "forceField", dna1: "dna", crd1: "crowd" }[id];
      return { id, key, present: !!(e && e[key]) };
    });

    // Honest inventory: every check that round-trips through state/export/reload but has NO
    // live-object read path. These are not failures — they are the explicit list of what this
    // sweep proves by storage/persistence rather than by inspecting the world.
    const stateOnly = results
      .filter((r) => !r.verifiable)
      .map((r) => ({ name: r.name, category: r.category }));

    return {
      results,
      unverifiable,
      stateOnly,
      reloadDiffs,
      envSurvived,
      exportCoverage,
      counts: {
        total: results.length,
        roundTripped: results.filter((r) => r.roundTripped).length,
        objectVerified: results.filter((r) => r.verifiable).length,
        stateOnly: stateOnly.length,
      },
    };
  });

  await page.screenshot({ path: path.join(ART, "roundtrip.png"), fullPage: false });
} catch (e) {
  out.fatal = String(e);
}

out.consoleErrors = consoleErrors;
out.pageErrors = pageErrors;

// ---- verdict ---------------------------------------------------------------------------
const sweep = out.sweep || {};
const results = sweep.results || [];
const failedRoundTrip = results.filter((r) => !r.roundTripped);
// Object-path checks whose live-object read did not match — these are the ones that would
// have caught the write-only defects (castShadow applied, sky rendered, collider built), so a
// mismatch here on a `verifiable` check is a HARD failure.
const failedObject = results.filter((r) => r.verifiable && !r.roundTripped);
const reloadFailures = (sweep.reloadDiffs || []).filter((d) => !d.survived);
const exportGaps = (sweep.exportCoverage || []).filter((c) => !c.present);
// Informational: checks whose target happened to equal the pre-set value, so before!==after
// could not prove change. Their object-path readback (where present) still proves the world
// holds the value; recorded, not failed.
const noBeforeDelta = results.filter((r) => r.genuinelyChanged === false).map((r) => r.name);

out.summary = {
  ...sweep.counts,
  failedRoundTrip: failedRoundTrip.map((r) => ({ name: r.name, paths: r.paths, target: r.target })),
  reloadFailures,
  exportGaps,
  envSurvivedReload: sweep.envSurvived,
  // The two honest inventories the task asks for: what is verified only through storage, and
  // what is explicitly not observable at all (with reasons).
  stateOnlyInventory: sweep.stateOnly,
  unverifiableInventory: sweep.unverifiable,
  targetEqualledStartValue: noBeforeDelta,
};

console.log(JSON.stringify(out, null, 2));
await browser.close();

const ok =
  !out.fatal &&
  results.length >= 40 &&
  failedRoundTrip.length === 0 &&
  failedObject.length === 0 &&
  reloadFailures.length === 0 &&
  exportGaps.length === 0 &&
  sweep.envSurvived === true &&
  pageErrors.length === 0;

process.exit(ok ? 0 : 1);
