import test from 'node:test';
import assert from 'node:assert/strict';
import { BoxGeometry, Group, Matrix4, Mesh, Texture, Vector3 } from 'three';
import { readFile } from 'node:fs/promises';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { importBrowserModule } from './support/import-browser-module.mjs';
import { observeGiantXrSelect } from '../src/ballsy-giant-xr.ts';
const { VrInputRig } = await importBrowserModule(new URL('../src/xr/vr-input.ts',import.meta.url));

function fixture(t) {
  const spaces = Array.from({ length: 2 }, () => {
    const ray = new Group(), grip = new Group(), hand = new Group();
    hand.joints = {};
    const names = ['wrist', 'thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip'];
    for (const finger of ['index', 'middle', 'ring', 'pinky']) {
      for (const part of ['metacarpal', 'phalanx-proximal', 'phalanx-intermediate', 'phalanx-distal', 'tip']) {
        names.push(`${finger}-finger-${part}`);
      }
    }
    for (const name of names) {
      const joint = new Group(); hand.joints[name] = joint; hand.add(joint);
    }
    return { ray, grip, hand };
  });
  const events = [];
  const renderer = { xr: {
    getController: i => spaces[i].ray,
    getControllerGrip: i => spaces[i].grip,
    getHand: i => spaces[i].hand,
  } };
  const rig = new VrInputRig(renderer, event => events.push(event));
  t.after(() => rig.dispose());
  const emit = (index, type, data) => spaces[index].ray.dispatchEvent({ type, data });
  const connect = (index, handedness, hand = false) => {
    // Missing xr-standard mapping intentionally exercises the immediate no-fetch fallback.
    const source = { handedness, targetRayMode: 'tracked-pointer', profiles: [],
      ...(hand ? { hand: new Map() } : {}) };
    emit(index, 'connected', source); return source;
  };
  return { rig, events, spaces, emit, connect };
}

test('slots use source handedness, not index, with a controller-only fallback', t => {
  const f = fixture(t); f.rig.setActive(true);
  const right = f.connect(0, 'right'), left = f.connect(1, 'left');
  f.rig.update();
  for (const slot of f.rig.slots) {
    assert.equal(slot.fallback.visible, true); assert.equal(slot.modelReady, false);
    assert.equal(slot.beam.visible, true);
  }
  f.emit(0, 'selectstart'); f.emit(1, 'squeezestart');
  assert.deepEqual(f.events.map(e => [e.handedness, e.action, e.phase]),
    [['right', 'select', 'start'], ['left', 'grab', 'start']]);
  assert.equal(f.events[0].source, right); assert.equal(f.events[1].source, left);
});

test('controller select and squeeze begin/end are independent and deduplicated', t => {
  const f = fixture(t); f.connect(0, 'none');
  f.emit(0, 'selectstart'); assert.equal(f.events.length, 0);
  f.rig.setActive(true);
  for (const name of ['selectstart', 'selectstart', 'squeezestart', 'squeezestart',
    'selectend', 'selectend', 'squeezeend', 'squeezeend']) f.emit(0, name);
  assert.deepEqual(f.events.map(e => [e.action, e.phase, e.cancelled]), [
    ['select', 'start', false], ['grab', 'start', false],
    ['select', 'end', false], ['grab', 'end', false],
  ]);
});

test('native release remains observable after tool cancellation without another gameplay end', t => {
  const f = fixture(t); f.rig.setActive(true); f.connect(0, 'right');
  const session = new EventTarget(), native = [];
  const detach = observeGiantXrSelect(session, phase => native.push(phase));
  t.after(detach);
  const emit = type => { session.dispatchEvent(new Event(type)); f.emit(0, type); };
  emit('selectstart'); f.rig.cancel(); f.rig.cancel();
  assert.deepEqual(native, ['start'], 'cancellation is not a native release');
  assert.deepEqual(f.events.map(event => [event.phase, event.cancelled]), [['start', false], ['end', true]]);
  emit('selectend');
  assert.deepEqual(native, ['start', 'end']);
  assert.equal(f.events.length, 2, 'physical release cannot cause a second end or launch after cancellation');
  emit('selectstart'); emit('selectend');
  assert.deepEqual(native, ['start', 'end', 'start', 'end']);
  assert.deepEqual(f.events.slice(2).map(event => [event.phase, event.cancelled]), [['start', false], ['end', false]]);
  detach(); emit('selectstart'); emit('selectend');
  assert.equal(native.length, 4, 'cleanup does not retain the diagnostic observer');
});

