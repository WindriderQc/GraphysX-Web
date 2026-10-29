// GraphysX world recordings: the seekable timeline (world-service/recording.mjs) and the
// read-only replay server (world-service/replay.mjs) the island viewer plays. CPU only.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { frameAt, helloAt, nextActionAfter, parseRecording } from "../world-service/recording.mjs";
import { startReplayServer } from "../world-service/replay.mjs";
import { IMAGE_DEFAULT, parseImageSize, pngSize, verticalFovDegrees } from "../world-service/image.mjs";

const FORMAT = "graphysx-world-stream/v1";
const doc = (entities) => ({ schema: "graphysx.agent-world/v2", id: "mesa-island", label: "Mesa island", environment: {}, entities });
const line = (value) => JSON.stringify(value);
const frame = (tick, x) => ({ kind: "frame", tick, t: tick / 60, poses: [[29, x, 0.4, 0, 0, 0, 0, 1]] });

/** Two minutes of a small world: a join, a pickup, a rock burst, a culled block, then a resume. */
function sampleRecording() {
  const lines = [
    { kind: "hello", format: FORMAT, tickHz: 60, tick: 0, document: doc([{ id: "ground", type: "box" }, { id: "block_1", type: "box" }]), ids: { 9: "ground", 29: "block_1" }, resumedFromTick: null },
  ];
  for (let tick = 6; tick <= 1200; tick += 6) lines.push(frame(tick, tick / 60));
  lines.push({ kind: "entities", tick: 61, added: [{ entity: { id: "agent-43", label: "Eko", type: "agent" }, numericId: 43 }] });
  lines.push({ kind: "action", tick: 400, agent: "Eko", input: { type: "Pickup", data: { position: [1, 0.4, 0] } }, result: "PickupSuccess" });
  lines.push({ kind: "entities", tick: 600, added: [{ entity: { id: "impactblock_1", type: "box" }, numericId: 50 }] });
  lines.push({ kind: "entities", tick: 900, removed: [29] });
  lines.push({ kind: "action", tick: 1100, agent: "Eko", input: { type: "Throw", data: { direction: [0, 0, -1] } }, result: "ThrowSuccess" });
  lines.sort((a, b) => a.tick - b.tick);
  return lines.map(line).join("\n") + "\n";
}

describe("recording timeline", () => {
  it("indexes frames, changes and actions, skipping a torn last line", () => {
    const recording = parseRecording(`${sampleRecording()}{"kind":"frame","tick":12`);
    assert.equal(recording.firstTick, 0);
    assert.equal(recording.lastTick, 1200);
    assert.equal(recording.frames.length, 200);
    assert.equal(recording.actions.length, 2);
    assert.equal(recording.skipped, 1);
    assert.throws(() => parseRecording(line(frame(6, 0))), /no hello/);
  });

  it("rebuilds the document at any tick", () => {
    const recording = parseRecording(sampleRecording());
    assert.deepEqual(helloAt(recording, 30).document.entities.map((e) => e.id), ["ground", "block_1"], "before the join");
    const mid = helloAt(recording, 700);
    assert.equal(mid.format, FORMAT);
    assert.equal(mid.replay, true, "the viewer can tell a replay from a live world");
    assert.equal(mid.tick, 700);
    assert.deepEqual(mid.document.entities.map((e) => e.id), ["ground", "block_1", "agent-43", "impactblock_1"]);
    assert.deepEqual(mid.ids, { 9: "ground", 29: "block_1", 43: "agent-43", 50: "impactblock_1" });
    const late = helloAt(recording, 1000);
    assert.deepEqual(late.document.entities.map((e) => e.id), ["ground", "agent-43", "impactblock_1"], "the culled block is gone");
    assert.equal(late.ids[29], undefined);
    assert.equal(frameAt(recording, 700).tick, 696);
    assert.equal(frameAt(recording, 3), null);
    assert.equal(nextActionAfter(recording, 400).tick, 1100);
    assert.equal(nextActionAfter(recording, 1100), null);
  });

  it("a resumed world's timeline replaces what the old one recorded after the resumed tick", () => {
    const resumed = [
      { kind: "hello", format: FORMAT, tickHz: 60, tick: 500, document: doc([{ id: "ground", type: "box" }, { id: "block_1", type: "box" }, { id: "agent-43", type: "agent", label: "Eko" }]), ids: { 9: "ground", 29: "block_1", 43: "agent-43" }, resumedFromTick: 500 },
      frame(504, 99),
      { kind: "action", tick: 520, agent: "Eko", input: { type: "Jump", data: {} }, result: "PickupSuccess" },
    ].map(line).join("\n");
    const recording = parseRecording(`${sampleRecording()}${resumed}\n`);
    assert.equal(recording.hellos.length, 2);
    assert.equal(recording.lastTick, 520);
    assert.deepEqual(recording.actions.map((a) => a.tick), [400, 520], "the old timeline after tick 500 is dropped");
    assert.equal(frameAt(recording, 1000).poses[0][1], 99, "frames after the resume come from the resumed world");
    assert.deepEqual(helloAt(recording, 510).document.entities.map((e) => e.id), ["ground", "block_1", "agent-43"]);
    assert.deepEqual(helloAt(recording, 450).document.entities.map((e) => e.id), ["ground", "block_1", "agent-43"], "before the resume: the first hello plus its changes");
  });
});

