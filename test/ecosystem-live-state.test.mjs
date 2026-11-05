import { test } from "node:test";
import assert from "node:assert/strict";
import { Group, Vector3 } from "three";
import { importBrowserModule } from "./support/import-browser-module.mjs";

const { createEcosystemLiveState, parseEcosystemLivePayload } = await importBrowserModule(new URL("../src/ecosystem-live-state.ts", import.meta.url));
const { mountEcosystemLiveLayer } = await importBrowserModule(new URL("../src/ecosystem-live-layer.ts", import.meta.url));
const { ecosystemObservation } = await importBrowserModule(new URL("../src/ecosystem-presentation.ts", import.meta.url));
const at = Date.parse("2026-11-05T18:00:00.000Z");
const iso = delta => new Date(at + delta).toISOString();
const sha = "a".repeat(64);
const node = (id = "ugalien", state = "online") => ({ id, state, source: "inference_endpoints", observedAt: iso(-1000), expiresAt: iso(10000), freshness: "current" });
function payload(nodes = [node()], delta = 0, revision = sha) {
  return { contract: "agentx.ecosystem-live/v1", generatedAt: iso(delta), expiresAt: iso(delta + 20000), nodes,
    read: { contract: "agentx.presentation-read/v1", id: `view_${revision}`, revision, source: "core.ecosystem.live", observedAt: iso(delta), expiresAt: iso(delta + 20000) } };
}

test("live state is opt-in, detached from input, and has no invented static health", () => {
  const store = createEcosystemLiveState();
  assert.equal(store.view(at), null);
  const input = payload();
  assert.equal(store.set(input), true);
  input.nodes[0].state = "offline"; input.read.id = "changed";
  const view = store.view(at);
  assert.equal(view.status, "available");
  assert.equal(view.nodes[0].state, "online");
  assert.equal(view.read.id, `view_${sha}`);
});

test("all operational states render with explicit scope, without requiring selection", () => {
  const store = createEcosystemLiveState();
  for (const state of ["online", "offline", "degraded", "busy", "parked", "unknown"]) {
    const next = payload([node("ugalien", state)], 1000 * ["online", "offline", "degraded", "busy", "parked", "unknown"].indexOf(state));
    assert.equal(store.set(next), true);
    assert.equal(store.view(at + 5000).nodes[0].displayState, state);
  }
});

test("node and global expiration remove current colours even without another payload", () => {
  const store = createEcosystemLiveState();
  assert.equal(store.set(payload()), true);
  assert.equal(store.view(at + 9999).nodes[0].displayState, "online");
  assert.equal(store.view(at + 10000).nodes[0].freshness, "stale");
  assert.equal(store.view(at + 10000).nodes[0].displayState, "unknown");
  const expired = store.view(at + 20000);
  assert.equal(expired.status, "stale");
  assert.equal(expired.read.id, `view_${sha}`, "retain the dated, expired reference as evidence");
  assert.match(expired.nodes[0].label, /Périmé/);
});

test("outage retains dated last observations and their read without a healthy badge", () => {
  const store = createEcosystemLiveState();
  store.set(payload()); store.set(null);
  const view = store.view(at);
  assert.equal(view.status, "unavailable"); assert.equal(view.read.id, `view_${sha}`);
  assert.equal(view.nodes[0].displayState, "unknown");
  assert.equal(view.nodes[0].observedAt, iso(-1000));
  assert.match(view.nodes[0].label, /Source indisponible/);
  assert.equal(store.set(payload([node()], -1000)), false, "outage does not erase the ordering fence");
  assert.equal(store.set(payload()), true, "the same confirmed current source may recover");
  const empty = createEcosystemLiveState(); empty.set(null);
  assert.equal(empty.view(at).read, null, "there is no read to invent before the first payload");
  store.set(null);
  assert.equal(store.view(at + 30000).nodes[0].freshness, "stale", "expiration remains explicit during an outage");
});

test("older snapshots, same-time conflicting revisions and reused refs with changed values refuse atomically", () => {
  const store = createEcosystemLiveState();
  const first = payload();
  assert.equal(store.set(first), true);
  assert.equal(store.set(payload([node()], -1000)), false);
  assert.equal(store.set(payload([node()], 0, "b".repeat(64))), false);
  assert.equal(store.set(payload([node("ugalien", "offline")])), false);
  assert.equal(store.set(first), true);
  assert.equal(store.view(at).nodes[0].state, "online");
  assert.equal(store.set(payload([node("ugalien", "offline")], 1000, "b".repeat(64))), true);
  assert.equal(store.view(at + 1000).nodes[0].state, "offline");
});

