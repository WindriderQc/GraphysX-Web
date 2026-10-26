import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { transpileModule, ModuleKind, ScriptTarget } from "typescript";

function harness() {
  let afterRender, onWorld, onExit, options, fail = false, instances = 0, revisionReads = 0;
  const hosts = [], apps = [];
  class Element {
    events = []; style = {}; attributes = new Map([["presentation-id", "card-one"], ["play", "memory,garage"]]);
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    replaceChildren() {} remove() {} setAttribute() {}
    dispatchEvent(event) { this.events.push(event); }
  }
  const context = vm.createContext({ HTMLElement: Element,
    document: { createElement: () => new Element() }, customElements: { get: () => true },
    crypto: { randomUUID: () => `${++instances}1111111-1111-4111-8111-111111111111` },
    __GRAPHYSX_EMBED_VERSION__: "a".repeat(64),
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
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
      const app = { disposed: 0, state: () => ({ tour: { script: "memory,garage" } }),
        dispose() { this.disposed++; }, tour: { setScript: (script, autoplay) => { app.lastScript = { script, autoplay }; } } };
      apps.push(app); return app;
    },
  });
  const source = readFileSync(new URL("../src/ecosystem-embed.ts", import.meta.url), "utf8").replace(/^import .*;$/gm, "");
  const code = transpileModule(source, { compilerOptions: { module: ModuleKind.ESNext, target: ScriptTarget.ES2022 } }).outputText.replace(/^export /gm, "");
  vm.runInContext(code + "\nglobalThis.ElementUnderTest = AgentxEcosystemElement;", context);
  return { element: new context.ElementUnderTest(), hosts, apps, render: () => afterRender?.(), worldEvent: () => onWorld?.(),
    exit: () => onExit(), settings: () => options, reads: () => revisionReads, failMount: () => { fail = true; } };
}

test("ready is deferred until after rendering, and the same tour owns script changes", () => {
  const h = harness(); h.element.connectedCallback();
  assert.equal(h.element.state(), null); assert.equal(h.element.events.length, 0);
  assert.equal(h.settings().embedded, true);
  h.render();
  const shown = h.element.state().presentation;
  assert.equal(shown.presentationId, "card-one"); assert.equal(shown.version, "a".repeat(64));
  assert.equal(shown.documentRevision, 1); assert.equal(h.element.events[0].type, "ecosystem-ready");
  h.element.attributeChangedCallback("play", "memory", "garage");
  assert.equal(h.apps[0].lastScript.script, "garage"); assert.equal(h.apps[0].lastScript.autoplay, true);
  h.render(); assert.equal(h.reads(), 1, "display frames do not repeatedly export the full world");
  h.worldEvent(); h.render(); assert.equal(h.reads(), 2);
  h.element.disconnectedCallback();
});

test("reconnection has a new instance and no retained ready receipt; close releases the native host", () => {
  const h = harness(); h.element.connectedCallback(); h.render();
  const first = h.element.state().presentation.instance;
  h.element.disconnectedCallback(); assert.equal(h.element.state(), null);
  assert.equal(h.apps[0].disposed, 1); assert.equal(h.hosts[0].disposed, 1);
  h.element.connectedCallback(); assert.equal(h.element.state(), null); h.render();
  assert.notEqual(h.element.state().presentation.instance, first);
  h.exit(); assert.equal(h.element.state(), null);
  assert.equal(h.hosts[1].disposed, 1); assert.equal(h.element.events.at(-1).type, "ecosystem-closed");
});

test("mount failure never produces a display receipt and disposes its allocated renderer", () => {
  const h = harness(); h.failMount(); h.element.connectedCallback();
  assert.equal(h.element.state(), null); assert.equal(h.hosts[0].disposed, 1);
  assert.equal(h.element.events.at(-1).type, "ecosystem-error");
  h.element.disconnectedCallback(); assert.equal(h.hosts[0].disposed, 1);
});
