// Deterministic acceptance of authored geometry, not evidence of model creativity.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { startSceneStore } from "../server/scene-store.mjs";
import { createActor, requestText } from "./live-session-harness.mjs";
import { applySmokeTimeout, launchSmokeBrowser } from "./smoke-harness.mjs";

const base = process.env.SMOKE_BASE || "http://127.0.0.1:4188/";
const output = process.env.SMOKE_ARTIFACTS || path.resolve("output/smoke");
mkdirSync(output, { recursive: true });
const pixels = { width: 4, height: 2, rgba: Array.from({ length: 8 }, (_, i) => i % 3 ? [20, 180, 220, 255] : [245, 120, 35, 255]).flat() };
const mesh = { positions: [-3, -1, 0, 3, -1, 0, 3, 1, 1, -3, 1, -1], indices: [0, 2, 1, 0, 3, 2], uvs: [0, 0, 1, 0, 1, 1, 0, 1], groups: [{ start: 0, count: 3, materialIndex: 0 }, { start: 3, count: 3, materialIndex: 1 }], materials: [{ color: "#ffffff", texture: { id: "inline", pixels, repeat: [3, 3] }, roughness: 0.6 }, { color: "#c77336", metalness: 0.55 }] };
const changed = structuredClone(mesh);
changed.positions[7] = 3;
changed.materials[0].texture.pixels.rgba[0] = 100;
const entity = { id: "authored-sail", type: "mesh", label: "Folded copper sail", mesh, transform: { position: [0, 2, 7] } };
const reply = { intent: "Sculpt a textured folded copper sail", commands: [{ op: "spawn", entity }] };
const browser = await launchSmokeBrowser();
const page = applySmokeTimeout(await browser.newPage({ viewport: { width: 1280, height: 720 }, reducedMotion: "reduce" }));
const errors = [];
page.on("pageerror", error => errors.push(String(error)));
page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
let store, dir;
const out = {};
const requests = [];
try {
  await page.route("**/mesh-fixture-propose", route => {
    requests.push(route.request().postDataJSON());
    return route.fulfill({ json: requests.length === 1 ? reply : { intent: "Refine the folded sail label", commands: [{ op: "update", id: entity.id, patch: { label: "Refined folded sail" } }] } });
  });
  await page.goto(`${base}?propose=${encodeURIComponent(new URL("mesh-fixture-propose", base).href)}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__GRAPHYSX_NESTOR__ && window.__GRAPHYSX_HOST__?.frameCount > 0);
  await page.waitForFunction(() => !window.__GRAPHYSX_HOST__.introPlaying && window.__GRAPHYSX_HOST__.frameCount > 3);
  const before = await page.evaluate(() => ({ doc: JSON.stringify(window.__GRAPHYSX__.exportDocument()), commits: window.__GRAPHYSX__.history().length }));
  await page.locator("[data-nestor-request]").fill("Sculpt an original folded copper sail with a cyan and orange woven texture");
  await page.locator("[data-nestor-request-send]").click();
  await page.waitForSelector("[data-proposal-accept]");
  assert.equal(await page.evaluate(() => JSON.stringify(window.__GRAPHYSX__.exportDocument())), before.doc, "proposal is inert before Apply");
  await page.locator("[data-proposal-accept]").click();
  await page.waitForFunction(() => window.__GRAPHYSX__.query({ ids: ["authored-sail"] }).length === 1);
  await page.waitForFunction(() => window.__GRAPHYSX_HOST__.world.getEntityObject("authored-sail")?.material?.[0]?.map?.image?.data?.length === 32);
  out.review = await page.evaluate(() => {
    const api = window.__GRAPHYSX__, object = window.__GRAPHYSX_HOST__.world.getEntityObject("authored-sail");
    return { mesh: api.exportDocument().entities.find(e => e.id === "authored-sail").mesh, commits: api.history().length, actor: api.history().at(-1).actor.id,
      vertices: object.geometry.attributes.position.count, triangles: object.geometry.index.count / 3, groups: object.geometry.groups.length, pixels: [...object.material[0].map.image.data] };
  });
  assert.deepEqual(out.review.mesh, mesh);
  assert.equal(out.review.commits, before.commits + 1);
  assert.equal(out.review.actor, "nestor");
  assert.deepEqual([out.review.vertices, out.review.triangles, out.review.groups], [4, 2, 2]);
  assert.deepEqual(out.review.pixels, pixels.rgba);
  await page.waitForFunction(() => {
    const host = window.__GRAPHYSX_HOST__;
    return !host.focusing && Math.hypot(host.orbitTarget.x, host.orbitTarget.y - 2, host.orbitTarget.z - 7) < 0.1;
  });
  out.view = await page.evaluate(() => {
    const h = window.__GRAPHYSX_HOST__, o = h.world.getEntityObject("authored-sail");
    const point = o.getWorldPosition(o.position.clone());
    return { target: h.orbitTarget.toArray(), camera: h.camera.position.toArray(), visible: o.visible, frame: h.frameCount, center: point.toArray(), projected: point.project(h.camera).toArray(), geometry: [...o.geometry.attributes.position.array] };
  });
  await page.evaluate(() => window.__GRAPHYSX__.select(["authored-sail"]));
  await page.waitForFunction(frame => window.__GRAPHYSX_HOST__.frameCount > frame + 2, out.view.frame);
  await page.screenshot({ path: path.join(output, "inline-mesh-desktop.png") });

  // The welcome has more than 60 entities. The next ordinary request must still carry
  // the object Nestor just presented, rather than only the first 60 original decorations.
  await page.evaluate(() => window.__GRAPHYSX__.select([]));
  await page.locator("[data-nestor-request]").fill("Refine the label on the folded sail you just made");
  await page.locator("[data-nestor-request-send]").click();
  await page.waitForSelector("[data-proposal-accept]");
  assert.equal(requests.length, 2);
  assert.equal(requests[1].scene.entities.length, 60);
  assert.ok(requests[1].scene.entities.some(entry => entry.id === entity.id));
  assert.ok(requests[1].scene.entities.every(entry => Object.keys(entry).sort().join(",") === "id,label,type"));
  await page.locator("[data-proposal-accept]").click();
  await page.waitForFunction(() => window.__GRAPHYSX__.query({ ids: ["authored-sail"] })[0]?.label === "Refined folded sail");
  out.followup = { boundedSummary: true, targetPresent: true, applied: true };

  out.edit = await page.evaluate(next => {
    const api = window.__GRAPHYSX__, read = () => JSON.stringify(api.exportDocument().entities.find(e => e.id === "authored-sail").mesh);
    const original = read(), history = api.history().length;
    const edit = api.commit({ actor: { id: "mesh-author", kind: "agent", label: "Mesh author" }, intent: "Bend one corner and recolor one texel", commands: [{ op: "update", id: "authored-sail", patch: { mesh: next } }], expectedRevision: api.state().revision });
    const oneCommit = api.history().length === history + 1, changed = read() === JSON.stringify(next);
    const undo = api.undo(), restored = read() === original;
    const redo = api.redo(), redone = read() === JSON.stringify(next);
    const load = api.load(api.exportDocument());
    return { edit: edit.ok, undo: undo.ok, redo: redo.ok, load: load.ok, oneCommit, changed, restored, redone, reloaded: read() === JSON.stringify(next) };
  }, changed);
  for (const [key, value] of Object.entries(out.edit)) assert.equal(value, true, key);
  out.rejected = await page.evaluate(() => {
    const api = window.__GRAPHYSX__, doc = JSON.stringify(api.exportDocument()), revision = api.state().revision, history = api.history().length;
    const bad = structuredClone(api.exportDocument().entities.find(e => e.id === "authored-sail").mesh);
    bad.indices[0] = 999;
    const result = api.transaction([{ op: "update", id: "authored-sail", patch: { label: "must not change" } }, { op: "update", id: "authored-sail", patch: { mesh: bad } }]);
    return { refused: !result.ok, unchanged: JSON.stringify(api.exportDocument()) === doc && api.state().revision === revision && api.history().length === history };
  });
  assert.deepEqual(out.rejected, { refused: true, unchanged: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => window.__GRAPHYSX_HOST__.renderer.domElement.clientWidth <= 390);
  const resizedFrame = await page.evaluate(() => window.__GRAPHYSX_HOST__.frameCount);
  await page.waitForFunction(frame => window.__GRAPHYSX_HOST__.frameCount > frame + 2, resizedFrame);
  await page.screenshot({ path: path.join(output, "inline-mesh-mobile.png") });
  out.physics = await page.evaluate(source => {
    const api = window.__GRAPHYSX__;
    // Keep the rolling ball on the ramp for the complete observation window.
    const ramp = { ...source, positions: [-3, 0, -8, 3, 0, -8, 3, 2, 8, -3, 2, 8] };
    api.pause(true);
    const load = api.load({ schema: "graphysx.agent-world/v2", id: "mesh-physics", label: "Exact ramp", environment: { ground: { visible: false } }, entities: [
      { id: "ramp", type: "mesh", mesh: ramp, physics: { mode: "static", collider: "trimesh" } },
      { id: "ball", type: "sphere", geometry: { radius: 0.25 }, transform: { position: [0, 4, 0] }, physics: { mode: "dynamic", friction: 1 } },
    ] });
    let minimum = Infinity;
    const trajectory = [];
    for (let i = 0; i < 90; i++) {
      api.step(1 / 60);
      const ball = api.query({ ids: ["ball"] })[0];
      minimum = Math.min(minimum, ball.position[1]);
      if (i % 10 === 0) trajectory.push(ball.position);
    }
    const collider = api.query({ ids: ["ramp"] })[0].physics.collider;
    const moving = api.update("ramp", { physics: { mode: "dynamic" } });
    const hull = api.spawn({ id: "hull", type: "mesh", mesh: { positions: [0, 1, 0, -1, -1, 1, 1, -1, 1, 0, -1, -1], indices: [0, 1, 2, 0, 2, 3, 0, 3, 1, 1, 3, 2] }, transform: { position: [5, 5, 0] }, physics: { mode: "dynamic", collider: "convex-hull" } });
    return { load: load.ok, minimum, trajectory, collider, movingRefused: !moving.ok, hull: hull.ok, hullCollider: api.query({ ids: ["hull"] })[0]?.physics?.collider };
  }, mesh);
  writeFileSync(path.join(output, "inline-mesh-physics.json"), JSON.stringify(out.physics, null, 2));
  assert.equal(out.physics.load, true);
  assert.equal(out.physics.collider.effective, "trimesh");
  assert.equal(out.physics.collider.triangleCount, 2);
  assert.ok(out.physics.minimum > 0.2, "ball lands on authored ramp triangles");
  assert.equal(out.physics.movingRefused, true);
  assert.equal(out.physics.hull, true);
  assert.equal(out.physics.hullCollider.effective, "convex-hull");

  dir = await mkdtemp(path.join(tmpdir(), "graphysx-mesh-"));
  store = await startSceneStore({ port: 0, dir, token: "mesh-smoke-token", origins: null, datalakeDir: null });
  const seed = { schema: "graphysx.agent-world/v2", id: "mesh-live", label: "Mesh live", entities: [] };
  const seeded = await requestText(`${store.url}/scenes/mesh-live`, { method: "PUT", headers: { "content-type": "application/json", authorization: "Bearer mesh-smoke-token" }, body: JSON.stringify({ definition: seed, actor: "fixture" }) });
  assert.ok(seeded.status >= 200 && seeded.status < 300);
  const created = await createActor(store.url, { storeToken: "mesh-smoke-token" }).call("POST", "/sessions", { sceneName: "mesh-live", owner: { id: "mesh-owner", label: "Mesh owner" } });
  const id = created.body.session.sessionId;
  const owner = createActor(store.url, { credential: created.body.credential });
  const submit = (actor, opId, commands) => actor.call("POST", `/sessions/${id}/ops`, { opId, commands });
  assert.equal((await submit(owner, "mesh-create", [{ op: "spawn", entity }])).status, 201);
  assert.equal((await submit(owner, "mesh-edit", [{ op: "update", id: entity.id, patch: { mesh: changed } }])).status, 201);
  assert.equal((await owner.call("POST", `/sessions/${id}/ops/mesh-edit/undo`, {})).status, 201);
  const snapshot = (await owner.call("GET", `/sessions/${id}/snapshot`)).body;
  assert.deepEqual(snapshot.definition.entities[0].mesh, mesh, "shared inverse restores triangles and pixels");
  const invitation = await owner.call("POST", `/sessions/${id}/invites`, { role: "viewer", ttlSeconds: 600 });
  const joined = await createActor(store.url).call("POST", `/sessions/${id}/join`, { code: invitation.body.code, actor: { id: "mesh-viewer", label: "Mesh viewer", kind: "human" } });
  const viewer = createActor(store.url, { credential: joined.body.credential });
  assert.equal((await submit(viewer, "mesh-forbidden", [{ op: "update", id: entity.id, patch: { mesh: changed } }])).status, 403);
  assert.deepEqual((await viewer.call("GET", `/sessions/${id}/snapshot`)).body.definition, snapshot.definition);
  out.shared = { saved: true, edited: true, inverse: true, viewerRefused: true };
  assert.deepEqual(errors, []);
  writeFileSync(path.join(output, "inline-mesh.json"), JSON.stringify({ ok: true, fixture: true, out, errors }, null, 2));
  console.log("PASS inline mesh: reviewed Apply, actual UV/pixel material, edit/undo/redo/reload, atomic refusal, exact physics, stored shared inverse and viewer authority");
} catch (error) {
  out.failure = { message: String(error), state: await page.evaluate(() => {
    const host = window.__GRAPHYSX_HOST__;
    return { nestor: window.__GRAPHYSX_NESTOR__?.state(), target: host?.orbitTarget.toArray(), position: host?.camera.position.toArray(), focusing: host?.focusing, frames: host?.frameCount, introPlaying: host?.introPlaying, introCompleted: host?.introCompleted };
  }).catch(() => null) };
  writeFileSync(path.join(output, "inline-mesh-failure.json"), JSON.stringify(out, null, 2));
  throw error;
} finally {
  await browser.close();
  await store?.close();
  if (dir) await rm(dir, { recursive: true, force: true });
}
