import test from 'node:test';
import assert from 'node:assert/strict';
import { BufferGeometry, Mesh, MeshStandardMaterial } from 'three';
import { importBrowserModule } from './support/import-browser-module.mjs';
const { projectLiveLava } = await importBrowserModule(new URL('../src/ballsy-live-mesh.ts', import.meta.url));
const { projectVolcano } = await importBrowserModule(new URL('../src/ballsy-volcano-scene.ts', import.meta.url));
const { createVolcano, advanceVolcano } = await importBrowserModule(new URL('../src/ballsy-volcano.ts', import.meta.url));
const source = { positions: [0,0,0, 0,0,1, 1,0,0], indices: [0,1,2], groups: [{start:0,count:3,materialIndex:0}], materials: [{color:'#ffab35',roughness:.42}] };

test('live lava projects exact geometry, normals and material groups, disposing old GPU geometry', () => {
  const old = new BufferGeometry(), material = new MeshStandardMaterial(), mesh = new Mesh(old, material);
  let disposed = false; old.addEventListener('dispose', () => { disposed = true; });
  assert.equal(projectLiveLava(mesh, source), true);
  assert.ok(disposed);
  assert.deepEqual([...mesh.geometry.attributes.position.array], source.positions);
  assert.deepEqual([...mesh.geometry.index.array], source.indices);
  assert.deepEqual(mesh.geometry.groups, source.groups);
  assert.equal(mesh.geometry.attributes.normal.count, 3);
  assert.equal(mesh.material, material, 'stable material is reused');
  assert.equal(material.color.getHexString(), 'ffab35');
  assert.equal(material.roughness, .42);
  mesh.geometry.dispose(); material.dispose();
});

test('material bands resize once and are reused; missing visual object retains API fallback', () => {
  const old = new MeshStandardMaterial(), mesh = new Mesh(new BufferGeometry(), old);
  let disposed = false; old.addEventListener('dispose', () => { disposed = true; });
  const bands = {...source, materials: [{color:'#63382c'}, {color:'#ce541d'}, {color:'#ffab35'}]};
  projectLiveLava(mesh, bands);
  assert.ok(disposed); assert.equal(mesh.material.length, 3);
  const materials = mesh.material;
  projectLiveLava(mesh, bands);
  assert.equal(mesh.material, materials);
  assert.equal(projectLiveLava(null, source), false);
  mesh.geometry.dispose(); materials.forEach(m => m.dispose());
});

test('earth deformation and reset retain API collider updates while lava bypasses document history', () => {
  const updates = [], api = {update: (id, patch) => updates.push({id, patch}), query: () => []};
  const mesh = new Mesh(new BufferGeometry(), new MeshStandardMaterial()), state = createVolcano();
  const object = id => id === 'volcano-earth-lava' ? mesh : null;
  projectVolcano(api, state, object);
  advanceVolcano(state, .2); projectVolcano(api, state, object);
  assert.deepEqual(updates.map(u => u.id), ['volcano-earth']);
  state.earth.height[20] -= .1; state.earth.revision++;
  projectVolcano(api, state, object);
  projectVolcano(api, createVolcano(), object);
  assert.deepEqual(updates.map(u => u.id), ['volcano-earth','volcano-earth','volcano-earth']);
  assert.ok(updates.every(u => u.patch.mesh.positions.length > 0));
  projectVolcano(api, state);
  assert.equal(updates.at(-1).id, 'volcano-earth-lava');
  mesh.geometry.dispose(); (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach(m => m.dispose());
});
