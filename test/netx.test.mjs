import { test } from "node:test";
import assert from "node:assert/strict";
import { importBrowserModule } from "./support/import-browser-module.mjs";

// The real browser modules, transpiled in place: NetX's data half has no DOM and no three.js.
const data = await importBrowserModule(new URL("../src/netx-data.ts", import.meta.url));

const NOW = new Date("2026-10-26T16:25:45.693Z").getTime();
const minutes = (count) => new Date(NOW - count * 60000).toISOString();
const rules = { onlineTtlMs: 30 * 60000, recentTtlMs: 24 * 3600000 };
const device = (over = {}) => ({ ip: "192.0.2.10", mac: "02:00:00:00:00:0A", vendor: "Espressif", hostname: "", alias: "", status: "online", lastSeen: minutes(7), firstSeen: "2026-06-21T03:24:04.444Z", scanSource: "ugfrank", ...over });

test("the observation state is derived from the age of lastSeen the way Data derives it, never from the raw flag alone", () => {
  assert.equal(data.classifyDevice(device(), NOW, rules).state, "online");
  assert.equal(data.classifyDevice(device({ lastSeen: minutes(31) }), NOW, rules).state, "recent", "reported online but past the online window");
  assert.equal(data.classifyDevice(device({ lastSeen: minutes(7), status: "offline" }), NOW, rules).state, "recent", "not reported online: never online");
  assert.equal(data.classifyDevice(device({ lastSeen: minutes(25 * 60) }), NOW, rules).state, "historical");
  assert.equal(data.classifyDevice(device({ lastSeen: null }), NOW, rules).state, "never_confirmed");
  assert.equal(data.classifyDevice(device({ lastSeen: minutes(7) }), NOW, rules).ageMs, 7 * 60000);
  // Data's own classification wins when it is in the body; the fixture's absence falls back to ours.
  const given = data.normaliseDevice(device({ lastSeen: minutes(7), observation: { state: "historical", ageMs: 1 } }), NOW, rules);
  assert.deepEqual([given.state, given.stateFromData, given.ageMs], ["historical", true, 1]);
  assert.equal(data.normaliseDevice(device({ observation: { state: "dancing" } }), NOW, rules).stateFromData, false, "an unknown state from Data is not trusted");
  assert.deepEqual(data.readRules({ onlineTtlMs: 1800000, recentTtlMs: 86400000 }), rules);
  assert.deepEqual(data.readRules({ onlineTtlMs: "x", recentTtlMs: 10 }), { onlineTtlMs: data.DEFAULT_ONLINE_TTL_MS, recentTtlMs: data.DEFAULT_ONLINE_TTL_MS }, "the recent window never undercuts the online one");
});

test("a device is addressed by its MAC, else by its address, and keeps only what Data says", () => {
  const byMac = data.normaliseDevice(device({ mac: "02-00-00-00-00-0a" }), NOW, rules);
  assert.equal(byMac.key, "02:00:00:00:00:0A", "MAC spelling is normalised");
  assert.equal(data.normaliseDevice(device({ mac: "" }), NOW, rules).key, "ip:192.0.2.10");
  assert.equal(data.normaliseDevice(device({ mac: "", ip: "not-an-ip" }), NOW, rules), null, "neither a MAC nor an address: not a device");
  assert.equal(byMac.name, "192.0.2.10", "no alias, no hostname: the address names it");
  assert.equal(data.normaliseDevice(device({ alias: "  salon-tv " }), NOW, rules).name, "salon-tv");
  assert.equal(data.normaliseDevice(device({ hostname: "octopi" }), NOW, rules).name, "octopi");
  assert.deepEqual([byMac.type, byMac.typeRaw, byMac.known, byMac.isNew, byMac.family], [null, null, false, false, "iot"]);
  const printer = data.normaliseDevice(device({ hardware: { type: "3d-printer-controller" }, alias: "octopi-wifi", vendor: "Raspberry Pi Foundation" }), NOW, rules);
  assert.deepEqual([printer.type, printer.typeRaw, printer.known, printer.family], [null, "3d-printer-controller", true, "pi"], "a type outside the Toolbox list is kept as text and drawn as other");
  assert.equal(data.normaliseDevice(device({ hardware: { type: "printer" } }), NOW, rules).type, "printer");
  assert.equal(data.normaliseDevice(device({ knownAt: "2026-10-01T00:00:00Z" }), NOW, rules).known, true, "the known flag counts as acknowledged, like the alert");
  assert.equal(data.normaliseDevice(device({ firstSeen: minutes(60) }), NOW, rules).isNew, true);
  const ports = data.normaliseDevice(device({ openPorts: [{ port: 22, protocol: "tcp", service: "ssh" }, { port: "x" }, { port: 70000 }] }), NOW, rules).openPorts;
  assert.deepEqual(ports, [{ port: 22, protocol: "tcp", service: "ssh" }]);
  assert.match(data.describeDevice(printer), /octopi|192\.0\.2\.10/);
  assert.match(data.describeDevice(printer), /type « 3d-printer-controller » \(hors liste\)/);
  assert.match(data.describeDevice(byMac), /non reconnu/);
});

