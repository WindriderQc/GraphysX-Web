import assert from "node:assert/strict";
import { it } from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { SegmentedArchive, recordingParts } from "../world-service/segments.mjs";
import { replayArchives } from "../world-service/archive.mjs";
import { parseRecording } from "../world-service/recording.mjs";
const id = "00000000-0000-4000-8000-000000000001";
const hello = tick => ({ kind: "hello", tick, instanceId: id, recordingId: id,
  format: "graphysx-world-stream/v1", tickHz: 60,
  document: { schema: "graphysx.agent-world/v2", entities: [] }, ids: {} });

it("rotates independently readable segments, resumes without touching old bytes and stops at a finite quota", async () => {
  const root = await mkdtemp(join(tmpdir(), "world-segments-"));
  const limits = { maxBytes: 1024, segmentBytes: 1024, instanceBytes: 5000, totalBytes: 10000 };
  const archive = new SegmentedArchive(root, limits);
  try {
    await archive.start(id);
    let tick = 0;
    archive.seed = () => [hello(tick)];
    archive.write(hello(0));
    for (tick = 1; tick < 12; tick++) archive.write({ kind: "frame", tick, poses: [], padding: "x".repeat(200) });
    await archive.close();
    const parts = await recordingParts(root, id);
    assert.ok(parts.length >= 3);
    const originals = await Promise.all(parts.map(part => readFile(join(root, "instances", id, part.name))));
    for (let i = 0; i < parts.length; i++) {
      assert.ok(parts[i].bytes <= limits.segmentBytes);
      assert.equal(parseRecording(originals[i].toString()).hellos[0].instanceId, id);
    }
    await archive.start(id);
    archive.write(hello(12));
    for (tick = 13; tick < 100; tick++) archive.write({ kind: "frame", tick, poses: [], padding: "x".repeat(200) });
    await archive.close();
    assert.match(archive.status().error, /quota/);
    assert.ok(archive.status().bytes <= limits.instanceBytes);
    for (let i = 0; i < parts.length; i++) assert.deepEqual(await readFile(join(root, "instances", id, parts[i].name)), originals[i]);
  } finally { await archive.close(); await rm(root, { recursive: true, force: true }); }
});

it("lists metadata without loading a replay, serves the selected segment, and releases idle readers", async () => {
  const root = await mkdtemp(join(tmpdir(), "world-segment-replay-"));
  const archive = new SegmentedArchive(root);
  await archive.start(id); archive.write(hello(10)); archive.write({ kind: "frame", tick: 20, poses: [] }); await archive.close();
  await archive.start(id); archive.write(hello(30)); archive.write({ kind: "frame", tick: 40, poses: [] }); await archive.close();
  const router = replayArchives(root, { idleMs: 40, cleanupEveryMs: 10 });
  const server = createServer(async (req, res) => { if (!await router.handle(req, res, new URL(req.url, "http://fixture"))) { res.writeHead(404); res.end(); } });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}/recordings/${id}`;
  try {
    const parts = await (await fetch(`${base}/parts`)).json();
    assert.deepEqual(parts.parts.map(part => part.id), [0, 1]);
    assert.ok(!JSON.stringify(parts).includes("ndjson"));
    assert.equal(router.status().openReaders, 0);
    const health = await (await fetch(`${base}/parts/1/healthz`)).json();
    assert.equal(health.instanceId, id); assert.equal(health.tick, 30);
    assert.equal((await (await fetch(`${base}/parts/1/replay/info`)).json()).total_ticks, 40);
    assert.equal((await fetch(`${base}/parts/99/healthz`)).status, 404);
    const deadline = Date.now() + 2000;
    while (router.status().openReaders && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(router.status().openReaders, 0); assert.equal(router.status().residentBytes, 0);
    assert.equal((await (await fetch(`${base}/parts/1/healthz`)).json()).tick, 30, "idle eviction reloads the same selected archive");
  } finally { await router.close(); await new Promise(resolve => server.close(resolve)); await rm(root, { recursive: true, force: true }); }
});

it("never appends a resume to a full or torn legacy file", async () => {
  const root = await mkdtemp(join(tmpdir(), "world-legacy-preserve-"));
  const archive = new SegmentedArchive(root, { maxBytes: 1024 });
  try {
    await archive.start(id); archive.write(hello(0)); await archive.close();
    const file = join(root, "instances", id, "graphysx-recording.ndjson");
    const original = Buffer.concat([await readFile(file), Buffer.from('{' + "x".repeat(1100))]);
    await writeFile(file, original);
    await archive.start(id); archive.write(hello(30)); await archive.close();
    assert.deepEqual(await readFile(file), original);
    assert.equal((await recordingParts(root, id)).length, 2);
  } finally { await archive.close(); await rm(root, { recursive: true, force: true }); }
});

it("reports a full disk without overwriting previously accepted segments", async () => {
  const root = await mkdtemp(join(tmpdir(), "world-enospc-"));
  const archive = new SegmentedArchive(root);
  try {
    await archive.start(id); archive.write(hello(0)); await archive.close();
    const file = join(root, "instances", id, "graphysx-recording.ndjson");
    const original = await readFile(file);
    const failed = new SegmentedArchive(root, { openFile: async () => { throw Object.assign(new Error("fixture full disk"), { code: "ENOSPC" }); } });
    await failed.start(id); failed.write(hello(10)); await failed.close();
    assert.match(failed.status().error, /ENOSPC/);
    assert.equal(failed.status().pendingBytes, 0);
    assert.deepEqual(await readFile(file), original);
  } finally { await archive.close(); await rm(root, { recursive: true, force: true }); }
});

it("keeps flush and shutdown bounded when disk synchronization fails", async () => {
  const root = await mkdtemp(join(tmpdir(), "world-sync-full-"));
  let closed = false;
  const archive = new SegmentedArchive(root, { openFile: async () => ({
    writeFile: async () => {}, sync: async () => { throw Object.assign(new Error("full"), { code: "ENOSPC" }); },
    close: async () => { closed = true; }
  }) });
  try {
    await archive.start(id); archive.write(hello(0)); await archive.flush();
    assert.match(archive.status().error, /sync failed: ENOSPC/);
    await archive.close(); assert.equal(closed, true);
  } finally { await archive.close(); await rm(root, { recursive: true, force: true }); }
});
