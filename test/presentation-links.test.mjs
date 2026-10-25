import { test } from "node:test";
import assert from "node:assert/strict";
import { importBrowserModule } from "./support/import-browser-module.mjs";

const { createRelationOverlay } = await importBrowserModule(new URL("../src/presentation-links.ts", import.meta.url));
const places = [
  { id: "a", center: [0, 1, 0], size: [2, 2, 2], role: "source" },
  { id: "b", center: [5, 1, 0], size: [2, 2, 2], role: "target" },
];
const links = [{ from: "a", to: "b" }];

test("invalid replacements preserve the displayed relation, its resources and progress", () => {
  const overlay = createRelationOverlay();
  overlay.set(places, links);
  overlay.seek(0.5);
  const children = [...overlay.group.children], state = overlay.state();
  let disposed = 0;
  children[0].material.addEventListener("dispose", () => { disposed++; });
  const invalid = [
    [places, [{ from: "a", to: "missing" }]],
    [[places[0], { ...places[1], center: [NaN, 0, 0] }], links],
    [[places[0], { ...places[1], id: "a" }], links],
    [[{ ...places[0], role: "unknown" }], []],
    [[{ ...places[0], size: [0, 1, 1] }], []],
    [places, Array.from({ length: 257 }, () => links[0])],
    [Array.from({ length: 65 }, (_, i) => ({ ...places[0], id: String(i) })), []],
  ];
  for (const [nextPlaces, nextLinks] of invalid) {
    assert.throws(() => overlay.set(nextPlaces, nextLinks));
    assert.deepEqual(overlay.group.children, children);
    assert.deepEqual(overlay.state(), state);
    assert.equal(disposed, 0);
  }
  overlay.set([places[1]], []);
  assert.equal(disposed, 1, "a valid replacement releases the previous material");
  assert.equal(overlay.state().links, 0);
  overlay.dispose();
});
