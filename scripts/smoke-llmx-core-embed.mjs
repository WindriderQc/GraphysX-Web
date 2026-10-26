import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { startStaticServer } from './static-server.mjs';
import { launchSmokeBrowser, applySmokeTimeout } from './smoke-harness.mjs';

// The real release module on a Core-like origin. No model, microphone or audio.
const output = process.env.SMOKE_ARTIFACTS || 'output/playwright/llmx-core-embed';
mkdirSync(output, { recursive: true });
const server = await startStaticServer({ root: path.resolve('dist'), port: 0 });
const browser = await launchSmokeBrowser();
const origin = new URL(server.url).origin, calls = [], errors = [], unexpected = [];
try {
  for (const profile of ['personal', 'family']) {
    const context = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: profile === 'family' ? 390 : 1280, height: 800 } });
    await context.addCookies([{ name: 'agentx_family_device', value: 'synthetic-pin', url: origin }]);
    const page = applySmokeTimeout(await context.newPage());
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', e => { if (e.type() === 'error') errors.push(e.text()); });
    const prefix = '/api/consumers/nestor/v1/llmx' + (profile === 'family' ? '/family' : '');
    const session = { sessionId: '11111111-1111-4111-8111-111111111111', turnCount: 1,
      packId: profile === 'family' ? 'kidx_nestor' : 'personal_operator', scopeId: profile,
      llmx: { schemaVersion: 1, opening: { status: 'skipped' } } };
    await page.route('**/*', async route => {
      const req = route.request(), url = new URL(req.url());
      if (url.origin !== origin) { unexpected.push(url.href); return route.abort(); }
      if (url.pathname === '/llmx') return route.fulfill({ contentType: 'text/html',
        headers: { 'Content-Security-Policy': "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'" },
        body: '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}[data-llmx-root]{position:fixed;inset:0}</style><div data-llmx-root><p role="status">Chargement de la Forge…</p></div><script type="module" src="/embed/llmx-room.js"></script>' });
      if (url.pathname.startsWith(prefix + '/')) {
        calls.push({ profile, method: req.method(), path: url.pathname, cookie: req.headers().cookie });
        const json = data => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, data }) });
        if (url.pathname === prefix + '/config') return json({ schemaVersion: 1, enabled: true, capabilities: { openingTurn: false } });
        if (url.pathname === prefix + '/sessions') return json({ session });
        if (url.pathname.endsWith('/turns/text')) return json({ session, turnId: req.postDataJSON().turnId, reply: { text: 'La conversation et la Forge partagent Core.' } });
        if (url.pathname.endsWith('/history')) return json({ session, turns: [] });
      }
      if (url.pathname.startsWith('/api/household/llmx/assets/')) {
        const asset = '/assets/' + url.pathname.slice('/api/household/llmx/assets/'.length);
        return route.continue({ url: origin + asset });
      }
      if (url.pathname === '/embed/llmx-room.js') return route.continue();
      unexpected.push(url.pathname);
      return route.abort();
    });
    await page.goto(origin + '/llmx' + (profile === 'family' ? '?profile=family' : ''));
    const input = page.getByRole('textbox', { name: 'Ton message' });
    await input.waitFor();
    await page.waitForFunction(() => !document.querySelector('[data-text]').disabled);
    await input.fill('Explique notre scène.');
    await page.locator('[data-talk="send"]').click();
    await page.getByText('La conversation et la Forge partagent Core.', { exact: true }).waitFor();
    assert.equal(await page.getByText('Chargement de la Forge…', { exact: true }).count(), 0, 'the module replaces the host loading state');
    await page.waitForFunction(() => document.querySelector('canvas')?.width > 200);
    await page.screenshot({ path: path.join(output, `core-${profile}.png`), fullPage: true });
    const posted = calls.filter(c => c.profile === profile && c.method === 'POST');
    assert.equal(posted.filter(c => c.path.endsWith('/sessions')).length, 1);
    assert.equal(posted.filter(c => c.path.endsWith('/turns/text')).length, 1);
    assert.ok(calls.filter(c => c.profile === profile).every(c => c.cookie?.includes('agentx_family_device=synthetic-pin')), 'same-origin calls retain the Family pin');
    await context.close();
  }
  assert.deepEqual(unexpected, []);
  assert.deepEqual(errors, []);
  writeFileSync(path.join(output, 'receipt.json'), JSON.stringify({ calls, errors, unexpected, synthetic: true }, null, 2));
  console.log('PASS llmx-core-embed: personal/Family text, scoped routes, pin cookie, graphics and mobile; no external request');
} finally { await browser.close(); await server.close(); }
