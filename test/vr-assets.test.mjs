import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { productAssetManifest, xrAssetManifest } from '../scripts/product-assets.mjs';
import { XR_MODEL_FILES } from '../scripts/vendor-xr-models.mjs';
const read = name => readFile(new URL(`../public/assets/xr/profiles/${name}`,import.meta.url),'utf8').then(JSON.parse);
test('local generic controller has all animated component nodes and stays in the product manifest',async()=>{
 const profiles=await read('profilesList.json');
 assert.equal(profiles['generic-trigger'].path,'generic-trigger/profile.json');
 const profile=await read(profiles['generic-trigger'].path);
 const model=await read('generic-trigger/controller.gltf');
 const names=new Set(model.nodes.map(node=>node.name));
 for(const handedness of ['left','right','none']){
  const layout=profile.layouts[handedness];assert.equal(layout.assetPath,'controller.gltf');
  assert.equal(layout.components['xr-standard-trigger'].gamepadIndices.button,0);
  assert.equal(layout.components['xr-standard-squeeze'].gamepadIndices.button,1);
  for(const component of Object.values(layout.components))for(const response of Object.values(component.visualResponses)){
   for(const key of ['valueNodeName','minNodeName','maxNodeName'])assert.ok(names.has(response[key]),response[key]);
  }
 }
 assert.ok(model.buffers.every(buffer=>buffer.uri.startsWith('data:')));
 const manifest=await productAssetManifest();
 const xr=await xrAssetManifest();
 assert.equal(xr.length,9);
 for(const file of ['profilesList.json','generic-trigger/profile.json','generic-trigger/controller.gltf']){
  assert.ok(manifest.files.includes(`/assets/xr/profiles/${file}`));
  assert.ok(xr.includes(`/assets/xr/profiles/${file}`));
 }
});

test('vendored hands and Touch controllers are pinned, self-contained and shipped with their license',async()=>{
 const manifest=await productAssetManifest();
 const xr=await xrAssetManifest();
 for(const [file,hash] of Object.entries(XR_MODEL_FILES)){
  const buffer=await readFile(new URL(`../public/assets/xr/profiles/${file}`,import.meta.url));
  assert.equal(createHash('sha256').update(buffer).digest('hex'),hash,file);
  assert.ok(manifest.files.includes(`/assets/xr/profiles/${file}`),file);
  assert.ok(xr.includes(`/assets/xr/profiles/${file}`),file);
  if(!file.endsWith('.glb'))continue;
  const gltf=JSON.parse(buffer.subarray(20,20+buffer.readUInt32LE(12)).toString());
  assert.ok(gltf.buffers.every(b=>!b.uri),'GLB buffers must be embedded');
  assert.ok((gltf.images??[]).every(image=>!image.uri),'GLB textures must be embedded');
  const names=new Set(gltf.nodes.map(node=>node.name));
  if(file.startsWith('generic-hand/')){
   assert.equal(gltf.skins.length,1);assert.equal(gltf.skins[0].joints.length,25);
   for(const name of ['wrist','thumb-tip','index-finger-tip','middle-finger-tip','ring-finger-tip','pinky-finger-tip'])assert.ok(names.has(name),name);
  }else{
   const profile=await read('oculus-touch-v3/profile.json');
   const side=file.includes('/left.')?'left':'right';
   const layout=profile.layouts[side];assert.equal(layout.assetPath,`${side}.glb`);
   assert.ok(names.has(layout.rootNodeName));
   for(const component of Object.values(layout.components)){
    assert.ok(names.has(component.rootNodeName));
    for(const response of Object.values(component.visualResponses)){
     for(const key of ['valueNodeName','minNodeName','maxNodeName'])assert.ok(names.has(response[key]),`${side}: ${response[key]}`);
    }
   }
  }
 }
 assert.equal((await read('profilesList.json'))['oculus-touch-v3'].path,'oculus-touch-v3/profile.json');
});
