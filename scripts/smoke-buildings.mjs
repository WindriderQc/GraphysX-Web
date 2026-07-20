import { mkdirSync } from "node:fs";
import path from "node:path";
import { SMOKE_TIMEOUT, applySmokeTimeout, launchSmokeBrowser } from "./smoke-harness.mjs";
import { startStaticServer } from "./static-server.mjs";
import {
  ARCHIVE_BUILDINGS,
  ARCHIVE_BUILDINGS_CONSTANTS,
  ARCHIVE_BUILDINGS_NOT_REVIVED,
  buildArchiveBuilding,
} from "../src/archive-buildings.ts";
import MAISON_RECORD from "../src/legacy/inspection-maison.json" with { type: "json" };

/**
 * Proves the recovered Maison in `src/archive-buildings.ts` is a living scene rather than
 * valid data.
 *
 * ## How this drives the real module
 *
 * `archive-buildings.ts` has **no runtime imports** — only a JSON import and type imports —
 * so this script imports the shipped module directly and pushes the exact definition it
 * produces into the BUILT page through `window.__GRAPHYSX__.create()`. Nothing is re-typed
 * here, so a change to the scene is a change to what is asserted. Until the lead wires a
 * compose call into a front-door route the module is not in the bundle; the *scene* is
 * therefore fully verified and only its *reachability from the UI* is not.
 *
 * It joins the gate's server when `SMOKE_BASE` is set and only stands up its own on port 4515
 * when run standalone — two static servers in one gate run is exactly the multi-fleet
 * contention that produces false reds.
 *
 * ## What is asserted, and why each one
 *
 * - **The scene really is the archive record.** This file re-reads
 *   `src/legacy/inspection-maison.json` itself and re-derives every expected position and size
 *   independently of the scene builder, then checks the LIVE runtime state against it. The
 *   fidelity claim is "the transforms are the record's under one axis change", so it is
 *   checked object by object against the record rather than against a constant in the module.
 * - **The conversion's precondition holds.** The Euler mapping is only exact because no mesh
 *   rotates about more than one axis. That is asserted, not assumed.
 * - **Nothing was dropped or merged.** All 24 meshes and all 6 lamps materialise, and the
 *   record's own vertex/polygon totals are checked to confirm this really is a box massing
 *   model (216 verts / 148 polys over 24 objects) rather than a mesh archive.
 * - **The lamps carry their recovered falloff.** `distance` 25 ×5 and ~30 ×1, verbatim.
 * - **Every asset the page fetched came back 200.** A 404 leaves a valid-looking empty scene,
 *   so responses are watched rather than entity counts trusted. This scene loads no models, so
 *   the assertion is that it requests none and that the sky it does request resolves.
 * - **The interaction works.** Lifting the living floor must actually hide the upper storey's
 *   children, which is the whole reason the storey is a group.
 * - **Export → load.** The scene claims to be an ordinary v2 document.
 * - **Zero console/page errors**, and a screenshot.
 */

const PORT = Number(process.env.SMOKE_PORT || 4515);
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

const consoleErrors = [];
const pageErrors = [];
const badResponses = [];
const requestedAssets = [];
let server;
let browser;

// ---- Independent re-derivation from the archive record --------------------------------
// Deliberately a second implementation of the conversion. If the module and this file agree
// on 24 objects' positions, the conversion is right; if someone "fixes" one, this goes red.
const RECORD_MESHES = MAISON_RECORD.objects.filter((o) => o.type === "MESH");
const RECORD_LAMPS = MAISON_RECORD.objects.filter((o) => o.type === "LAMP");
const expectPosition = (loc) => [loc[0], loc[2], -loc[1]];
const expectSize = (dim) => [dim[0], dim[2], dim[1]];

/**
 * `state()` mixes reference frames — see `agent-world-runtime.ts:2334-2349`. `position` is
 * `object.getWorldPosition()`, but `rotationDegrees` and `scale` are read straight off
 * `object.rotation` / `object.scale`, which are LOCAL. Everything is then passed through
 * `roundVector`. So a child of the staged site group reports a world position and a local
 * scale of 1, and comparing a live position against the archive's local coordinate fails
 * even when the scene is exactly right.
 *
 * The fidelity claim is about the authored document, so it is checked there — exactly, with
 * no staging in the way. This helper then re-applies the site transform independently so the
 * LIVE world position is checked too, which is what proves the runtime honoured it.
 */
