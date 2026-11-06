import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { createHash } from "node:crypto";
import { importBrowserModule } from "./support/import-browser-module.mjs";
const catalogue = await importBrowserModule(new URL("../src/ecosystem-catalog.ts", import.meta.url));
import { transpileModule, ModuleKind, ScriptTarget } from "typescript";

function harness(verifyGate = Promise.resolve()) {
  let mounted, failed, verified;
  const mountDone = new Promise(resolve => { mounted = resolve; });
  const errorDone = new Promise(resolve => { failed = resolve; });
  const verifyDone = new Promise(resolve => { verified = resolve; });
  let afterRender, onWorld, onExit, options, fail = false, instances = 0, revisionReads = 0;
  const hosts = [], apps = [];
  class Element {
    isConnected = false; events = []; style = {}; attributes = new Map([["presentation-id", "card-one"], ["play", "memory,garage"]]);
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    replaceChildren() {} remove() {} setAttribute() {}
    dispatchEvent(event) { this.events.push(event); if (event.type === "ecosystem-error") failed(event); }
  }
  const context = vm.createContext({ HTMLElement: Element, performance,
    document: { createElement: () => new Element() }, customElements: { get: () => true },
    crypto: { randomUUID: () => `${++instances}1111111-1111-4111-8111-111111111111` },
    __GRAPHYSX_EMBED_VERSION__: "a".repeat(64),
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    createEcosystemCatalog: catalogue.createEcosystemCatalog,
    DEFAULT_ECOSYSTEM_CATALOG: catalogue.DEFAULT_ECOSYSTEM_CATALOG,
    parseComposition: catalogue.parseComposition,
    verifyComposition: async view => { await verifyGate; try { await catalogue.verifyComposition(view); } finally { verified(); } },
    ecosystemObservation: state => ({ application: "ecosystem", ...state }),
    PlatformHost: class {
      disposed = 0;
      world = { getState: () => { revisionReads++; return { revision: 1 }; }, subscribeEvents: fn => { onWorld = fn; return () => { onWorld = null; }; } };
      constructor() { hosts.push(this); }
      subscribeAfterRender(fn) { afterRender = fn; return () => { afterRender = null; }; }
      dispose() { this.disposed++; }
    },
    mountEcosystemApp: (_root, _host, exit, settings) => {
      options = settings; onExit = exit;
      if (fail) throw new Error("synthetic mount failure");
      settings.onEvent("ready", {});
      const app = { disposed: 0, live: undefined, state: () => ({ tour: { script: "memory,garage" }, ...(app.live ? { live: app.live } : {}) }),
        setLiveState(value) { app.live = value; settings.onEvent("live-state-changed", {}); return true; },
        setNarrator(value) { app.narrator = value; app.narratorSets = (app.narratorSets || 0) + 1; },
        dispose() { this.disposed++; }, tour: { setScript: (script, autoplay) => { app.lastScript = { script, autoplay }; } } };
      apps.push(app); mounted(); return app;
    },
  });
  const source = readFileSync(new URL("../src/ecosystem-embed.ts", import.meta.url), "utf8").replace(/^import .*;$/gm, "");
  const code = transpileModule(source, { compilerOptions: { module: ModuleKind.ESNext, target: ScriptTarget.ES2022 } }).outputText.replace(/^export /gm, "");
  vm.runInContext(code + "\nglobalThis.ElementUnderTest = AgentxEcosystemElement;", context);
  const element = new context.ElementUnderTest();
  return { element, mountDone, errorDone, verifyDone, connect: () => { element.isConnected = true; element.connectedCallback(); },
    disconnect: () => { element.isConnected = false; element.disconnectedCallback(); }, hosts, apps, render: () => afterRender?.(), worldEvent: () => onWorld?.(),
    exit: () => onExit(), settings: () => options, reads: () => revisionReads, failMount: () => { fail = true; } };
}

test("ready is deferred until after rendering, and the same tour owns script changes", () => {
  const h = harness(); h.connect();
  assert.equal(h.element.state(), null); assert.equal(h.element.events.length, 0);
  assert.equal(h.settings().embedded, true);
  h.render();
  const shown = h.element.state().presentation;
  assert.equal(shown.presentationId, "card-one"); assert.equal(shown.version, "a".repeat(64));
  assert.equal(shown.documentRevision, 1); assert.equal(h.element.events[0].type, "ecosystem-ready");
  h.element.attributeChangedCallback("play", "memory", "garage");
  assert.equal(h.apps[0].lastScript.script, "garage"); assert.equal(h.apps[0].lastScript.autoplay, true);
  assert.equal(h.element.events.filter(e => e.type === "ecosystem-first-frame").length, 1);
  h.render(); assert.equal(h.reads(), 1, "display frames do not repeatedly export the full world");
  h.worldEvent(); h.render(); assert.equal(h.reads(), 2);
  h.disconnect();
});

