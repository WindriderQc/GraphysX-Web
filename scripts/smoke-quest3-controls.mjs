import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { applySmokeTimeout, launchSmokeBrowser } from './smoke-harness.mjs';

const base = new URL('?app=quest3', process.env.SMOKE_BASE || 'http://127.0.0.1:4188/');
const output = path.resolve(process.env.SMOKE_ARTIFACTS || 'output/playwright/quest3-controls');
await mkdir(output, { recursive: true });
const browser = await launchSmokeBrowser();
const errors = [];
const phase = page => page.evaluate(() => window.__GRAPHYSX_QUEST3__.mission.phase);
const ready = async page => {
  await page.goto(base.href);
  await page.waitForFunction(() => window.__GRAPHYSX_QUEST3__?.visualReady);
};
const spin = page => page.evaluate(() => window.advanceTime(0));
const pane = async options => {
  const page = applySmokeTimeout(await browser.newPage(options));
  page.on('pageerror', error => errors.push(error.message));
  return page;
};
const result = {};
try {
  const touch = await pane({ hasTouch: true, viewport: { width: 900, height: 650 }, reducedMotion: 'reduce' });
  await ready(touch);
  result.reducedMotion = await touch.evaluate(() => {
    const { host } = window.__GRAPHYSX_QUEST3__;
    document.querySelector('[data-view="1"]').click();
    return { position: host.camera.position.toArray(), target: host.controls.target.toArray() };
  });
  await touch.emulateMedia({ reducedMotion: 'no-preference' });
  result.motionWithNoPreference = await touch.evaluate(() => {
    const { host } = window.__GRAPHYSX_QUEST3__;
    document.querySelector('[data-view="0"]').click();
    return host.camera.position.toArray();
  });
  await touch.emulateMedia({ reducedMotion: 'reduce' });
  await touch.waitForFunction(() => {
    const { host } = window.__GRAPHYSX_QUEST3__;
    return host.camera.position.distanceToSquared(host.camera.position.clone().set(.9, 1.65, 1.6)) < 1e-14;
  });
  await spin(touch);
  await touch.tap('.nacre-primary');
  await spin(touch);
  await touch.evaluate(() => {
    const { host } = window.__GRAPHYSX_QUEST3__;
    const result = host.api.spawn({ id: 'qa-nacre-partition', type: 'box', geometry: { width: 1, height: 1, depth: .08 },
      transform: { position: [.76, 1.38, .87] }, material: { color: '#425866' } });
    if (!result.ok) throw Error(result.error);
    host.scene.updateMatrixWorld(true);
  });
  const tapCell = async () => {
    const { x, y } = await touch.evaluate(() => JSON.parse(window.render_game_to_text()).cell.screen);
    await touch.touchscreen.tap(x, y);
    return phase(touch);
  };
  result.touchBehindWall = await tapCell();
  await touch.screenshot({ path: path.join(output, 'blocked-touch.png') });
  await touch.evaluate(() => {
    const { host, mission } = window.__GRAPHYSX_QUEST3__;
    mission.reset();
    const result = host.api.update('qa-nacre-partition', { visible: false });
    if (!result.ok) throw Error(result.error);
  });
  await spin(touch);
  result.touchWithHiddenWall = await tapCell();
  await touch.close();

  const xr = await pane({ viewport: { width: 900, height: 650 } });
  await xr.addInitScript(() => {
    let attempt = 0;
    Object.defineProperty(navigator, 'xr', { configurable: true, value: {
      isSessionSupported: async () => true,
      requestSession: () => {
        if (++attempt === 1) return new Promise((_resolve, reject) => {
          window.denyNacreSession = () => reject(new DOMException('Permission denied', 'NotAllowedError'));
        });
        const session = new EventTarget();
        session.visibilityState = 'visible';
        session.requestReferenceSpace = async () => new EventTarget();
        session.end = async () => session.dispatchEvent(new Event('end'));
        return Promise.resolve(session);
      },
    } });
  });
  await ready(xr);
  await xr.evaluate(() => {
    const { host } = window.__GRAPHYSX_QUEST3__;
    host.renderer.xr.setSession = async () => {};
    host.renderer.xr.getReferenceSpace = () => new EventTarget();
  });
  await xr.click('.nacre-enter');
  result.missionWhileRequestPending = await phase(xr);
  await xr.evaluate(() => window.denyNacreSession());
  await xr.waitForFunction(() => window.__GRAPHYSX_QUEST3__.vr.session.snapshot.phase === 'error');
  // The status HUD runs at a lower cadence than the XR lifecycle.
  const rejectedAt = await xr.evaluate(() => performance.now());
  await xr.waitForFunction(at => performance.now() - at > 200, rejectedAt);
  result.missionAfterRefusal = await phase(xr);
  result.refusalText = await xr.locator('.nacre-status [role=status]').innerText();
  result.retryLabel = await xr.locator('.nacre-enter').innerText();
  await xr.screenshot({ path: path.join(output, 'vr-refused.png') });
  await xr.click('.nacre-enter');
  await xr.waitForFunction(() => window.__GRAPHYSX_QUEST3__.vr.session.snapshot.phase === 'active');
  result.missionAfterSuccessfulRetry = await phase(xr);
  await xr.evaluate(() => {
    const { host, vr } = window.__GRAPHYSX_QUEST3__;
    const { ray, grip } = vr.input.slots[0];
    const source = { handedness: 'right', targetRayMode: 'tracked-pointer', profiles: ['meta-quest-touch-plus'],
      targetRaySpace: {}, gripSpace: {}, gamepad: { mapping: 'xr-standard', buttons: [], axes: [] } };
    ray.dispatchEvent({ type: 'connected', data: source });
    ray.visible = grip.visible = true;
    grip.position.set(.65, 1.12, .48);
    vr.rig.worldToLocal(grip.position);
    ray.position.copy(grip.position);
    grip.updateMatrix(); ray.updateMatrix(); host.scene.updateMatrixWorld(true);
    const wall = host.api.spawn({ id: 'qa-nacre-vr-partition', type: 'box', geometry: { width: .6, height: .6, depth: .02 },
      transform: { position: [.65, 1.12, .42] }, material: { color: '#425866' } });
    if (!wall.ok) throw Error(wall.error);
    host.scene.updateMatrixWorld(true);
    window.grabNacreCell = () => ray.dispatchEvent({ type: 'squeezestart' });
    window.grabNacreCell();
  });
  result.xrBehindWall = await phase(xr);
  await xr.evaluate(() => {
    const { host, mission, vr } = window.__GRAPHYSX_QUEST3__;
    vr.input.slots[0].ray.dispatchEvent({ type: 'squeezeend' });
    mission.reset();
    const updated = host.api.update('qa-nacre-vr-partition', { material: { opacity: .25 } });
    if (!updated.ok) throw Error(updated.error);
    window.grabNacreCell();
  });
  result.xrThroughTransparentPane = await phase(xr);
  await xr.evaluate(() => {
    const { host, vr } = window.__GRAPHYSX_QUEST3__;
    const { ray } = vr.input.slots[0];
    const button = host.scene.getObjectByName('nacre-ui:RÉACTEUR');
    const origin = ray.getWorldPosition(ray.position.clone());
    const target = button.getWorldPosition(ray.position.clone());
    const direction = target.clone().sub(origin).normalize();
    ray.quaternion.setFromUnitVectors(direction.clone().set(0, 0, -1), direction);
    ray.updateMatrix();
    const wall = host.api.spawn({ id: 'qa-nacre-console-wall', type: 'box',
      geometry: { width: .8, height: .8, depth: .04 },
      transform: { position: origin.lerp(target, .5).toArray() }, material: { color: '#425866' } });
    if (!wall.ok) throw Error(wall.error);
    host.scene.updateMatrixWorld(true);
    window.aimNacreConsole = () => { ray.dispatchEvent({ type: 'selectstart' }); ray.dispatchEvent({ type: 'selectend' }); };
    window.aimNacreConsole();
  });
  result.consoleBehindWall = await xr.evaluate(() => JSON.parse(window.render_game_to_text()).view);
  await xr.evaluate(() => {
    const { host } = window.__GRAPHYSX_QUEST3__;
    const removed = host.api.remove('qa-nacre-console-wall');
    if (!removed.ok) throw Error(removed.error);
    window.aimNacreConsole();
  });
  result.consoleWithClearRay = await xr.evaluate(() => ({
    view: JSON.parse(window.render_game_to_text()).view,
    holding: window.__GRAPHYSX_QUEST3__.holding,
  }));

  assert.deepEqual(errors, []);
  console.log(JSON.stringify(result));
  await writeFile(path.join(output, 'quest3-controls.json'), JSON.stringify(result, null, 2));
  const { refusalText, ...controls } = result;
  assert.match(refusalText, /autorisations.*réessayez/i);
  assert.deepEqual(controls, {
    reducedMotion: { position: [1, 1.35, -5.8], target: [.2, 2.35, -10.7] },
    motionWithNoPreference: [1, 1.35, -5.8],
    touchBehindWall: 'cell', touchWithHiddenWall: 'carrying',
    missionWhileRequestPending: 'standby', missionAfterRefusal: 'standby', retryLabel: 'Réessayer la VR',
    missionAfterSuccessfulRetry: 'cell', xrBehindWall: 'cell', xrThroughTransparentPane: 'carrying',
    consoleBehindWall: 0, consoleWithClearRay: { view: 1, holding: true },
  });
  console.log('PASS NACRE controls: recoverable VR entry, reduced movement, and visible-only touch and controller selection.');
} finally { await browser.close(); }
