import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { transpileModule, ModuleKind, ScriptTarget } from "typescript";

function harness() {
  const hosts = [], apps = [];
  let failMount = false, failDispose = false;
  class Element {
    children = []; style = {}; events = [];
    getAttribute() { return null; }
    setAttribute() {}
    append(child) { this.children.push(child); }
    replaceChildren(...children) { this.children = children; }
    remove() { this.removed = true; }
    dispatchEvent(event) { this.events.push(event); }
  }
  const context = vm.createContext({
    HTMLElement: Element, document: { querySelector: () => true, createElement: () => new Element() },
    window: { location: { host: "core.example" } },
    customElements: { get: () => true }, CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    parseDiskxCityAttributes: () => ({ endpoints: {}, roots: ["/data"] }),
    PlatformHost: class { disposed = 0; constructor() { hosts.push(this); } dispose() { this.disposed++; } },
    mountDiskxApp: () => {
      if (failMount) throw new Error("mount failed");
      const app = { disposed: 0, state: () => "ready", dispose() { this.disposed++; if (failDispose) throw new Error("dispose failed"); } };
      apps.push(app); return app;
    },
  });
  const source = readFileSync(new URL("../src/diskx-embed.ts", import.meta.url), "utf8").replace(/^import .*;$/gm, "");
  const code = transpileModule(source, { compilerOptions: { module: ModuleKind.ESNext, target: ScriptTarget.ES2022 } }).outputText.replace(/^export /gm, "");
  vm.runInContext(code + "\nglobalThis.ElementUnderTest = DiskxCityElement;", context);
  return { element: new context.ElementUnderTest(), hosts, apps,
    failMount: value => { failMount = value; }, failDispose: () => { failDispose = true; } };
}

test("failed mounting releases its host immediately and reconnecting replaces the error", () => {
  const h = harness(); h.failMount(true); h.element.connectedCallback();
  assert.equal(h.hosts[0].disposed, 1);
  assert.equal(h.element.state(), null);
  assert.equal(h.element.events[0].type, "diskx-error");
  h.element.disconnectedCallback();
  assert.equal(h.hosts[0].disposed, 1, "disconnect never disposes the failed host twice");
  h.failMount(false); h.element.connectedCallback();
  assert.equal(h.element.children.length, 1, "the old error is removed");
  assert.equal(h.element.state(), "ready");
  h.element.disconnectedCallback();
  assert.equal(h.hosts[1].disposed, 1);
});

test("mount and disconnect are idempotent and host cleanup survives an app disposal failure", () => {
  const h = harness(); h.element.connectedCallback(); h.element.connectedCallback();
  assert.equal(h.hosts.length, 1);
  const stage = h.element.children[0]; h.failDispose();
  assert.throws(() => h.element.disconnectedCallback(), /dispose failed/);
  assert.equal(h.hosts[0].disposed, 1); assert.equal(stage.removed, true);
  h.element.disconnectedCallback();
  assert.equal(h.apps[0].disposed, 1); assert.equal(h.hosts[0].disposed, 1);
});