test("reconnection has a new instance and no retained ready receipt; close releases the native host", () => {
  const h = harness(); h.connect(); h.render();
  const first = h.element.state().presentation.instance;
  h.disconnect(); assert.equal(h.element.state(), null);
  assert.equal(h.apps[0].disposed, 1); assert.equal(h.hosts[0].disposed, 1);
  h.connect(); assert.equal(h.element.state(), null); h.render();
  assert.notEqual(h.element.state().presentation.instance, first);
  h.exit(); assert.equal(h.element.state(), null);
  assert.equal(h.hosts[1].disposed, 1); assert.equal(h.element.events.at(-1).type, "ecosystem-closed");
});

test("mount failure never produces a display receipt and disposes its allocated renderer", () => {
  const h = harness(); h.failMount(); h.connect();
  assert.equal(h.element.state(), null); assert.equal(h.hosts[0].disposed, 1);
  assert.equal(h.element.events.at(-1).type, "ecosystem-error");
  h.disconnect(); assert.equal(h.hosts[0].disposed, 1);
});

test("a live update is acknowledged by the same app but only the following render reports it", () => {
  const h = harness();
  assert.equal(h.element.setLiveState({}), false, "an unmounted component cannot claim acceptance");
  h.connect(); h.render();
  const before = h.element.state();
  const live = { status: "available", read: { id: "view_fixture" } };
  assert.equal(h.element.setLiveState(live), true);
  assert.equal(h.element.state(), before);
  assert.equal(h.element.events.filter(event => event.type === "ecosystem-live-state-changed").length, 0);
  h.render();
  assert.equal(h.element.state().presentation.live.read.id, "view_fixture");
  assert.equal(h.element.events.filter(event => event.type === "ecosystem-live-state-changed").length, 1);
  assert.equal(h.hosts.length, 1, "a refresh never allocates a replacement renderer");
  h.disconnect();
});

test("a host narrator is retained before mounting and can replace the current transport", () => {
  const h = harness();
  const first = async () => {}, second = async () => {};
  h.element.narrator = first; h.connect();
  assert.equal(h.apps[0].narrator, first);
  h.element.narrator = second;
  assert.equal(h.apps[0].narrator, second);
  h.element.setLiveState({ status: "available", read: { id: "view_fixture" } }); h.render();
  assert.equal(h.apps[0].narrator, second);
  assert.equal(h.apps[0].narratorSets, 2, "live refresh never replaces or restarts the voice transport");
  h.disconnect(); h.connect();
  assert.equal(h.apps[1].narrator, second);
  h.disconnect();
});

test("an ambient host can explicitly retain silent playback", () => {
  const h = harness(); h.element.attributes.set('voice', 'off'); h.connect();
  assert.equal(h.settings().voice, false); h.disconnect();
});
function composition() {
  const data = { version: 1, reviewedAt: '2030-01-02', source: 'Synthetic fixture', nodes: [
    { id: 'host-a', name: 'Host A', subtitle: 'Compute', kind: 'host', status: 'installed' }
  ], links: [], workflows: [], placements: { 'host-a': { x: 0, z: 0, width: 2, height: 2, depth: 2 } } };
  return { contentRevision: createHash('sha256').update(JSON.stringify(data)).digest('hex'), data,
    read: { contract: 'agentx.presentation-read/v1', source: 'core.ecosystem.composition', id: 'view_' + 'b'.repeat(64), revision: 'b'.repeat(64),
      observedAt: '2030-01-02T12:00:00.000Z', expiresAt: '2030-01-02T12:05:00.000Z' } };
}
test('disconnect while verifying composition cannot mount a late renderer or retain its receipt', async () => {
  let release;
  const h = harness(new Promise(resolve => { release = resolve; }));
  h.element.attributes.set('composition', JSON.stringify(composition()));
  h.connect(); assert.equal(h.hosts.length, 0); assert.equal(h.element.state(), null);
  h.disconnect(); release(); await h.verifyDone;
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.hosts.length, 0); assert.equal(h.element.events.length, 0);
  h.connect(); await h.mountDone; h.render();
  assert.equal(h.hosts.length, 1); assert.equal(h.settings().composition.data.nodes[0].id, 'host-a');
  assert.ok(h.element.state().presentation); h.disconnect();
});
test('tampered composition fails before allocating a renderer and never substitutes history', async () => {
  const h = harness(), view = composition(); view.data.nodes[0].subtitle = 'Tampered';
  h.element.attributes.set('composition', JSON.stringify(view)); h.connect(); await h.errorDone;
  assert.equal(h.hosts.length, 0); assert.equal(h.element.state(), null);
  assert.equal(h.element.events.at(-1).detail.stage, 'mount');
});