test('profile fetch failure retains the procedural controller without external requests', async t => {
  const urls = [], warnings = [];
  t.mock.method(globalThis, 'fetch', async url => { urls.push(String(url)); throw Error('simulated offline'); });
  t.mock.method(console, 'warn', error => warnings.push(error));
  const f = fixture(t); f.rig.setActive(true);
  f.emit(0, 'connected', { handedness: 'right', targetRayMode: 'tracked-pointer',
    profiles: ['unknown-controller'], gamepad: { mapping: 'xr-standard', buttons: [], axes: [] } });
  await new Promise(resolve => setImmediate(resolve));
  f.rig.update(); f.emit(0, 'selectstart');
  assert.deepEqual(urls, ['/assets/xr/profiles/profilesList.json']);
  assert.equal(warnings.length, 1);
  assert.equal(f.rig.slots[0].modelReady, false);
  assert.equal(f.rig.slots[0].fallback.visible, true);
  assert.equal(f.rig.slots[0].beam.visible, true);
  assert.equal(f.events.length, 1);
});

test('hands use native pinch selection as grab and compute midpoint anchor', t => {
  const f = fixture(t); f.rig.setActive(true); f.connect(0, 'left', true);
  const { hand } = f.spaces[0];
  hand.joints['index-finger-tip'].position.set(2, 4, 6);
  hand.joints['thumb-tip'].position.set(4, 6, 8);
  f.rig.group.position.set(10, 0, 0); f.rig.group.updateMatrixWorld(true);
  f.rig.update(); f.emit(0, 'selectstart'); f.emit(0, 'squeezestart');
  assert.equal(f.rig.slots[0].fallback.visible, false);
  assert.equal(f.rig.slots[0].modelReady, true);
  assert.deepEqual(f.rig.slots[0].anchor.getWorldPosition(new Vector3()).toArray(), [13, 5, 7]);
  f.emit(0, 'selectend');
  assert.deepEqual(f.events.map(e => [e.action, e.phase]), [['grab', 'start'], ['grab', 'end']]);
});

test('disconnect and source replacement cancel held actions against the old source', t => {
  const f = fixture(t); f.rig.setActive(true); const old = f.connect(0, 'right');
  f.emit(0, 'selectstart'); f.emit(0, 'squeezestart');
  f.connect(0, 'left');
  assert.deepEqual(f.events.slice(2).map(e => [e.source === old, e.phase, e.cancelled]),
    [[true, 'end', true], [true, 'end', true]]);
  f.emit(0, 'selectstart'); f.emit(0, 'disconnected');
  assert.equal(f.events.at(-1).cancelled, true);
  assert.equal(f.rig.slots[0].source, null);
  assert.equal(f.rig.slots[0].beam.visible, false);
  assert.equal(f.rig.slots[0].fallback.visible, false);
  f.emit(0, 'selectend'); assert.equal(f.events.length, 6);
});

for (const loss of ['ray', 'grip', 'hand', 'index-finger-tip', 'thumb-tip']) {
  test(`${loss} pose loss cancels once and recovered pose never revives a hold`, t => {
    const f = fixture(t), isHand = !['ray', 'grip'].includes(loss);
    f.rig.setActive(true); f.connect(0, 'left', isHand); f.emit(0, 'selectstart');
    const target = f.spaces[0][loss] ?? f.spaces[0].hand.joints[loss];
    target.visible = false; f.rig.update(); f.rig.update();
    assert.equal(f.events.length, 2); assert.equal(f.events[1].cancelled, true);
    assert.equal(f.rig.slots[0].beam.visible, false);
    f.emit(0, 'selectstart'); assert.equal(f.events.length, 2);
    target.visible = true; f.rig.update(); f.emit(0, 'selectend');
    assert.equal(f.events.length, 2);
    f.emit(0, 'selectstart'); assert.equal(f.events.length, 3);
  });
}

test('visibility/session deactivation cancels and reactivation does not revive holds', t => {
  const f = fixture(t); f.rig.setActive(true); f.connect(0, 'right');
  f.emit(0, 'selectstart'); f.emit(0, 'squeezestart');
  f.rig.setActive(false); f.rig.setActive(false); f.rig.update();
  assert.equal(f.rig.group.visible, false);
  assert.equal(f.events.length, 4); assert.ok(f.events.slice(2).every(e => e.cancelled));
  f.emit(0, 'selectstart'); assert.equal(f.events.length, 4);
  f.rig.setActive(true); f.rig.update(); f.emit(0, 'selectend'); f.emit(0, 'squeezeend');
  assert.equal(f.events.length, 4);
  assert.equal(f.rig.slots[0].selecting, false); assert.equal(f.rig.slots[0].grabbing, false);
});

