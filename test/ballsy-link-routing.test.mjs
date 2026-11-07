import assert from "node:assert/strict";
import test from "node:test";
import { browserModuleUrl } from "./support/import-browser-module.mjs";

let instance = 0;
async function client(t, { preview = false, status = { schema: "ballsy-room/v1" }, mime = "application/json" } = {}) {
  const previousWindow = globalThis.window, previousFetch = globalThis.fetch;
  const requests = [];
  const timers = new Map(); let nextTimer = 0;
  globalThis.window = { location: { href: "https://graphysx.example/ballsy.html", origin: "https://graphysx.example" },
    setTimeout: callback => { timers.set(++nextTimer, callback); return nextTimer; }, clearTimeout: id => { timers.delete(id); } };
  globalThis.fetch = async (url, options = {}) => {
    const target = new URL(url, window.location.href);
    requests.push({ path: target.pathname, options });
    if (options.method === "HEAD") return new Response(null, { headers: preview ? { "X-Ballsy-Relay": "1" } : {} });
    if (target.pathname.endsWith("/status")) return new Response(typeof status === "string" ? status : JSON.stringify(status), { headers: { "content-type": mime } });
    if (target.pathname.endsWith("/create")) return Response.json({ roomId: "room-id", hostToken: "test-host", code: "TESTCODE" });
    if (target.pathname.endsWith("/host")) return Response.json({ commands: [], guestConnected: false });
    if (target.pathname.endsWith("/join")) return Response.json({ roomId: "room-id", guestToken: "test-guest" });
    if (target.pathname.endsWith("/view")) return Response.json({ snapshot: null, hostLive: false });
    return Response.json({ ok: true });
  };
  t.after(() => { globalThis.window = previousWindow; globalThis.fetch = previousFetch; });
  const api = await import(`${browserModuleUrl(new URL("../src/ballsy-link.ts", import.meta.url))}#routing-${++instance}`);
  const poll = async () => {
    assert.equal(timers.size, 1, "one live poll, never overlapping loops");
    const [id, callback] = [...timers][0]; timers.delete(id); callback();
    await new Promise(resolve => setImmediate(resolve));
  };
  return { api, requests, timers, poll };
}

for (const preview of [false, true]) test(`${preview ? "private preview" : "published site"} validates its actual JSON relay and keeps all game traffic on that same origin`, async t => {
  const { api, requests } = await client(t, { preview });
  const prefix = preview ? "/api/ballsy/" : "/store/api/ballsy/";
  assert.deepEqual(await Promise.all([api.ballsyRelayAvailable(), api.ballsyRelayAvailable()]), [true, true]);
  assert.equal(requests.filter(request => request.options.method === "HEAD").length, 1);
  assert.equal(requests.filter(request => request.path === `${prefix}status`).length, 1);
  const host = api.createBallsyHostLink({ snapshot: () => ({}), command: () => {}, presence: () => {} });
  await host.open();
  assert.equal(host.state().code, "TESTCODE");
  host.dispose();
  const guest = api.createBallsyGuestLink(() => {});
  await guest.join("TESTCODE");
  guest.leave();
  const gameRequests = requests.filter(request => request.options.method !== "HEAD");
  assert.ok(gameRequests.every(request => request.path.startsWith(prefix)));
  assert.ok(gameRequests.some(request => request.path.endsWith("/close")));
  assert.ok(gameRequests.some(request => request.path.endsWith("/leave")));
  assert.ok(gameRequests.every(request => !request.path.includes("test-host") && !request.path.includes("test-guest")), "credentials stay in Authorization, never URLs");
});

for (const [name, status, mime] of [
  ["SPA HTML fallback", "<html>not a relay</html>", "text/html"],
  ["unrelated JSON API", { schema: "not-ballsy" }, "application/json"],
]) test(`a ${name} cannot masquerade as an available relay even with the preview header`, async t => {
  const { api, requests } = await client(t, { preview: true, status, mime });
  assert.equal(await api.ballsyRelayAvailable(), false);
  const host = api.createBallsyHostLink({ snapshot: () => ({}), command: () => {}, presence: () => {} });
  await assert.rejects(host.open(), /indisponible/);
  assert.ok(!requests.some(request => request.path.endsWith("/create")));
});

