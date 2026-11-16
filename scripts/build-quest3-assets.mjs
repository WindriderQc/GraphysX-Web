// Original, deterministic assets. CPU-only bake: direct lights + sampled ambient occlusion.
// No Blender, GPU, hosted generation, or homelab service is required.
import { mkdir, readFile, writeFile, copyFile, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { BoxGeometry, SphereGeometry, Group, Mesh, MeshStandardMaterial, MeshBasicMaterial, Vector3, Float32BufferAttribute, Box3 } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'public/assets/quest3');
const tools = path.join(root, 'output/quest3/tools');
await mkdir(out, { recursive: true }); await mkdir(tools, { recursive: true });
globalThis.FileReader = class {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then(value => { this.result=value; this.onloadend?.(); }); }
  readAsDataURL(blob) { blob.arrayBuffer().then(value => { this.result=`data:${blob.type};base64,${Buffer.from(value).toString('base64')}`; this.onloadend?.(); }); }
};
// Pin the optional offline encoder. Runtime assets need only Three's bundled transcoder.
const expectedEncoderHashes = { 'basis_encoder.js': 'd225ce1e7012609bcfbe338351c8778d95eb1c19d404314d513b2b2df94a6ffb', 'basis_encoder.wasm': '48d4e39ccaa1e290a17d00c13b353a728227bb439108d5e6c944fe6ab80552db' };
const encoderHashes = {};
for (const name of ['basis_encoder.js', 'basis_encoder.wasm']) {
  const target=path.join(tools,name);
  let bytes;
  try { bytes=await readFile(target); } catch {
    const response=await fetch(`https://raw.githubusercontent.com/BinomialLLC/basis_universal/v2_50/webgl/encoder/build/${name}`);
    if(!response.ok)throw Error(`Encoder download ${response.status}`);
    bytes=Buffer.from(await response.arrayBuffer()); await writeFile(target,bytes);
  }
  encoderHashes[name]=createHash('sha256').update(bytes).digest('hex');
  if(encoderHashes[name]!==expectedEncoderHashes[name])throw Error(`Pinned encoder hash mismatch: ${name}`);
}
await copyFile(path.join(tools,'basis_encoder.js'),path.join(tools,'basis_encoder.cjs'));
const basis=await createRequire(import.meta.url)(path.join(tools,'basis_encoder.cjs'))({wasmBinary:await readFile(path.join(tools,'basis_encoder.wasm'))});
basis.initializeBasis();
async function ktx(name,pixels,width,height) {
  const encoder=new basis.BasisEncoder();
  try {
    encoder.setCreateKTX2File(true); encoder.setUASTC(false); encoder.setQualityLevel(160);
    encoder.setPerceptual(true); encoder.setKTX2AndBasisSRGBTransferFunc(true); encoder.setMipGen(true); encoder.setMipSRGB(true);
    encoder.setSliceSourceImage(0,pixels,width,height,false);
    const buffer=new Uint8Array(width*height*8+65536); const count=encoder.encode(buffer);
    if(!count)throw Error(`Could not encode ${name}`);
    await writeFile(path.join(out,name),buffer.subarray(0,count));
  } finally { encoder.delete(); }
}
const mat=(name,color,metalness=.4,roughness=.55)=>{const m=new MeshStandardMaterial({color,metalness,roughness});m.name=name;return m;};
const graphite=mat('Ceramic graphite','#243647',.3,.65), alloy=mat('Brushed titanium','#8eaaa9',.7,.34), ivory=mat('Warm ceramic','#b6bcae',.25,.65);
const amber=mat('Amber enamel','#d18b39',.45,.4), dark=mat('Inset graphite','#10212e',.3,.7);
const source=new Group(); const blockers=[];
function box(parent, name, size, position, material, occluder=false) {
  const mesh=new Mesh(new BoxGeometry(...size),material);mesh.name=name;mesh.position.set(...position);parent.add(mesh);
  if(occluder)blockers.push({min:position.map((p,i)=>p-size[i]/2),max:position.map((p,i)=>p+size[i]/2)});
  return mesh;
}
box(source,'Deck',[14,.3,28],[0,-.15,-10],graphite);
box(source,'Port sill',[.5,.65,28],[-6.8,.325,-10],ivory,true);
box(source,'Starboard sill',[.5,.65,28],[6.8,.325,-10],ivory,true);
box(source,'Arrival bulkhead',[14,6,.4],[0,3,3.9],graphite,true);
box(source,'Observation sill',[14,.6,.4],[0,.3,-23.9],alloy,true);
box(source,'Reactor pedestal',[3.6,.55,3.6],[0,.275,-11],alloy,true);
for(const x of [-1.2,1.2])for(const z of [-12.2,-9.8])box(source,'Reactor containment strut',[.12,4.6,.12],[x,2.85,z],dark,true);
for(const y of [.65,5.1])for(const side of [-1,1]){
  box(source,'Containment crossbar',[2.6,.16,.16],[0,y,-11+side*1.2],alloy,true);
  box(source,'Containment side rail',[.16,.16,2.6],[side*1.2,y,-11],alloy,true);
}
for(const side of [-1,1]) {
  box(source,'Gallery ledge',[1.15,.16,20],[side*5.65,.95,-11],ivory,true);
  for(const z of [-3,-7,-15,-19])box(source,'Equipment bay',[.65,1.4,1.2],[side*6.15,.7,z],dark,true);
}
box(source,'Observation dais',[8,.14,3],[0,.07,-21],ivory);