test("transients are the nameless, vendorless devices no longer seen; the vendor family is colour only", () => {
  const ghost = data.normaliseDevice(device({ vendor: "", lastSeen: minutes(3 * 24 * 60) }), NOW, rules);
  assert.equal(ghost.transient, true);
  assert.equal(data.normaliseDevice(device({ vendor: "", lastSeen: minutes(3 * 24 * 60), hostname: "laptop" }), NOW, rules).transient, false, "a hostname keeps a device on its ring");
  assert.equal(data.normaliseDevice(device({ vendor: "" }), NOW, rules).transient, false, "online stays on its ring whatever it lacks");
  for (const [vendor, family] of [["Raspberry Pi Trading", "pi"], ["Google", "google"], ["TP-Link Limited", "network"], ["Hewlett Packard", "pc"], ["Oculus VR", "vr"], ["Acme Widgets", "other"], ["", "unknown"], [null, "unknown"]]) {
    assert.equal(data.vendorFamily(vendor), family, String(vendor));
  }
});

test("the inventory is built from Data's three bodies with Data's reference time and Nestor's freshness sentence", () => {
  const bodies = {
    devices: { devices: [device(), device({ ip: "192.0.2.11", mac: "02:00:00:00:00:0B", lastSeen: minutes(40) }), device({ ip: "192.0.2.12", mac: "02:00:00:00:00:0C", vendor: "", lastSeen: minutes(60 * 30) }),
      device({ mac: "02:00:00:00:00:0A" }), { ip: "garbage" }], summary: { referenceTime: new Date(NOW).toISOString(), onlineTtlMs: 1800000, recentTtlMs: 86400000 } },
    agents: { scanners: [{ scannerId: "ugfrank", hostname: "UGFrank", ip: "192.0.2.99", platform: "linux", lastSeen: minutes(0.5), lastScanAt: minutes(7), active: true, capabilities: { nmap: true, privileged: false } },
      { scannerId: "ugbrutal", ip: "192.0.2.12", lastSeen: "2026-09-10T00:34:52.852Z", lastScanAt: "2026-09-10T00:24:14.622Z", active: false }], active: 1 },
    capability: { nmap: false },
  };
  const inventory = data.buildInventory(bodies, 0);
  assert.equal(inventory.referenceTime, new Date(NOW).toISOString(), "Data's reference time, not the caller's clock");
  assert.equal(inventory.devices.length, 3, "a duplicate key and a row without address are dropped");
  assert.deepEqual(inventory.devices.map((entry) => entry.state), ["online", "recent", "historical"]);
  assert.deepEqual([inventory.counts.total, inventory.counts.online, inventory.counts.recent, inventory.counts.historical, inventory.counts.unnamed, inventory.counts.unacknowledged, inventory.counts.transient], [3, 1, 1, 1, 3, 3, 1]);
  assert.deepEqual([inventory.activeCollectors, inventory.collectors.map((collector) => collector.id), inventory.dataCanScan], [1, ["ugfrank", "ugbrutal"], false]);
  assert.deepEqual([inventory.collectors[0].privileged, inventory.collectors[1].privileged], [false, null]);
  assert.deepEqual(inventory.freshness, { stale: false, text: "Dernier scan il y a 7 min.", lastScanAt: minutes(7) });
  const stale = data.buildInventory({ ...bodies, agents: { scanners: [bodies.agents.scanners[1]] } }, 0);
  assert.match(stale.freshness.text, /^Inventaire périmé : dernier scan il y a 47 jours\./);
  assert.equal(stale.freshness.stale, true);
  assert.equal(data.buildInventory({ devices: null, agents: null, capability: null }, NOW).freshness.text, "Aucun scan réseau connu : l'inventaire ne dit pas ce qui est branché maintenant.");
  assert.equal(data.buildInventory({ devices: null, agents: null, capability: null }, NOW).dataCanScan, null);
  // The Toolbox's five filters and its search.
  const [online, recent, ghost] = inventory.devices;
  assert.deepEqual(inventory.devices.filter((entry) => data.passesFilter(entry, "online")), [online]);
  assert.equal(inventory.devices.filter((entry) => data.passesFilter(entry, "unnamed")).length, 3);
  assert.equal(inventory.devices.filter((entry) => data.passesFilter(entry, "new")).length, 0);
  assert.ok(data.matchesSearch(online, "020000"), "a MAC without colons matches");
  assert.ok(data.matchesSearch(online, "02-00-00-00-00-0a"));
  assert.ok(data.matchesSearch(recent, "espress"));
  assert.ok(!data.matchesSearch(ghost, "espress"));
  assert.ok(data.matchesSearch(ghost, "192.0.2.12"));
});

