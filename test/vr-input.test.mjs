import test from 'node:test';
import assert from 'node:assert/strict';
import { Group, Matrix4, Vector3 } from 'three';
import { VrInputRig } from '../src/xr/vr-input.ts';
import { observeGiantXrSelect } from '../src/ballsy-giant-xr.ts';

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
  const slot = f.rig.slots[0]; let geometryDisposals = 0, materialDisposals = 0;
  slot.fallback.geometry.addEventListener('dispose', () => geometryDisposals++);
  slot.fallback.material.addEventListener('dispose', () => materialDisposals++);
  f.rig.dispose(); f.rig.dispose();
  assert.equal(f.events.length, 2); assert.equal(f.events[1].cancelled, true);
  assert.equal(geometryDisposals, 1); assert.equal(materialDisposals, 1);
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