test("leaving while relay discovery is pending never creates a late room or joins a late game", async t => {
  const { api, requests } = await client(t);
  const realFakeFetch = globalThis.fetch;
  let releaseHead;
  globalThis.fetch = (url, options) => options?.method === "HEAD"
    ? new Promise(resolve => { releaseHead = () => resolve(new Response(null)); }) : realFakeFetch(url, options);
  const host = api.createBallsyHostLink({ snapshot: () => ({}), command: () => {}, presence: () => {} });
  const guest = api.createBallsyGuestLink(() => {});
  const opening = host.open(), joining = guest.join("TESTCODE");
  host.dispose(); guest.leave();
  releaseHead();
  await Promise.all([opening, joining]);
  assert.ok(!requests.some(request => /\/(create|join)$/.test(request.path)));
});

for (const stalled of ["HEAD", "status"]) test(`a slow initial ${stalled} probe can be retried by an explicit invitation action`, async t => {
  const { api, requests, timers } = await client(t);
  const respond = globalThis.fetch; let slow = true;
  globalThis.fetch = (url, options = {}) => {
    const selected = stalled === "HEAD" ? options.method === "HEAD" : String(url).endsWith("/status");
    if (!slow || !selected) return respond(url, options);
    return new Promise((resolve, reject) => {
      // Keep the test alive until the real request AbortSignal's 1.4 s deadline fires.
      const guard = setTimeout(() => reject(new Error("probe ignored its deadline")), 3000);
      options.signal.addEventListener("abort", () => { clearTimeout(guard); reject(options.signal.reason); }, { once: true });
    });
  };
  const host = api.createBallsyHostLink({ snapshot: () => ({}), command: () => {}, presence: () => {} });
  await assert.rejects(host.open(), /indisponible/);
  assert.equal(host.state().status, "interrupted");
  assert.equal(host.state().code, null);
  assert.equal(timers.size, 0, "discovery failure never creates an automatic retry loop");
  assert.ok(!requests.some(request => request.path.endsWith("/create")));
  slow = false;
  await host.open();
  assert.equal(host.state().status, "open");
  assert.equal(host.state().code, "TESTCODE");
  host.dispose();
});

for (const code of [403, 404, 410]) test(`host HTTP ${code} invalidates the invitation, stops polling, and only a fresh click creates another`, async t => {
  const { api, timers, poll } = await client(t);
  const respond = globalThis.fetch; let creates = 0, failed = false;
  const presence = [], commands = [];
  globalThis.fetch = (url, options) => {
    if (String(url).endsWith("/create")) return Promise.resolve(Response.json({ roomId: `room-${++creates}`, hostToken: `host-${creates}`, code: creates === 1 ? "OLDCODE1" : "NEWCODE2" }));
    if (String(url).endsWith("/host")) return Promise.resolve(failed
      ? code === 404 ? new Response("<html>missing</html>", { status: 404, headers: { "content-type": "text/html" } })
        : Response.json({ error: "Invitation invalide." }, { status: code })
      : Response.json({ commands: [], guestConnected: true }));
    return respond(url, options);
  };
  const host = api.createBallsyHostLink({ snapshot: () => ({}), command: c => commands.push(c), presence: value => presence.push(value) });
  await host.open();
  assert.equal(host.state().code, "OLDCODE1");
  failed = true;
  await poll();
  assert.equal(host.state().code, null);
  assert.equal(host.state().status, "expired");
  assert.equal(host.state().connected, false);
  assert.match(host.state().message, /Nouvelle invitation/);
  assert.equal(timers.size, 0);
  assert.equal(creates, 1);
  assert.deepEqual(presence, [true, false]);
  assert.deepEqual(commands.at(-1), { type: "release" });
  failed = false;
  await host.open();
  assert.equal(creates, 2);
  assert.equal(host.state().code, "NEWCODE2");
  assert.equal(host.state().status, "open");
  assert.equal(timers.size, 1);
  host.dispose();
});

for (const failure of ["network", 408, 429]) test(`${failure} failures preserve the code, bound automatic attempts, then resume only on request`, async t => {
  const { api, requests, timers, poll } = await client(t);
  const respond = globalThis.fetch; let failed = false;
  globalThis.fetch = (url, options) => String(url).endsWith("/host") && failed
    ? failure === "network" ? Promise.reject(new TypeError("network interrupted"))
      : Promise.resolve(Response.json({ error: "Réessayez." }, { status: failure })) : respond(url, options);
  const host = api.createBallsyHostLink({ snapshot: () => ({}), command: () => {}, presence: () => {} });
  await host.open();
  failed = true;
  for (let attempt = 0; attempt < 5; attempt++) await poll();
  assert.equal(host.state().code, "TESTCODE");
  assert.equal(host.state().status, "interrupted");
  assert.equal(timers.size, 0);
  failed = false;
  await host.open();
  assert.equal(host.state().status, "open");
  assert.equal(host.state().code, "TESTCODE");
  assert.equal(requests.filter(request => request.path.endsWith("/create")).length, 1, "resumption must not mint rooms");
  assert.equal(timers.size, 1);
  host.dispose();
});