test("placement is deterministic: angle from the address, radius from the state, a stable step when two devices share an address", () => {
  const rows = [device(), device({ ip: "192.0.2.10", mac: "02:00:00:00:00:FF", lastSeen: minutes(5) }), device({ ip: "192.0.2.138", mac: "02:00:00:00:00:0B", lastSeen: minutes(40) }),
    device({ ip: "192.0.2.200", mac: "02:00:00:00:00:0C", vendor: "", lastSeen: minutes(60 * 30) }), device({ ip: "192.0.2.201", mac: "02:00:00:00:00:0D", vendor: "", lastSeen: minutes(60 * 30) })];
  const first = data.buildInventory({ devices: { devices: rows }, agents: null, capability: null }, NOW);
  const again = data.buildInventory({ devices: { devices: [...rows].reverse() }, agents: null, capability: null }, NOW);
  const placed = data.placeDevices(first.devices);
  assert.deepEqual(placed, data.placeDevices(again.devices), "the order Data returns rows in changes nothing");
  const byKey = Object.fromEntries(placed.map((entry) => [entry.key, entry]));
  const a = byKey["02:00:00:00:00:0A"], b = byKey["02:00:00:00:00:FF"];
  assert.equal(a.angle, b.angle, "same address, same angle");
  assert.equal(a.radius, data.NETX_RING.online);
  assert.equal(b.radius, data.NETX_RING.online + data.NETX_STACK_STEP, "the second MAC on the address steps outward");
  assert.ok(Math.abs(byKey["02:00:00:00:00:0B"].angle - Math.PI * 138 / 128) < 1e-9, "octet 138 sits at 138/256 of the circle");
  assert.equal(byKey["02:00:00:00:00:0B"].radius, data.NETX_RING.recent);
  assert.ok(byKey["02:00:00:00:00:0C"].ring === "passages" && byKey["02:00:00:00:00:0D"].ring === "passages", "transients line the passages arc");
  assert.equal(byKey["02:00:00:00:00:0C"].radius, data.NETX_PASSAGES_RADIUS);
  assert.ok(byKey["02:00:00:00:00:0C"].angle >= data.NETX_PASSAGES_ARC[0] && byKey["02:00:00:00:00:0D"].angle <= data.NETX_PASSAGES_ARC[1]);
  for (const entry of placed) assert.ok(Math.abs(Math.hypot(entry.x, entry.z) - entry.radius) < 0.01, `${entry.key} sits on its radius`);
  const lighthouse = data.placeCollector({ octet: 99 }, 0);
  assert.ok(Math.abs(Math.hypot(lighthouse.x, lighthouse.z) - data.NETX_COLLECTOR_RADIUS) < 0.01);
  assert.ok(Math.abs(lighthouse.angle - data.angleOfOctet(99)) < 1e-9);
});

