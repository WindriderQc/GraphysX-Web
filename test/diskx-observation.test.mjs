import { test } from 'node:test';
import assert from 'node:assert/strict';
import { importBrowserModule } from './support/import-browser-module.mjs';
const { replaceScope, diskxEntityKey, redactedInventory } = await importBrowserModule(new URL('../src/diskx-snapshot.ts', import.meta.url));
const { createPresentationClock, presentationPoint } = await importBrowserModule(new URL('../src/presentation-transition.ts', import.meta.url));
const { createFixtureSource, createLiveSource, resolveDiskxSource } = await import('../src/diskx-source.ts');
const { JANITOR_DEMO, janitorAvailability } = await importBrowserModule(new URL('../src/diskx-janitor.ts', import.meta.url));
const { mathTimeline, mathCubeAt, mathLabelAt } = await importBrowserModule(new URL('../src/llmx-math-scene.ts', import.meta.url));

test('scope replacement removes vanished paths and never mutates the prior observation', () => {
  const previous = [{ path: '/a/deleted', fileCount: 2, totalSize: 8 }, { path: '/ab/keep', fileCount: 1, totalSize: 4 }];
  const next = replaceScope(previous, '/a', [{ path: '/a/new', fileCount: 3, totalSize: 12 }]);
  assert.deepEqual(next.map(row => row.path), ['/ab/keep', '/a/new']);
  assert.equal(previous[0].path, '/a/deleted');
  assert.throws(() => replaceScope(previous, '/a', [{ path: '/outside', fileCount: 1, totalSize: 5 }]));
  assert.throws(() => replaceScope(previous, '/a', [{ path: '/a', fileCount: -1, totalSize: NaN }]));
});
test('scene identity is rank independent and path scoped, not physical identity', () => {
  assert.equal(diskxEntityKey('/a/é'), diskxEntityKey('/a/é'));
  assert.notEqual(diskxEntityKey('/a/é'), diskxEntityKey('/a/e'));
  assert.notEqual(diskxEntityKey('/a/old'), diskxEntityKey('/a/new'));
  // Real NAS folders nest deep: the key must fit the runtime's 80-character entity ids.
  const deep = `/mnt/datalake/${'Very Long Folder Name/'.repeat(40)}SimCity 2000 Windows`;
  assert.match(diskxEntityKey(deep), /^[0-9a-f]{16}$/);
  assert.ok(!diskxEntityKey('/mnt/media/Movies').includes('4d6f76696573'), 'no folder name in the key');
  const keys = new Set(Array.from({ length: 5000 }, (_, i) => diskxEntityKey(`/mnt/media/folder-${i}`)));
  assert.equal(keys.size, 5000, 'no collision across a level-sized set');
});
test('redacted export carries no source paths, largest filenames, tags, IDs or operations', () => {
  const value = redactedInventory({ id: 'private-id', roots: ['/secret'], observedAt: '2026-01-01', consistency: 'unversioned', incomplete: ['/secret'], rows: [{ path: '/secret/folder', largestFile: '/secret/name.txt', fileCount: 2, totalSize: 10 }] });
  const json = JSON.stringify(value);
  for (const secret of ['secret', 'name.txt', 'private-id', 'tags', 'operation']) assert.ok(!json.includes(secret));
  assert.equal(value.incomplete, true);
  assert.equal(value.directories[0].bytes, 10);
});
test('missing completeness is never treated as complete; live roots come from server configuration', async () => {
  const fixture = createFixtureSource();
  assert.equal((await fixture.tree('/mnt/media')).truncated, false);
  const unknown = createLiveSource(async () => new Response(JSON.stringify({ data: { tree: [] } })), ['/configured'], 'test');
  assert.equal((await unknown.tree('/configured')).truncated, true);
  const configured = await resolveDiskxSource({ fetchImpl: async () => new Response(JSON.stringify({ enabled: true, roots: ['/configured'] })) });
  assert.deepEqual(configured.roots, ['/configured']);
});
test('presentation supports pause, rewind and target without an execution receipt', () => {
  const clock = createPresentationClock(2); clock.play(); clock.tick(1);
  assert.equal(clock.state().progress, 0.5); clock.pause(); clock.tick(10);
  assert.equal(clock.state().progress, 0.5); clock.seek(1);
  assert.equal(clock.state().scope, 'presentation-only'); clock.seek(0);
  assert.deepEqual(presentationPoint([0, 2, 4], [8, 6, 0], 0), [0, 2, 4]);
  assert.deepEqual(presentationPoint([0, 2, 4], [8, 6, 0], 1), [8, 6, 0]);
  assert.throws(() => clock.seek(NaN));
  assert.equal(janitorAvailability().status, 'unavailable');
  assert.ok(JANITOR_DEMO.synthetic);
  assert.ok(JANITOR_DEMO.candidates.every(candidate => candidate.reclaimableBytes === null));
});
test('Math Teacher addition retains correct units/results while its positions support the reusable preview', () => {
  for (let a = 0; a <= 20; a++) for (let b = 0; b <= 20 - a; b++) {
    if (a + b === 0) continue;
    const timeline = mathTimeline({ kind: 'add', a, b });
    assert.equal(timeline.cubes.length, a + b);
    assert.equal(mathLabelAt(timeline, timeline.duration), `${a} + ${b} = ${a + b}`);
    for (const cube of timeline.cubes) {
      assert.deepEqual(presentationPoint(cube.start, cube.end, 0), [...cube.start]);
      assert.deepEqual(presentationPoint(cube.start, cube.end, 1), [...cube.end]);
      const final = mathCubeAt(cube, timeline.duration);
      assert.ok(final.visible); assert.ok(Math.abs(final.position[0] - cube.end[0]) < 1e-9);
    }
  }
});
