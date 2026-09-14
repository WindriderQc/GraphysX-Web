import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Group, Scene, Vector2, Vector4 } from 'three';
import { importBrowserModule } from './support/import-browser-module.mjs';

const { createLlmXFaceInset } = await importBrowserModule(new URL('../src/llmx-face-inset.ts', import.meta.url));

function fixture(t) {
  const view = { isConnected: true, getBoundingClientRect: () => ({ left: 420, bottom: 290, width: 90, height: 100 }) };
  const button = { setAttribute() {}, addEventListener() {}, removeEventListener() {},
    querySelector: () => view, remove() { view.isConnected = false; } };
  const previous = globalThis.document;
  globalThis.document = { createElement: () => button };
  t.after(() => { if (previous) globalThis.document = previous; else delete globalThis.document; });
  const originalTarget = {}, scene = new Scene();
  const renderer = {
    domElement: { getBoundingClientRect: () => ({ left: 10, bottom: 420, width: 500, height: 400 }) },
    autoClear: false, shadowMap: { needsUpdate: true },
    viewport: new Vector4(0, 0, 1000, 800), scissor: new Vector4(1, 2, 3, 4), scissorTest: false,
    target: originalTarget, face: 2, mip: 1, calls: [], fail: false,
    getSize: v => v.copy(new Vector2(1000, 800)),
    getRenderTarget() { return this.target; }, getActiveCubeFace() { return this.face; }, getActiveMipmapLevel() { return this.mip; },
    getViewport(v) { return v.copy(this.viewport); }, getScissor(v) { return v.copy(this.scissor); },
    getScissorTest() { return this.scissorTest; }, setScissorTest(value) { this.scissorTest = value; },
    setRenderTarget(target, face = 0, mip = 0) { Object.assign(this, { target, face, mip }); },
    setViewport(...args) { this.viewport = args[0] instanceof Vector4 ? args[0].clone() : new Vector4(...args); },
    setScissor(...args) { this.scissor = args[0] instanceof Vector4 ? args[0].clone() : new Vector4(...args); },
    render(renderedScene, camera) {
      assert.equal(renderedScene, scene);
      assert.equal(this.target, null); assert.equal(this.scissorTest, true); assert.equal(this.autoClear, true);
      assert.equal(this.shadowMap.needsUpdate, false);
      assert.deepEqual(this.viewport.toArray(), [820, 260, 180, 200]);
      assert.deepEqual(this.scissor.toArray(), this.viewport.toArray());
      assert.equal(camera.aspect, 0.9);
      this.calls.push(camera);
      if (this.fail) throw new Error('render failed');
    },
  };
  let face = new Group(); face.position.set(4, 3, 2); scene.add(face);
  const inset = createLlmXFaceInset(renderer, scene, { append() {}, classList: { toggle() {}, remove() {} } }, () => face, () => {});
  t.after(() => inset.dispose());
  return { inset, renderer, button, view, originalTarget, replace(value) { face = value; } };
}

test('portrait maps CSS bounds into the shared renderer and restores every changed render state, including on failure', t => {
  const { inset, renderer, originalTarget } = fixture(t);
  for (const fail of [false, true]) {
    renderer.fail = fail; inset.update(true);
    if (fail) assert.throws(() => inset.render(), /render failed/); else inset.render();
    assert.equal(renderer.target, originalTarget); assert.equal(renderer.face, 2); assert.equal(renderer.mip, 1);
    assert.deepEqual(renderer.viewport.toArray(), [0, 0, 1000, 800]);
    assert.deepEqual(renderer.scissor.toArray(), [1, 2, 3, 4]);
    assert.equal(renderer.scissorTest, false); assert.equal(renderer.autoClear, false); assert.equal(renderer.shadowMap.needsUpdate, true);
  }
  assert.equal(inset.state().frames, 1);
});

test('portrait follows the current native face after world replacement and stops rendering when hidden or disposed', t => {
  const { inset, renderer, replace, button } = fixture(t);
  inset.update(true);
  assert.deepEqual(inset.camera.position.toArray(), [4.18, 3.03, 6.1]);
  const replacement = new Group(); replacement.position.set(-4, 6, 1); replace(replacement);
  inset.update(true); assert.deepEqual(inset.camera.position.toArray(), [-3.82, 6.03, 5.1]);
  inset.render();
  inset.update(false); inset.render(); assert.equal(button.hidden, true);
  replace(null); inset.update(true); inset.render(); assert.equal(inset.state().visible, false);
  replace(replacement); inset.update(true); inset.dispose(); inset.render();
  assert.equal(renderer.calls.length, 1);
});
