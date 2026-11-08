import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Group, Triangle, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { importBrowserModule } from './support/import-browser-module.mjs';
const { ControllerHandModel,controllerThumbTargets,readControllerHandInput }=await importBrowserModule(new URL('../src/xr/controller-hand.ts',import.meta.url));
const pad=()=>({buttons:Array.from({length:8},()=>({value:0,touched:false,pressed:false})),axes:[0,0,0,0]});
const targets=side=>({stick:new Vector3(side==='right'?.01:-.01,.008,-.027),primary:new Vector3(side==='right'?-.005:.005,.012,-.015),secondary:new Vector3(side==='right'?-.012:.012,.004,-.024),rest:new Vector3(side==='right'?-.022:.022,.012,-.003)});
async function handObject(side){
 const bytes=await readFile(new URL(`../public/assets/xr/profiles/generic-hand/${side}.glb`,import.meta.url));
 const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 return gltf.scene.children[0];
}
const model=async side=>new ControllerHandModel(await handObject(side),side,targets(side));
const settle=(model,pad,seconds=.8)=>{for(let i=0;i<Math.ceil(seconds*90);i++)model.update(pad,1/90);};
const point=(model,name)=>model.joints.get(name).bone.position.clone();

async function controllerGeometry(side){
 const bytes=await readFile(new URL(`../public/assets/xr/profiles/oculus-touch-v3/${side}.glb`,import.meta.url));
 const jsonLength=bytes.readUInt32LE(12),gltf=JSON.parse(bytes.subarray(20,20+jsonLength).toString());
 // Geometry/poses are unchanged. Drop textures so this Node geometry check needs no DOM.
 gltf.materials=[{pbrMetallicRoughness:{baseColorFactor:[1,1,1,1]}}];delete gltf.images;delete gltf.textures;delete gltf.samplers;
 const json=Buffer.from(JSON.stringify(gltf)),padded=Math.ceil(json.length/4)*4,bin=bytes.subarray(28+jsonLength);
 const packed=Buffer.alloc(28+padded+bin.length);packed.writeUInt32LE(0x46546c67,0);packed.writeUInt32LE(2,4);packed.writeUInt32LE(packed.length,8);
 packed.writeUInt32LE(padded,12);packed.writeUInt32LE(0x4e4f534a,16);packed.fill(0x20,20,20+padded);json.copy(packed,20);
 packed.writeUInt32LE(bin.length,20+padded);packed.writeUInt32LE(0x004e4942,24+padded);bin.copy(packed,28+padded);
 return (await new GLTFLoader().parseAsync(packed.buffer.slice(packed.byteOffset,packed.byteOffset+packed.byteLength),'')).scene;
}

test('Quest 2 inputs distinguish capacitive contact, press, grip and thumb targets without mutations',()=>{
 const gamepad=pad(),before=structuredClone(gamepad);
 assert.deepEqual(readControllerHandInput(gamepad),{trigger:0,grip:0,indexTouch:false,thumb:'raised',x:0,y:0,thumbPress:0});
 assert.deepEqual(gamepad,before);
 gamepad.buttons[0].touched=true;assert.equal(readControllerHandInput(gamepad).indexTouch,true);
 gamepad.buttons[0].value=.4;gamepad.buttons[1].value=.8;assert.equal(readControllerHandInput(gamepad).trigger,.4);assert.equal(readControllerHandInput(gamepad).grip,.8);
 for(const [index,thumb] of [[3,'stick'],[4,'primary'],[5,'secondary'],[6,'rest']]){
  const sample=pad();sample.buttons[index].touched=true;assert.equal(readControllerHandInput(sample).thumb,thumb);
  sample.buttons[index]={pressed:true,touched:false,value:1};assert.equal(readControllerHandInput(sample).thumb,thumb);
 }
 const sample=pad();sample.axes[2]=.5;assert.equal(readControllerHandInput(sample).thumb,'stick');
 sample.buttons[0].value=NaN;sample.axes[3]=Infinity;assert.equal(readControllerHandInput(sample).trigger,0);assert.equal(readControllerHandInput(sample).y,0);
});

