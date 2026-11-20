import assert from "node:assert/strict";
import { test } from "node:test";
import { importBrowserModule } from "./support/import-browser-module.mjs";
const { visibleStudioEntities } = await importBrowserModule(new URL("../src/studio-simple.ts", import.meta.url));

test("simple object list hides hidden archive branches and empty waypoints without changing their document", () => {
  const entity = (id, type, values = {}) => ({ id, type, visible: true, parentId: null, ...values });
  const source = [entity("house", "model"), entity("source-massing", "group", { visible: false }), entity("source-wall", "box", { parentId: "source-massing" }),
    entity("kitchen", "model", { visible: false }), entity("waypoint", "group"), entity("table-group", "group"), entity("table", "box", { parentId: "table-group" }),
    entity("presence", "group", { runtimeOwnedTransient: true }), entity("presence-child", "sphere", { parentId: "presence" }), entity("light", "point-light")];
  const before = structuredClone(source);
  assert.deepEqual(visibleStudioEntities(source).map(item => item.id), ["house", "table-group", "table", "light"]);
  assert.deepEqual(source, before);
});