// Atlas each triangle independently with a texel gutter. UV1 survives glTF export.
const meshes=[];source.updateWorldMatrix(true,true);source.traverse(o=>{if(o.isMesh)meshes.push(o);});
let triangles=0;for(const mesh of meshes){mesh.geometry=mesh.geometry.toNonIndexed();mesh.geometry.applyMatrix4(mesh.matrixWorld);triangles+=mesh.geometry.attributes.position.count/3;mesh.position.set(0,0,0);mesh.quaternion.identity();mesh.scale.set(1,1,1);}
const resolution=512, grid=Math.ceil(Math.sqrt(triangles)), cell=Math.floor(resolution/grid), atlas=new Uint8Array(resolution*resolution*4);
atlas.fill(255);
const lights=[];for(const z of [-2,-8,-14,-21])for(const x of [-4.8,4.8])lights.push({p:[x,3.8,z],c:x<0?[.22,.72,1]:[1,.57,.21],power:3.4});
lights.push({p:[0,2.8,-11],c:[.2,.9,1],power:4});
function blocked(p,d,limit) {
  for(const b of blockers){let near=0,far=limit;for(let a=0;a<3;a++){if(Math.abs(d[a])<1e-8){if(p[a]<b.min[a]||p[a]>b.max[a]){far=-1;break;}continue;}
    let lo=(b.min[a]-p[a])/d[a],hi=(b.max[a]-p[a])/d[a];if(lo>hi)[lo,hi]=[hi,lo];near=Math.max(near,lo);far=Math.min(far,hi);if(far<near)break;}
    if(far>=near&&far>.015&&near<limit)return true;}
  return false;
}
const srgb=v=>Math.round(255*(v<=.0031308?12.92*v:1.055*Math.pow(Math.min(1,v),1/2.4)-.055));
let chart=0;
for(const mesh of meshes) {
  const p=mesh.geometry.attributes.position,n=mesh.geometry.attributes.normal,uv=[];
  if(mesh.material===graphite){const surfaceUv=mesh.geometry.attributes.uv;for(let i=0;i<p.count;i++){
    const a=Math.abs(n.getY(i))>.5?p.getX(i):Math.abs(n.getX(i))>.5?p.getZ(i):p.getX(i);
    const b=Math.abs(n.getY(i))>.5?p.getZ(i):p.getY(i);surfaceUv.setXY(i,a*.4,b*.4);
  }}
  for(let i=0;i<p.count;i+=3,chart++) {
    const ox=(chart%grid)*cell,oy=Math.floor(chart/grid)*cell;
    const a=[p.getX(i),p.getY(i),p.getZ(i)],b=[p.getX(i+1),p.getY(i+1),p.getZ(i+1)],c=[p.getX(i+2),p.getY(i+2),p.getZ(i+2)];
    const normal=[n.getX(i),n.getY(i),n.getZ(i)];
    uv.push((ox+2)/resolution,(oy+2)/resolution,(ox+cell-2)/resolution,(oy+2)/resolution,(ox+2)/resolution,(oy+cell-2)/resolution);
    for(let y=0;y<cell;y++)for(let x=0;x<cell;x++) {
      let u=Math.max(0,Math.min(1,(x-2)/(cell-4))),v=Math.max(0,Math.min(1,(y-2)/(cell-4)));if(u+v>1){const sum=u+v;u/=sum;v/=sum;}
      const point=a.map((value,k)=>value+(b[k]-value)*u+(c[k]-value)*v+normal[k]*.02);
      // A coarse cosine-weighted hemisphere estimates ambient occlusion against real boxes.
      let occlusion=0;for(const direction of [[.65,.7,0],[-.65,.7,0],[0,.7,.65],[0,.7,-.65]]) {
        if(direction.reduce((sum,value,k)=>sum+value*normal[k],0)>0&&blocked(point,direction,2.5))occlusion++;
      }
      const rgb=[.2,.24,.29].map(value=>value*(1-occlusion*.14));
      for(const light of lights){const d=light.p.map((value,k)=>value-point[k]);const distance=Math.hypot(...d);const direction=d.map(value=>value/distance);
        const cosine=Math.max(0,normal.reduce((sum,value,k)=>sum+value*direction[k],0));
        if(cosine===0||blocked(point,direction,distance-.03))continue;
        const energy=cosine*light.power/(1+distance*distance*.2);rgb.forEach((value,k)=>{rgb[k]=value+energy*light.c[k];});
      }
      const index=((oy+y)*resolution+ox+x)*4;for(let k=0;k<3;k++)atlas[index+k]=srgb(rgb[k]);atlas[index+3]=255;
    }
  }
  mesh.geometry.setAttribute('uv1',new Float32BufferAttribute(uv,2));
}
await ktx('station-light.ktx2',atlas,resolution,resolution);
function mergeByMaterial(group) {
  const result=new Group(),families=new Map();group.updateWorldMatrix(true,true);
  group.traverse(mesh=>{if(!mesh.isMesh)return;const geometry=mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);const list=families.get(mesh.material)||[];list.push(geometry);families.set(mesh.material,list);});
  for(const [material,geometries] of families){const mesh=new Mesh(mergeGeometries(geometries,false),material);mesh.name=material.name;result.add(mesh);}
  return result;
}
const exporter=new GLTFExporter();
async function glb(name,group,texture=false) {
  const bytes=Buffer.from(await exporter.parseAsync(group,{binary:true}));
  let final=bytes;
  if(texture){
    const jsonLength=bytes.readUInt32LE(12),json=JSON.parse(bytes.subarray(20,20+jsonLength).toString());
    json.extensionsUsed=[...(json.extensionsUsed||[]),'KHR_texture_basisu'];json.extensionsRequired=['KHR_texture_basisu'];
    json.images=[{uri:typeof texture==='string'?texture:'panels.ktx2'}];json.textures=[{extensions:{KHR_texture_basisu:{source:0}}}];
    const material=typeof texture==='object'?json.materials.find(m=>m.name===texture.material):json.materials[0];
    if(typeof texture==='object')json.images[0].uri=texture.url;
    material.pbrMetallicRoughness.baseColorTexture={index:0};
    const text=Buffer.from(JSON.stringify(json));const padded=Buffer.alloc(Math.ceil(text.length/4)*4,32);text.copy(padded);
    const rest=bytes.subarray(20+jsonLength),header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(20+padded.length+rest.length,8);header.writeUInt32LE(padded.length,12);header.writeUInt32LE(0x4e4f534a,16);
    final=Buffer.concat([header,padded,rest]);
  }
  await writeFile(path.join(out,name),final);
  return {url:`/assets/quest3/${name}`,bytes:final.length};
}
const deckSize=256,deckPixels=new Uint8Array(deckSize*deckSize*4);
for(let y=0;y<deckSize;y++)for(let x=0;x<deckSize;x++){
  const border=x<3||y<3||x>252||y>252;const bolt=Math.hypot(x-12,y-12)<2||Math.hypot(x-244,y-244)<2;
  const scratch=(Math.imul(x+113,y+37)>>>0)%19;let value=border?44:bolt?75:214+scratch;
  const stripe=x>218&&x<224&&y>30&&y<110;const rgb=stripe?[242,169,66]:[value,value+2,value+4];
  deckPixels.set([...rgb,255],(y*deckSize+x)*4);
}
await ktx('deck.ktx2',deckPixels,deckSize,deckSize);
const station=await glb('station.glb',mergeByMaterial(source),{material:'Ceramic graphite',url:'deck.ktx2'});
const details=new Group();box(details,'Survey equipment',[.65,.6,.8],[0,0,0],alloy);box(details,'Recess',[.54,.28,.04],[0,.05,.42],dark);
for(const x of [-.31,.31])for(const z of [-.38,.38])box(details,'Corner armour',[.08,.72,.08],[x,0,z],amber);
const low=new Group();box(low,'Equipment silhouette',[.65,.6,.8],[0,0,0],alloy);
await glb('equipment.glb',mergeByMaterial(details),true);await glb('equipment-low.glb',low,true);
const rib=new Group();box(rib,'Port upright',[.2,4.4,.26],[-6.55,2.2,0],alloy);box(rib,'Starboard upright',[.2,4.4,.26],[6.55,2.2,0],alloy);
for(const side of [-1,1])box(rib,'Angled haunch',[2.1,.22,.26],[side*5.85,5.05,0],alloy).rotation.z=-side*Math.PI/4;
box(rib,'Overhead spine',[10.5,.22,.26],[0,5.8,0],alloy);await glb('rib.glb',mergeByMaterial(rib));
const trim=new Group();const luminous=new MeshBasicMaterial({color:'#67dce4'});luminous.name='Cyan luminous inlay';box(trim,'Inlay',[.035,.018,1.4],[0,0,0],luminous);await glb('inlay.glb',trim);
const star=new Group();star.add(new Mesh(new SphereGeometry(.5,4,3),new MeshBasicMaterial({color:'#c3d9eb'})));await glb('star.glb',star);
// Reuse the observatory's actual Earth imagery. Bake its fixed sun, clouds and
// night lights into one compressed unlit map, keeping the mobile draw cost flat.
const planetWidth=2048,planetHeight=1024,planetPixels=new Uint8Array(planetWidth*planetHeight*4);
const earthInputs={day:'earth-day.jpg',night:'earth-night.jpg',clouds:'earth-clouds.png'};
const earthSources={},earthPixels={};
for(const [layer,name] of Object.entries(earthInputs)){
  const relative='public/assets/sbqc/orbital/'+name,bytes=await readFile(path.join(root,relative));
  const image=await loadImage(bytes),canvas=createCanvas(planetWidth,planetHeight),context=canvas.getContext('2d');
  context.drawImage(image,0,0,planetWidth,planetHeight);
  earthPixels[layer]=context.getImageData(0,0,planetWidth,planetHeight).data;
  earthSources[layer]={path:relative,sha256:createHash('sha256').update(bytes).digest('hex'),width:image.width,height:image.height};
}
const linear=Float64Array.from({length:256},(_,i)=>i/255<=.04045?i/255/12.92:((i/255+.055)/1.055)**2.4);
const sun=new Vector3(-.8,.38,.55).normalize(),view=new Vector3(-.015,-.11,1).normalize(),limbColor=[.12,.42,1];
for(let row=0;row<planetHeight;row++)for(let col=0;col<planetWidth;col++){
  const latitude=(1-row/(planetHeight-1))*Math.PI,longitude=col/(planetWidth-1)*Math.PI*2;
  const x=-Math.cos(longitude)*Math.sin(latitude),y=Math.cos(latitude),z=Math.sin(longitude)*Math.sin(latitude);
  // KTX2 uploads without flipY: its first row must be south, unlike the input images.
  const sample=((planetHeight-1-row)*planetWidth+col)*4,index=(row*planetWidth+col)*4;
  const incidence=x*sun.x+y*sun.y+z*sun.z,daylight=.018+.982*Math.max(0,incidence)**.72;
  const t=Math.max(0,Math.min(1,(incidence+.12)/.32)),night=1-t*t*(3-2*t);
  const cloud=earthPixels.clouds[sample+3]/255*.88;
  const facing=x*view.x+y*view.y+z*view.z;
  const limb=facing>0?(1-facing)**4*(.035+.13*Math.sqrt(Math.max(0,incidence))):0;
  for(let k=0;k<3;k++){
    const surface=linear[earthPixels.day[sample+k]]*daylight;
    const city=linear[earthPixels.night[sample+k]]*night*.9;
    const litCloud=linear[earthPixels.clouds[sample+k]]*daylight;
    const color=(surface+city)*(1-cloud)+litCloud*cloud+limb*limbColor[k];
    planetPixels[index+k]=Math.max(0,Math.min(255,srgb(color)));
  }
  planetPixels[index+3]=255;
}
await ktx('planet.ktx2',planetPixels,planetWidth,planetHeight);
const planet=new Group(),earthMaterial=new MeshBasicMaterial({color:'#ffffff'});earthMaterial.name='Observatory Earth';
const earth=new Mesh(new SphereGeometry(1,96,64),earthMaterial);earth.name='EarthDayNightClouds';planet.add(earth);
await glb('planet.glb',planet,'planet.ktx2');
const panelSize=128,pixels=new Uint8Array(panelSize*panelSize*4);
for(let y=0;y<panelSize;y++)for(let x=0;x<panelSize;x++){const edge=x%32<2||y%32<2;const mark=y>80&&y<86&&x>12&&x<110;const offset=(y*panelSize+x)*4;
  pixels.set(edge?[38,54,65,255]:mark?[232,176,86,255]:[175+(x%7),190+(y%5),188,255],offset);}
