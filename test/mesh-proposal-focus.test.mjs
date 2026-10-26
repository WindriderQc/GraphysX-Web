import test from 'node:test';
import assert from 'node:assert/strict';
import { meshProposalFocus, MESH_FOCUS_BYTES } from '../src/mesh-proposal-focus.ts';
import { buildInlineMesh } from '../server/mesh-construction.mjs';
import { buildWorldVocabulary } from '../server/world-vocabulary.mjs';

test('focused context contains only one mesh authoring view, without behavior or personal fields',()=>{
  const entity={id:'panel',type:'mesh',label:'Panel',mesh:buildInlineMesh({kind:'extrude',profile:[[0,0],[1,0],[0,1]],depth:1}),
    transform:{position:[1,2,3]},material:{color:'#ffffff'},behaviors:[{script:'private'}],tags:['private'],agent:{memory:'private'}};
  const focus=meshProposalFocus(entity);
  assert.equal(focus.complete,true);assert.deepEqual(focus.mesh,entity.mesh);assert.equal(focus.vertexCount,entity.mesh.positions.length/3);
  assert.equal(JSON.stringify(focus).includes('private'),false);
  focus.mesh.positions[0]=99;assert.equal(entity.mesh.positions[0],0);
  assert.equal(meshProposalFocus({id:'box',type:'box'}),undefined);
});
test('oversized focused meshes carry counts and a truthful incomplete marker, without partial buffers',()=>{
  const mesh=buildInlineMesh({kind:'revolve',segments:24,profile:Array.from({length:12},(_,i)=>[1+i/10,i/5])});
  const focus=meshProposalFocus({id:'large',type:'mesh',mesh,material:{color:'#fff'}});
  assert.equal(focus.complete,false);assert.equal(focus.mesh,undefined);assert.equal(focus.material,undefined);
  assert.equal(focus.vertexCount,300);assert.ok(Buffer.byteLength(JSON.stringify(focus))<MESH_FOCUS_BYTES);
});
test('published authoring blocks are field arrays Core can render, with executable examples',()=>{
  const vocabulary=buildWorldVocabulary();
  for(const name of ['meshBuild','meshEdits','meshRange','pixelEdits']) {
    assert.ok(Array.isArray(vocabulary.fields[name]),`${name} must use the published field-list contract`);
    assert.ok(vocabulary.fields[name].every(field=>field.name&&field.description));
  }
  assert.match(vocabulary.operations.spawn.description,/spawn.meshBuild/);
  assert.equal(vocabulary.limits.meshEditing.ranges,64);
});
