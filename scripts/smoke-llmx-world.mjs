import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { startStaticServer } from './static-server.mjs';
import { launchSmokeBrowser, applySmokeTimeout } from './smoke-harness.mjs';

const artifacts = process.env.SMOKE_ARTIFACTS || 'output/playwright/llmx-world';
mkdirSync(artifacts, { recursive: true });
const server = process.env.SMOKE_BASE ? null : await startStaticServer({ root: path.resolve('dist'), port: 0 });
const base = process.env.SMOKE_BASE || server.url;
const nativeGpu = process.env.LLMX_NATIVE_GPU === '1';
const browser = await launchSmokeBrowser(nativeGpu ? { args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] } : {});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
applySmokeTimeout(page);
const errors = [], turns = [], receipts = [];
page.on('pageerror', error => errors.push(String(error)));
const session = { sessionId: 'full-world-browser', packId: 'personal_operator', scopeId: 'personal', turnCount: 1, llmx: { schemaVersion: 1 } };
let commands = [];
await page.route('**/llmx-api/**', async route => {
  const request = route.request(), url = new URL(request.url()), body = request.postDataJSON();
  let data;
  if (url.pathname.endsWith('/config')) data = { enabled: true, schemaVersion: 1, capabilities: { sceneProposals: true, commandsVersion: 2 } };
  else if (url.pathname.endsWith('/history')) data = { session, messages: [] };
  else if (url.pathname.endsWith('/turns/text')) {
    turns.push(body);
    data = { session, turnId: body.turnId, reply: { text: 'Le geste est prêt.', language: 'fr' },
      sceneProposal: { schemaVersion: 1, environmentId: body.sceneContext.environment.id, revision: body.sceneContext.revision, intent: body.text, commands } };
  } else if (url.pathname.endsWith('/scene-receipts')) { receipts.push(body); data = { receipt: body, turnId: body.turnId }; }
  else data = { session };
  await route.fulfill({ json: { ok: true, data } });
});
async function send(text, batch) {
  commands = batch;
  const before = receipts.length;
  await page.locator('[data-text]').fill(text);
  await page.locator('[data-talk="send"]').click();
  await page.waitForFunction(() => !document.querySelector('[data-talk="send"]').disabled);
  assert.equal(receipts.length, before + 1);
  assert.equal(receipts.at(-1).status, 'applied', receipts.at(-1).message);
}
const document = () => page.evaluate(() => window.__GRAPHYSX__.exportDocument());
try {
  if (nativeGpu) {
    const renderer = await page.evaluate(() => {
      const gl = document.createElement('canvas').getContext('webgl2'), info = gl?.getExtension('WEBGL_debug_renderer_info');
      return info && gl.getParameter(info.UNMASKED_RENDERER_WEBGL);
    });
    assert.ok(renderer && !/swiftshader|software/i.test(renderer), 'hardware acceptance must not silently fall back to CPU rendering');
    console.log('Native GPU: ' + renderer);
  }
  await page.goto(base + '?app=llmx');
  await page.locator('[data-text]:not([disabled])').waitFor();
  const initial = await document();
  const floor = initial.entities.find(entity => entity.type === 'box');
  const light = initial.entities.find(entity => entity.type === 'point-light');
  await send('Déplace cette dalle au loin et change la lumière.', [
    { op: 'update', id: floor.id, patch: { transform: { position: [24, 0, 0], rotationDegrees: [0, 25, 0] }, material: { texture: { id: 'eroded-metal' } } } },
    { op: 'update', id: light.id, patch: { intensity: 3, material: { color: '#8855ff' } } },
    { op: 'set-environment', environment: { sky: 'clearblue', physics: { gravity: [0, -3, 0] } } },
    { op: 'spawn', entity: { id: 'distant-base', type: 'box', transform: { position: [26, 0, 0], scale: [8, 0.4, 8] }, physics: { mode: 'static' }, material: { color: '#394352' } } },
  ]);
  assert.equal(turns[0].sceneContext.capabilities.commandsVersion, 2);
  assert.ok(turns[0].sceneContext.entities.some(entity => entity.id === floor.id));
  assert.ok(turns[0].sceneContext.world.catalogs.textures.includes('eroded-metal'));
  await send('Fais suivre une trajectoire et lance une balle attachée.', [
    { op: 'spawn', entity: { id: 'route', type: 'spline', path: { points: [[24, 2, 0], [26, 4, 0], [28, 2, 0]] }, material: { color: '#55ddff' } } },
    { op: 'spawn', entity: { id: 'traveller', type: 'sphere', geometry: { radius: 0.4 }, material: { color: '#55ddff' }, physics: { mode: 'kinematic' } } },
    { op: 'attach-behavior', id: 'traveller', behavior: { id: 'travel', type: 'follow-spline', splineId: 'route', speed: 2, loop: true } },
    { op: 'spawn', entity: { id: 'anchor', type: 'box', transform: { position: [26, 5, 1], scale: [0.4, 0.4, 0.4] }, physics: { mode: 'static' } } },
    { op: 'spawn', entity: { id: 'ball', type: 'sphere', transform: { position: [26, 2, 1] }, physics: { mode: 'dynamic', mass: 1 }, material: { color: '#df8b4c' }, steering: {} } },
    { op: 'update', id: 'ball', patch: { interactions: [{ id: 'push', type: 'apply-impulse', targetIds: ['ball'], impulse: [2, 0, 0] }] } },
    { op: 'add-joint', joint: { id: 'rope', type: 'rope', bodyA: 'anchor', bodyB: 'ball', length: 3 } },
    { op: 'interact', id: 'ball', interactionId: 'push' },
  ]);
  await send('Change la trajectoire existante.', [{ op: 'update', id: 'route', patch: { path: { points: [[24, 2, 0], [26, 6, 0], [28, 2, 0]] } } }]);
  const updated = await document();
  assert.equal(updated.entities.find(entity => entity.id === 'route').path.points[1][1], 6);
  await page.locator('[data-action="undo"]').click();
  assert.equal((await document()).entities.find(entity => entity.id === 'route').path.points[1][1], 4);
  await page.locator('[data-action="redo"]').click();
  const positions = await page.evaluate(() => {
    const object = window.__GRAPHYSX_HOST__.world.getEntityObject('traveller');
    const before = object.position.toArray(); window.advanceTime(800); return { before, after: object.position.toArray() };
  });
  assert.notDeepEqual(positions.before, positions.after, 'the native follower actually moves');
  await page.locator('[data-action="save"]').click();
  await page.reload();
  await page.locator('[data-text]:not([disabled])').waitFor();
  const restored = await document();
  assert.equal(restored.entities.find(entity => entity.id === 'route').path.points[1][1], 6);
  assert.equal(restored.joints.find(joint => joint.id === 'rope').length, 3);
  assert.equal(restored.environment.sky, 'clearblue');
  await page.evaluate(() => window.__GRAPHYSX_HOST__.frameView([32, 7, 11], [26, 2, 0], 0));
  await page.screenshot({ path: path.join(artifacts, 'full-world.png') });
  writeFileSync(path.join(artifacts, 'report.json'), JSON.stringify({ turns, receipts, positions, restored, errors }, null, 2));
  assert.deepEqual(errors, []);
  console.log('LLMx full world: existing scenery, textures, light, sky/gravity, path/follower, impulse/joint, undo and reload passed.');
} catch (error) {
  writeFileSync(path.join(artifacts, 'failure.json'), JSON.stringify({ error: String(error), turns, receipts, errors }, null, 2));
  await page.screenshot({ path: path.join(artifacts, 'failure.png') }).catch(() => {});
  throw error;
} finally { await browser.close(); await server?.close(); }
