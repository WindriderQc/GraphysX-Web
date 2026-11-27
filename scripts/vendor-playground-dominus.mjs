// Read-only archive inputs. All generated files belong to this product checkout.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {decodeBinaryX} from './directx-binary.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2),archive=path.resolve(args.find(a=>a.startsWith('--archive='))?.slice(10)??path.join(root,'../GraphysX'));
const playground=path.resolve(args.find(a=>a.startsWith('--playground='))?.slice(13)??'E:/Media/Datalake/Codes/SBQC/public/Projects/3D Playground');
const check=args.includes('--check'),hash=b=>createHash('sha256').update(b).digest('hex');
const read=relative=>fs.readFile(path.join(root,relative));
const write=async(relative,bytes)=>{const destination=path.resolve(root,relative);assert.ok(destination.startsWith(path.join(root,'public')+path.sep));if(check)assert.deepEqual(await fs.readFile(destination),bytes,relative);else {await fs.mkdir(path.dirname(destination),{recursive:true});await fs.writeFile(destination,bytes);}};
const json=async(relative,value)=>write(relative,Buffer.from(JSON.stringify(value,null,2)+'\n'));
const gallery=JSON.parse(await read('src/content/dominus-asset-gallery.json'));
const audit=JSON.parse(await read('src/content/dominus-family-audit.json'));
const rootSource=gallery.sourceAudit.canonicalRoot,models=[],textures=[...gallery.textureRecords];
const additionalTexture='RENZOKDO.JPG',textureBytes=await fs.readFile(path.join(archive,rootSource,additionalTexture));
const newTextureUrl='/assets/ports/dominus/renzokdo.jpg';
await write('public'+newTextureUrl,textureBytes);
textures.push({source:rootSource+'/'+additionalTexture,sourceSha256:hash(textureBytes),url:newTextureUrl,outputSha256:hash(textureBytes),conversion:'byte-identical copy',runtimeColorKey:null});
const textureUrl=name=>{const record=textures.find(t=>t.source.split('/').at(-1).toLowerCase()===name.toLowerCase());assert.ok(record,'Missing original texture: '+name);return record.url;};
for(const asset of gallery.assets){
 const sourceBytes=await fs.readFile(path.join(archive,asset.source));assert.equal(hash(sourceBytes),asset.sha256.toLowerCase(),asset.source);
 let url=asset.payloadUrl,payload,binary=false;
 if(url){const bytes=await read('public'+url);assert.equal(hash(bytes),asset.payloadSha256.toLowerCase(),url);payload=JSON.parse(bytes);}
 else {
  binary=true;url='/assets/ports/archive-dominus-'+asset.id.replaceAll('_','-')+'.json';
  const fixture=path.join(root,'test/fixtures/dominus',asset.id+'.x');
  if(check)assert.deepEqual(await fs.readFile(fixture),sourceBytes);else {await fs.mkdir(path.dirname(fixture),{recursive:true});await fs.writeFile(fixture,sourceBytes);}
  payload={...decodeBinaryX(sourceBytes,{textureUrl}),source:asset.source,sha256:hash(sourceBytes),
   catalog:{label:'Dominus · '+asset.id.replaceAll('_',' '),category:asset.family==='port'?'port':'character'},
   provenance:{archiveSource:asset.source,sourceSha256:hash(sourceBytes),recovery:'uncompressed binary DirectX X 0303, counted little-endian tokens',adapted:['Static mesh; shared renderer computes normals and reflects Z like the existing text-X payloads.']}};
  await json('public'+url,payload);
 }
 const keyed=textures.some(t=>t.runtimeColorKey==='magenta'&&payload.meshes.some(m=>m.materials.some(material=>material.textureUrl===t.url)));
 models.push({id:asset.id,name:asset.name,family:asset.family,source:asset.source,sourceSha256:hash(sourceBytes),sourceFormat:sourceBytes.toString('ascii',0,16),url,colorKey:keyed,
  recovery:binary?'decoded-binary-x':'retained-text-x',bounds:payload.bounds,vertices:payload.vertexCount,triangles:payload.triangleCount,meshCount:payload.meshes.length,materialGroups:payload.materialGroupCount});
}
const docRecord=audit.references.objectLibraryCopyHashes.find(record=>!path.isAbsolute(record.path));assert.ok(docRecord);
const docBytes=await fs.readFile(path.join(archive,docRecord.path));assert.equal(hash(docBytes),docRecord.sha256.toLowerCase());
await json('public/assets/ports/archive-dominus.json',{
 schema:'graphysx.archive-dominus/v1',source:{archiveRevision:'f4cf357bc98cfad689d7a40a07fdd2dd0dc15d25',root:rootSource,document:docRecord.path,documentSha256:hash(docBytes)},
 models,textures,portPlacements:audit.objectLibraryExclusion.portPlacements,
 evidence:{sourceRecords:61,portPlacements:28,recoveredModels:65,previouslyUnsupported:models.filter(m=>m.recovery==='decoded-binary-x').map(m=>m.id),
  faithful:['Les 65 modèles d’origine, dont deux modèles DirectX binaires nouvellement décodés.','Les 28 placements du catalogue ObjectLibrary conservent leurs positions, rotations et tailles.'],
  adapted:['L’éclairage, le fond et la caméra de visite sont actuels.','La galerie complète est une disposition d’inspection actuelle.'],
  unestablished:['Les sources attestent d’un projet d’environnement en cours. Elles n’établissent pas un village terminé ni un jeu Dominus.']}
});
const runtimeAssets=[['Media/Airplane.glb','media/Airplane.glb'],['textures/twoway.jpg','textures/twoway.jpg'],['textures/earth/earth_uv_with_topo.jpg','textures/earth/earth_uv_with_topo.jpg'],
 ...['bk','dn','ft','lf','rt','up'].map(face=>['textures/sky/asteroids/asteroids_'+face+'.jpg','textures/sky/asteroids/asteroids_'+face+'.jpg'])];