for(const side of ['left','right'])test(`${side} real hand rig wraps the grip and moves index, grasp and thumb independently`,async()=>{
 const avatar=await model(side),gamepad=pad();
 assert.equal(avatar.object.userData.poseSource,'controller-gamepad');
 assert.equal(avatar.joints.size,25);
 const wrist=point(avatar,'wrist'),index=point(avatar,'index-finger-tip'),middle=point(avatar,'middle-finger-tip');
 assert.ok(wrist.x*(side==='right'?1:-1)>0);
 gamepad.buttons[0].touched=true;settle(avatar,gamepad);
 const touching=point(avatar,'index-finger-tip');assert.ok(touching.distanceTo(index)>.008);
 assert.ok(point(avatar,'middle-finger-tip').distanceTo(middle)<1e-8);
 gamepad.buttons[0].value=1;settle(avatar,gamepad);
 assert.ok(point(avatar,'index-finger-tip').distanceTo(touching)>.008);
 const indexPressed=point(avatar,'index-finger-tip');gamepad.buttons[1].value=1;settle(avatar,gamepad);
 assert.ok(point(avatar,'middle-finger-tip').distanceTo(middle)>.01);
 assert.ok(point(avatar,'index-finger-tip').distanceTo(indexPressed)<1e-7);
 for(const [button,target] of [[3,'stick'],[4,'primary'],[5,'secondary'],[6,'rest']]){
  gamepad.buttons.forEach((state,i)=>{if(i>=3)state.touched=false;});gamepad.buttons[button].touched=true;settle(avatar,gamepad);
  assert.equal(avatar.object.userData.thumbTarget,target);
  assert.ok(point(avatar,'thumb-tip').distanceTo(targets(side)[target])<.012,`${side} ${target}: reachable thumb contact`);
  const thumb=['thumb-metacarpal','thumb-phalanx-proximal','thumb-phalanx-distal','thumb-tip'];
  for(let i=1;i<thumb.length;i++){
   const a=avatar.joints.get(thumb[i-1]),b=avatar.joints.get(thumb[i]);
   const original=new Vector3().setFromMatrixPosition(a.bind).distanceTo(new Vector3().setFromMatrixPosition(b.bind));
   assert.ok(Math.abs(a.bone.position.distanceTo(b.bone.position)-original)<1e-7,`${side} ${target}: thumb length preserved`);
  }
  for(const finger of ['index','middle','ring','pinky']){
   const names=['metacarpal','phalanx-proximal','phalanx-intermediate','phalanx-distal','tip'].map(part=>`${finger}-finger-${part}`);
   for(let i=1;i<names.length;i++){
    const a=avatar.joints.get(names[i-1]),b=avatar.joints.get(names[i]);
    const original=new Vector3().setFromMatrixPosition(a.bind).distanceTo(new Vector3().setFromMatrixPosition(b.bind));
    assert.ok(Math.abs(a.bone.position.distanceTo(b.bone.position)-original)<1e-7,`${side} ${names[i]} preserves segment length`);
   }
  }
 }
 assert.deepEqual(point(avatar,'wrist').toArray(),wrist.toArray());
});

test('pose blending follows elapsed time and recovers from missing optional button data',async()=>{
 const a=await model('right'),b=await model('right'),gamepad=pad();gamepad.buttons[0].value=1;gamepad.buttons[1].value=1;
 for(let i=0;i<36;i++)a.update(gamepad,1/72);
 for(let i=0;i<60;i++)b.update(gamepad,1/120);
 assert.ok(point(a,'index-finger-tip').distanceTo(point(b,'index-finger-tip'))<1e-8);
 assert.ok(point(a,'middle-finger-tip').distanceTo(point(b,'middle-finger-tip'))<1e-8);
 assert.doesNotThrow(()=>a.update({buttons:[],axes:[]},NaN));
 for(const joint of a.joints.values())assert.ok([...joint.bone.position.toArray(),...joint.bone.quaternion.toArray()].every(Number.isFinite));
});

for(const side of ['left','right'])test(`${side} authored grip keeps grasping fingertips near the real Touch handle`,async()=>{
 const grip=new Group(),controller=await controllerGeometry(side);grip.add(controller);grip.updateMatrixWorld(true);
 const realAvatar=new ControllerHandModel(await handObject(side),side,controllerThumbTargets(controller,grip,side));
 const body=controller.getObjectByName('controller'),geometry=body.geometry,positions=geometry.attributes.position,indices=geometry.index;
 const triangles=[];
 for(let i=0;i<indices.count;i+=3)triangles.push(new Triangle(...[0,1,2].map(offset=>
  new Vector3().fromBufferAttribute(positions,indices.getX(i+offset)).applyMatrix4(body.matrixWorld))));
 const nearest=new Vector3();
 for(const pressure of [0,1]){
  const gamepad=pad();gamepad.buttons[0].touched=true;gamepad.buttons[0].value=pressure;gamepad.buttons[1].value=pressure;
  settle(realAvatar,gamepad);
  for(const finger of ['middle','ring','pinky']){
   const tip=point(realAvatar,`${finger}-finger-tip`);let distance=Infinity;
   for(const triangle of triangles){triangle.closestPointToPoint(tip,nearest);distance=Math.min(distance,tip.distanceTo(nearest));}
   assert.ok(distance<.018,`${side} ${finger} pressure ${pressure}: ${Math.round(distance*1000)} mm from handle`);
  }
 }
});
