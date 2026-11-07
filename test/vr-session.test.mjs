import test from 'node:test';
import assert from 'node:assert/strict';
import { VrSessionController } from '../src/xr/vr-session.ts';

const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
class Session extends EventTarget {
  visibilityState = 'visible';
  ends = 0;
  failEnd = false;
  async end() { this.ends++; if (this.failEnd) throw Error('end failed'); this.dispatchEvent(new Event('end')); }
}
function fixture(overrides = {}) {
  const session = new Session();
  const events = [];
  let requests = 0;
  let init;
  const xr = { isSessionSupported: async () => true, requestSession(mode, options) { requests++; assert.equal(mode, 'immersive-vr'); init = options; return Promise.resolve(session); } };
  const controller = new VrSessionController({ xr, secureContext: true, bindSession: async () => {}, onStarted: () => events.push('started'), onEnded: () => events.push('ended'), onInterrupted: () => events.push('interrupted'), ...overrides });
  return { controller, session, events, xr, get requests() { return requests; }, get init() { return init; } };
}
test('support checks are graceful and stale checks do not overwrite entry', async () => {
  for (const options of [{ xr: undefined }, { secureContext: false }, { xr: { isSessionSupported: async () => false } }]) {
    const { controller } = fixture(options); await controller.checkSupport(); assert.equal(controller.snapshot.phase, 'unsupported');
  }
  const { controller } = fixture({ xr: { isSessionSupported: async () => { throw Error(); } } });
  await controller.checkSupport(); assert.equal(controller.snapshot.phase, 'error');
  const check = deferred(); const f = fixture(); f.xr.isSessionSupported = () => check.promise;
  const checking = f.controller.checkSupport(); await f.controller.enter(); check.resolve(false); await checking;
  assert.equal(f.controller.snapshot.phase, 'active');
});
test('request is synchronous, features optional, duplicate clicks guarded, reentry works', async () => {
  const f = fixture(); await f.controller.checkSupport();
  const entry = f.controller.enter(); assert.equal(f.requests, 1); const again = f.controller.enter();
  assert.equal(entry, again); await entry;
  assert.deepEqual(f.init, { optionalFeatures: ['local-floor', 'hand-tracking'] });
  assert.equal(f.controller.session, f.session); assert.equal(f.controller.snapshot.phase, 'active');
  await Promise.all([f.controller.exit(), f.controller.exit()]); assert.equal(f.session.ends, 1);
  assert.equal(f.controller.session, null); await f.controller.enter(); assert.equal(f.requests, 2);
});
test('denied requests and synchronous exceptions allow retry', async () => {
  const f = fixture(); f.xr.requestSession = () => Promise.reject(Error('denied'));
  await f.controller.enter(); assert.equal(f.controller.snapshot.phase, 'error');
  f.xr.requestSession = () => { throw Error('denied'); };
  await f.controller.enter(); assert.equal(f.controller.snapshot.phase, 'error');
  f.xr.requestSession = () => Promise.resolve(f.session); await f.controller.enter(); assert.equal(f.controller.snapshot.phase, 'active');
});
test('end during bind never starts or resurrects the session', async () => {
  const binding = deferred(); const f = fixture({ bindSession: () => binding.promise });
  const entry = f.controller.enter(); await Promise.resolve(); f.session.dispatchEvent(new Event('end'));
  binding.resolve(); await entry; assert.equal(f.controller.snapshot.phase, 'ready'); assert.deepEqual(f.events, ['ended']);
  f.session.dispatchEvent(new Event('end')); assert.deepEqual(f.events, ['ended']);
});
test('dispose during request ends the late session without binding it', async () => {
  const request = deferred(); let binds = 0;
  const f = fixture({ bindSession: async () => { binds++; } }); f.xr.requestSession = () => request.promise;
  const entry = f.controller.enter(); const disposing = f.controller.dispose(); request.resolve(f.session);
  await Promise.all([entry, disposing]); assert.equal(binds, 0); assert.equal(f.session.ends, 1); assert.equal(f.controller.snapshot.phase, 'disposed');
  await f.controller.enter(); assert.equal(f.controller.session, null);
});
test('exit during request and dispose during bind cancel activation', async () => {
  const request = deferred(); const f = fixture(); f.xr.requestSession = () => request.promise;
  const entry = f.controller.enter(); const exiting = f.controller.exit(); request.resolve(f.session);
  await Promise.all([entry, exiting]); assert.equal(f.controller.snapshot.phase, 'ready'); assert.ok(!f.events.includes('started'));
  const binding = deferred(); const g = fixture({ bindSession: () => binding.promise });
  const secondEntry = g.controller.enter(); await Promise.resolve(); const disposing = g.controller.dispose();
  binding.resolve(); await Promise.all([secondEntry, disposing]); assert.equal(g.controller.snapshot.phase, 'disposed'); assert.ok(!g.events.includes('started'));
});
test('hidden and blurred interrupt input; visible never restarts input', async () => {
  const f = fixture(); await f.controller.enter();
  for (const state of ['visible-blurred', 'hidden', 'visible']) { f.session.visibilityState = state; f.session.dispatchEvent(new Event('visibilitychange')); }
  assert.deepEqual(f.events, ['started', 'interrupted', 'interrupted']);
});
test('bind failure closes session and permits retry', async () => {
  const f = fixture({ bindSession: async () => { throw Error('renderer'); } });
  await f.controller.enter(); assert.equal(f.session.ends, 1); assert.equal(f.controller.session, null); assert.equal(f.controller.snapshot.phase, 'error');
});
test('failed end retains session and permits exit/dispose retry', async () => {
  const f = fixture(); await f.controller.enter(); f.session.failEnd = true;
  await f.controller.exit(); assert.equal(f.controller.session, f.session); assert.equal(f.controller.snapshot.phase, 'error');
  await f.controller.enter(); assert.equal(f.requests, 1); assert.ok(!f.events.includes('ended'));
  await f.controller.dispose(); assert.equal(f.controller.session, f.session); assert.equal(f.controller.snapshot.phase, 'error');
  f.session.failEnd = false; await f.controller.dispose(); assert.equal(f.controller.snapshot.phase, 'disposed'); assert.equal(f.controller.session, null);
});
test('snapshot subscriptions are immutable and unsubscribe', async () => {
  const f = fixture(); const snapshots = []; const unsubscribe = f.controller.subscribe(s => snapshots.push(s));
  assert.equal(snapshots[0].phase, 'checking'); assert.ok(Object.isFrozen(snapshots[0])); unsubscribe();
  await f.controller.checkSupport(); assert.equal(snapshots.length, 1);
});
test('rejected bind after headset ended does not overwrite the end state', async () => {
  const binding = deferred(); const f = fixture({ bindSession: () => binding.promise });
  const entry = f.controller.enter(); await Promise.resolve(); f.session.dispatchEvent(new Event('end'));
  binding.reject(Error('stale renderer failure')); await entry;
  assert.equal(f.controller.snapshot.phase, 'ready'); assert.deepEqual(f.events, ['ended']);
});
test('disposal invalidates pending support result and late event listeners are removed', async () => {
  const support = deferred(); const f = fixture(); f.xr.isSessionSupported = () => support.promise;
  const checking = f.controller.checkSupport(); await f.controller.dispose(); support.resolve(true); await checking;
  assert.equal(f.controller.snapshot.phase, 'disposed');
  const g = fixture(); await g.controller.enter(); await g.controller.exit(); const count = g.events.length;
  g.session.visibilityState = 'hidden'; g.session.dispatchEvent(new Event('visibilitychange'));
  g.session.dispatchEvent(new Event('end')); assert.equal(g.events.length, count);
});