const assets=[];for(const [source,relative] of runtimeAssets){const bytes=await fs.readFile(path.join(playground,source)),url='/assets/threejs-playground/'+relative;assert.deepEqual(await read('public'+url),bytes,url);assets.push({source,url,bytes:bytes.length,sha256:hash(bytes)});}
const sourceFiles=['index.html','main.js','GraphysX/sceneManager.js','GraphysX/generalLights.js','GraphysX/graphysx.js','scene/world.js','scene/airplane.js','scene/earth.js','scene/morphSphere.js','scene/planeZ.js','scene/testCube.js','scene/testLine.js'];
const source=[];for(const file of sourceFiles){const bytes=await fs.readFile(path.join(playground,file));source.push({path:file,bytes:bytes.length,sha256:hash(bytes)});}
const glb=await fs.readFile(path.join(playground,'Media/Airplane.glb')),gltf=JSON.parse(glb.subarray(20,20+glb.readUInt32LE(12)).toString());
assert.equal(gltf.nodes.length,1);assert.equal(gltf.meshes.length,1);assert.equal(gltf.meshes[0].primitives.length,1);assert.equal(gltf.nodes[0].matrix,undefined);
const accessor=gltf.accessors[gltf.meshes[0].primitives[0].attributes.POSITION];
await json('public/assets/ports/archive-playground.json',{
 schema:'graphysx.archive-playground/v1',source:{project:'SBQC/public/Projects/3D Playground',files:source},assets,
 airplaneBounds:{min:accessor.min,max:accessor.max,size:accessor.max.map((n,i)=>n-accessor.min[i])},
 evidence:{faithful:['Neuf fichiers d’origine conservés à l’octet près.','Le cube, l’avion et sa trajectoire, les trois planètes, les trois sphères déformées, la ligne bleue et le plan procédural.','Les équations des sphères et les noms, valeurs initiales et limites des 16 réglages.'],
  adapted:['Le terrain aléatoire utilise une graine fixe et est présenté à l’horizontale. La caméra de visite remplace le point de vue d’origine non cadré.','Les animations utilisent la même horloge que le Studio, avec un équivalent source à 60 images par seconde.','L’éclairage utilise les lumières du moteur actuel.','Les rotations X des planètes sont une option explicite : leur calcul était commenté dans la source.'],
  unestablished:['L’objet SceneSubject était commenté dans la composition d’origine ; il n’est pas ajouté à cette reprise.']}
});
console.log(JSON.stringify({check,models:models.length,binaryModels:models.filter(m=>m.recovery==='decoded-binary-x').map(m=>({id:m.id,vertices:m.vertices,triangles:m.triangles})),portPlacements:28,playgroundAssets:assets.length,sourceFiles:source.length}));
