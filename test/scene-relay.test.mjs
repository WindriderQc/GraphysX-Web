import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createRelay, createSceneStoreServer } from "../server/scene-store.mjs";

const response = (writableLength = 0) => {
  const target = new EventEmitter();
  const state = {
    writes: [],
    responseDestroyed: false,
    socketDestroyed: false,
    status: null,
    headers: null,
    body: "",
    ended: false,
  };
  const socket = { destroy: () => { state.socketDestroyed = true; } };
  return Object.assign(target, {
    state,
    socket,
    writableLength,
    headersSent: false,
    writableEnded: false,
    destroyed: false,
    writeHead(status, headers) {
      state.status = status;
      state.headers = headers;
      this.headersSent = true;
      return this;
    },
    write(frame) {
      state.writes.push(frame);
      return true;
    },
    end(body = "") {
      state.body += String(body);
      state.ended = true;
      this.writableEnded = true;
      this.emit("finish");
      return this;
    },
    destroy() {
      state.responseDestroyed = true;
      if (!this.destroyed) {
        this.destroyed = true;
        this.emit("close");
      }
      return this;
    },
  });
};

const request = (url) => Object.assign(new EventEmitter(), {
  method: "GET",
  url,
  headers: {},
  aborted: false,
  destroyed: false,
});

const waitUntil = async (predicate, label, remaining = 100) => {
  if (predicate()) return;
  if (remaining <= 0) throw new Error(`Timed out waiting for ${label}`);
  await new Promise((resolve) => setTimeout(resolve, 5));
  return waitUntil(predicate, label, remaining - 1);
};

const createTimerHarness = () => {
  const timers = new Set();
  return {
    timers,
    setStreamInterval(callback, milliseconds) {
      const timer = { callback, milliseconds, unref() {} };
      timers.add(timer);
      return timer;
    },
    clearStreamInterval(timer) {
      timers.delete(timer);
    },
  };
};

const seedScene = (store) => store.put("scene", {
  schema: "graphysx.agent-world/v2",
  id: "scene",
  label: "Relay admission fixture",
  entities: [],
}, 0);

describe("scene relay retention", () => {
  it("reports resync after restart or a gap, while a current cursor resumes cleanly", () => {
    const empty = createRelay();
    assert.equal(empty.catchUp("scene", 1, 2), null);
    assert.deepEqual(empty.catchUp("scene", 2, 2), []);
    assert.equal(empty.catchUp("scene", 3, 2), null);

    const relay = createRelay();
    relay.publish("scene", { revision: 2, commands: [] });
    assert.equal(relay.catchUp("scene", 0, 2), null);
    const replay = relay.catchUp("scene", 1, 2);
    assert.equal(replay.length, 1);
    assert.match(replay[0], /^id: 2/m);
  });

  it("strictly bounds one scene and the global LRU, including oversized lone frames", () => {
    const relay = createRelay({ limits: { entries: 2, sceneBytes: 120, totalBytes: 180, names: 2 } });
    relay.publish("a", { revision: 1, value: "a" });
    relay.publish("b", { revision: 1, value: "b" });
    relay.publish("c", { revision: 1, value: "c" });
    assert.ok(relay.backlogStats().names <= 2);
    assert.ok(relay.backlogStats().bytes <= 180);

    relay.publish("oversized", { revision: 1, value: "x".repeat(500) });
    assert.equal(relay.catchUp("oversized", 0, 1), null);
    assert.ok(relay.backlogStats().bytes <= 180);
  });

  it("sweeps idle unwatched names on later activity", () => {
    let at = 0;
    const relay = createRelay({ now: () => at, limits: { idleMs: 10 } });
    relay.publish("old", { revision: 1 });
    at = 11;
    relay.publish("new", { revision: 1 });
    assert.equal(relay.catchUp("old", 0, 1), null);
    assert.equal(relay.backlogStats().names, 1);
  });

  it("uses projected bytes and hard-destroys a stalled subscriber immediately", () => {
    const relay = createRelay({ limits: { streamBytes: 32 } });
    const stalled = response(31);
    relay.subscribe("scene", stalled);
    relay.publish("scene", { revision: 1, commands: [] });
    assert.equal(relay.subscriberCount("scene"), 0);
    assert.equal(stalled.state.responseDestroyed, true);
    assert.equal(stalled.state.socketDestroyed, true);
  });
});