// The source imports the JSON fixture with an import attribute, which the transpiling helper does
// not rewrite; Node's own type stripping reads it (as test/diskx-source.test.mjs does).
const source = await import("../src/netx-source.ts");

test("the shipped fixture is synthetic: no real address, the live proportions, and it reads like Data's bodies", async () => {
  const fixture = source.NETX_FIXTURE;
  assert.equal(fixture.synthetic, true);
  assert.equal(fixture.schema, "graphysx.netx-fixture/v1");
  const rows = fixture.devices.devices;
  assert.equal(rows.length, 55);
  for (const row of rows) {
    assert.match(row.ip, /^192\.0\.2\.\d{1,3}$/, `TEST-NET-1 only: ${row.ip}`);
    assert.match(row.mac, /^02:/, `locally administered MAC only: ${row.mac}`);
  }
  for (const scanner of fixture.agents.scanners) assert.match(scanner.ip, /^192\.0\.2\./);
  const inventory = data.buildInventory(await source.createFixtureSource().load(), 0);
  assert.equal(inventory.referenceTime, fixture.capturedAt, "the fixture is read at its capture instant, so it never ages");
  assert.deepEqual([inventory.counts.online, inventory.counts.recent, inventory.counts.historical, inventory.counts.never_confirmed], [31, 3, 21, 0]);
  assert.deepEqual([inventory.counts.total - inventory.counts.unnamed, inventory.counts.known, inventory.activeCollectors, inventory.dataCanScan], [2, 2, 1, false]);
  assert.equal(inventory.devices.filter((entry) => !entry.vendor).length, 13);
  assert.ok(inventory.counts.transient >= 9 && inventory.counts.transient <= 13, `ghosts line the passages: ${inventory.counts.transient}`);
  assert.equal(inventory.freshness.text, "Dernier scan il y a 7 min.");
  assert.equal(inventory.devices.every((entry) => entry.stateFromData === false), true, "the fixture carries no observation: the classifier runs");
  assert.ok(inventory.devices.some((entry) => entry.typeRaw === "3d-printer-controller" && entry.type === null), "the out-of-list type seen in production is in the capture");
  assert.match(source.createFixtureSource().origin, /^Capture 2026-10-26 · synthétique$/);
  assert.equal(new Set(data.placeDevices(inventory.devices).map((entry) => `${entry.x},${entry.z}`)).size, 55, "no two devices share a spot");
});

test("the live source reads the three relay GETs, tolerates a missing capability, and falls back to the fixture when the relay is off", async () => {
  const calls = [];
  const envelope = (body) => new Response(JSON.stringify({ status: "success", data: body }));
  const fetchImpl = async (url) => {
    calls.push(String(url));
    if (url.endsWith("/config")) return new Response(JSON.stringify({ enabled: true, source: "agentx.example" }));
    if (url.endsWith("/network/devices")) return envelope({ devices: [device()], summary: { referenceTime: new Date(NOW).toISOString() } });
    if (url.endsWith("/network/agents")) return envelope({ scanners: [], active: 0 });
    return new Response("nope", { status: 502 });
  };
  const live = await source.resolveNetxSource({ fetchImpl });
  assert.equal(live.kind, "live");
  assert.equal(live.origin, "AgentX Data · agentx.example");
  const bodies = await live.load();
  assert.equal(bodies.devices.devices.length, 1);
  assert.equal(bodies.capability, null, "a failed capability read is not a failed inventory");
  assert.deepEqual(calls.slice(1).sort(), ["/diskx-api/network/agents", "/diskx-api/network/capability", "/diskx-api/network/devices"]);
  assert.equal((await source.resolveNetxSource({ fetchImpl: async () => new Response(JSON.stringify({ enabled: false })) })).kind, "fixture");
  assert.equal((await source.resolveNetxSource({ fetchImpl: async () => { throw new Error("offline"); } })).kind, "fixture");
  assert.equal((await source.resolveNetxSource({ fetchImpl, forceFixture: true })).kind, "fixture");
  await assert.rejects(source.resolveNetxSource({ fetchImpl: async () => new Response(JSON.stringify({ enabled: false })), requireLive: true }), /Source désactivée/);
  const failing = source.createLiveSource(async (url) => (url.endsWith("/network/devices") ? new Response("x", { status: 500 }) : envelope({})), "lan");
  await assert.rejects(failing.load(), /NetX: 500/, "a failed inventory read is an error, never an empty network");
});