const K = ARCHIVE_BUILDINGS_CONSTANTS.maison;
function stage(local) {
  const radians = (K.siteYawDegrees * Math.PI) / 180;
  const [x, y, z] = local.map((v) => v * K.siteScale);
  return [
    K.sitePosition[0] + x * Math.cos(radians) + z * Math.sin(radians),
    K.sitePosition[1] + y,
    K.sitePosition[2] - x * Math.sin(radians) + z * Math.cos(radians),
  ];
}

try {
  if (!SHARED_BASE) server = await startStaticServer({ root: path.resolve("dist"), port: PORT });
  browser = await launchSmokeBrowser();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  applySmokeTimeout(page);
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  page.on("response", (response) => {
    const url = response.url();
    if (response.status() >= 400) badResponses.push(`${response.status()} ${url}`);
    if (/\/assets\/.+\.(png|jpg|jpeg|webp|json|glb|gltf|fbx|obj)$/i.test(url)) {
      requestedAssets.push({ url, status: response.status() });
    }
  });

  const base = SHARED_BASE ?? `http://127.0.0.1:${PORT}/`;
  await page.goto(`${base}?host=standalone`, { waitUntil: "load", timeout: SMOKE_TIMEOUT });
  await page.waitForFunction(() => !!window.__GRAPHYSX_HOST__ && !!window.__GRAPHYSX__, { timeout: SMOKE_TIMEOUT });

  // ---- 0. The record itself is well formed --------------------------------------------
  console.log("\n# provenance records");
  check("one building recorded", ARCHIVE_BUILDINGS.length === 1, ARCHIVE_BUILDINGS.map((b) => b.id));
  for (const record of ARCHIVE_BUILDINGS) {
    check(`${record.id}: fidelity is labelled three ways`,
      record.fidelity.faithful.length > 0 && record.fidelity.inferred.length > 0 && record.fidelity.deliberatelyAbsent.length > 0,
      { faithful: record.fidelity.faithful.length, inferred: record.fidelity.inferred.length, absent: record.fidelity.deliberatelyAbsent.length });
    check(`${record.id}: deviations are machine-readable`,
      record.deviations.length > 0 && record.deviations.every((d) => typeof d.code === "string" && d.code.length > 0 && typeof d.detail === "string"),
      record.deviations.map((d) => d.code));
    check(`${record.id}: provenance names its source bytes and hash`,
      record.provenance.sourcePaths.length > 0 && /^[0-9A-F]{64}$/.test(record.provenance.sourceSha256));
  }
  check("the shipped hash matches the imported record",
    ARCHIVE_BUILDINGS[0].provenance.sourceSha256 === MAISON_RECORD.source.sha256,
    MAISON_RECORD.source.sha256);
  check("rejections are recorded with reasons", ARCHIVE_BUILDINGS_NOT_REVIVED.length >= 3 &&
    ARCHIVE_BUILDINGS_NOT_REVIVED.every((r) => r.verdict && r.why && r.why.length > 80),
    ARCHIVE_BUILDINGS_NOT_REVIVED.map((r) => r.verdict));

  // ---- 1. The record is a box massing model, which is the whole argument ---------------
  console.log("\n# the record is primitives, not a mesh archive");
  check("24 meshes and 6 lamps in the record",
    RECORD_MESHES.length === 24 && RECORD_LAMPS.length === 6,
    { meshes: RECORD_MESHES.length, lamps: RECORD_LAMPS.length });
  check("216 vertices / 148 polygons over 24 objects — ~9 verts each, i.e. boxes",
    MAISON_RECORD.meshTotals.vertices === 216 && MAISON_RECORD.meshTotals.polygons === 148);
  check("20 of the 24 meshes are literally 8-vertex boxes",
    RECORD_MESHES.filter((m) => m.mesh.vertices === 8).length === 20,
    RECORD_MESHES.filter((m) => m.mesh.vertices === 8).length);
  // The precondition that makes the Euler conversion exact.
  check("no mesh rotates about more than Blender Z, so the Euler mapping is exact",
    RECORD_MESHES.every((m) => m.rotationEuler[0] === 0 && m.rotationEuler[1] === 0),
    RECORD_MESHES.filter((m) => m.rotationEuler[0] !== 0 || m.rotationEuler[1] !== 0).map((m) => m.name));

  // ---- 2. The scene loads ---------------------------------------------------------------
  console.log("\n# archive-maison");
  const definition = buildArchiveBuilding("archive-maison");
  await page.evaluate((d) => window.__GRAPHYSX__.create(d), definition);
  await page.waitForTimeout(700);

  const state = await page.evaluate(() => {
    const s = window.__GRAPHYSX__.state();
    return {
      worldId: s.world.id,
      environment: s.environment,
      count: s.entities.length,
      entities: s.entities.map((e) => ({
        id: e.id, type: e.type, label: e.label, parentId: e.parentId,
        position: e.position, rotationDegrees: e.rotationDegrees, scale: e.scale,
        geometry: e.geometry, intensity: e.intensity, distance: e.distance,
        material: { color: e.material.color, opacity: e.material.opacity },
        visible: e.visible, tags: e.tags, asset: e.asset,
      })),
    };
  });
  const byId = Object.fromEntries(state.entities.map((e) => [e.id, e]));

  check("scene loaded under its own id", state.worldId === "archive-maison", state.worldId);
  check("every authored entity materialised", state.count === definition.entities.length,
    { live: state.count, authored: definition.entities.length });
  check("dusk sky, so the recovered lamps are the subject", state.environment.sky === "clearnight",
    state.environment.sky);
  check("envelope pushed past the model so the far wall is not fogged",
    state.environment.envelope && state.environment.envelope.fogNear >= 100 && state.environment.envelope.cameraFar >= 400,
    state.environment.envelope);

  // ---- 3. Object for object against the archive record ---------------------------------
  console.log("\n# the transforms ARE the record");
  const slug = (n) => n.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const authored = Object.fromEntries(definition.entities.filter((e) => e.id).map((e) => [e.id, e]));
  let positionMismatches = [];
  let stagedMismatches = [];
  let sizeMismatches = [];
  let rotationMismatches = [];
  for (const mesh of RECORD_MESHES) {
    const id = `maison-${slug(mesh.name)}`;
    const live = byId[id];
    const doc = authored[id];
    if (!live || !doc) { positionMismatches.push(`${mesh.name}: missing`); continue; }
    const wantPosition = expectPosition(mesh.location);
    const wantSize = expectSize(mesh.dimensions);
    // (a) The document carries the archive coordinate verbatim — the actual fidelity claim.
    if (!wantPosition.every((v, i) => near(doc.transform.position[i], v, 1e-9))) {
      positionMismatches.push(`${mesh.name}: ${JSON.stringify(doc.transform.position)} != ${JSON.stringify(wantPosition)}`);
    }
    // (b) The runtime placed it where the site transform says it should be.
    const wantStaged = stage(wantPosition);
    if (!wantStaged.every((v, i) => near(live.position[i], v, 2e-3))) {
      stagedMismatches.push(`${mesh.name}: ${JSON.stringify(live.position)} != ${JSON.stringify(wantStaged.map((v) => Number(v.toFixed(3))))}`);
    }
    // `Plane` is the one declared exception: a zero-thickness plane is given 0.04 to be visible.
    const wantHeight = mesh.name === "Plane" ? 0.04 : wantSize[1];
    if (!near(live.geometry.width, wantSize[0], 1e-6) || !near(live.geometry.height, wantHeight, 1e-6) ||
        !near(live.geometry.depth, wantSize[2], 1e-6)) {
      sizeMismatches.push(`${mesh.name}: ${JSON.stringify([live.geometry.width, live.geometry.height, live.geometry.depth])} != ${JSON.stringify([wantSize[0], wantHeight, wantSize[2]])}`);
    }
    const wantYaw = (mesh.rotationEuler[2] * 180) / Math.PI;
    if (!near(live.rotationDegrees[1], wantYaw, 1e-4)) {
      rotationMismatches.push(`${mesh.name}: yaw ${live.rotationDegrees[1]} != ${wantYaw}`);
    }
  }
  check("all 24 archive positions survive the axis change exactly, in the document", positionMismatches.length === 0, positionMismatches.slice(0, 4));
  check("and the runtime places all 24 exactly where the site transform says", stagedMismatches.length === 0, stagedMismatches.slice(0, 4));
  check("all 24 archive dimensions survive the axis change exactly", sizeMismatches.length === 0, sizeMismatches.slice(0, 4));
  check("all 24 archive Z rotations became platform Y rotations of equal sign", rotationMismatches.length === 0, rotationMismatches.slice(0, 4));
  // The doors are the only rotated objects and the only ones where this could go wrong.
  {
    const doors = RECORD_MESHES.filter((m) => m.name.startsWith("OutsideDoor"));
    const yaws = doors.map((d) => Number(byId[`maison-${slug(d.name)}`].rotationDegrees[1].toFixed(3)));
    check("the eight doors keep their 0 / 90 / 180 degree rotations",
      doors.length === 8 && yaws.every((y) => near(y, 0, 0.01) || near(y, 90, 0.01) || near(y, 180, 0.01)), yaws);
  }

  // ---- 4. The recovered lamps ------------------------------------------------------------
  console.log("\n# the six recovered lamps");
  const liveLamps = state.entities.filter((e) => e.type === "point-light");
  check("all six LAMP objects became point lights", liveLamps.length === 6, liveLamps.length);
  {
    const lampMismatches = [];
    RECORD_LAMPS.forEach((lamp, index) => {
      const id = `maison-lamp-${index}-${slug(lamp.name)}`;
      const live = byId[id];
      const doc = authored[id];
      if (!live || !doc) { lampMismatches.push(`${lamp.name}: missing`); return; }
      const want = expectPosition(lamp.location);
      if (!want.every((v, i) => near(doc.transform.position[i], v, 1e-9))) lampMismatches.push(`${lamp.name}: document position`);
      if (!stage(want).every((v, i) => near(live.position[i], v, 2e-3))) lampMismatches.push(`${lamp.name}: staged position`);
      if (!near(live.distance, lamp.light.distance, 1e-6)) lampMismatches.push(`${lamp.name}: distance ${live.distance} != ${lamp.light.distance}`);
      if (!near(live.intensity, lamp.light.energy * K.lampEnergyToIntensity, 1e-6)) {
        lampMismatches.push(`${lamp.name}: intensity`);
      }
      // The record's colour is (1,1,1); the scene must carry it, not a chosen tint.
      const channels = lamp.light.color.map((c) => Math.round(Math.max(0, Math.min(1, c)) * 255).toString(16).padStart(2, "0"));
      if (live.material.color !== `#${channels.join("")}`) lampMismatches.push(`${lamp.name}: colour ${live.material.color}`);
    });
    check("every lamp carries its recorded position, colour distance and energy", lampMismatches.length === 0, lampMismatches);
  }
  check("five lamps fall off at the recorded 25 units and one at ~30",
    liveLamps.filter((l) => near(l.distance, 25, 1e-6)).length === 5 &&
    liveLamps.filter((l) => near(l.distance, 29.999983, 1e-5)).length === 1,
    liveLamps.map((l) => l.distance));
  check("no lightbulb gizmos inside a translucent house",
    definition.entities.filter((e) => e.type === "point-light").every((e) => e.marker === false));

  // ---- 5. Staging is one transform in one place ------------------------------------------
  console.log("\n# staging");
  {
    const site = byId["maison-site"];
    check("the presentation scale is uniform and on the root group alone",
      site && site.scale[0] === site.scale[1] && site.scale[1] === site.scale[2] && site.scale[0] > 1, site?.scale);
    const staged = definition.entities.filter((e) => e.parentId && e.id !== "maison-site");
    check("nothing below the root carries a scale of its own",
      staged.every((e) => { const s = e.transform?.scale; return s === undefined || s.every((v) => v === 1); }));
    // Tolerance rather than equality because `state()` rounds every vector it reports.
    check("the site yaw reproduces the archive camera azimuth",
      near(site.rotationDegrees[1], K.siteYawDegrees, 1e-2),
      { live: site.rotationDegrees[1], derived: K.siteYawDegrees });
    check("the house stands on the ground rather than through it",
      near(SITE_BASE_Y(state), 0, 0.02), SITE_BASE_Y(state));
  }

  // ---- 6. Assets: this scene loads none, and nothing 404s ---------------------------------
  console.log("\n# asset health");
  check("no model entity in the scene resolved to an error",
    state.entities.every((e) => e.asset === null || e.asset.status === "ready"),
    state.entities.filter((e) => e.asset && e.asset.status !== "ready").map((e) => ({ id: e.id, status: e.asset.status })));
  check("no request in the whole session returned 4xx/5xx", badResponses.length === 0, badResponses.slice(0, 6));
  check("every asset the browser did fetch came back 200",
    requestedAssets.every((r) => r.status === 200),
    requestedAssets.filter((r) => r.status !== 200).slice(0, 6));
  // The scene's own claim: it needs no catalog registration because it loads no meshes.
  check("the scene genuinely loads zero meshes, so it needs no catalog registration",
    definition.entities.every((e) => e.type !== "model" && e.asset === undefined));

  // ---- 7. The interaction actually does something -----------------------------------------
  console.log("\n# lift the living floor");
  // `toggle-visibility` flips the flag on its TARGET. three.js hides the whole subtree when a
  // parent is invisible, but each child keeps reporting its own `visible: true` — so the group's
  // flag is the thing to assert, and the rendered result is confirmed by the second screenshot.
  const toggle = await page.evaluate(() => {
    const api = window.__GRAPHYSX__;
    const groups = () => ["maison-living-floor", "maison-doors"]
      .map((id) => api.state().entities.find((e) => e.id === id).visible);
    const storey = () => api.state().entities.filter((e) => e.tags.includes("upper-volume")).length;
    const doors = () => api.state().entities.filter((e) => e.tags.includes("door")).length;
    const before = groups();
    api.interact("maison-living-floor", "toggle-living-floor");
    const after = groups();
    api.interact("maison-living-floor", "toggle-living-floor");
    return { before, after, restored: groups(), storeyCount: storey(), doorCount: doors() };
  });
  check("the upper storey really is nine recovered volumes", toggle.storeyCount === 9, toggle.storeyCount);
  check("and the doors that lift with it are the archive's eight", toggle.doorCount === 8, toggle.doorCount);
  check("the living floor and its doors start visible", toggle.before.every((v) => v === true), toggle.before);
  check("lifting the floor hides the storey AND its doors", toggle.after.every((v) => v === false), toggle.after);
  check("and putting it back restores both", toggle.restored.every((v) => v === true), toggle.restored);

  // ---- 8. Export -> load ------------------------------------------------------------------
  console.log("\n# export -> load");
  const roundTrip = await page.evaluate(() => {
    const api = window.__GRAPHYSX__;
    api.load(api.export());
    const s = api.state();
    const map = Object.fromEntries(s.entities.map((e) => [e.id, e]));
    return {
      count: s.entities.length,
      sky: s.environment.sky,
      envelope: s.environment.envelope,
      siteScale: map["maison-site"]?.scale,
      siteYaw: map["maison-site"]?.rotationDegrees?.[1],
      doorYaw: map["maison-outsidedoor-005"]?.rotationDegrees?.[1],
      lampDistance: map["maison-lamp-5-lamp"]?.distance,
      upperOpacity: map["maison-cube"]?.material?.opacity,
    };
  });
  check("the whole scene survives export -> load",
    roundTrip.count === state.count && roundTrip.sky === "clearnight" &&
    near(roundTrip.siteYaw, K.siteYawDegrees, 1e-2) &&
    near(roundTrip.doorYaw, 90, 1e-3) && near(roundTrip.lampDistance, 29.999983, 1e-5) &&
    near(roundTrip.upperOpacity, 0.24, 1e-6),
    roundTrip);

  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(ART, "buildings-maison.png") });

  // A second frame with the storey lifted — the interaction is the scene's argument, so it is
  // worth an artefact a human can actually look at.
  await page.evaluate(() => window.__GRAPHYSX__.interact("maison-living-floor", "toggle-living-floor"));
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(ART, "buildings-maison-plan.png") });
} catch (error) {
  failures.push(`fatal — ${String(error)}`);
  console.error(error);
} finally {
  if (browser) await browser.close();
  if (server) await server.close();
}

/**
 * Lowest point of any recovered volume, in world space, after staging.
 *
 * `entity.scale` is LOCAL (1 for every child of the site group) while `entity.position` is
 * WORLD, so the height has to be scaled by the site's own factor rather than by the child's.
 * Reading the child's scale here is what made the first draft of this check report the house
 * floating 0.33 units above the ground when it is in fact sitting on it.
 */
function SITE_BASE_Y(state) {
  let lowest = Infinity;
  for (const entity of state.entities) {
    if (!entity.tags?.includes("archive-buildings")) continue;
    if (entity.type !== "box") continue;
    lowest = Math.min(lowest, entity.position[1] - (entity.geometry.height * K.siteScale) / 2);
  }
  return lowest;
}

console.log("\n# page health");
check("no console errors", consoleErrors.length === 0, consoleErrors.slice(0, 5));
check("no page errors", pageErrors.length === 0, pageErrors.slice(0, 5));

if (failures.length) {
  console.log(`\n${failures.length} failure(s):`);
  for (const failure of failures) console.log(`  - ${failure}`);
}
console.log(`\nsmoke-buildings: ${failures.length ? "FAIL" : "PASS"}`);
process.exit(failures.length ? 1 : 0);
