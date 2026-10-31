// Reliability contracts against disposable CPU worlds: no browser, model or live service.
import assert from "node:assert/strict";
import { before, after, it } from "node:test";
import { mkdtempSync, readFileSync, rmSync, mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "vite";
import { startWorldServer } from "../world-service/server.mjs";
import { Archive, atomicSnapshot, verifyCheckpoint } from "../world-service/archive.mjs";
import { loadStartupSnapshot } from "../world-service/startup.mjs";
import { registerRecording } from "../world-service/register-recording.mjs";
import { parseRecording } from "../world-service/recording.mjs";

let module, temporary;
before(async () => {
  temporary = mkdtempSync(join(tmpdir(), "island-reliability-"));
  const outDir = join(temporary, "bundle");
  await build({ configFile: new URL("../vite.world-service.config.ts", import.meta.url).pathname,
    build: { outDir, emptyOutDir: true }, logLevel: "silent" });
  module = await import(pathToFileURL(join(outDir, "world.js")).href);
});
after(() => rmSync(temporary, { recursive: true, force: true }));

const start = (options = {}) => startWorldServer({ module, apiMarkdown: "API", realtime: false, operatorToken: "fixture", ...options });
const json = async (url, method = "GET", body, headers = {}) => {
  const response = await fetch(url, { method, headers: { "content-type": "application/json", ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, body: await response.json() };
};
const switchWorld = running => json(`${running.url}/world`, "POST", { world: "mesa-island", force: true }, { "x-operator-token": "fixture" });
async function opening(url, headers = {}) {
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), 4000);
  const response = await fetch(url, { headers, signal: controller.signal });
  const reader = response.body.getReader();
  let text = "";
  try {
    while (!text.includes("event: frame\n")) text += new TextDecoder().decode((await reader.read()).value);
  } finally { clearTimeout(deadline); controller.abort(); }
  return text.split("\n\n").flatMap(block => {
    const event = /^event: (.+)$/m.exec(block)?.[1];
    const data = /^data: (.+)$/m.exec(block)?.[1];
    return event && data ? [{ event, data: JSON.parse(data) }] : [];
  });
}

it("never substitutes another instance of the same world, including already connected run viewers", async () => {
  const running = await start();
  try {
    const id = running.world.instanceId;
    const response = await fetch(`${running.url}/spectate?instance=${id}`);
    const reader = response.body.getReader();
    await reader.read();
    const replaced = await switchWorld(running);
    assert.equal(replaced.status, 200);
    assert.notEqual(replaced.body.instanceId, id);
    assert.equal((await json(`${running.url}/healthz?instance=${id}`)).status, 409);
    assert.equal((await fetch(`${running.url}/spectate?instance=${id}`)).status, 409);
    assert.equal((await json(`${running.url}/join?instance=${replaced.body.instanceId}`, "POST", {}, { "x-world-instance": id })).status, 409, "query cannot override the runner's pin");
    // The old bound stream ends instead of receiving a different island's hello.
    let remainder = "";
    for (;;) { const chunk = await reader.read(); if (chunk.done) break; remainder += new TextDecoder().decode(chunk.value); }
    assert.ok(!remainder.includes(replaced.body.instanceId));
  } finally { await running.close(); }
});

it("catches up a bounded per-instance journal and resumes strictly after a stable action id", async () => {
  const running = await start();
  try {
    const joined = running.world.join("Eko");
    for (let i = 0; i < 205; i++) { running.world.apply(joined.session, { type: "Stop", data: {} }); running.tick(); }
    const first = await opening(`${running.url}/spectate`);
    const hello = first.find(entry => entry.event === "hello").data;
    const actions = first.filter(entry => entry.event === "action").map(entry => entry.data);
    assert.equal(actions.length, 200);
    assert.deepEqual(actions.map(entry => entry.sequence), Array.from({ length: 200 }, (_, i) => i + 6));
    assert.equal(hello.journal.truncated, true);
    const reconnect = await opening(`${running.url}/spectate`, { "Last-Event-ID": actions.at(-2).id });
    assert.deepEqual(reconnect.filter(entry => entry.event === "action").map(entry => entry.data.id), [actions.at(-1).id]);
    assert.equal(new Set(actions.map(entry => entry.id)).size, 200);
    await switchWorld(running);
    const next = await opening(`${running.url}/spectate?after=${actions.at(-1).id}`);
    assert.equal(next[0].data.journal.reset, true);
    assert.equal(next.filter(entry => entry.event === "action").length, 0);
  } finally { await running.close(); }
});

it("leaves only the departing member and restores sessions with unproven presence marked idle", async () => {
  const running = await start();
  let resumed;
  try {
    const a = (await json(`${running.url}/join?name=A`, "POST")).body;
    const b = (await json(`${running.url}/join?name=B`, "POST")).body;
    let hello = (await opening(`${running.url}/spectate`))[0].data;
    assert.deepEqual(hello.inspection.agents.map(agent => agent.attributes.Presence), ["active", "active"]);
    assert.equal((await json(`${running.url}/leave`, "POST", {}, { "x-session": a.session })).body.left, true);
    running.tick();
    assert.equal(running.world.agentCount, 1);
    assert.ok(running.world.hasSession(b.session));
    assert.equal(running.world.sceneHello().document.entities.filter(entity => entity.type === "agent").length, 1);
    resumed = await start({ snapshot: (await json(`${running.url}/snapshot`, "GET", null, { "x-operator-token": "fixture" })).body });
    hello = (await opening(`${resumed.url}/spectate`))[0].data;
    assert.equal(hello.inspection.agents[0].attributes.Presence, "idle");
    await json(`${resumed.url}/observe`, "GET", null, { "x-session": b.session });
    assert.equal((await opening(`${resumed.url}/spectate`))[0].data.inspection.agents[0].attributes.Presence, "active");
  } finally { await running.close(); if (resumed) await resumed.close(); }
});

it("checkpoints identity, physics and journal, then opens the correct archived world after a reset", async () => {
  const root = join(temporary, "archive");
  const snapshotPath = join(temporary, "checkpoint.json");
  const running = await start({ recordDir: root, snapshotPath });
  let resumed;
  try {
    const { session } = running.world.join("Eko");
    running.world.apply(session, { type: "MoveTo", data: { position: [0, 1, 0] } });
    for (let i = 0; i < 60; i++) running.tick();
    await running.checkpoint();
    const saved = JSON.parse(readFileSync(snapshotPath, "utf8"));
    assert.equal(saved.instanceId, running.world.instanceId);
    assert.equal(verifyCheckpoint(saved).tick, running.world.tick);
    assert.throws(() => verifyCheckpoint({ ...saved, tick: saved.tick + 1 }), /checksum/);
    const healthBefore = await json(`${running.url}/healthz`);
    assert.equal(healthBefore.body.checkpoint.lastSaved.sha256, saved.recovery.sha256);
    const oldCursor = (await opening(`${running.url}/spectate`)).find(entry => entry.event === "action").data.id;
    resumed = await start({ snapshot: saved });
    assert.deepEqual(resumed.world.observe(session), running.world.observe(session));
    const restarted = await opening(`${resumed.url}/spectate?after=${oldCursor}`);
    assert.equal(restarted[0].data.journal.reset, true);
    assert.equal(restarted.filter(entry => entry.event === "action").length, 1);
    resumed.world.apply(session, { type: "Stop", data: {} }); resumed.tick();
    const newActions = (await opening(`${resumed.url}/spectate`)).filter(entry => entry.event === "action");
    assert.notEqual(newActions.at(-1).data.id, oldCursor);
    const id = saved.instanceId;
    await switchWorld(running); // flushes the old archive
    const health = await json(`${running.url}/recordings/${id}/healthz`);
    assert.equal(health.body.instanceId, id);
    assert.equal(health.body.replay, true);
    await json(`${running.url}/recordings/${id}/replay/seek?tick=60`, "POST");
    const replay = await opening(`${running.url}/recordings/${id}/spectate`);
    assert.equal(replay[0].data.instanceId, id);
    assert.equal((await json(`${running.url}/recordings/${id}/join`, "POST")).status, 404);
    assert.equal((await json(`${running.url}/recordings/not-an-id/healthz`)).status, 404);
    const recording = parseRecording(readFileSync(join(root, "instances", id, "graphysx-recording.ndjson"), "utf8"));
    assert.equal(recording.frames.length, 10);
    assert.equal(recording.frames.filter(frame => frame.inspection).length, 1, "inspection once per second, poses at 10 Hz");
    const fullBytes = JSON.stringify({ ...recording.frames[0], inspection: saved.document }).length;
    assert.ok(JSON.stringify(recording.frames[0]).length < fullBytes / 2);
    const boundRun = "00000000-0000-4000-8000-000000000001";
    const headers = { "x-operator-token": "fixture" };
    const one = await json(`${running.url}/world`, "POST", { world: "mesa-island", force: true, runId: boundRun }, headers);
    const two = await json(`${running.url}/world`, "POST", { world: "mesa-island", force: true, runId: boundRun }, headers);
    assert.equal(one.body.instanceId, two.body.instanceId, "same request reconciles without a replacement world");
  } finally { await running.close(); if (resumed) await resumed.close(); }
});

it("bounds recording queues and reports failure without deleting any accepted archive data", async () => {
  const root = join(temporary, "bounded");
  const archive = new Archive(root, { maxBytes: 30 });
  await archive.start("00000000-0000-4000-8000-000000000001");
  archive.write({ tick: 1 });
  archive.write({ text: "x".repeat(100) });
  assert.match(archive.status().error, /limit/);
  await archive.close();
  assert.equal(readFileSync(join(root, "instances", "00000000-0000-4000-8000-000000000001", "graphysx-recording.ndjson"), "utf8"), '{"tick":1}\n');
  await atomicSnapshot(join(temporary, "atomic.json"), { a: 1 });
  await atomicSnapshot(join(temporary, "atomic.json"), { a: 2 });
  assert.deepEqual(JSON.parse(readFileSync(join(temporary, "atomic.json"), "utf8")), { a: 2 });
});

it("reduces repeated living-island metadata while preserving a full inspection every second", () => {
  const world = new module.IslandWorld(undefined, { world: "living-island" });
  world.join("Fixture");
  for (let i = 0; i < 60; i++) world.step();
  const full = Buffer.byteLength(JSON.stringify(world.poseFrame()));
  const compact = Buffer.byteLength(JSON.stringify(world.poseFrame(false)));
  assert.ok((full + 9 * compact) / (10 * full) < 0.25, "at least 75% less repeated frame payload in this synthetic initial fixture");
});

it("registers an old archive without exposing paths and rejects reassignment or changed bytes", async () => {
  const root = join(temporary, "legacy-root");
  const old = join(root, "old-timestamp");
  mkdirSync(old, { recursive: true });
  const world = new module.IslandWorld();
  const hello = world.sceneHello();
  delete hello.instanceId;
  writeFileSync(join(old, "graphysx-recording.ndjson"), JSON.stringify({ kind: "hello", ...hello }) + "\n");
  const registered = await registerRecording(root, old);
  await assert.rejects(registerRecording(root, old, registered.recordingId), /EEXIST/);
  await assert.rejects(registerRecording(root, temporary), /ENOENT|inside/);
  const running = await start({ recordDir: root });
  try {
    const result = await json(`${running.url}/recordings/${registered.recordingId}/healthz`);
    assert.equal(result.body.instanceId, registered.instanceId);
    assert.equal(result.body.identitySource, "registered-legacy");
  } finally { await running.close(); }
  // Verify the immutable registration receipt, rather than silently reading changed content.
  appendFileSync(join(old, "graphysx-recording.ndjson"), "{}\n");
  const again = await start({ recordDir: root });
  try { assert.equal((await json(`${again.url}/recordings/${registered.recordingId}/healthz`)).status, 404); }
  finally { await again.close(); }
});

it("requires explicit fresh startup and refuses missing, corrupt or mismatched recovery checkpoints", async () => {
  const path = join(temporary, "startup.json");
  assert.throws(() => loadStartupSnapshot({ startMode: "resume" }), /requires/);
  assert.throws(() => loadStartupSnapshot({ startMode: "resume", snapshotPath: path }), /does not exist/);
  assert.equal(loadStartupSnapshot({ startMode: "fresh", snapshotPath: path }).snapshot, undefined);
  const world = new module.IslandWorld();
  await atomicSnapshot(path, world.snapshot());
  const legacy = loadStartupSnapshot({ startMode: "resume", snapshotPath: path }).snapshot;
  assert.equal(new module.IslandWorld(legacy).instanceId, world.instanceId);
  writeFileSync(path, "{");
  assert.throws(() => loadStartupSnapshot({ resumePath: path }), SyntaxError);
  assert.throws(() => loadStartupSnapshot({ startMode: "surprise", snapshotPath: path }), /fresh or resume/);
});

it("creates periodic durable checkpoints without a caller requesting a save", async () => {
  const path = join(temporary, "periodic.json");
  const running = await start({ snapshotPath: path, snapshotEveryMs: 20 });
  try {
    running.world.join("Fixture");
    for (let i = 0; i < 24; i++) running.tick();
    const deadline = Date.now() + 2000;
    let saved;
    while (Date.now() < deadline) {
      saved = JSON.parse(readFileSync(path, "utf8"));
      if (saved.tick === 24) break;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.equal(saved.tick, 24);
    assert.equal(verifyCheckpoint(saved).instanceId, running.world.instanceId);
    const restored = new module.IslandWorld(saved);
    assert.equal(restored.agentCount, 1);
    assert.deepEqual(restored.poseFrame(), running.world.poseFrame());
  } finally { await running.close(); }
});

it("keeps a resume hello readable after a torn archival write and bounds catchup bytes", async () => {
  const id = "00000000-0000-4000-8000-000000000003";
  const root = join(temporary, "torn");
  const dir = join(root, "instances", id);
  mkdirSync(dir, { recursive: true });
  const hello = new module.IslandWorld().sceneHello();
  const path = join(dir, "graphysx-recording.ndjson");
  writeFileSync(path, JSON.stringify({ kind: "hello", ...hello, instanceId: id }) + '\n{"kind":"frame"');
  const archive = new Archive(root);
  await archive.start(id);
  archive.write({ kind: "hello", ...hello, instanceId: id, tick: 10, resumedFromTick: 10 });
  await archive.close();
  const parsed = parseRecording(readFileSync(path, "utf8"));
  assert.equal(parsed.skipped, 1);
  assert.equal(parsed.hellos.at(-1).tick, 10);
  const running = await start();
  try {
    const { session } = running.world.join("Fixture");
    for (let i = 0; i < 10; i++) { running.world.apply(session, { type: "Stop", data: { text: "x".repeat(64000) } }); running.tick(); }
    const opened = await opening(`${running.url}/spectate`);
    const actions = opened.filter(entry => entry.event === "action").map(entry => entry.data);
    assert.ok(actions.length < 10);
    assert.ok(Buffer.byteLength(JSON.stringify(actions)) <= 256 * 1024);
    assert.equal(opened[0].data.journal.truncated, true);
    assert.equal(actions.at(-1).sequence, 10);
  } finally { await running.close(); }
});