test("a late terminal response cannot change a disposed host or a newer guest connection", async t => {
  const { api, poll } = await client(t);
  const respond = globalThis.fetch; let releaseHost, releaseGuest, stallHost = false, stallGuest = false;
  globalThis.fetch = (url, options) => {
    if (stallHost && String(url).endsWith("/host")) return new Promise(resolve => { releaseHost = () => resolve(Response.json({}, { status: 404 })); });
    if (stallGuest && String(url).endsWith("/view")) return new Promise(resolve => { releaseGuest = () => resolve(Response.json({}, { status: 404 })); });
    return respond(url, options);
  };
  const host = api.createBallsyHostLink({ snapshot: () => ({}), command: () => {}, presence: () => {} });
  await host.open(); stallHost = true; await poll(); host.dispose();
  releaseHost(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(host.state().status, "idle");
  assert.equal(host.state().message, "");
  const guest = api.createBallsyGuestLink(() => {});
  await guest.join("OLD-CODE"); stallGuest = true; await poll(); stallGuest = false;
  await guest.join("NEW-CODE");
  releaseGuest(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(guest.state().joined, true);
  guest.leave();
});

async function liveGuestClient(t) {
  const context = await client(t);
  const { createVolcano } = await import(browserModuleUrl(new URL("../src/ballsy-volcano.ts", import.meta.url)));
  const respond = globalThis.fetch;
  let joins = 0;
  globalThis.fetch = (url, options) => {
    if (String(url).endsWith("/join")) return Promise.resolve(Response.json({ roomId: `guest-room-${++joins}`, guestToken: `guest-token-${joins}` }));
    if (String(url).endsWith("/view")) return Promise.resolve(Response.json({ hostLive: true, snapshot: {
      roundId: "routing-round-123456", phase: "racing", ally: null, volcano: createVolcano("challenge"),
      players: [0, 1].map(i => ({ id: `ballsy-p${i + 1}`, position: [-4, .7, 8 + i * 2], lap: 0, finished: false })),
    } }));
    return respond(url, options);
  };
  return context;
}

test("an old HTTP 200 command refusal cannot overwrite a rejoined guest's message", async t => {
  const { api } = await liveGuestClient(t);
  const respond = globalThis.fetch;
  let releaseCommand;
  globalThis.fetch = (url, options) => String(url).endsWith("/command")
    ? new Promise(resolve => { releaseCommand = () => resolve(Response.json({ accepted: false, reason: "OLD_COMMAND_REASON" })); })
    : respond(url, options);
  const guest = api.createBallsyGuestLink(() => {});
  await guest.join("FIRST");
  assert.equal(guest.state().live, true);
  guest.send({ type: "release" });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(typeof releaseCommand, "function");
  guest.leave();
  await guest.join("SECOND");
  const current = guest.state();
  releaseCommand();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(guest.state(), current);
  assert.equal(guest.state().live, true);
  assert.notEqual(guest.state().message, "OLD_COMMAND_REASON");
  guest.leave();
});

test("an old join rejection is ignored after a newer join succeeds, while current join errors still reach the UI", async t => {
  const { api } = await liveGuestClient(t);
  const respond = globalThis.fetch;
  let releaseOldJoin, oldFailure = null;
  globalThis.fetch = (url, options) => {
    if (String(url).endsWith("/join")) {
      const { code } = JSON.parse(options.body);
      if (code === "OLD") return new Promise(resolve => { releaseOldJoin = () => resolve(Response.json({ error: "OLD_JOIN_ERROR" }, { status: 404 })); });
      if (code === "CURRENT-BAD") return Promise.resolve(Response.json({ error: "CURRENT_JOIN_ERROR" }, { status: 404 }));
    }
    return respond(url, options);
  };
  const guest = api.createBallsyGuestLink(() => {});
  const oldJoin = guest.join("OLD").catch(error => { oldFailure = error.message; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(typeof releaseOldJoin, "function");
  await guest.join("NEW");
  const current = guest.state();
  releaseOldJoin(); await oldJoin;
  assert.equal(oldFailure, null, "the old error must not reach the external UI catch");
  assert.deepEqual(guest.state(), current);
  assert.equal(guest.state().live, true);
  await assert.rejects(guest.join("CURRENT-BAD"), /CURRENT_JOIN_ERROR/);
  guest.leave();
});
