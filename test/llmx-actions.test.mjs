import assert from 'node:assert/strict';
import { test } from 'node:test';
import { importBrowserModule } from './support/import-browser-module.mjs';
import { applyCommands } from '../server/scene-commands.mjs';

const { createLlmXForge } = await importBrowserModule(new URL('../src/llmx-environment.ts', import.meta.url));
const { prepareLlmXSceneAction, createLlmXSceneActions } = await importBrowserModule(new URL('../src/llmx-actions.ts', import.meta.url));
const forge = createLlmXForge(), zone = forge.anchors.buildZone;
const identity = { environmentId: 'room', revision: 'generation:3' };
const spawn = { op: 'spawn', entity: { id: 'llmx-created-cube', type: 'box', transform: { position: [4.6, .7, 3.4] }, material: { color: '#44aaff' } } };
const proposal = commands => ({ schemaVersion: 1, ...identity, intent: 'Créer un cube bleu', commands });

test('scene proposals preflight native commands without altering the source or its Forge', () => {
  const before = JSON.stringify(forge.document);
  const action = prepareLlmXSceneAction(proposal([spawn]), forge.document, identity, zone);
  assert.deepEqual(action.entityIds, ['llmx-created-cube']);
  assert.ok(action.commands[0].entity.tags.includes('llmx-creation'));
  assert.equal(JSON.stringify(forge.document), before);
  const created = applyCommands(forge.document, action.commands).definition;
  assert.deepEqual(created.entities.slice(0, -1), forge.document.entities);
  const update = prepareLlmXSceneAction(proposal([{ op: 'update', id: spawn.entity.id, patch: { material: { color: '#ffbb33' } } }]), created, identity, zone);
  assert.equal(applyCommands(created, update.commands).definition.entities.at(-1).material.color, '#ffbb33');
});

test('stale worlds, protected edits, references, unknown fields and oversized actions reject atomically', () => {
  const invalid = [
    { ...proposal([spawn]), revision: 'old' }, { ...proposal([spawn]), environmentId: 'other' },
    proposal([{ op: 'remove', id: 'llmx-face' }]), proposal([{ op: 'update', id: 'llmx-created-cube', patch: { appearance: { kind: 'voxel-face' } } }]),
    proposal([{ ...spawn, entity: { ...spawn.entity, parentId: 'llmx-face' } }]),
    proposal([{ ...spawn, entity: { ...spawn.entity, parentId: 'llmx-created-absent' } }]),
    proposal([{ ...spawn, entity: { ...spawn.entity, behaviors: [{ type: 'spin' }] } }]),
    proposal([{ ...spawn, entity: { ...spawn.entity, tags: ['llmx-math-v1'] } }]),
    proposal([{ ...spawn, entity: { ...spawn.entity, material: { roughness: Infinity } } }]),
    proposal(Array(41).fill(spawn)), proposal([spawn, spawn]),
    { ...proposal([spawn]), math: { operation: 'count', left: 3, right: 0, step: 0 } },
  ];
  const before = JSON.stringify(forge.document);
  for (const raw of invalid) assert.throws(() => prepareLlmXSceneAction(raw, forge.document, identity, zone), JSON.stringify(raw));
  assert.equal(JSON.stringify(forge.document), before);
});

test('a maths envelope produces deterministic native quantities and cannot be edited as arbitrary cubes', () => {
  const raw = { schemaVersion: 1, ...identity, intent: 'Montrer trois plus deux', math: { operation: 'add', left: 3, right: 2 } };
  const action = prepareLlmXSceneAction(raw, forge.document, identity, zone);
  const world = applyCommands(forge.document, action.commands).definition;
  assert.equal(world.entities.filter(entity => entity.tags?.includes('llmx-math-unit')).length, 5);
  assert.equal(world.entities.find(entity => entity.id === 'llmx-created-math').transform.position[0], -zone.center[0], 'math has its own table away from ordinary creations');
  assert.throws(() => prepareLlmXSceneAction(proposal([{ op: 'remove', id: 'llmx-created-math-unit-a-0' }]), world, identity, zone));
  assert.throws(() => prepareLlmXSceneAction(proposal([{ ...spawn, entity: { ...spawn.entity, parentId: 'llmx-created-math' } }]), world, identity, zone));
  assert.doesNotThrow(() => prepareLlmXSceneAction(proposal([{ op: 'remove', id: 'llmx-created-math' }]), world, identity, zone));
  assert.throws(() => prepareLlmXSceneAction({ ...raw, math: { operation: 'subtract', left: 2, right: 3 } }, world, identity, zone));
});

test('one native commit per response; rejection/replay and failed visuals never misreport an applied edit', () => {
  let world = structuredClone(forge.document), revision = 3, commits = 0;
  const api = { exportDocument: () => world, state: () => ({ revision }), commit(change) {
    commits++; assert.equal(change.expectedRevision, revision);
    world = applyCommands(world, change.commands).definition; revision++;
    return { ok: true };
  } };
  const actions = createLlmXSceneActions(api, () => identity, zone, () => { throw new Error('visuals unavailable'); });
  assert.equal(actions.apply(proposal([spawn]), 'turn-one').status, 'applied');
  assert.equal(actions.apply(proposal([spawn]), 'turn-one').status, 'rejected');
  assert.equal(actions.apply({ ...proposal([spawn]), revision: 'old' }, 'turn-two').status, 'rejected');
  assert.equal(commits, 1);
});

test('canonical document commands work without Node Buffer and measure UTF-8 bytes', () => {
  const original = globalThis.Buffer;
  try {
    globalThis.Buffer = undefined;
    const result = applyCommands(forge.document, [{ ...spawn, entity: { ...spawn.entity, label: 'Étoile 🌟' } }]);
    assert.equal(result.definition.entities.at(-1).label, 'Étoile 🌟');
  } finally { globalThis.Buffer = original; }
});