/** Read SSE events from a fetch body until `done(events)` or the deadline. */
async function readEvents(url, done, ms = 3000) {
  const controller = new AbortController();
  const response = await fetch(url, { signal: controller.signal });
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const events = [];
  let buffer = "";
  const deadline = Date.now() + ms;
  let pending = null; // one read at a time, kept across timeouts so no chunk is lost
  try {
    while (Date.now() < deadline && !done(events)) {
      pending ??= reader.read();
      const chunk = await Promise.race([pending, new Promise((resolve) => setTimeout(() => resolve(null), 100))]);
      if (!chunk) continue;
      pending = null;
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value);
      let cut;
      while ((cut = buffer.indexOf("\n\n")) >= 0) {
        const block = buffer.slice(0, cut);
        buffer = buffer.slice(cut + 2);
        const name = /^event: (.+)$/m.exec(block)?.[1];
        const data = /^data: (.+)$/m.exec(block)?.[1];
        if (name && data) events.push({ name, data: JSON.parse(data) });
      }
    }
  } finally {
    controller.abort();
  }
  return { response, events };
}

describe("replay server", () => {
  it("answers like a replay source: health, info, actions, shared transport and SSE", async () => {
    const running = await startReplayServer({ recording: parseRecording(sampleRecording()), port: 0, realtime: false });
    const get = async (path, init) => {
      const response = await fetch(`${running.url}${path}`, init);
      return { status: response.status, cors: response.headers.get("access-control-allow-origin"), body: await response.json() };
    };
    try {
      const health = await get("/healthz");
      assert.deepEqual(health.body, { ok: true, tick: 0, replay: true });
      assert.equal(health.cors, "*", "the viewer runs on another origin");
      assert.deepEqual((await get("/replay/info")).body, { current_tick: 0, total_ticks: 1200, first_tick: 0, tick_rate: 60, speed: 1, paused: true, skip_idle: false }, "Clawblox's /replay/info shape, paused at the start");
      assert.equal((await get("/replay/actions")).body.actions.length, 2);
      assert.equal((await get("/replay/seek?tick=x", { method: "POST" })).status, 400);
      assert.equal((await get("/replay/speed?value=99", { method: "POST" })).status, 400);
      assert.equal((await get("/join", { method: "POST" })).status, 404, "nothing can join a replay");

      // A spectator gets the document at the shared clock, then what the clock passes.
      const seeked = await get("/replay/seek?tick=700", { method: "POST" });
      assert.equal(seeked.body.current_tick, 700);
      const opening = await readEvents(`${running.url}/spectate`, (events) => events.length >= 2);
      assert.equal(opening.response.headers.get("content-type"), "text/event-stream; charset=utf-8");
      assert.equal(opening.events[0].name, "hello");
      assert.equal(opening.events[0].data.tick, 700);
      assert.ok(opening.events[0].data.document.entities.some((e) => e.id === "impactblock_1"));
      assert.deepEqual([opening.events[1].name, opening.events[1].data.tick], ["frame", 696]);

      await get("/replay/speed?value=4", { method: "POST" });
      await get("/replay/play", { method: "POST" });
      const playing = readEvents(`${running.url}/spectate`, (events) => events.some((e) => e.name === "entities"));
      await new Promise((resolve) => setTimeout(resolve, 100));
      running.advance(1); // 60 ticks x4 = 240 ticks: past the cull at 900
      const passed = await playing;
      const removed = passed.events.find((e) => e.name === "entities");
      assert.deepEqual(removed.data.removed, [29], "the culled block is announced as the clock passes it");
      assert.ok(passed.events.some((e) => e.name === "frame" && e.data.tick > 900));
      assert.equal(running.info().current_tick, 940);

      running.advance(10);
      assert.deepEqual([running.info().current_tick, running.info().paused], [1200, true], "it stops at the end");
      assert.equal((await get("/replay/play", { method: "POST" })).body.current_tick, 0, "play at the end starts over");

      // Skip-idle jumps to just before the next action when nothing happens for a while.
      await get("/replay/skip-idle?enabled=true", { method: "POST" });
      running.advance(0.05);
      assert.equal(running.info().current_tick, 340, "one second before the pickup at 400");
    } finally {
      await running.close();
    }
  });
});

describe("first-person image contract", () => {
  it("parses sizes like Clawblox and derives the vertical field of view", () => {
    const params = (query) => new URLSearchParams(query);
    assert.deepEqual(parseImageSize(params("")), IMAGE_DEFAULT);
    assert.deepEqual(IMAGE_DEFAULT, { width: 1088, height: 640 });
    assert.deepEqual(parseImageSize(params("width=320&height=180")), { width: 320, height: 180 });
    assert.deepEqual(parseImageSize(params("width=10&height=99999")), { width: 64, height: 1080 }, "clamped to 64..1920 x 64..1080");
    assert.match(parseImageSize(params("width=abc")).error, /whole number/);
    assert.match(parseImageSize(params("height=-5")).error, /whole number/);
    assert.ok(Math.abs(verticalFovDegrees(105, 1088, 640) - 74.948) < 0.001, "105° horizontal at 1088x640");
    assert.ok(Math.abs(verticalFovDegrees(90, 100, 100) - 90) < 1e-9);
  });

  it("reads a PNG's size from its header", () => {
    const header = Buffer.alloc(24);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(header, 0);
    header.write("IHDR", 12, "ascii");
    header.writeUInt32BE(1088, 16);
    header.writeUInt32BE(640, 20);
    assert.deepEqual(pngSize(header), { width: 1088, height: 640 });
    assert.equal(pngSize(Buffer.from("not a png at all, really")), null);
  });
});
