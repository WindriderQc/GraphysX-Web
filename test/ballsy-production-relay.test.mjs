import assert from "node:assert/strict";
import { createServer, request as httpRequest } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import test from "node:test";
import { BALLSY_HTTP_LIMITS as LIMITS, ballsyRequestContext, createBallsyRoute } from "../server/ballsy-http.mjs";
import { startSceneStore } from "../server/scene-store.mjs";
import { importBrowserModule } from "./support/import-browser-module.mjs";

const { createVolcano } = await importBrowserModule(new URL("../src/ballsy-volcano.ts", import.meta.url));
const snapshot = () => ({ roundId: "production-round-123456", phase: "racing", ally: null, volcano: createVolcano("challenge"),
  players: [0, 1].map((i) => ({ id: `ballsy-p${i + 1}`, position: [-4, 0.7, 8 + i * 2], lap: 0, finished: false })) });

async function listen(t, handler) {
  const server = createServer(handler);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  });
  return `http://127.0.0.1:${server.address().port}`;
}

test("proxy headers are ignored unless the explicit store mount trusts its loopback TCP peer", () => {
  const req = (address, headers = {}, encrypted = false) => ({ socket: { remoteAddress: address, encrypted },
    headers: { host: "graphysx.example", origin: "https://graphysx.example", "x-forwarded-proto": "https", "x-real-ip": "198.51.100.7", ...headers } });
  for (const address of ["127.0.0.1", "::1", "::ffff:127.0.0.1"]) {
    assert.deepEqual(ballsyRequestContext(req(address), { trustedLoopbackProxy: true }), { origin: "https://graphysx.example", address: "198.51.100.7" });
    assert.throws(() => ballsyRequestContext(req(address)), { status: 403 }, "private preview never trusts forwarding headers");
  }
  assert.throws(() => ballsyRequestContext(req("198.51.100.8"), { trustedLoopbackProxy: true }), { status: 403 });
  assert.deepEqual(ballsyRequestContext(req("198.51.100.8", { origin: "http://graphysx.example" }), { trustedLoopbackProxy: true }),
    { origin: "http://graphysx.example", address: "198.51.100.8" });
  for (const headers of [{ "x-forwarded-proto": "https,http" }, { "x-real-ip": "198.51.100.1, 127.0.0.1" }, { "x-real-ip": "no-address" },
    { origin: "https://evil.example", "x-forwarded-host": "evil.example" }, { origin: "null" }, { host: "good.example@evil.example" }]) {
    assert.throws(() => ballsyRequestContext(req("127.0.0.1", headers), { trustedLoopbackProxy: true }), { status: 403 });
  }
  assert.equal(ballsyRequestContext(req("127.0.0.1", { "x-forwarded-for": "1.2.3.4" }), { trustedLoopbackProxy: true }).address, "198.51.100.7");
});

