import assert from 'node:assert/strict';
import { test } from 'node:test';
import { importBrowserModule } from './support/import-browser-module.mjs';
const { llmxWorldContext } = await importBrowserModule(new URL('../src/llmx-world-context.ts', import.meta.url));
test('world observation indexes authored scenery and selects requested details while preserving its source', () => {
  const entities = Array.from({ length: 75 }, (_, i) => ({ id: 'floor-' + i, type: 'box', label: 'Dalle ' + i, transform: { position: [i, 0, 0] } }));
  entities.push({ id: 'lamp', type: 'point-light', intensity: 3 }, { id: 'route', type: 'spline', label: 'Trajectoire extérieure', path: { points: [[0,0,0], [20,10,0]] } },
    { id: 'llmx-created-math', type: 'group' }, { id: 'llmx-created-math-unit-1', type: 'box' });
  const world = { entities, environment: { sky: 'clearnight' } }, before = JSON.stringify(world);
  const api = { exportDocument: () => world, state: () => ({ selectedIds: ['floor-74'], entities: [
    { id: 'floor-74', position: [74, 2, 5], visible: true, physics: { linearVelocity: [0, -2, 0], angularVelocity: [0, 0, 0], sleeping: false } },
  ] }) };
  for (const key of ['assets', 'sounds', 'textures', 'skies', 'hdris', 'emitters', 'heightmaps', 'flocks', 'crowds', 'forceFields', 'formulas', 'dna', 'surfaces']) api[key] = () => [{ id: 'actual-' + key }];
  const observation = llmxWorldContext(api, 'Change la trajectoire extérieure');
  assert.equal(observation.entities.length, 77);
  assert.equal(observation.world.details.length, 32);
  assert.equal(observation.world.details[0].id, 'floor-74');
  assert.deepEqual(observation.world.details[0].transform.position, [74, 0, 0]);
  assert.deepEqual(observation.world.details[0].runtime.position, [74, 2, 5]);
  assert.deepEqual(observation.world.details[0].runtime.linearVelocity, [0, -2, 0]);
  assert.ok(observation.world.details.some(entity => entity.id === 'route' && entity.path));
  assert.deepEqual(observation.world.settings, world.environment);
  assert.deepEqual(observation.world.catalogs.textures, ['actual-textures']);
  assert.equal(llmxWorldContext(api, '', true).entities.length, 78);
  assert.equal(JSON.stringify(world), before);
});
