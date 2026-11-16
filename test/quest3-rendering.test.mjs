import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { RenderDiagnostics } from '../src/render-diagnostics.ts';
import { negotiateQuestRate } from '../src/xr/quest-profile.ts';
import { resolveModelPresentation } from '../server/model-presentation.mjs';
import { validateStoredSceneDefinition } from '../server/scene-commands.mjs';
import { productAssetManifest } from '../scripts/product-assets.mjs';

test('diagnostics retain stalls, bound their sample window and separate desktop from immersion',()=>{
  const stats=new RenderDiagnostics(),counts={calls:4,triangles:12,geometries:2,textures:1};
  for(let i=0;i<250;i++)stats.record('desktop',10,3,counts);
  stats.record('desktop',900,5,counts);
  assert.equal(stats.snapshot().samples,240);assert.equal(stats.snapshot().intervalMs.p99,10);
  stats.record('immersive-vr',1000/90,2,counts);
  const value=stats.snapshot();assert.equal(value.frames,1);assert.equal(value.samples,1);assert.equal(value.observedHz,90);assert.equal(value.gpuMs,null);assert.equal(value.memoryBytes,null);
  stats.record('immersive-vr',900,2,counts);assert.equal(stats.snapshot().intervalMs.p95,900);
  assert.equal(value.calls,4);
});
test('Quest rate negotiation follows capabilities and a refusal preserves session ownership',async()=>{
  const requested=[];const session={supportedFrameRates:new Float32Array([72,90,120]),frameRate:72,async updateTargetFrameRate(rate){requested.push(rate);this.frameRate=rate;}};
  assert.equal((await negotiateQuestRate(session,'balanced')).activeHz,90);assert.deepEqual(requested,[90]);
  await negotiateQuestRate(session,'economy');assert.equal(session.frameRate,72);
  session.updateTargetFrameRate=async()=>{throw Error('refused');};const rejected=await negotiateQuestRate(session,'quality');assert.match(rejected.error,/refused/);assert.equal(rejected.activeHz,72);
  assert.deepEqual(await negotiateQuestRate({},'balanced'),{requestedHz:null,activeHz:null,error:null});
});
const asset={format:'gltf',url:'/model.glb',instances:[{position:[1,2,3]}],lods:[{url:'/low.glb',distance:12}],lightmap:{url:'/bake.ktx2'}};
test('native model presentation validates at the document boundary and rejects ambiguous or unbounded batches',()=>{
  const world={schema:'graphysx.agent-world/v2',id:'test',label:'Test',entities:[{id:'native',type:'model',asset}]};
  assert.doesNotThrow(()=>validateStoredSceneDefinition(world));
  assert.deepEqual(resolveModelPresentation(asset).instances[0].scale,[1,1,1]);
  for(const patch of [{instances:[]},{instances:Array.from({length:2049},()=>({}))},{instances:[{scale:[-1,1,1]}]},{instances:[{position:[NaN,0,0]}]},{lods:[{url:'/a',distance:4},{url:'/b',distance:3}]},{lightmap:{url:'//untrusted/test'}},{lightmap:{url:'/a',intensity:Infinity}},{instances:[{extra:true}]}]){
    assert.throws(()=>resolveModelPresentation({...asset,...patch}));
    assert.throws(()=>validateStoredSceneDefinition({...world,entities:[{...world.entities[0],asset:{...asset,...patch}}]}));
  }
  assert.throws(()=>validateStoredSceneDefinition({...world,entities:[{...world.entities[0],physics:{mode:'static'}}]}),/physics proxies/);
  assert.throws(()=>resolveModelPresentation({...asset,format:'graphysx-mesh-json'}),/requires/);
});
test('the release includes native models, complete KTX2 codecs and Quest 3 Touch Plus profiles',async()=>{
  const manifest=await productAssetManifest();
  for(const file of ['/assets/quest3/station.glb','/assets/quest3/station-light.ktx2','/assets/quest3/panels.ktx2','/assets/codecs/basis/basis_transcoder.wasm','/assets/codecs/basis/LICENSE.txt','/assets/xr/profiles/meta-quest-touch-plus/profile.json'])assert.ok(manifest.files.includes(file),file);
  const read=async file=>readFile(new URL(`../public/assets/quest3/${file}`,import.meta.url));
  const glb=await read('station.glb'),doc=JSON.parse(glb.subarray(20,20+glb.readUInt32LE(12)).toString());
  assert.ok(doc.meshes.every(mesh=>mesh.primitives.every(primitive=>primitive.attributes.TEXCOORD_1!==undefined)),'every baked surface owns a UV1 chart');
  const bytes=await read('equipment.glb'),equipment=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
  assert.ok(equipment.extensionsRequired.includes('KHR_texture_basisu'));
  const ktx=await read('station-light.ktx2');assert.deepEqual([...ktx.subarray(0,12)],[171,75,84,88,32,50,48,187,13,10,26,10]);
  const bake=JSON.parse((await read('build.json')).toString());assert.ok(bake.bake.lights.length>0);assert.match(bake.bake.method,/AABB shadows/);
});