test('dispose cancels, releases owned graphics once, and detaches native listeners/spaces', t => {
  const f = fixture(t); const parent = new Group(); parent.add(f.rig.group);
  f.rig.setActive(true); f.connect(0, 'right'); f.emit(0, 'selectstart');
  const slot = f.rig.slots[0]; let geometryDisposals = 0, materialDisposals = 0, textureDisposals = 0;
  const texture = new Texture();texture.addEventListener('dispose',()=>textureDisposals++);
  slot.fallback.material.map = texture;slot.fallback.material.normalMap = texture;
  slot.fallback.geometry.addEventListener('dispose', () => geometryDisposals++);
  slot.fallback.material.addEventListener('dispose', () => materialDisposals++);
  f.rig.dispose(); f.rig.dispose();
  assert.equal(f.events.length, 2); assert.equal(f.events[1].cancelled, true);
  assert.equal(geometryDisposals, 1); assert.equal(materialDisposals, 1);
  assert.equal(textureDisposals, 1);
  assert.equal(f.rig.group.parent, null);
  for (const spaces of f.spaces) for (const space of Object.values(spaces)) assert.equal(space.parent, null);
  f.connect(0, 'left'); f.emit(0, 'selectstart'); f.rig.update();
  assert.equal(slot.source, null); assert.equal(f.events.length, 2);
});

test('native release arriving before the next frame is cancelled when pose is already lost', t => {
  const f = fixture(t); f.rig.setActive(true); f.connect(0, 'right');
  f.emit(0, 'squeezestart'); f.spaces[0].grip.visible = false; f.emit(0, 'squeezeend');
  assert.equal(f.events.at(-1).phase, 'end'); assert.equal(f.events.at(-1).cancelled, true);
  assert.equal(f.rig.slots[0].grabbing, false);
});

test('partial hand visibility compacts factory instances without stale or omitted joints', t => {
  const f = fixture(t); f.rig.setActive(true); f.connect(0, 'right', true);
  const hand=f.spaces[0].hand;
  const primitive=f.rig.slots[0].modelRoot.children[0].motionController;
  const matrix=new Matrix4();
  primitive.joints.forEach((name,index)=>hand.joints[name].position.set(index,index*.1,-.7));
  f.rig.group.updateMatrixWorld(true); assert.equal(primitive.handMesh.count,25);
  hand.joints.wrist.visible=false;hand.joints['middle-finger-metacarpal'].visible=false;
  f.rig.group.updateMatrixWorld(true);
  const visible=primitive.joints.filter(name=>hand.joints[name].visible);
  assert.equal(primitive.handMesh.count,23);
  visible.forEach((name,index)=>{
    primitive.handMesh.getMatrixAt(index,matrix);
    assert.equal(matrix.elements[12],hand.joints[name].position.x);
  });
  hand.joints.wrist.visible=true;hand.joints['middle-finger-metacarpal'].visible=true;
  f.rig.group.updateMatrixWorld(true); assert.equal(primitive.handMesh.count,25);
  let disposed=0;primitive.handMesh.addEventListener('dispose',()=>disposed++);
  f.rig.dispose();f.rig.dispose();assert.equal(disposed,1);
});

