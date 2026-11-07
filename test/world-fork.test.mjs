// A new game from an existing island: disposable CPU worlds, no browser, model or live service.
import assert from "node:assert/strict";
import { before, after, it } from "node:test";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "vite";
import { startWorldServer } from "../world-service/server.mjs";
import { atomicSnapshot, checkpointDigest, sealCheckpoint, verifyCheckpoint } from "../world-service/archive.mjs";
import { loadStartupSnapshot } from "../world-service/startup.mjs";

let module, temporary;
before(async () => {
  temporary = mkdtempSync(join(tmpdir(), "island-fork-"));
  const outDir = join(temporary, "bundle");
  await build({ configFile: fileURLToPath(new URL("../vite.world-service.config.ts", import.meta.url)),
    build: { outDir, emptyOutDir: true }, logLevel: "silent" });
  module = await import(pathToFileURL(join(outDir, "world.js")).href);
});
after(() => rmSync(temporary, { recursive: true, force: true }));

const operator = { "x-operator-token": "fixture" };
const start = (options = {}) => startWorldServer({ module, apiMarkdown: "API", realtime: false, operatorToken: "fixture", ...options });
const json = async (url, method = "GET", body, headers = {}) => {
  const response = await fetch(url, { method, headers: { "content-type": "application/json", ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, body: await response.json() };
};
const entityIds = world => world.snapshot().document.entities.map(entity => entity.id).sort();

/** A played island: an agent walked, chatted and stacked state for a while. */
function playedIsland(worldId = "mesa-island") {
  const world = new module.IslandWorld(undefined, { world: worldId });
  const { session } = world.join("Eko");
  world.apply(session, { type: "MoveTo", data: { position: [0, 1, 0] } });
  world.postChat(session, "hello from the old game");
  for (let i = 0; i < 90; i++) world.step();
  return { world, session };
}

/** What a maintenance operator keeps aside: the sealed checkpoint form of GET /snapshot. */
function sealed(world, extra = {}) {
  return sealCheckpoint({ ...world.snapshot(), runId: null, journal: { sequence: 3, actions: [] }, ...extra });
}

it("forks the same terrain and clock under a new identity, without the old players or chat", () => {
  const { world } = playedIsland();
  const source = sealed(world);
  const sha256 = checkpointDigest(source);
  assert.equal(sha256, source.recovery.sha256);
  const fork = new module.IslandWorld(verifyCheckpoint(source), { fork: { sha256 } });
  assert.notEqual(fork.instanceId, world.instanceId);
  assert.deepEqual(fork.forkedFrom, { instanceId: world.instanceId, tick: world.tick, sha256 });
  assert.equal(fork.tick, world.tick);
  assert.equal(fork.worldId, world.worldId);
  assert.equal(fork.agentCount, 0);
  assert.equal(world.chatMessages(null, 20).messages.length, 1);
  assert.equal(fork.chatMessages(null, 20).messages.length, 0);
  // Everything but the departed avatar is still there, at the same place.
  const avatar = [...world.snapshot().numericIds].find(([id]) => id.startsWith("agent-"))[0];
  assert.deepEqual(entityIds(fork), entityIds(world).filter(id => id !== avatar));
  const before = new Map(world.poseFrame().poses.map(pose => [pose[0], pose]));
  for (const pose of fork.poseFrame().poses) assert.deepEqual(pose, before.get(pose[0]));
  assert.equal(fork.drainChanges().length, 0, "the removed avatar is not replayed as a change of the new game");
  const hello = fork.sceneHello();
  assert.equal(hello.instanceId, fork.instanceId);
  assert.deepEqual(hello.forkedFrom, fork.forkedFrom);
  // A new player joins the fork like a fresh island.
  const joined = fork.join("Eko");
  assert.equal(fork.agentCount, 1);
  assert.ok(fork.observe(joined.session));
});

it("keeps the provenance through checkpoints and plain resumes of the fork", () => {
  const { world } = playedIsland();
  const source = sealed(world);
  const fork = new module.IslandWorld(verifyCheckpoint(source), { fork: { sha256: checkpointDigest(source) } });
  for (let i = 0; i < 30; i++) fork.step();
  const saved = fork.snapshot();
  assert.deepEqual(saved.forkedFrom, fork.forkedFrom);
  const resumed = new module.IslandWorld(saved);
  assert.equal(resumed.instanceId, fork.instanceId, "a resume keeps the fork's identity");
  assert.deepEqual(resumed.forkedFrom, fork.forkedFrom);
  assert.equal(new module.IslandWorld(world.snapshot()).forkedFrom, null, "an ordinary resume has no fork origin");
  assert.throws(() => new module.IslandWorld(undefined, { fork: { sha256: "0".repeat(64) } }), /source snapshot/);
  assert.throws(() => new module.IslandWorld(world.snapshot(), { fork: { sha256: "not-a-digest" } }), /SHA-256/);
});

it("continues a living island's trees and flocks exactly as the source would have", () => {
  const living = new module.IslandWorld(undefined, { world: "living-island" });
  for (let i = 0; i < 120; i++) living.step();
  const source = sealed(living);
  const plain = new module.IslandWorld(verifyCheckpoint(source));
  const fork = new module.IslandWorld(verifyCheckpoint(source), { fork: { sha256: checkpointDigest(source) } });
  for (let i = 0; i < 60; i++) { plain.step(); fork.step(); }
  assert.deepEqual(fork.poseFrame(), plain.poseFrame());
  assert.deepEqual(fork.snapshot().living, plain.snapshot().living);
  assert.ok(fork.poseFrame().swarms, "the flocks came along");
});

it("forks once at startup, resumes that fork afterwards and never replaces another island's checkpoint", async () => {
  const dir = join(temporary, "startup");
  mkdirSync(dir, { recursive: true });
  const { world } = playedIsland();
  const forkPath = join(dir, "mesa-before.json");
  const snapshotPath = join(dir, "current.json");
  const value = sealed(world);
  await atomicSnapshot(forkPath, value);
  const sha256 = value.recovery.sha256;
  assert.throws(() => loadStartupSnapshot({ startMode: "fork", snapshotPath }), /WORLD_FORK_PATH/);
  assert.throws(() => loadStartupSnapshot({ startMode: "fork", forkPath }), /WORLD_SNAPSHOT_PATH/);
  assert.throws(() => loadStartupSnapshot({ startMode: "fork", forkPath, snapshotPath, resumePath: forkPath }), /does not combine/);
  assert.throws(() => loadStartupSnapshot({ startMode: "fork", forkPath: join(dir, "missing.json"), snapshotPath }), /does not exist/);
  assert.throws(() => loadStartupSnapshot({ startMode: "fork", forkPath, snapshotPath, forkSha256: "f".repeat(64) }), /does not match/);
  assert.throws(() => loadStartupSnapshot({ startMode: "fork", forkPath, snapshotPath, forkSha256: "ABC" }), /lowercase/);

  const first = loadStartupSnapshot({ startMode: "fork", forkPath, snapshotPath, forkSha256: sha256 });
  assert.deepEqual(first.fork, { sha256 });
  const running = await start({ snapshot: first.snapshot, fork: first.fork, snapshotPath });
  let forkId;
  try {
    forkId = running.world.instanceId;
    assert.notEqual(forkId, world.instanceId);
    const health = await json(`${running.url}/healthz`);
    assert.deepEqual(health.body.forkedFrom, { instanceId: world.instanceId, tick: world.tick, sha256 });
    assert.equal(health.body.runId, null, "the old run does not follow the island into the new game");
    assert.equal(health.body.checkpoint.lastSaved.instanceId, forkId);
  } finally { await running.close(); }

  // The service restarts with the same settings: it resumes the fork, it does not fork again.
  const again = loadStartupSnapshot({ startMode: "fork", forkPath, snapshotPath, forkSha256: sha256 });
  assert.equal(again.fork, undefined);
  assert.equal(again.path, snapshotPath);
  assert.equal(new module.IslandWorld(again.snapshot).instanceId, forkId);

  // Any other island in WORLD_SNAPSHOT_PATH is refused, never overwritten.
  await atomicSnapshot(snapshotPath, sealed(new module.IslandWorld()));
  assert.throws(() => loadStartupSnapshot({ startMode: "fork", forkPath, snapshotPath }), /another island/);
  assert.throws(() => loadStartupSnapshot({ startMode: "surprise", snapshotPath }), /fresh, resume or fork/);
});

it("POST /world never forks: a fork request is refused and the island stays as it was", async () => {
  const running = await start();
  try {
    const first = running.world.instanceId;
    const post = body => json(`${running.url}/world`, "POST", body, operator);
    for (const body of [
      { world: "mesa-island", from: "mesa-before.json", sha256: "a".repeat(64), force: true },
      { world: "mesa-island", from: "mesa-before.json", force: true },
      { world: "mesa-island", sha256: "a".repeat(64), force: true },
    ]) {
      const refused = await post(body);
      assert.equal(refused.status, 400);
      assert.match(refused.body.error, /WORLD_START_MODE=fork/);
    }
    assert.equal(running.world.instanceId, first);
    assert.equal((await json(`${running.url}/healthz`)).body.forkedFrom, null);
  } finally { await running.close(); }
});