await ktx('panels.ktx2',pixels,panelSize,panelSize);
const bounds=new Box3().setFromObject(source);const size=bounds.getSize(new Vector3()),centre=bounds.getCenter(new Vector3());
const manifest={generator:'scripts/build-quest3-assets.mjs',encoder:'BinomialLLC/basis_universal v2_50',encoderHashes,
  bake:{method:'CPU direct lighting with AABB shadows and sampled ambient occlusion; no global illumination claim',resolution,triangles,lights},
  planet:{method:'Existing orbital Earth imagery with baked fixed sun, cloud coverage, night lights and limb tint',width:planetWidth,height:planetHeight,sun:sun.toArray(),sources:earthSources},
  station:{...station,fitSize:Math.max(size.x,size.y,size.z),centre:centre.toArray()},provenance:'Original GraphysX station artwork; Earth reuses the existing sbqc/orbital imagery recorded in planet.sources'};
await writeFile(path.join(out,'build.json'),JSON.stringify(manifest,null,2)+'\n');
await writeFile(path.join(out,'LICENSE.txt'),'Station artwork created for GraphysX by scripts/build-quest3-assets.mjs. Copyright 2026 Yanik; ownership retained by the repository owner. Earth imagery reuses the existing GraphysX sbqc/orbital assets; original source paths and hashes are recorded in build.json. No new external artwork was downloaded.\n');
const codec=path.join(root,'public/assets/codecs/basis');await mkdir(codec,{recursive:true});
for(const name of ['basis_transcoder.js','basis_transcoder.wasm'])await copyFile(path.join(root,'node_modules/three/examples/jsm/libs/basis',name),path.join(codec,name));
const licenseResponse=await fetch('https://raw.githubusercontent.com/BinomialLLC/basis_universal/v2_50/LICENSE');
if(!licenseResponse.ok)throw Error('Could not retrieve Basis license');
await writeFile(path.join(codec,'LICENSE.txt'),`Basis Universal, Apache-2.0:\n${await licenseResponse.text()}\n\nThree.js distribution notice:\n${await readFile(path.join(root,'node_modules/three/LICENSE'),'utf8')}`);
console.log(JSON.stringify({station:manifest.station,bake:{resolution,triangles},files:(await readdir(out)).length}));