test("the existing /store proxy serves game rooms without sharing store authority or CORS", async t => {
  const root = await mkdtemp(path.join(tmpdir(), "graphysx-ballsy-store-"));
  const store = await startSceneStore({ port: 0, dir: path.join(root, "scenes"), assetDir: path.join(root, "assets"), datalakeDir: null, token: "test-store-only-credential" });
  t.after(async () => {
    await store.close();
    assert.equal(path.dirname(root), path.resolve(tmpdir()));
    assert.match(path.basename(root), /^graphysx-ballsy-store-/);
    await rm(root, { recursive: true, force: true });
  });
  const origin = "https://graphysx.example";
  const proxy = await listen(t, (req, res) => {
    const upstream = httpRequest(new URL(req.url.replace(/^\/store/, ""), store.url), {
      method: req.method,
      headers: { ...req.headers, host: "graphysx.example", "x-forwarded-proto": "https", "x-real-ip": "198.51.100.17" },
    }, reply => { res.writeHead(reply.statusCode, reply.headers); reply.pipe(res); });
    upstream.on("error", () => { res.writeHead(502); res.end(); });
    req.pipe(upstream);
  });
  const request = (route, packet, token, extra = {}) => fetch(`${proxy}/store${route}`, {
    method: packet === undefined ? "GET" : "POST", headers: { origin, ...(packet === undefined ? {} : { "content-type": "application/json" }),
      ...(token ? { authorization: `Bearer ${token}` } : {}), ...extra }, ...(packet === undefined ? {} : { body: JSON.stringify(packet) }),
  });
  const status = await request("/api/ballsy/status");
  assert.deepEqual(await status.json(), { schema: "ballsy-room/v1" });
  assert.equal(status.headers.get("access-control-allow-origin"), null);
  assert.equal(status.headers.get("cache-control"), "no-store");
  assert.equal((await request("/api/ballsy/create", {}, undefined, { origin: "https://evil.example" })).status, 403);
  const options = await fetch(`${proxy}/store/api/ballsy/create`, { method: "OPTIONS", headers: { origin: "https://evil.example" } });
  assert.equal(options.status, 403);
  assert.equal(options.headers.get("access-control-allow-origin"), null);
  const owner = await (await request("/api/ballsy/create", {})).json();
  assert.match(owner.hostToken, /^[a-f0-9]{48}$/);
  assert.equal((await request(`/api/ballsy/${owner.roomId}/host`, { snapshot: snapshot(), ack: 0 }, "test-store-only-credential")).status, 403);
  assert.equal((await request(`/api/ballsy/${owner.roomId}/host`, { snapshot: snapshot(), ack: 0 }, owner.hostToken)).status, 200);
  const guest = await (await request("/api/ballsy/join", { code: owner.code })).json();
  const view = await (await request(`/api/ballsy/${owner.roomId}/view`, undefined, guest.guestToken)).json();
  assert.equal(view.snapshot.roundId, snapshot().roundId);
  assert.ok(!JSON.stringify(view).includes(owner.hostToken));
  const packet = { id: "production-command-123", roundId: snapshot().roundId, command: { type: "route", route: "divert" } };
  assert.equal((await (await request(`/api/ballsy/${owner.roomId}/command`, packet, guest.guestToken)).json()).accepted, true);
  const hosted = await (await request(`/api/ballsy/${owner.roomId}/host`, { snapshot: snapshot(), ack: 0 }, owner.hostToken)).json();
  assert.deepEqual(hosted.commands.map(entry => entry.command), [packet.command]);
  const sceneWrite = await fetch(`${proxy}/store/scenes/private`, { method: "PUT", headers: { authorization: `Bearer ${owner.hostToken}`, "content-type": "application/json" }, body: "{}" });
  assert.equal(sceneWrite.status, 401, "room capabilities do not authorize scene writes");
  assert.equal((await request("/api/ballsy/scenes")).status, 404);
  assert.equal((await request(`/api/ballsy/${owner.roomId}/close`, {}, guest.guestToken)).status, 403);
  assert.equal((await request(`/api/ballsy/${owner.roomId}/close`, {}, owner.hostToken)).status, 200);
  assert.equal((await request(`/api/ballsy/${owner.roomId}/view`, undefined, guest.guestToken)).status, 404);
  assert.equal((await request("/health")).status, 200, "store stays available independently");
});

test("proxy admission quotas follow validated client IP, expire, and cap the whole process", async t => {
  let now = 1000;
  const route = createBallsyRoute({ trustedLoopbackProxy: true, now: () => now });
  const base = await listen(t, (req, res) => { if (!route(req, res)) { res.writeHead(404); res.end(); } });
  const join = (ip) => fetch(`${base}/api/ballsy/join`, { method: "POST", headers: {
    origin: base.replace("http:", "https:"), "x-forwarded-proto": "https", "x-real-ip": ip,
    "content-type": "application/json", "x-forwarded-for": String(Math.random()),
  }, body: '{"code":"ABSENT"}' });
  for (let i = 0; i < LIMITS.admissionsPerMinute; i++) assert.equal((await join("198.51.100.1")).status, 404);
  assert.equal((await join("198.51.100.1")).status, 429);
  assert.equal((await join("198.51.100.2")).status, 404, "different proxy clients do not share nginx's IP bucket");
  now += 60_000;
  assert.equal((await join("198.51.100.1")).status, 404);
  for (let i = 1; i < LIMITS.totalAdmissionsPerMinute; i++) assert.equal((await join(`198.51.100.${2 + Math.floor(i / 10)}`)).status, 404);
  assert.equal((await join("203.0.113.99")).status, 429, "rotating IPs cannot bypass process admission cap");
});

