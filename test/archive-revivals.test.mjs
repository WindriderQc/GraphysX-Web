import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {MeshStandardMaterial} from 'three';
import {decodeBinaryX,binaryXTokens} from '../scripts/directx-binary.mjs';
import {validatePlaygroundShader} from '../server/visual-effects.mjs';
import {validateStoredSceneDefinition,applyCommands} from '../server/scene-commands.mjs';
import {assertInlineMesh,assertMeshSceneBudget} from '../server/inline-mesh.mjs';
import {importBrowserModule} from './support/import-browser-module.mjs';
import {applyPlaygroundShader,updatePlaygroundShader} from '../src/playground-material.ts';
import {productAssetManifest} from '../scripts/product-assets.mjs';
const read=file=>readFileSync(new URL('../'+file,import.meta.url));
const json=file=>JSON.parse(read(file));
const source=json('public/assets/ports/archive-playground.json'),dominus=json('public/assets/ports/archive-dominus.json');
const {buildPlayground,playgroundTerrainCommands}=await importBrowserModule(new URL('../src/archive-playground-scene.ts',import.meta.url));
const {buildDominus,dominusViewCommands}=await importBrowserModule(new URL('../src/archive-dominus-scene.ts',import.meta.url));

test('complete Playground composition survives bounded v2 storage with original topology',()=>{
 const world=buildPlayground(source);validateStoredSceneDefinition(world);assertMeshSceneBudget(world.entities);
 const triangles=parent=>world.entities.filter(e=>e.parentId===parent).reduce((n,e)=>n+e.mesh.indices.length/3,0);
 assert.equal(triangles('playground-terrain'),200);
 for(let i=0;i<3;i++){assert.equal(triangles('playground-morph-'+i),720);assert.equal(triangles('playground-'+['earth','mars','moon'][i]),4900);}
 assert.equal(world.entities.find(e=>e.id==='playground-airplane').asset.fitSize,Math.max(...source.airplaneBounds.size));
 assert.equal(world.entities.find(e=>e.id==='playground-airplane').behaviors[0].speedDegrees,100);
 for(const e of world.entities.filter(e=>e.mesh))assertInlineMesh(e.mesh);
 assert.deepEqual(JSON.parse(JSON.stringify(world)),world);
});

test('all terrain slider extremes retain the document budget and preserve user objects',()=>{
 let world=buildPlayground(source);
 world.entities.push({id:'my-object',type:'box',parentId:'playground-terrain',label:'Keep this'});
 world.entities.find(e=>e.id==='playground-terrain-mesh-0').material.color='#123456';
 for(const [width,height] of [[100,100],[1,100],[100,1],[10,10]]){
  ({definition:world}=applyCommands(world,playgroundTerrainCommands(world,width,height)));
  validateStoredSceneDefinition(world);assertMeshSceneBudget(world.entities);
  assert.equal(world.entities.find(e=>e.id==='my-object').label,'Keep this');
  assert.equal(world.entities.find(e=>e.id==='playground-terrain-mesh-0').material.color,'#123456');
  const active=world.entities.filter(e=>e.parentId==='playground-terrain'&&e.mesh&&e.visible!==false);
  assert.equal(active.reduce((n,e)=>n+e.mesh.indices.length/3,0),2*width*height);
 }
});

test('all 65 Dominus models and all 28 source pivots remain ordinary editable model entities',()=>{
 const world=buildDominus(dominus);validateStoredSceneDefinition(world);
 assert.equal(world.entities.filter(e=>e.type==='model').length,93);
 for(const p of dominus.portPlacements){
  const key=p.name.toLowerCase(),group=world.entities.find(e=>e.id==='dominus-source-'+key),mesh=world.entities.find(e=>e.parentId===group.id&&e.type==='model'),record=dominus.models.find(m=>m.id===key);
  assert.deepEqual(group.transform.position,[p.position[0],p.position[1],-p.position[2]]);assert.deepEqual(group.transform.scale,p.scale);
  const center=record.bounds.min.map((n,i)=>(n+record.bounds.max[i])/2);
  assert.deepEqual(mesh.transform.position,[center[0],center[1],-center[2]]);assert.equal(mesh.asset.fitSize,Math.max(...record.bounds.size));
 }
 const edited=world.entities.find(e=>e.id==='dominus-source-port_crateshed-model');edited.label='My recovered shed';
 const switched=applyCommands(world,dominusViewCommands('models')).definition;
 assert.equal(switched.entities.find(e=>e.id===edited.id).label,edited.label);
 assert.equal(switched.entities.find(e=>e.id==='dominus-source').visible,false);
 assert.equal(switched.entities.find(e=>e.id==='dominus-models').visible,true);
 assert.equal(dominus.models.filter(m=>m.recovery==='decoded-binary-x').length,2);
});

