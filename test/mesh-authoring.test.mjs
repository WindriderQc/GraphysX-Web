import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInlineMesh } from '../server/mesh-construction.mjs';
import { editInlineMesh, materializeMeshCommands } from '../server/mesh-authoring.mjs';
import { applyCommands } from '../server/scene-commands.mjs';
import { computeInverseCommands } from '../server/live-sessions.mjs';

const rectangle=[[-1,-1],[1,-1],[1,1],[-1,1]];
const recipe={kind:'extrude',profile:rectangle,depth:2};
const base=()=>({schema:'graphysx.agent-world/v2',id:'mesh-edit',label:'Mesh editing',entities:[]});
const spawn={op:'spawn',entity:{id:'made',type:'mesh'},meshBuild:recipe};
const volume=mesh=>{let v=0;for(let i=0;i<mesh.indices.length;i+=3){const [a,b,c]=mesh.indices.slice(i,i+3).map(k=>mesh.positions.slice(k*3,k*3+3));v+=(a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]))/6;}return v;};

test('extrusion caps concave profiles, winding is outward and reverse input has the same volume',()=>{
  const mesh=buildInlineMesh(recipe);assert.equal(volume(mesh),8);assert.equal(mesh.positions.length/3,24);assert.equal(mesh.indices.length/3,12);
  assert.equal(volume(buildInlineMesh({...recipe,profile:[...rectangle].reverse()})),8);
  const concave=buildInlineMesh({...recipe,profile:[[0,0],[2,0],[2,1],[1,1],[1,2],[0,2]]});
  assert.equal(volume(concave),6);assert.equal(concave.uvs.length,concave.positions.length/3*2);
});
test('revolution supports pole vertices, seam UVs, partial turns and refuses collapsed axes',()=>{
  const mesh=buildInlineMesh({kind:'revolve',profile:[[0,0],[1,0],[1,2],[0,2]],segments:16});
  assert.ok(volume(mesh)>6&&volume(mesh)<6.3);assert.ok(mesh.uvs.includes(1));
  assert.ok(buildInlineMesh({kind:'revolve',profile:[[1,0],[1,2]],segments:8,angleDegrees:180}).indices.length);
  assert.throws(()=>buildInlineMesh({kind:'revolve',profile:[[0,0],[0,1],[1,2]]}),/collapsed/);
});
test('construction is canonical Float32 JSON and independent of host trigonometry',()=>{
  const saved={sin:Math.sin,cos:Math.cos};
  let mesh;
  try {Math.sin=()=>{throw new Error('Host sine is not deterministic');};Math.cos=Math.sin;mesh=buildInlineMesh({kind:'revolve',profile:[[0,0],[2,0],[1,2]],segments:8});}
  finally {Math.sin=saved.sin;Math.cos=saved.cos;}
  assert.deepEqual(mesh,JSON.parse(JSON.stringify(mesh)));
  assert.ok(mesh.positions.every(n=>Object.is(n,Math.fround(n))&&!Object.is(n,-0)));
  assert.deepEqual(mesh.positions.slice((9+2)*3,(9+3)*3),[0,0,2]);
});
test('sweep caps a polygon along a spatial path, with outward volume and portable UVs',()=>{
  const straight=buildInlineMesh({kind:'sweep',profile:rectangle,path:[[0,0,0],[0,0,3]]});
  assert.equal(volume(straight),12);
  const curved=buildInlineMesh({kind:'sweep',profile:rectangle,path:[[0,0,0],[0,0,3],[2,1,5],[4,3,5]]});
  assert.equal(curved.uvs.length,curved.positions.length/3*2);assert.ok(volume(curved)>0);
  assert.throws(()=>buildInlineMesh({kind:'sweep',profile:rectangle,path:[[0,0,0],[0,0,0]]}),/repeated/);
  assert.throws(()=>buildInlineMesh({kind:'sweep',profile:rectangle,path:[[0,0,0],[1,0,0],[0,0,0]]}),/collapsed/);
});
test('invalid/self-intersecting profiles, unknown fields and allocation budgets fail before construction',()=>{
  for(const profile of [[],[[0,0],[1,0],[0,0]],[[0,0],[1,1],[0,1],[1,0]],[[0,0],[1,0],[2,0]]]) assert.throws(()=>buildInlineMesh({...recipe,profile}));
  for(const bad of [{...recipe,depth:0},{...recipe,depth:Infinity},{...recipe,script:'ignored?'},{kind:'other',profile:rectangle}]) assert.throws(()=>buildInlineMesh(bad));
  assert.throws(()=>buildInlineMesh({kind:'revolve',segments:64,profile:Array.from({length:64},(_,i)=>[1,i])}),/budget/);
});
test('tuple ranges retain other vertices, UVs and triangles and invalidate old explicit normals',()=>{
  const mesh=buildInlineMesh(recipe);mesh.normals=mesh.positions.map((_,i)=>i%3===1?1:0);
  const old=structuredClone(mesh),next=editInlineMesh(mesh,{positions:[{start:0,values:[-1,-0.5,-1]}]});
  assert.deepEqual(mesh,old);assert.deepEqual(next.positions.slice(3),mesh.positions.slice(3));assert.deepEqual(next.indices,mesh.indices);assert.deepEqual(next.uvs,mesh.uvs);assert.equal(next.normals,undefined);
  for(const edits of [{positions:[{start:-1,values:[0,0,0]}]},{positions:[{start:999,values:[0,0,0]}]},{positions:[{start:0,values:[1,2]}]},{positions:[{start:0,values:[0,0,0]},{start:0,values:[1,1,1]}]},{uvs:[{start:0,values:[NaN,0]}]},{indices:[{start:0,values:[0,0,1]}]},{script:[]}]) assert.throws(()=>editInlineMesh(mesh,edits));
});
test('relative position edits preserve untouched components exactly and refuse ambiguous/non-position deltas',()=>{
  const mesh=buildInlineMesh(recipe);mesh.positions[0]=-0;
  const edited=editInlineMesh(mesh,{positions:[{start:0,delta:[0,0.2,0]}]});
  assert.equal(Object.is(edited.positions[0],-0),true);assert.equal(edited.positions[1],0.2);assert.equal(edited.positions[2],mesh.positions[2]);assert.deepEqual(edited.positions.slice(3),mesh.positions.slice(3));
  assert.throws(()=>editInlineMesh(mesh,{positions:[{start:0,delta:[0,1,0],values:[0,1,0]}]}),/Choose/);
  assert.throws(()=>editInlineMesh(mesh,{indices:[{start:0,delta:[0,0,0]}]}),/positions-only/);
});
test('declarative batches persist only canonical buffers and patches and have exact live inverses',()=>{
  const initial=applyCommands(base(),[spawn]).definition;
  assert.equal(initial.entities[0].mesh.positions.length,72);assert.equal(initial.entities[0].meshBuild,undefined);
  const commands=[{op:'update',id:'made',patch:{meshEdits:{positions:[{start:0,values:[-1,-0.5,-1]}]}}}];
  const input=structuredClone(commands),changed=applyCommands(initial,commands);
  const inverse=computeInverseCommands(initial,commands,changed.outputs);
  assert.deepEqual(applyCommands(changed.definition,inverse).definition,initial);assert.deepEqual(commands,input);
  const rebuilt=applyCommands(initial,[{op:'update',id:'made',patch:{meshBuild:{kind:'revolve',profile:[[0,0],[1,0],[0,2]],segments:8}}}]);
  assert.ok(rebuilt.definition.entities[0].mesh.positions.length>0);
  assert.equal(rebuilt.definition.entities[0].meshBuild,undefined);
});
test('pixel rectangles retain untouched texels and texture transforms; overlaps and competing sources refuse atomically',()=>{
  const source=structuredClone(spawn);source.entity.material={texture:{id:'inline',pixels:{width:2,height:2,rgba:Array(16).fill(255)},repeat:[2,3]}};
  const initial=applyCommands(base(),[source]).definition;
  const commands=[{op:'update',id:'made',patch:{pixelEdits:[{x:1,y:0,width:1,height:1,rgba:[0,100,200,255]}]}}];
  const changed=applyCommands(initial,commands),texture=changed.definition.entities[0].material.texture;
  assert.deepEqual(texture.repeat,[2,3]);assert.deepEqual(texture.pixels.rgba,[255,255,255,255,0,100,200,255,...Array(8).fill(255)]);
  assert.deepEqual(applyCommands(changed.definition,computeInverseCommands(initial,commands,changed.outputs)).definition,initial);
  for(const patch of [{pixelEdits:[{x:2,y:0,width:1,height:1,rgba:[0,0,0,255]}]},{pixelEdits:[...commands[0].patch.pixelEdits,...commands[0].patch.pixelEdits]},{...commands[0].patch,material:{texture:{id:'checker'}}},{mesh:initial.entities[0].mesh,meshBuild:recipe}]) assert.throws(()=>applyCommands(initial,[{op:'update',id:'made',patch}]));
  assert.deepEqual(initial.entities[0].material.texture.pixels.rgba,Array(16).fill(255));
});
test('sequential create/edit/pixel materialization uses the preceding draft without mutating source commands',()=>{
  const legacy=[{op:'spawn',entity:{id:'legacy',type:'box'}}];assert.equal(materializeMeshCommands(legacy,[]),legacy,'existing command batches bypass the optional mesh expander');
  const commands=[spawn,{op:'update',id:'made',patch:{meshEdits:{positions:[{start:0,values:[-1,-0.5,-1]}]}}}];
  const frozen=structuredClone(commands),expanded=materializeMeshCommands(commands,[]);
  assert.equal(expanded[1].patch.mesh.positions[1],-0.5);assert.deepEqual(commands,frozen);
  const doc=base();assert.throws(()=>applyCommands(doc,[...commands,{op:'update',id:'made',patch:{meshEdits:{indices:[{start:0,values:[0,0,0]}]}}}]));assert.deepEqual(doc,base());
});
test('texel patches target a face material slot without changing geometry or other materials',()=>{
  const mesh=buildInlineMesh(recipe),texture={id:'inline',pixels:{width:1,height:1,rgba:[20,180,220,255]}};
  mesh.materials=[{texture}];
  const initial={...base(),entities:[{id:'slotted',type:'mesh',mesh}]};
  const commands=[{op:'update',id:'slotted',patch:{pixelEdits:[{materialIndex:0,x:0,y:0,width:1,height:1,rgba:[220,110,40,255]}]}}];
  const changed=applyCommands(initial,commands);
  assert.deepEqual(changed.definition.entities[0].mesh.positions,mesh.positions);
  assert.deepEqual(changed.definition.entities[0].mesh.materials[0].texture.pixels.rgba,[220,110,40,255]);
  assert.equal(changed.definition.entities[0].material,undefined);
  assert.deepEqual(applyCommands(changed.definition,computeInverseCommands(initial,commands,changed.outputs)).definition,initial);
  for(const materialIndex of [null,'base',-1,1,0.5]) assert.throws(()=>applyCommands(initial,[{op:'update',id:'slotted',patch:{pixelEdits:[{...commands[0].patch.pixelEdits[0],materialIndex}]}}]));
});
