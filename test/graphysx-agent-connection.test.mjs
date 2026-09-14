import assert from 'node:assert/strict';
import { test } from 'node:test';
import { importBrowserModule } from './support/import-browser-module.mjs';
const { invokeGraphysXAgentTool: invoke } = await importBrowserModule(new URL('../src/graphysx-agent-connection.ts', import.meta.url));

test('camera uses bounded native framing without accepting stale or degenerate coordinates', async () => {
  const moves = [], host = { api: { state: () => ({ revision: 3 }) }, frameView: (...args) => moves.push(args) };
  const request = { kind: 'camera', expectedRevision: 3, position: [4, 3, 7], target: [0, 1, 0] };
  await invoke(host, request);
  assert.deepEqual(moves, [[[4, 3, 7], [0, 1, 0], 0]]);
  await assert.rejects(invoke(host, { ...request, expectedRevision: 2 }), /Revision conflict/);
  await assert.rejects(invoke(host, { ...request, position: [Infinity, 0, 0] }), /finite/);
  await assert.rejects(invoke(host, { ...request, position: request.target }), /must differ/);
  assert.equal(moves.length, 1);
  await invoke(host, { kind: 'camera', position: [1, 2, 3], target: [0, 0, 0] });
  assert.equal(moves.length, 2, 'framing does not change the scene, so the revision guard is optional');
});

test('a tab without a loaded world says so instead of reporting a revision conflict', async () => {
  const host = { api: { state: () => null }, frameView: () => {}, bridge: { manifest: () => ({ tools: [{ path: 'spawn', mutates: true }] }), call: async () => ({ ok: true }) } };
  assert.equal((await invoke(host, { kind: 'summary' })).loaded, false);
  await assert.rejects(invoke(host, { kind: 'edit', method: 'spawn', expectedRevision: 0, args: [{}] }), /No world is loaded/);
  await assert.rejects(invoke(host, { kind: 'camera', position: [1, 2, 3], target: [0, 0, 0] }), /No world is loaded/);
});

test('read/edit separation, native rejection and stale revisions are enforced at the actual browser boundary', async () => {
  let revision = 7, calls = 0;
  const host = { api: { state: () => ({ revision }) }, bridge: {
    manifest: () => ({ tools: [{ path: 'query', mutates: false }, { path: 'spawn', mutates: true }] }),
    call: async (method, entity) => { calls++; if (method === 'spawn' && entity?.invalid) return { ok: false, error: 'Invalid entity' };
      if (method === 'spawn') revision++; return { ok: true }; },
  } };
  await assert.rejects(invoke(host, { kind: 'read', method: 'spawn' }), /Use read/);
  await assert.rejects(invoke(host, { kind: 'edit', method: 'query', expectedRevision: 7 }), /Use read/);
  await assert.rejects(invoke(host, { kind: 'edit', method: 'spawn', expectedRevision: 6 }), /Revision conflict/);
  await assert.rejects(invoke(host, { kind: 'edit', method: '__proto__.constructor', expectedRevision: 7 }), /Unknown tool/);
  assert.equal(calls, 0);
  assert.equal((await invoke(host, { kind: 'edit', method: 'spawn', expectedRevision: 7, args: [{}] })).revision, 8);
  await assert.rejects(invoke(host, { kind: 'edit', method: 'spawn', expectedRevision: 7, args: [{}] }), /Revision conflict/);
  assert.equal(calls, 1, 'the second agent cannot overwrite from the same stale observation');
  await assert.rejects(invoke(host, { kind: 'edit', method: 'spawn', expectedRevision: 8, args: [{ invalid: true }] }), /Invalid entity/);
});
