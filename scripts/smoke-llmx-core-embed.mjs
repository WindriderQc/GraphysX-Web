import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { startStaticServer } from './static-server.mjs';
import { launchSmokeBrowser, applySmokeTimeout, useLightRender } from './smoke-harness.mjs';

// The real release module on a Core-like origin. No model, microphone or audio.
const output = process.env.SMOKE_ARTIFACTS || 'output/playwright/llmx-core-embed';
mkdirSync(output, { recursive: true });
const server = await startStaticServer({ root: path.resolve('dist'), port: 0 });
const browser = await launchSmokeBrowser();
const origin = new URL(server.url).origin, calls = [], errors = [], unexpected = [], layouts = [], receipts = [];
try {
  for (const profile of ['personal', 'family']) {
    const context = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: profile === 'family' ? 390 : 1280, height: 800 } });
    // Behaviour journey: routes, cookie, turn, assets and mobile reachability, not the desktop look.
    await useLightRender(context);
    await context.addCookies([{ name: 'agentx_family_device', value: 'synthetic-pin', url: origin }]);
    const page = applySmokeTimeout(await context.newPage());
    if (profile === 'personal') await page.addInitScript(() => {
      const probe = window.__llmxColdStart = {};
      const fetch = window.fetch;
      window.fetch = (...args) => {
        if (String(args[0]).endsWith('/llmx/config')) probe.configAt = performance.now();
        return fetch(...args);
      };
      const draw = WebGL2RenderingContext.prototype.drawElementsInstanced;
      WebGL2RenderingContext.prototype.drawElementsInstanced = function (...args) {
        if (probe.finishedAt === undefined && document.querySelector('.gx-llmx')) {
          probe.startedAt = performance.now();
          // A cold driver can block the main thread longer than the 15s network
          // deadline. Reproduce that ordering without a model or a slower timeout.
          while (performance.now() - probe.startedAt < 16_000) { /* cold compile */ }
          probe.finishedAt = performance.now();
        }
        return draw.apply(this, args);
      };
    });
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', e => { if (e.type() === 'error') errors.push(e.text()); });
    const prefix = '/api/consumers/nestor/v1/llmx' + (profile === 'family' ? '/family' : '');
    const reply = profile === 'family'
      ? 'Le cube cyan a été ajouté dans la zone de construction. Tu peux reprendre cette création avec Annuler, puis Rétablir. Le texte reste lisible et les commandes restent accessibles quand la conversation s’allonge.'
      : 'La conversation et la Forge partagent Core.';
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
        if (url.pathname.endsWith('/turns/text')) {
          const body = req.postDataJSON();
          return json({ session, turnId: body.turnId, reply: { text: reply, language: 'fr' },
            ...(profile === 'family' ? { sceneProposal: { schemaVersion: 1,
              environmentId: body.sceneContext.environment.id, revision: body.sceneContext.revision,
              intent: 'Ajouter un cube cyan', commands: [{ op: 'spawn', entity: { id: 'llmx-created-mobile-cube',
                type: 'box', geometry: { width: 0.65, height: 0.65, depth: 0.65 },
                material: { color: '#00c8d8' }, transform: { position: body.sceneContext.buildZone?.center ?? [4.6, 0.5, 3.4] },
                tags: ['llmx-creation'] } }] } } : {}) });
        }
        if (url.pathname.endsWith('/scene-receipts')) { const receipt = req.postDataJSON(); receipts.push(receipt); return json(receipt); }
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
    if (profile === 'personal') {
      await page.waitForFunction(() => window.__llmxColdStart?.finishedAt !== undefined
        && window.__llmxColdStart?.configAt !== undefined);
      const cold = await page.evaluate(() => window.__llmxColdStart);
      assert.ok(cold.configAt >= cold.finishedAt, JSON.stringify({ message: 'the network deadline starts after cold rendering', cold }));
    }
    const input = page.getByRole('textbox', { name: 'Ton message' });
    await input.waitFor();
    await page.waitForFunction(() => !document.querySelector('[data-text]').disabled);
    await input.fill(profile === 'family' ? 'Ajoute un cube cyan dans la zone de construction. Garde notre conversation et les commandes accessibles pendant que nous continuons cette création. '.repeat(3) : 'Explique notre scène.');
    await page.locator('[data-talk="send"]').click();
    await page.getByText(reply, { exact: true }).waitFor();
    assert.equal(await page.getByText('Chargement de la Forge…', { exact: true }).count(), 0, 'the module replaces the host loading state');
    await page.waitForFunction(() => document.querySelector('canvas')?.width > 200);
    await page.screenshot({ path: path.join(output, `core-${profile}.png`), fullPage: true });
    if (profile === 'family') {
      await page.locator('[data-action="undo"]:not([hidden])').waitFor();
      await page.waitForFunction(() => !document.querySelector('[data-talk="send"]').disabled);
      assert.equal(receipts.length, 1);
      assert.equal(receipts[0].status, 'applied');
      for (const [width, height] of [[320, 568], [390, 844], [600, 800]]) {
        await page.setViewportSize({ width, height });
        // One page call per size instead of two per control. Each Playwright call waits on
        // several rendered frames, about 3 s apiece on a software renderer. The checks are
        // unchanged: after the resize settles, each control must match exactly once, have a
        // box, scroll into view (centred if needed, as Playwright does) and win the hit test.
        const reach = await page.evaluate(async selectors => {
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          return selectors.map(selector => {
            const matches = document.querySelectorAll(selector);
            if (matches.length !== 1) return { selector, reachable: false, detail: `${matches.length} matches` };
            const element = matches[0];
            element.scrollIntoViewIfNeeded(true);
            const r = element.getBoundingClientRect(), hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
            return { selector, reachable: r.width > 0 && r.height > 0 && (hit === element || element.contains(hit)), detail: hit?.outerHTML.slice(0, 80) ?? 'nothing' };
          });
        }, ['[data-action="save"]', '[data-action="math"]', '[data-action="undo"]', '[data-action="redo"]', '[data-action="face"]', '[data-text]', '[data-talk="send"]', '[data-talk="microphone"]', '[data-talk="history"]']);
        for (const { selector, reachable, detail } of reach) assert.ok(reachable, `${width}x${height}: ${selector} is reachable (hit: ${detail})`);
        const layout = await page.evaluate(() => {
          const rect = selector => { const e = document.querySelector(selector), r = e.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
          return { input: rect('[data-text]'), send: rect('[data-talk="send"]'), microphone: rect('[data-talk="microphone"]'),
            transcript: rect('.gx-llmx-transcript'), heading: rect('.gx-llmx-talk-heading'), edits: rect('.gx-llmx-edit-actions'),
            portrait: rect('.gx-llmx-face-inset'), scrollWidth: document.documentElement.scrollWidth };
        });
        layouts.push({ width, height, ...layout });
        assert.ok(Math.abs(layout.input.y - layout.send.y) < 1 && Math.abs(layout.input.y - layout.microphone.y) < 1, 'text and voice share one composer row');
        assert.ok(layout.transcript.bottom <= layout.heading.y, 'the transcript does not cover the status or controls');
        assert.ok(layout.edits.bottom <= layout.transcript.y, 'undo and redo do not cover messages');
        if (layout.portrait.height) assert.ok(layout.portrait.bottom <= layout.transcript.y, 'the portrait does not cover messages');
        assert.ok(layout.scrollWidth <= width, 'no document-wide horizontal overflow');
        await page.screenshot({ path: path.join(output, `core-family-${width}x${height}.png`), fullPage: true });
      }
    }
    const posted = calls.filter(c => c.profile === profile && c.method === 'POST');
    assert.equal(posted.filter(c => c.path.endsWith('/sessions')).length, 1);
    assert.equal(posted.filter(c => c.path.endsWith('/turns/text')).length, 1);
    assert.ok(calls.filter(c => c.profile === profile).every(c => c.cookie?.includes('agentx_family_device=synthetic-pin')), 'same-origin calls retain the Family pin');
    await context.close();
  }
  assert.deepEqual(unexpected, []);
  assert.deepEqual(errors, []);
  writeFileSync(path.join(output, 'receipt.json'), JSON.stringify({ calls, errors, unexpected, layouts, receipts, synthetic: true }, null, 2));
  console.log('PASS llmx-core-embed: personal/Family text, scoped routes, pin cookie, graphics and mobile; no external request');
} finally { await browser.close(); await server.close(); }
