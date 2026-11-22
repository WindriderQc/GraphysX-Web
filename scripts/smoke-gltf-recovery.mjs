import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { applySmokeTimeout, launchSmokeBrowser, useLightRender } from './smoke-harness.mjs';

const base = process.env.SMOKE_BASE || 'http://127.0.0.1:4188/';
const output = path.resolve(process.env.SMOKE_ARTIFACTS || 'output/playwright/gltf-recovery');
await mkdir(output, { recursive: true });
const browser = await launchSmokeBrowser();
const errors = [];
const staleSlot = 'mesh:999:old:material:0:old';
const missingLod = '/assets/quest3/qa-missing-lod.glb';
const lodUrl = '/assets/quest3/equipment-low.glb';
const trailingLod = lodUrl + '?qa=after-missing';
const baseUrl = '/assets/quest3/equipment.glb';
try {
  const page = applySmokeTimeout(await browser.newPage({ viewport: { width: 1100, height: 750 } }));
  await useLightRender(page, { resolution: .65 });
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() !== 'error') return;
    if (message.location().url.endsWith(missingLod) && /\b404\b/.test(message.text())) return;
    errors.push(message.text());
  });
  const modelRequests = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if ([baseUrl, missingLod, lodUrl].includes(url.pathname)) modelRequests.push(url.pathname + url.search);
  });
  await page.route('**/qa-missing-lod.glb', route => route.fulfill({ status: 404, body: 'Missing test LOD' }));
  await page.goto(new URL('?host=standalone', base).href);
  await page.waitForFunction(() => Boolean(window.__GRAPHYSX_HOST__));
  await page.evaluate(({ staleSlot, missingLod, lodUrl, trailingLod, baseUrl }) => {
    const { api } = window.__GRAPHYSX_HOST__;
    const asset = { format: 'gltf', fitSize: 2, url: baseUrl };
    const loaded = api.create({
      schema: 'graphysx.agent-world/v2', id: 'qa-gltf-recovery', label: 'GLB recovery',
      entities: [
        { id: 'fill', type: 'ambient-light', intensity: 2 },
        { id: 'fallback', type: 'model', transform: { position: [-1.4, 1, 0] },
          asset: { ...asset, lods: [{ url: missingLod, distance: 8 }, { url: trailingLod, distance: 15 }] } },
        { id: 'stale', type: 'model', transform: { position: [1.4, 1, 0] },
          asset: { ...asset, lods: [{ url: lodUrl, distance: 8 }] },
          modelMaterialOverrides: { [staleSlot]: { color: '#dd3355' } } },
        { id: 'missing-base', type: 'model', asset: { ...asset, url: missingLod } },
      ],
    });
    if (!loaded.ok) throw Error(loaded.error);
  }, { staleSlot, missingLod, lodUrl, trailingLod, baseUrl });
  await page.waitForFunction(() => ['fallback', 'stale', 'missing-base'].every(id => {
    const asset = window.__GRAPHYSX__.query({ ids: [id] })[0]?.asset;
    return asset && asset.status !== 'loading';
  }));
  await page.evaluate(() => window.__GRAPHYSX_HOST__.frameView([0, 4, 14], [0, 1, 0], 0));
  await page.waitForFunction(() => {
    const lod = window.__GRAPHYSX_HOST__.world.getEntityObject('stale').children.find(child => child.isLOD);
    return lod?.levels[1]?.object.visible && !lod.levels[0].object.visible;
  });
  const before = await page.evaluate(() => {
    const { api, world } = window.__GRAPHYSX_HOST__;
    const fallback = world.getEntityObject('fallback').children.find(child => child.isLOD);
    const root = world.getEntityObject('stale');
    let mesh;
    root.traverse(child => { if (!mesh && child.isMesh) mesh = child; });
    const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    window.__qaStaleModel = { root, mesh, geometry: mesh.geometry, source: material };
    const entity = id => api.query({ ids: [id] })[0];
    return { fallback: entity('fallback').asset, stale: entity('stale').asset,
      missingBase: entity('missing-base').asset.status,
      fallbackLevels: fallback?.levels.map(level => level.distance) ?? [],
      fallbackVisible: fallback?.levels[0].object.visible ?? false,
      slots: entity('stale').materialSlots };
  });
  await page.locator('.gx-ed-row[title="stale — model"]').click();
  const removeOverride = page.getByRole('button', { name: 'Remove override', exact: true });
  await removeOverride.waitFor();
  await page.screenshot({ path: path.join(output, 'gltf-before-repair.png') });
  const beforeRepairRequests = modelRequests.length;
  await removeOverride.click();
  await removeOverride.waitFor({ state: 'detached' });
  await page.evaluate(() => window.__GRAPHYSX_HOST__.frameView([3, 2.6, 4], [0, 1, 0], 0));
  const after = await page.evaluate(staleSlot => {
    const { api, world } = window.__GRAPHYSX_HOST__;
    const { root, mesh, geometry } = window.__qaStaleModel;
    const state = () => api.query({ ids: ['stale'] })[0];
    const validId = state().materialSlots[0].id;
    const previousRevision = api.state().revision;
    const edited = api.update('stale', { modelMaterialOverrides: { [validId]: { color: '#3ac8df' } } });
    const actual = state();
    const result = { ok: edited.ok, error: edited.error, status: actual.asset.status, issues: actual.asset.materialOverrideIssues ?? [],
      sameRoot: root === world.getEntityObject('stale'), sameGeometry: geometry === mesh.geometry,
      color: actual.materialSlots[0].color, meshColor: mesh.material.color.getHexString(),
      newRevision: api.state().revision, previousRevision,
      saved: api.exportDocument().entities.find(entity => entity.id === 'stale').modelMaterialOverrides };
    const current = mesh.material;
    let disposals = 0;
    current.addEventListener('dispose', () => { disposals++; });
    const bad = api.update('stale', { modelMaterialOverrides: { [staleSlot]: { color: '#ffffff' } } });
    return { ...result, invalidRejected: !bad.ok, afterInvalidRevision: api.state().revision,
      keptModel: root === world.getEntityObject('stale') && mesh.material === current, disposals };
  }, staleSlot);
  await page.screenshot({ path: path.join(output, 'gltf-repaired.png') });
  await page.locator('.gx-ed-row[title="fallback — model"]').click();
  const cleanup = await page.evaluate(() => {
    const { api } = window.__GRAPHYSX_HOST__;
    const { mesh, geometry, source } = window.__qaStaleModel;
    const clone = mesh.material;
    let cloneDisposed = 0, sourceDisposed = 0, geometryDisposed = 0;
    clone.addEventListener('dispose', () => { cloneDisposed++; });
    source.addEventListener('dispose', () => { sourceDisposed++; });
    geometry.addEventListener('dispose', () => { geometryDisposed++; });
    const reset = api.update('stale', { modelMaterialOverrides: null });
    const restored = reset.ok && mesh.material === source;
    const beforeRemoval = { cloneDisposed, sourceDisposed, geometryDisposed };
    const removed = api.remove('stale');
    return { restored, removed: removed.ok, beforeRemoval, afterRemoval: { cloneDisposed, sourceDisposed, geometryDisposed } };
  });
  const receipt = { before, after, cleanup, modelRequests, beforeRepairRequests };
  await writeFile(path.join(output, 'gltf-recovery.json'), JSON.stringify(receipt, null, 2));

  assert.equal(before.fallback.status, 'ready');
  assert.match(before.fallback.lodWarning, /qa-missing-lod\.glb/);
  assert.deepEqual(before.fallbackLevels, [0]);
  assert.equal(before.fallbackVisible, true);
  assert.equal(before.missingBase, 'error');
  assert.equal(modelRequests.includes(lodUrl), true);
  assert.equal(modelRequests.includes(trailingLod), false, 'a failed intermediate level must not shift later material slot IDs');
  assert.equal(before.stale.status, 'ready');
  assert.equal(before.stale.materialOverrideIssues?.[0]?.slotId, staleSlot);
  assert.ok(before.slots.length > 0);
  assert.equal(after.ok, true, after.error);
  assert.equal(after.status, 'ready');
  assert.deepEqual(after.issues, []);
  assert.equal(after.color, '#3ac8df');
  assert.equal(after.meshColor, '3ac8df');
  assert.deepEqual(Object.values(after.saved), [{ color: '#3ac8df' }]);
  assert.equal(after.newRevision, after.previousRevision + 1);
  assert.equal(after.afterInvalidRevision, after.newRevision);
  assert.ok(after.sameRoot && after.sameGeometry && after.keptModel);
  assert.equal(after.invalidRejected, true);
  assert.equal(after.disposals, 0);
  assert.deepEqual(cleanup, { restored: true, removed: true,
    beforeRemoval: { cloneDisposed: 1, sourceDisposed: 0, geometryDisposed: 0 },
    afterRemoval: { cloneDisposed: 1, sourceDisposed: 1, geometryDisposed: 1 } });
  assert.equal(modelRequests.length, beforeRepairRequests);
  assert.deepEqual(errors, []);
  console.log('PASS GLB base fallback and in-place material slot repair.');
} finally {
  await browser.close();
}
