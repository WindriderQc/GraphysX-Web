import { test } from "node:test";
import assert from "node:assert/strict";
import { startBallsyServer } from "../scripts/serve-ballsy.mjs";
import { importBrowserModule } from "./support/import-browser-module.mjs";

const { createVolcano } = await importBrowserModule(new URL("../src/ballsy-volcano.ts", import.meta.url));

test("the HTTP relay enforces origin, roles and bounded JSON before forwarding commands", async () => {
  const app = await startBallsyServer({ port: 0 });
  const request = (route, packet, token, origin = new URL(app.url).origin) => fetch(`${app.url}api/ballsy/${route}`, {
    method: "POST", headers: { "content-type": "application/json", Origin: origin, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: typeof packet === "string" ? packet : JSON.stringify(packet),
  });
  try {
    assert.equal((await request("create", {}, undefined, "https://unrelated.invalid")).status, 403);
    assert.equal((await request("create", "{" )).status, 400);
    assert.equal((await request("create", " ".repeat(14_001))).status, 413);
    const status = await fetch(`${app.url}api/ballsy/status`);
    assert.equal(status.headers.get("x-ballsy-relay"), "1");
    assert.equal(status.headers.get("cache-control"), "no-store");
    assert.equal(status.headers.get("referrer-policy"), "no-referrer");
    assert.equal(status.headers.get("access-control-allow-origin"), null);
    const owner = await (await request("create", {})).json();
    const roundId = "round-http-aaaaaaaaaaaa";
    const snapshot = { roundId, phase: "racing", ally: null, volcano: createVolcano("challenge"),
      players: [0, 1].map((i) => ({ id: `ballsy-p${i + 1}`, position: [-4, 0.7, 8 + i * 2], lap: 0, finished: false })) };
    assert.equal((await request(`${owner.roomId}/host`, { snapshot, ack: 0 })).status, 403);
    assert.equal((await request(`${owner.roomId}/host`, { snapshot, ack: 0 }, owner.hostToken)).status, 200);
    const guest = await (await request("join", { code: owner.code })).json();
    assert.equal((await request(`${owner.roomId}/host`, { snapshot, ack: 0 }, guest.guestToken)).status, 403);
    const view = await fetch(`${app.url}api/ballsy/${owner.roomId}/view`, { headers: { Authorization: `Bearer ${guest.guestToken}` } });
    const received = await view.json();
    assert.equal(received.snapshot.roundId, roundId);
    assert.ok(!JSON.stringify(received).includes(owner.hostToken));
    const command = { id: "http-command-aaaaaaaa", roundId, command: { type: "route", route: "divert" } };
    assert.equal((await (await request(`${owner.roomId}/command`, command, guest.guestToken)).json()).accepted, true);
    const poll = await (await request(`${owner.roomId}/host`, { snapshot, ack: 0 }, owner.hostToken)).json();
    assert.deepEqual(poll.commands.map((entry) => entry.command), [command.command]);
    assert.equal((await request(`${owner.roomId}/close`, {}, guest.guestToken)).status, 403);
    assert.equal((await request(`${owner.roomId}/close`, {}, owner.hostToken)).status, 200);
  } finally { await app.close(); }
});

test("HTTPS needs both certificate and key instead of silently falling back to HTTP", async () => {
  await assert.rejects(startBallsyServer({ port: 0, cert: "missing-cert" }), /both --cert and --key/);
  await assert.rejects(startBallsyServer({ port: 0, key: "missing-key" }), /both --cert and --key/);
});
