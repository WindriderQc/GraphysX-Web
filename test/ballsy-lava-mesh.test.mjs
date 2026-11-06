import { test } from 'node:test';
import assert from 'node:assert/strict';
import { importBrowserModule } from './support/import-browser-module.mjs';
import { assertInlineMesh } from '../server/inline-mesh.mjs';
const { createEarth, advanceEarth, earthMesh, EARTH_LAVA_VISIBLE_DEPTH } = await importBrowserModule(new URL('../src/ballsy-earth.ts', import.meta.url));
const { createVolcano, volcanoSlowAt } = await importBrowserModule(new URL('../src/ballsy-volcano.ts', import.meta.url));
test('lava projection clips continuous shorelines, uses finite welded faces, and preserves all simulation mass', () => {
  const e = createEarth();
  assertInlineMesh(earthMesh(e, true));
  for (const seconds of [1, 5, 20, 60]) {
    advanceEarth(e, seconds, 1);
    const before = JSON.stringify(e), mesh = earthMesh(e, true);
    assertInlineMesh(mesh);
    assert.equal(JSON.stringify(e), before);
    assert.ok(mesh.positions.every(Number.isFinite));
    assert.ok(mesh.indices.length >= 3);
    assert.ok(mesh.positions.some((n, i) => i % 3 !== 1 && Math.abs(n * 2 - Math.round(n * 2)) > 0.01), 'shoreline vertices interpolate between grid samples');
    assert.ok(mesh.positions.length / 3 < mesh.indices.length, 'adjacent faces share vertices rather than disconnected squares');
  }
});
test('the visible lava contour is also the physical slowdown threshold', () => {
  const v = createVolcano();
  v.earth.lava.fill((EARTH_LAVA_VISIBLE_DEPTH - 0.001) * 0.25);
  assert.equal(volcanoSlowAt(v, [12, 0.7, 0]).intensity, 0);
  assert.equal(earthMesh(v.earth, true).positions.length, 9, 'only the hidden empty-mesh placeholder exists');
  v.earth.lava.fill((EARTH_LAVA_VISIBLE_DEPTH + 0.01) * 0.25);
  assert.ok(volcanoSlowAt(v, [12, 0.7, 0]).intensity > 0);
  assertInlineMesh(earthMesh(v.earth, true));
});
test('high-frequency lava patterns remain inside the platform mesh budget', () => {
  const e = createEarth(); e.lava = e.lava.map((_, i) => i % 2 ? 0.1 : 0);
  const mesh = earthMesh(e, true);
  assertInlineMesh(mesh);
  assert.ok(mesh.positions.length / 3 <= 4096);
});