describe("scene relay subscriber admission", () => {
  it("enforces deterministic per-scene and global caps without retaining refusals", () => {
    const relay = createRelay({ limits: { subscribersPerScene: 2, subscribersTotal: 3 } });
    const first = response();
    const second = response();
    const refusedByScene = response();
    const third = response();
    const refusedGlobally = response();

    assert.equal(typeof relay.subscribe("a", first), "function");
    assert.equal(typeof relay.subscribe("a", second), "function");
    assert.equal(relay.subscribe("a", refusedByScene), null);
    assert.equal(typeof relay.subscribe("b", third), "function");
    assert.equal(relay.subscribe("c", refusedGlobally), null);
    assert.equal(relay.subscriberCount("a"), 2);
    assert.equal(relay.subscriberCount("b"), 1);
    assert.equal(relay.subscriberCount("c"), 0);
    assert.deepEqual(refusedByScene.state.writes, []);
    assert.deepEqual(refusedGlobally.state.writes, []);
  });

  it("releases capacity idempotently after close or a stream write error", () => {
    const relay = createRelay({ limits: { subscribersPerScene: 1, subscribersTotal: 1 } });
    const first = response();
    const releaseFirst = relay.subscribe("scene", first);
    assert.equal(typeof releaseFirst, "function");
    assert.equal(relay.subscribe("scene", response()), null);

    releaseFirst();
    releaseFirst();
    assert.equal(relay.subscriberCount("scene"), 0);

    const broken = response();
    broken.write = () => { throw new Error("socket failed"); };
    assert.equal(typeof relay.subscribe("scene", broken), "function");
    assert.equal(relay.write("scene", broken, "data: x\n\n"), false);
    assert.equal(relay.subscriberCount("scene"), 0);
    assert.equal(broken.state.responseDestroyed, true);
    assert.equal(broken.state.socketDestroyed, true);
    assert.equal(typeof relay.subscribe("scene", response()), "function");
  });

  it("returns 429 before a refused request owns SSE headers, a subscriber slot, or a timer", async (t) => {
    const dir = await mkdtemp(join(tmpdir(), "graphysx-scene-relay-"));
    const timerHarness = createTimerHarness();
    const engine = createSceneStoreServer({
      dir,
      relayLimits: { subscribersPerScene: 1, subscribersTotal: 1 },
      setStreamInterval: timerHarness.setStreamInterval,
      clearStreamInterval: timerHarness.clearStreamInterval,
    });
    t.after(async () => {
      await engine.sessions.closeAll();
      await rm(dir, { recursive: true, force: true });
    });
    await seedScene(engine.store);

    const admittedRequest = request("/scenes/scene/stream");
    const admittedResponse = response();
    engine.server.emit("request", admittedRequest, admittedResponse);
    await waitUntil(() => admittedResponse.state.status === 200, "first stream admission");
    assert.equal(engine.relay.subscriberCount("scene"), 1);
    assert.equal(timerHarness.timers.size, 1);

    const refusedRequest = request("/scenes/scene/stream");
    const refusedResponse = response();
    engine.server.emit("request", refusedRequest, refusedResponse);
    await waitUntil(() => refusedResponse.state.ended, "capacity refusal");
    const refusalBody = JSON.parse(refusedResponse.state.body);
    assert.equal(refusedResponse.state.status, 429);
    assert.match(String(refusedResponse.state.headers["content-type"]), /^application\/json/);
    assert.equal(refusedResponse.state.headers["retry-after"], "5");
    assert.equal(refusalBody.code, "scene-stream-capacity");
    assert.equal(refusedResponse.state.writes.length, 0);
    assert.equal(engine.relay.subscriberCount("scene"), 1);
    assert.equal(timerHarness.timers.size, 1);

    admittedResponse.emit("close");
    assert.equal(engine.relay.subscriberCount("scene"), 0);
    assert.equal(timerHarness.timers.size, 0);

    const readmittedRequest = request("/scenes/scene/stream");
    const readmittedResponse = response();
    engine.server.emit("request", readmittedRequest, readmittedResponse);
    await waitUntil(() => readmittedResponse.state.status === 200, "stream re-admission");
    assert.equal(engine.relay.subscriberCount("scene"), 1);
    assert.equal(timerHarness.timers.size, 1);
    readmittedResponse.emit("error", new Error("socket failed"));
    assert.equal(engine.relay.subscriberCount("scene"), 0);
    assert.equal(timerHarness.timers.size, 0);
  });

  it("does not admit a client that disconnects while the scene read is pending", async (t) => {
    const dir = await mkdtemp(join(tmpdir(), "graphysx-scene-relay-race-"));
    const timerHarness = createTimerHarness();
    const engine = createSceneStoreServer({
      dir,
      relayLimits: { subscribersPerScene: 1, subscribersTotal: 1 },
      setStreamInterval: timerHarness.setStreamInterval,
      clearStreamInterval: timerHarness.clearStreamInterval,
    });
    t.after(async () => {
      await engine.sessions.closeAll();
      await rm(dir, { recursive: true, force: true });
    });
    await seedScene(engine.store);

    const originalGet = engine.store.get.bind(engine.store);
    let releaseRead;
    const heldRead = new Promise((resolve) => { releaseRead = resolve; });
    let markReadStarted;
    const readStarted = new Promise((resolve) => { markReadStarted = resolve; });
    let markReadReturned;
    const readReturned = new Promise((resolve) => { markReadReturned = resolve; });
    engine.store.get = async (name) => {
      const record = await originalGet(name);
      markReadStarted();
      await heldRead;
      markReadReturned();
      return record;
    };

    const abandonedRequest = request("/scenes/scene/stream");
    const abandonedResponse = response();
    engine.server.emit("request", abandonedRequest, abandonedResponse);
    await readStarted;
    abandonedRequest.aborted = true;
    abandonedRequest.destroyed = true;
    abandonedResponse.destroyed = true;
    abandonedRequest.emit("aborted");
    abandonedResponse.emit("close");
    releaseRead();
    await readReturned;
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(abandonedResponse.state.status, null);
    assert.deepEqual(abandonedResponse.state.writes, []);
    assert.equal(engine.relay.subscriberCount("scene"), 0);
    assert.equal(timerHarness.timers.size, 0);
  });
});