test("JSON caps apply to query-string routes and incomplete bodies have a short deadline", async t => {
  const route = createBallsyRoute({ bodyTimeoutMs: 80 });
  const base = await listen(t, (req, res) => { route(req, res); });
  const tooLarge = await fetch(`${base}/api/ballsy/create?x=1`, { method: "POST", body: " ".repeat(LIMITS.bodyBytes + 1) });
  assert.equal(tooLarge.status, 413);
  assert.equal(tooLarge.headers.get("connection"), "close");
  const before = Date.now();
  const result = await new Promise((resolve, reject) => {
    const pending = httpRequest(`${base}/api/ballsy/create`, { method: "POST", headers: { "content-length": "100" } }, response => {
      response.resume(); response.on("end", () => resolve(response.statusCode));
    });
    pending.on("error", reject);
    pending.write("{");
  });
  assert.equal(result, 408);
  assert.ok(Date.now() - before < 3000);
  const healthy = await fetch(`${base}/api/ballsy/status`);
  assert.equal(healthy.status, 200);
});

test("address buckets and request rates are bounded and recover without a process restart", async t => {
  let now = 1000;
  const route = createBallsyRoute({ trustedLoopbackProxy: true, now: () => now });
  const base = await listen(t, (req, res) => { route(req, res); });
  const status = ip => fetch(`${base}/api/ballsy/status`, { headers: { "x-forwarded-proto": "https", "x-real-ip": ip } });
  for (let i = 1; i <= LIMITS.addresses; i++) assert.equal((await status(`198.51.100.${i}`)).status, 200);
  assert.equal((await status("203.0.113.1")).status, 429);
  now += 60_000;
  for (let i = 0; i < LIMITS.requestsPerSecond; i++) assert.equal((await status("203.0.113.1")).status, 200);
  assert.equal((await status("203.0.113.1")).status, 429);
  now += 1000;
  assert.equal((await status("203.0.113.1")).status, 200);
});

test("slow bodies have per-address and process concurrency ceilings and release their reservations", async () => {
  const route = createBallsyRoute({ trustedLoopbackProxy: true });
  const pending = [];
  const call = (ip, slow = false) => {
    const request = new PassThrough();
    Object.assign(request, { url: slow ? "/api/ballsy/00000000-0000-0000-0000-000000000000/host" : "/api/ballsy/status",
      method: slow ? "POST" : "GET", socket: { remoteAddress: "127.0.0.1" },
      headers: { host: "graphysx.example", "x-forwarded-proto": "https", "x-real-ip": ip } });
    const response = { status: null, setHeader() {}, writeHead(status) { this.status = status; }, end() {} };
    assert.equal(route(request, response), true);
    if (slow) { pending.push(request); request.write("{"); }
    return response;
  };
  try {
    for (let ip = 1; ip <= LIMITS.concurrent / LIMITS.concurrentPerAddress; ip++) {
      for (let i = 0; i < LIMITS.concurrentPerAddress; i++) assert.equal(call(`198.51.100.${ip}`, true).status, null);
      assert.equal(call(`198.51.100.${ip}`).status, 429);
    }
    assert.equal(call("203.0.113.9").status, 429, "the whole process refuses another in-flight request");
  } finally {
    for (const request of pending) request.end("}");
    await new Promise(resolve => setImmediate(resolve));
  }
  assert.equal(call("203.0.113.9").status, 200);
});