for(const side of ['left','right']){
 test(`${side} hand surface follows all native joints and falls back on incomplete tracking`,async t=>{
  const loads=[];
  t.mock.method(GLTFLoader.prototype,'load',function(url,onLoad){loads.push({url,path:this.path,onLoad});});
  const f=fixture(t);f.rig.setActive(true);f.connect(1,side,true);
  const slot=f.rig.slots[1];
  assert.equal(loads.length,1);assert.equal(loads[0].url,`${side}.glb`);
  assert.equal(loads[0].path,'/assets/xr/profiles/generic-hand/');
  const buffer=await readFile(new URL(`../public/assets/xr/profiles/generic-hand/${side}.glb`,import.meta.url));
  const gltf=await new GLTFLoader().parseAsync(buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength),'');
  loads[0].onLoad(gltf);
  const surface=slot.modelRoot.getObjectByName('Translucent tracked hand');
  const fallback=slot.modelRoot.getObjectByName('Tracked joint fallback');
  const skin=surface.getObjectByProperty('type','SkinnedMesh');
  assert.equal(skin.skeleton.bones.length,25);
  for(const [index,joint] of Object.values(slot.hand.joints).entries())joint.position.set(index*.01,1.1,-.5);
  f.rig.group.updateMatrixWorld(true);
  assert.equal(surface.visible,true);assert.equal(fallback.visible,false);
  for(const bone of skin.skeleton.bones)assert.deepEqual(bone.position.toArray(),slot.hand.joints[bone.name].position.toArray());
  assert.equal(skin.material.transparent,true);assert.ok(skin.material.opacity<1);
  assert.equal(skin.material.depthWrite,false);
  const missing=slot.hand.joints['ring-finger-phalanx-intermediate'];missing.visible=false;
  f.rig.group.updateMatrixWorld(true);
  assert.equal(surface.visible,false);assert.equal(fallback.visible,true);
  assert.equal(fallback.motionController.handMesh.count,24);
  delete slot.hand.joints['ring-finger-phalanx-intermediate'];
  assert.doesNotThrow(()=>f.rig.group.updateMatrixWorld(true));
  assert.equal(surface.visible,false);assert.equal(fallback.motionController.handMesh.count,24);
  slot.hand.joints['ring-finger-phalanx-intermediate']=missing;
  missing.visible=true;missing.position.x=.8;f.rig.group.updateMatrixWorld(true);
  assert.equal(surface.visible,true);assert.equal(fallback.visible,false);
  assert.equal(surface.getObjectByName('ring-finger-phalanx-intermediate').position.x,.8);
  let released=0;const dispose=skin.skeleton.dispose.bind(skin.skeleton);
  t.mock.method(skin.skeleton,'dispose',()=>{released++;dispose();});
  f.rig.dispose();f.rig.dispose();assert.equal(released,1);
 });
}

test('late hand mesh load is disposed and cannot replace a reconnected source',async t=>{
 let deliver;
 t.mock.method(GLTFLoader.prototype,'load',function(_url,onLoad){deliver=onLoad;});
 const f=fixture(t);f.rig.setActive(true);f.connect(0,'left',true);
 const stale=f.rig.slots[0].modelRoot;f.connect(0,'right');
 const buffer=await readFile(new URL('../public/assets/xr/profiles/generic-hand/left.glb',import.meta.url));
 const gltf=await new GLTFLoader().parseAsync(buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength),'');
 const mesh=gltf.scene.getObjectByProperty('type','SkinnedMesh');let disposed=0;
 mesh.geometry.addEventListener('dispose',()=>disposed++);deliver(gltf);
 assert.equal(disposed,1);assert.equal(stale.parent,null);
 assert.equal(f.rig.slots[0].source.handedness,'right');
 assert.equal(f.rig.slots[0].fallback.visible,true);
 assert.equal(f.rig.slots[0].modelRoot.getObjectByProperty('type','SkinnedMesh'),undefined);
});

for(const interruption of ['replacement','disposal'])test(`late controller avatar load is disposed after ${interruption} and cannot revive its source`,async t=>{
 let deliver;
 t.mock.method(GLTFLoader.prototype,'load',function(_url,onLoad){deliver=onLoad;});
 const f=fixture(t);f.rig.setActive(true);f.connect(0,'right');
 const slot=f.rig.slots[0],proxy=slot.modelRoot,controller=new Group(),geometry=new BoxGeometry(.01,.01,.01);
 for(const name of ['thumbstick','a_button','b_button']){const mesh=new Mesh(geometry);mesh.name=name;controller.add(mesh);}
 proxy.add(controller);slot.modelReady=true;slot.fallback.visible=false;
 f.rig.addControllerHand(slot,'right',proxy,controller);
 f.emit(0,'selectstart');assert.equal(f.events.at(-1).phase,'start','cosmetic load cannot block trigger actions');
 if(interruption==='replacement')f.connect(0,'left');else f.rig.dispose();
 const buffer=await readFile(new URL('../public/assets/xr/profiles/generic-hand/right.glb',import.meta.url));
 const gltf=await new GLTFLoader().parseAsync(buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength),'');
 const skin=gltf.scene.getObjectByProperty('type','SkinnedMesh');let disposed=0;
 skin.geometry.addEventListener('dispose',()=>disposed++);deliver(gltf);
 assert.equal(disposed,1);assert.equal(proxy.parent,null);assert.equal(slot.controllerHand,null);
 assert.equal(f.events.at(-1).cancelled,true);
 assert.equal(slot.source?.handedness,interruption==='replacement'?'left':undefined);
});
