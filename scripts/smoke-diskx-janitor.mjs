import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { startStaticServer } from './static-server.mjs';
import { launchSmokeBrowser, applySmokeTimeout } from './smoke-harness.mjs';
const output = 'output/playwright/diskx-janitor'; mkdirSync(output, { recursive: true });
// The page installs render_game_to_text after its first module load; read it only once it exists.
const app = () => typeof window.render_game_to_text === 'function' ? JSON.parse(window.render_game_to_text()).application : null;
const server = await startStaticServer({ root: 'dist', port: 0 });
const browser = await launchSmokeBrowser({ args: ['--no-sandbox', '--mute-audio', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  applySmokeTimeout(page);
  const errors = []; page.on('pageerror', error => errors.push(String(error)));
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== new URL(server.url).origin) return route.abort();
    return route.continue();
  });
  await page.goto(`${server.url}?app=diskx&source=fixture&janitor=demo`);
  await page.getByRole('heading', { name: 'Data Janitor', exact: true }).waitFor();
  await page.waitForFunction(`(${app})()?.loading === false`);
  await page.getByRole('button', { name: 'Voir actuel et cible', exact: true }).click();
  const before = await page.evaluate(() => JSON.stringify(window.__GRAPHYSX__.exportDocument()));
  await page.getByRole('button', { name: 'Voir la cible', exact: true }).click();
  await page.waitForFunction(`(${app})()?.janitor.preview.progress === 1`);
  assert.equal(await page.evaluate(() => JSON.stringify(window.__GRAPHYSX__.exportDocument())), before, 'preview never edits the document');
  await page.screenshot({ path: `${output}/target.png`, fullPage: true });
  await page.getByRole('button', { name: 'Retour à l’actuel', exact: true }).click();
  await page.waitForFunction(`(${app})()?.janitor.preview.progress === 0`);
  await page.getByRole('combobox', { name: 'État du candidat' }).selectOption('demo-candidate-3');
  assert.match(await page.locator('[data-janitor-proof]').textContent(), /Terminé \(fictif\)/);
  assert.match(await page.locator('[data-janitor-proof]').textContent(), /Aucun résultat du backend/);
  // Duplicate group from the synthetic report: kept copy, three extras, arcs; still no document edit.
  await page.getByRole('button', { name: 'Lire le dernier rapport', exact: true }).click();
  await page.waitForFunction(`(${app})()?.janitor.availability === 'ready'`);
  await page.locator('[data-janitor-live] details').first().evaluate(node => { node.open = true; });
  await page.getByRole('button', { name: 'Montrer dans la ville', exact: true }).first().click();
  await page.waitForFunction(`(${app})()?.janitor.group?.places === 4`);
  const group = await page.evaluate(`(${app})().janitor.group`);
  assert.deepEqual([group.scope, group.keep, group.links, group.outside, group.copies], ['/mnt/datalake', true, 3, 0, 4]);
  assert.equal(await page.locator('.gx-diskx-tag').count(), 4, 'one tag per outlined district');
  assert.match(await page.locator('[data-group-view]').textContent(), /3 copies en trop/);
  const beforeGroup = await page.evaluate(() => JSON.stringify(window.__GRAPHYSX__.exportDocument()));
  await page.getByRole('button', { name: 'Voir la cible', exact: true }).click();
  await page.waitForFunction(`(${app})()?.janitor.preview.progress === 1`);
  await page.screenshot({ path: `${output}/group-target.png` });
  const afterGroup = await page.evaluate(() => JSON.stringify(window.__GRAPHYSX__.exportDocument()));
  assert.equal(afterGroup, beforeGroup, 'playing the group preview to its target never edits the scene document');
  assert.ok(!afterGroup.includes('presentation-relations'), 'the relation overlay lives outside the document');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${output}/mobile.png`, fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });

  // Mock the documented GET inventory, then change it to prove stale paths disappear.
  let version = 1, fail = false, reportReady = false;
  await page.route('**/diskx-api/**', async route => {
    const url = new URL(route.request().url());
    assert.equal(route.request().method(), 'GET');
    const respond = data => route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
    if (url.pathname.endsWith('/config')) return respond({ enabled: true, source: 'synthetic-server', roots: ['/test'] });
    // Volumes ride inside summary, as the storage agent publishes them (measured 2026-10-25).
    if (url.pathname.endsWith('/summary')) return respond({ status: 'success', data: { totalFiles: 1, totalSize: version * 100, lastScan: { finished_at: `2026-10-25T00:00:0${version}Z` },
      // Label, host and figures as the real gateway returns them (2026-10-26), so the gauge head is exercised at production width.
      volumes: [{ id: 'test:vol', label: 'Media/Media', host: 'UGFrank', roots: ['/test'], capacityBytes: 7380882554880, freeBytes: 4923464220672 - version * 100, source: 'measured', method: 'statfs', measuredAt: '2026-10-25T00:00:00Z', filesystem: { type: 'zfs' } }] } });
    if (url.pathname.endsWith('/tree')) {
      if (fail) return route.fulfill({ status: 503, body: '{}' });
      return respond({ status: 'success', data: { truncated: false, tree: [{ path: `/test/${version === 1 ? 'old' : 'new'}`, fileCount: 1, totalSize: version * 100 }, { path: '/testing/not-in-scope', fileCount: 99, totalSize: 999 }] } });
    }
    if (url.pathname.endsWith('/files')) return respond({ status: 'success', data: { files: [] } });
    if (url.pathname.endsWith('/janitor-strategy')) return respond(reportReady
      ? { status: 'success', data: { generatedAt: '2026-10-25T00:00:00Z', status: 'ready_for_review', summary: { verifiedGroups: 1, provenSavingsBytes: 50, candidateGroups: 0, candidateBytes: 0, filesToHash: 0, bytesToHash: 0, executableActions: 0 } } }
      : { status: 'success', data: { available: false, status: 'unavailable' } });
    if (url.pathname.endsWith('/janitor-groups')) return respond({ status: 'success', data: { report: { id: 'r1', generatedAt: '2026-10-25T00:00:00Z', status: 'ready_for_review' }, total: 1, offset: 0, limit: 20, nextOffset: null, scanBoundReached: false,
      groups: [{ sha256: 'b'.repeat(64), proof: 'sha256-current-metadata', size: 50, count: 2, provenSavingsBytes: 50, filesOmitted: 0, policySurvivorPath: '/test/new/a.bin', review: null, files: [{ path: '/test/new/a.bin' }, { path: '/test/new/sub/a.bin' }] }] } });
    throw new Error(`Unexpected route ${url}`);
  });
  await page.goto(`${server.url}?app=diskx`);
  await page.waitForFunction(`(() => { const s = (${app})(); return s?.loading === false && s.source === 'live'; })()`);
  assert.equal(await page.evaluate(() => JSON.parse(window.render_game_to_text()).application.focus.totalSize), 100);
  assert.deepEqual(await page.evaluate(`(${app})().volumes`), [{ id: 'test:vol', label: 'Media/Media', capacityBytes: 7380882554880, freeBytes: 4923464220572, source: 'measured' }], 'the live volume comes out of summary');
  const gauge = page.locator('[data-volumes] .gx-diskx-gauge');
  assert.match(await gauge.locator('.free').textContent(), /^4\.5 To libres$/, 'the gauge shows the agent-measured free space');
  assert.equal(await gauge.locator('.name').textContent(), 'Media/Media · UGFrank');
  assert.equal(await gauge.getAttribute('title'), 'test:vol · zfs');
  const provenance = gauge.locator('.provenance');
  assert.equal(await provenance.isVisible(), true, 'measurement provenance is visible without a tooltip');
  assert.match(await provenance.textContent(), /^Mesuré \(statfs\) le /);
  // A production-length `label · host` must not hide the host behind an ellipsis nor break the free figure
  // onto two lines (seen against the real gateway on 2026-10-26: "Media/Media · UGFra…", "4.5 To / libres").
  const head = await gauge.evaluate((node) => {
    const name = node.querySelector('.name'), free = node.querySelector('.free');
    return { nameClipped: name.scrollWidth > name.clientWidth + 1, freeLines: Math.round(free.getBoundingClientRect().height / parseFloat(getComputedStyle(free).fontSize)) };
  });
  assert.deepEqual(head, { nameClipped: false, freeLines: 1 }, `host readable, free figure on one line: ${JSON.stringify(head)}`);
  fail = true;
  await page.getByRole('button', { name: 'Actualiser', exact: true }).click();
  await page.waitForFunction(`(${app})()?.loading === false`);
  assert.match(await page.locator('[data-notice]').textContent(), /Lecture échouée/);
  fail = false; version = 2;
  await page.getByRole('button', { name: 'Actualiser', exact: true }).click();
  await page.waitForFunction(`(() => { const s = (${app})(); return s?.loading === false && s.focus.totalSize === 200; })()`);
  assert.equal((await page.evaluate(`(${app})().volumes`))[0].freeBytes, 4923464220472, 'refreshing the inventory refreshes the volume with it');
  const document = await page.evaluate(() => JSON.stringify(window.__GRAPHYSX__.exportDocument()));
  assert.ok(!document.includes('/mnt/media') && !document.includes('/testing'), 'no fixture or prefix-neighbor contamination');
  await page.getByRole('button', { name: 'Lire le dernier rapport', exact: true }).click();
  await page.getByText('Aucun rapport Janitor disponible. Aucun rapport généré ici.', { exact: true }).waitFor();
  reportReady = true;
  await page.getByRole('button', { name: 'Lire le dernier rapport', exact: true }).click();
  await page.waitForFunction(`(${app})()?.janitor.availability === 'ready'`);
  await page.locator('[data-janitor-live] details').first().evaluate(node => { node.open = true; });
  await page.getByRole('button', { name: 'Montrer dans la ville', exact: true }).first().click();
  await page.waitForFunction(`(() => { const s = (${app})(); return s?.loading === false && s.janitor.group?.places === 1; })()`);
  const liveGroup = await page.evaluate(`(${app})().janitor.group`);
  assert.deepEqual([liveGroup.scope, liveGroup.keep, liveGroup.links, liveGroup.freedBytes], ['/test', true, 0, 50], 'both copies in one district: kept, no arc, one extra freed logically');
  assert.deepEqual(errors, []);
  console.log('PASS: synthetic Janitor, duplicate group in the city (demo and served), read-only preview, mobile capture, atomic inventory refresh, retry, root boundary and absent report. No backend execution.');
} finally { await browser.close(); await server.close(); }
