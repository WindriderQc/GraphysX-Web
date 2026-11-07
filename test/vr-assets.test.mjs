import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { productAssetManifest } from '../scripts/product-assets.mjs';
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
 for(const file of ['profilesList.json','generic-trigger/profile.json','generic-trigger/controller.gltf']){
  assert.ok(manifest.files.includes(`/assets/xr/profiles/${file}`));
 }
});