test('formerly unsupported binary source files decode every mesh, UV and material binding',()=>{
 for(const [name,vertices,triangles,groups] of [['port_crateshed',274,176,4],['renzokscale',917,1118,1]]){
  const bytes=read('test/fixtures/dominus/'+name+'.x'),record=dominus.models.find(m=>m.id===name);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),record.sourceSha256);
  const result=decodeBinaryX(bytes,{textureUrl:name=>dominus.textures.find(t=>t.source.split('/').at(-1).toLowerCase()===name.toLowerCase()).url});
  assert.equal(result.vertexCount,vertices);assert.equal(result.triangleCount,triangles);assert.equal(result.materialGroupCount,groups);
  assert.deepEqual(result.bounds,record.bounds);
  const published=json('public'+record.url);assert.deepEqual(result.meshes,published.meshes);
  for(const mesh of result.meshes){assert.equal(mesh.uvs.length,mesh.vertexCount*2);assert.equal(mesh.groups.reduce((n,g)=>n+g.count,0),mesh.indices.length);assert.ok(mesh.materials.every(m=>m.textureUrl.startsWith('/assets/')));}
 }
});

test('binary decoder rejects truncation, unsupported encodings and oversized records before allocation',()=>{
 const bytes=read('test/fixtures/dominus/port_crateshed.x');
 for(const length of [0,15,17,22,bytes.length-1])assert.throws(()=>decodeBinaryX(bytes.subarray(0,length)));
 const count=Buffer.from(bytes);count.writeUInt32LE(0xffffffff,18);assert.throws(()=>binaryXTokens(count),/long|Truncated/);
 const header=Buffer.from(bytes);header.write('bzip',8,'ascii');assert.throws(()=>decodeBinaryX(header),/header/);
 const token=Buffer.from(bytes);token.writeUInt16LE(0xffff,16);assert.throws(()=>decodeBinaryX(token),/token/);
});

test('Playground effects are fixed, shared-clock programs and cannot carry arbitrary shader source',()=>{
 for(const effect of ['morph','unlit']){
  const settings={id:'archive-playground',effect};validatePlaygroundShader(settings);
  const world=buildPlayground(source);world.entities.find(e=>e.id==='playground-cube').material.shader=settings;validateStoredSceneDefinition(world);
 }
 for(const bad of [{id:'archive-playground',effect:'eval'},{id:'archive-playground',effect:'morph',vertexShader:'void main(){}'},{id:'archive-playground'},{id:'other',effect:'morph'}])assert.throws(()=>validatePlaygroundShader(bad));
 const material=new MeshStandardMaterial();applyPlaygroundShader(material,{id:'archive-playground',effect:'morph'});
 const uniforms=material.userData.graphysxPlaygroundUniforms;updatePlaygroundShader(material,2);assert.equal(uniforms.gxPlaygroundFrame.value,121);
 applyPlaygroundShader(material,{id:'archive-playground',effect:'morph'});assert.equal(material.userData.graphysxPlaygroundUniforms,uniforms);
 applyPlaygroundShader(material,{id:'archive-playground',effect:'unlit'});assert.equal(material.userData.graphysxPlaygroundUniforms,uniforms);
 applyPlaygroundShader(material,null);assert.equal(material.userData.graphysxPlaygroundUniforms,undefined);material.dispose();
});

test('the production manifest includes exact Playground GLB/sky assets and both recovered binary models',async()=>{
 const manifest=await productAssetManifest(),urls=new Set(manifest.files);
 for(const item of source.assets){assert.ok(urls.has(item.url),item.url);assert.equal(createHash('sha256').update(read('public'+item.url)).digest('hex'),item.sha256);}
 for(const item of dominus.models.filter(m=>m.recovery==='decoded-binary-x'))assert.ok(urls.has(item.url),item.url);
 assert.ok(urls.has('/assets/ports/dominus/renzokdo.jpg'));
});

test('the revival ledger accounts for every legacy harness and links recoveries to usable evidence',()=>{
 const ledger=json('docs/revival-status.json');
 const entries=[...read('src/preview-registry.ts').toString().matchAll(/id:\s*"([^"]+)"([\s\S]*?)(?=\bid:\s*"|$)/g)];
 const unresolved=entries.filter(([, , entry])=>/state:\s*"unconverted"/.test(entry)).map(([,id])=>id).sort();
 const reconciled=ledger.previewReconciliation.map(entry=>entry.id).sort();
 assert.deepEqual(reconciled,unresolved,'New or removed legacy harnesses require an explicit reconciliation');
 assert.equal(new Set(reconciled).size,reconciled.length);
 const experiences=new Map(ledger.experiences.map(entry=>[entry.id,entry]));
 for(const entry of [...ledger.experiences,...ledger.previewReconciliation,...ledger.researchQueue]){
  if(entry.experience)assert.ok(experiences.has(entry.experience),entry.id+' must name a tracked experience');
  for(const file of [entry.evidence,entry.implementation,...entry.verification??[]].filter(Boolean))assert.ok(read(file).length>0,file);
 }
 assert.equal(ledger.historicalCensus.currentCompletionScore,false,'A dated census cannot become a current completion claim');
});