const scene = await importBrowserModule(new URL("../src/netx-scene.ts", import.meta.url));

test("the world has one tagged principal per device and per collector, unique ids, and reads its facts from the tags", async () => {
  const inventory = data.buildInventory(await source.createFixtureSource().load(), 0);
  const world = scene.composeNetxWorld(inventory, { motes: false });
  assert.equal(world.id, "agentx-netx");
  assert.equal(world.schema, "graphysx.agent-world/v2");
  const ids = new Set(world.entities.map((entity) => entity.id));
  assert.equal(ids.size, world.entities.length, "entity ids are unique");
  const principals = world.entities.filter((entity) => entity.tags?.includes(scene.NETX_DEVICE_TAG));
  assert.equal(principals.length, inventory.devices.length);
  for (const entity of principals) {
    const key = scene.netxDeviceKeyOf(entity.tags);
    const device = inventory.devices.find((entry) => entry.key === key);
    assert.ok(device, `${entity.id} names a known device`);
    assert.ok(entity.tags.includes(`netx-state:${device.state}`));
    assert.ok(["box", "cylinder"].includes(entity.type), "every device is a plain primitive");
    if (!device.transient) assert.equal(scene.netxDeviceKeyOf(world.entities.find((part) => part.parentId === entity.id)?.tags), key, "parts carry their device key too");
    else assert.equal(world.entities.some((part) => part.parentId === entity.id), false, "a ghost is one faint body, nothing more");
    assert.doesNotMatch(entity.label, /192\.168\./);
  }
  assert.equal(principals.filter((entity) => entity.tags.includes("netx-state:online")).length, 31);
  assert.equal(principals.filter((entity) => entity.tags.includes("netx-transient")).length, inventory.counts.transient);
  assert.equal(principals.filter((entity) => entity.tags.includes("netx-new")).length, inventory.counts.new);
  assert.equal(world.entities.filter((entity) => entity.id.endsWith("-beacon")).length, inventory.counts.new, "one amber beacon per new device");
  assert.equal(world.entities.filter((entity) => entity.id.endsWith("-cage")).length, inventory.devices.filter((entry) => !entry.transient && (entry.type === null || !entry.known)).length, "a cage on every unknown crate and on every typed device nobody acknowledged");
  const collectors = world.entities.filter((entity) => entity.tags?.includes(scene.NETX_COLLECTOR_TAG));
  assert.deepEqual(collectors.map((entity) => scene.netxCollectorIdOf(entity.tags)), ["ugfrank", "ugbrutal", "ugalien"]);
  assert.equal(world.entities.filter((entity) => entity.id.endsWith("-beam")).length, 1, "only the live collector sweeps a beam");
  assert.ok(world.entities.some((entity) => entity.id === scene.NETX_HUB_ID && entity.label === "Réseau · 192.0.2.0/24"));
  // Two devices on one address stand apart; a typed device has a body of its type.
  const positions = principals.map((entity) => entity.transform.position.slice(0, 3).map((n, i) => (i === 1 ? 0 : n)).join(","));
  assert.equal(new Set(positions).size, principals.length, "no two devices share ground");
  const typed = inventory.devices.find((entry) => entry.typeRaw === "3d-printer-controller");
  const typedEntity = principals.find((entity) => scene.netxDeviceKeyOf(entity.tags) === typed.key);
  assert.ok(typedEntity.tags.includes("netx-type:unknown") && typedEntity.tags.includes("netx-known:true"), "an out-of-list type is drawn as an unknown crate but stays acknowledged");
  assert.equal(scene.netxEntityId("02:00:00:00:00:0A"), "netx-dev-02-00-00-00-00-0a");
  assert.equal(scene.netxEntityId("ip:192.0.2.5"), "netx-dev-ip-192-0-2-5");
});