test("malformed dates, duplicate/unknown IDs, over-limit nodes and incoherent refs are rejected", () => {
  const cases = [
    p => { p.generatedAt = "2026-02-30T12:00:00.000Z"; },
    p => { p.expiresAt = p.generatedAt; },
    p => { p.read.expiresAt = iso(30000); },
    p => { p.read.observedAt = iso(-1000); },
    p => { p.read.id = `view_${"b".repeat(64)}`; },
    p => { p.read.revision = "not-a-sha"; },
    p => { p.read.source = "browser"; },
    p => { p.read.url = "http://private"; },
    p => { p.nodes.push(node()); },
    p => { p.nodes[0].id = "eco-node:ugalien"; },
    p => { p.nodes[0].id = "not-in-the-map"; },
    p => { p.nodes = Array.from({ length: 33 }, () => node()); },
    p => { p.nodes[0].observedAt = "yesterday"; },
    p => { p.nodes[0].observedAt = iso(1); },
    p => { p.nodes[0].expiresAt = iso(-2000); },
    p => { p.nodes[0].expiresAt = null; },
    p => { p.nodes[0].source = "machine_health"; },
    p => { p.nodes[0].state = "healthy"; },
    p => { p.nodes[0].freshness = "live"; },
  ];
  for (const change of cases) {
    const input = payload(); change(input);
    assert.equal(parseEcosystemLivePayload(input), null, change.toString());
  }
  const unknown = payload([{ ...node(), observedAt: null, expiresAt: null, state: "unknown", freshness: "unknown" }]);
  assert.ok(parseEcosystemLivePayload(unknown));
});

test("presentation carries only the rendered bounded read; a static tour has no live claim", () => {
  const state = { application: "ecosystem", tour: { index: 0, script: "overview", adhoc: null }, focus: [], narration: "", narrationComplete: true };
  assert.equal(ecosystemObservation(state).live, undefined);
  const store = createEcosystemLiveState(); store.set(payload());
  const observed = ecosystemObservation({ ...state, live: store.view(at) });
  assert.deepEqual(Object.keys(observed.live).sort(), ["read", "status"]);
  assert.equal(observed.live.read.revision, sha);
});

class Element {
  children = []; attributes = new Map(); dataset = {}; style = { setProperty() {} }; events = new Map();
  textContent = ""; hidden = false;
  setAttribute(key, value) { this.attributes.set(key, value); }
  querySelector() { return null; }
  addEventListener(key, value) { this.events.set(key, value); }
  append(...children) { for (const child of children) { child.parent = this; this.children.push(child); } }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); }
}

test("the status layer updates every covered node in place, expires by host frame and releases resources", () => {
  const original = globalThis.document;
  globalThis.document = { createElement: () => new Element() };
  try {
    const surface = new Element(), scene = new Group(), selected = [];
    const blocks = ["ugalien", "core"].map((id, i) => ({ id, center: new Vector3(i * 4, 2, 0), size: new Vector3(2, 3, 2) }));
    const layer = mountEcosystemLiveLayer(surface, { scene, mode: "play" }, () => blocks, id => selected.push(id));
    layer.frame(at);
    assert.equal(surface.children[0].hidden, true);
    const input = payload([node(), { ...node("core", "degraded"), source: "product_service" }]);
    assert.equal(layer.set(input), true);
    assert.equal(layer.state(), null, "setting data is not a displayed receipt");
    layer.frame(at);
    const group = scene.getObjectByName("ecosystem-live-observations");
    assert.equal(group.children.length, 2, "every covered component has an outline without a selection");
    const firstOutline = group.children[0];
    const list = surface.children[0].children[2];
    const firstButton = list.children[0].children[0];
    assert.match(firstButton.textContent, /Inférence : Disponible/);
    assert.match(list.children[1].children[0].textContent, /Santé du service : Dégradé/);
    assert.deepEqual(selected, []);
    layer.set(payload([node("ugalien", "busy"), { ...node("core", "offline"), source: "product_service" }], 1000));
    layer.frame(at + 1000);
    assert.equal(group.children[0], firstOutline, "updates keep the same overlay objects");
    assert.equal(list.children[0].children[0], firstButton, "keyboard focus survives refresh");
    assert.match(firstButton.textContent, /Occupé/);
    firstButton.events.get("click")();
    assert.deepEqual(selected, ["ugalien"], "only explicit interaction selects a component");
    layer.frame(at + 10000);
    assert.equal(list.children[0].dataset.freshness, "stale");
    assert.match(firstButton.textContent, /Périmé/);
    layer.set(null); layer.frame(at + 11000);
    assert.equal(layer.state().status, "unavailable");
    assert.match(firstButton.textContent, /Source indisponible/);
    layer.dispose();
    assert.equal(scene.children.length, 0); assert.equal(surface.children.length, 0);
  } finally { globalThis.document = original; }
});
