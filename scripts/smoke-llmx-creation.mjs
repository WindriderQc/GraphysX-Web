import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { applySmokeTimeout, launchSmokeBrowser, SMOKE_TIMEOUT } from './smoke-harness.mjs';
import { startStaticServer } from './static-server.mjs';

// Mounted product controls and native scene reads. HTTP fixtures replace only AgentX;
// no application state injection, scene API writes, inference or acoustic acceptance.
const artifacts = process.env.SMOKE_ARTIFACTS || 'output/playwright/llmx-creation';
mkdirSync(artifacts, { recursive: true });
const startedAt = Date.now();
const server = process.env.SMOKE_BASE ? null : await startStaticServer({ root: path.resolve('dist'), port: 0 });
const base = process.env.SMOKE_BASE || server.url;
const browser = await launchSmokeBrowser();
const calls = [], errors = [], snapshots = [], navigations = [];
const sessions = new Map(), expectedHttpErrors = new Set();
let sessionSequence = 0, originalProposal = null;
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
applySmokeTimeout(page);
const action = name => page.locator(`[data-action="${name}"]`);
const talk = name => page.locator(`[data-talk="${name}"]`);
const matching = suffix => calls.filter(call => call.path.endsWith(suffix));
const envelope = data => JSON.stringify({ ok: true, status: 'success', data });

page.on('framenavigated', frame => { if (frame === page.mainFrame()) navigations.push(frame.url()); });
page.on('pageerror', error => errors.push(String(error)));
page.on('console', message => {
  if (message.type() !== 'error') return;
  const location = message.location().url;
  if (expectedHttpErrors.has(location) && message.text().includes('503')) return;
  errors.push(message.text() + (location ? ` [${location}]` : ''));
});

async function checkpoint(predicate) {
  const deadline = Date.now() + SMOKE_TIMEOUT;
  while (!predicate()) {
    if (Date.now() >= deadline) assert.fail('Expected fixture receipt did not arrive');
    await new Promise(resolve => setTimeout(resolve, 20));
  }
}

async function ready(profile = 'personal') {
  await page.waitForFunction(expected => {
    if (!window.render_game_to_text) return false;
    const state = JSON.parse(window.render_game_to_text()).application;
    return state?.application === 'llmx' && state.profile === expected && state.entrance.phase === 'ready'
      && state.conversation.available;
  }, profile);
  await page.locator('[data-text]:enabled').waitFor();
  assert.equal(await talk('sound').getAttribute('aria-pressed'), 'false');
}

async function observe(name) {
  const observed = await page.evaluate(() => {
    const api = window.__GRAPHYSX__, document = api.exportDocument(), runtime = api.state();
    const application = JSON.parse(window.render_game_to_text()).application;
    // Native load sorts parent dependencies; compare every entity field by identity, not insertion order.
    const created = document.entities.filter(entity => entity.id?.startsWith('llmx-created-')).sort((a, b) => a.id.localeCompare(b.id));
    const units = created.filter(entity => entity.tags?.includes('llmx-math-unit'));
    const root = created.find(entity => entity.id === 'llmx-created-math');
    const readTag = key => root?.tags?.find(tag => tag.startsWith(`llmx-math:${key}:`))?.split(':').at(-1);
    return {
      application: { profile: application.profile, activeId: application.activeId, worldName: application.worldName,
        revision: application.revision, math: application.math, lastAction: application.lastAction },
      runtimeRevision: runtime.revision, commits: api.history(), created,
      protectedEntities: document.entities.filter(entity => !entity.id?.startsWith('llmx-created-')),
      math: root ? { operation: readTag('operation'), left: Number(readTag('left')), right: Number(readTag('right')),
        step: Number(readTag('step')), total: units.length,
        leftCount: units.filter(entity => entity.tags.includes('llmx-math:zone:left')).length,
        rightCount: units.filter(entity => entity.tags.includes('llmx-math:zone:right')).length,
        units: units.map(entity => ({ id: entity.id, position: entity.transform.position, scale: entity.transform.scale,
          visible: entity.visible !== false, tags: entity.tags })) } : null,
    };
  });
  snapshots.push({ name, ...observed });
  console.log(`creation checkpoint: ${name} (${Date.now() - startedAt} ms)`);
  return observed;
}

function assertMath(snapshot, step) {
  assert.ok(snapshot.math, 'the exercise must be authored in the native world');
  const { units, ...math } = snapshot.math;
  assert.deepEqual(math, { operation: 'add', left: 2, right: 3, step, total: 5, leftCount: 2 + step, rightCount: 3 - step });
  assert.deepEqual(snapshot.application.math, { operation: 'add', left: 2, right: 3, step });
  assert.equal(new Set(units.map(unit => unit.id)).size, 5);
  assert.equal(new Set(units.map(unit => JSON.stringify(unit.scale))).size, 1, 'counted cubes have equal size');
  assert.equal(new Set(units.map(unit => unit.position[1])).size, 1, 'counted cubes occupy one layer');
  assert.ok(units.every(unit => unit.visible));
  for (let i = 0; i < units.length; i++) for (let j = i + 1; j < units.length; j++) {
    assert.ok([0, 2].some(axis => Math.abs(units[i].position[axis] - units[j].position[axis])
      >= (units[i].scale[axis] + units[j].scale[axis]) / 2), 'counted cube footprints must not overlap');
  }
}

async function send(text, expectedStatus) {
  const sentBefore = matching('/turns/text').length, receiptsBefore = matching('/scene-receipts').length;
  await page.locator('[data-text]').fill(text);
  await talk('send').click();
  await checkpoint(() => matching('/scene-receipts').length === receiptsBefore + 1);
  await page.waitForFunction(() => !document.querySelector('[data-talk="send"]').disabled);
  assert.equal(matching('/turns/text').length, sentBefore + 1, 'one request per human submission');
  const turn = matching('/turns/text').at(-1), receipt = matching('/scene-receipts').at(-1);
  assert.equal(receipt.body.turnId, turn.body.turnId, 'receipt belongs to the exact completed human turn');
  assert.equal(receipt.body.status, expectedStatus);
  assert.ok(receipt.body.message?.trim());
  assert.equal(receipt.path.split('/').at(-2), turn.path.split('/').at(-3), 'receipt stays in the same session');
  return { turn, receipt };
}

async function prepareAddition() {
  await action('math').click();
  const settings = page.locator('[data-math-settings]');
  if (await settings.getAttribute('open') === null) await settings.locator('summary').click();
  await page.locator('[data-math-operation]').selectOption('add');
  await page.locator('[data-math-left]').fill('2');
  await page.locator('[data-math-right]').fill('3');
  await page.locator('[data-math-form] button[type="submit"]').click();
  await page.locator('[data-math-lesson]:not([hidden])').waitFor();
}

async function openLibrary() {
  await action('environments').click();
  await page.locator('dialog[open]').waitFor();
}

try {
  await page.addInitScript(() => {
    // Hold only the DEV HMR connection so an independently edited source file cannot
    // reload the fixture. No application commands or document state are replaced.
    const NativeWebSocket = window.WebSocket;
    window.WebSocket = class extends NativeWebSocket {
      constructor(url, protocols) {
        if (protocols === 'vite-hmr') {
          const socket = new EventTarget();
          Object.assign(socket, { url: String(url), protocol: 'vite-hmr', readyState: 1, OPEN: 1, send() {}, close() {} });
          queueMicrotask(() => socket.dispatchEvent(new Event('open')));
          return socket;
        }
        super(url, protocols);
      }
    };
    const NativeContext = window.AudioContext;
    window.AudioContext = class extends NativeContext {
      get state() { return 'suspended'; }
      resume() { return Promise.resolve(); }
    };
  });
  await page.route('http://localhost:8788/scenes', route => {
    expectedHttpErrors.add(route.request().url());
    return route.fulfill({ status: 503, contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: 'Optional scene store fixture is offline' }) });
  });
  await page.route('**/llmx-api/**', async route => {
    const request = route.request(), url = new URL(request.url()), body = request.postDataJSON();
    const profile = url.pathname.startsWith('/llmx-api/family/') ? 'family' : 'personal';
    const call = { path: url.pathname, method: request.method(), body, profile };
    calls.push(call);
    const json = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: envelope(data) });
    if (url.pathname.endsWith('/config')) return json({ enabled: true, schemaVersion: 1, openingVersion: 1,
      capabilities: { openingTurn: true, sceneContext: true, sceneProposals: true, interrupt: true, playbackSignals: true } });
    if (url.pathname.includes('/assets/')) return route.fulfill({ contentType: 'text/javascript',
      body: 'window.VoixAudio={Player:class{play(){throw new Error("Creation smoke must remain silent")}}};' });
    if (url.pathname.endsWith('/sessions')) {
      const session = { sessionId: `creation-${profile}-${++sessionSequence}`, packId: profile === 'family' ? 'kidx_nestor' : 'personal_operator',
        scopeId: profile, turnCount: 0, llmx: { schemaVersion: 1 }, voice: { language: 'fr' } };
      sessions.set(session.sessionId, { session, turns: [], lastReply: null });
      return json({ session }, 201);
    }
    const address = /\/sessions\/([^/]+)\/(history|turns\/text|scene-receipts|interrupt)$/.exec(url.pathname);
    if (address) {
      const stored = sessions.get(address[1]);
      assert.ok(stored, 'only fixture-created sessions may be accessed');
      assert.equal(stored.session.scopeId, profile, 'Family must never address a personal conversation');
      if (address[2] === 'history') return json(stored);
      if (address[2] === 'interrupt') return json({ interrupted: true, turnId: body.turnId });
      if (address[2] === 'scene-receipts') {
        const turn = stored.turns.find(turn => turn.clientTurnId === body.turnId);
        assert.ok(turn, 'receipt must refer to a completed fixture turn');
        assert.equal(turn.receipt, undefined, 'a completed turn must not be applied twice');
        turn.receipt = structuredClone(body);
        if (body.status === 'rejected' || turn.math) {
          turn.replyText = body.message;
          stored.lastReply = { turnId: body.turnId, reply: { text: body.message, language: 'fr',
            speech: { provider: 'kokoro', voice: 'ff_siwis', language: 'fr' } } };
        }
        return json(body);
      }
      if (address[2] === 'turns/text') {
        const observation = body.sceneContext;
        const current = { schemaVersion: 1, environmentId: observation.environment.id, revision: observation.revision,
          intent: 'Créer un petit cube bleu', commands: [{ op: 'spawn', entity: { id: 'llmx-created-smoke-cube', type: 'box',
            transform: { position: observation.buildZone.center.map((value, axis) => value + (axis === 1 ? .35 : 0)), scale: [.4, .4, .4] },
            material: { color: '#44aaff' } } }] };
        const stale = body.text.startsWith('Ancien contexte');
        const math = body.text === 'Montre 2 plus 3 avec les cubes.';
        const sceneProposal = math ? { schemaVersion: 1, environmentId: observation.environment.id, revision: observation.revision,
          intent: 'Expliquer deux plus trois', math: { operation: 'add', left: 2, right: 3, step: 0 } }
          : stale ? structuredClone(originalProposal) : current;
        assert.ok(sceneProposal, 'a stale response requires a previously observed world');
        if (!originalProposal) originalProposal = structuredClone(current);
        const text = math ? 'Two plus three make six.' : stale ? 'Cette ancienne création est maintenant en place.' : 'Le cube bleu est en place.';
        stored.session.turnCount++;
        const reply = math ? { text, language: 'en', speech: { provider: 'kokoro', voice: 'am_michael', language: 'en' } }
          : { text, language: 'fr' };
        stored.turns.push({ origin: 'human', clientTurnId: body.turnId, inputText: body.text, replyText: text, outcome: 'completed', math });
        stored.lastReply = { turnId: body.turnId, reply };
        return json({ session: stored.session, turnId: body.turnId, origin: 'human', reply, sceneProposal });
      }
    }
    errors.push('Unexpected backend call: ' + url.pathname);
    return route.fulfill({ status: 501, contentType: 'application/json', body: JSON.stringify({ ok: false }) });
  });

  const url = new URL(base); url.searchParams.set('app', 'llmx');
  await page.goto(url.href, { waitUntil: 'domcontentloaded' });
  await ready();
  const initial = await observe('initial');
  assert.equal(initial.created.length, 0);
  const accepted = await send('Crée un cube bleu.', 'applied');
  assert.deepEqual(accepted.receipt.body.entityIds, ['llmx-created-smoke-cube']);
  const created = await observe('accepted-human-creation');
  assert.equal(created.created.length, 1);
  assert.equal(created.created[0].id, 'llmx-created-smoke-cube');
  assert.deepEqual(created.protectedEntities, initial.protectedEntities);
  assert.equal(created.commits.length, initial.commits.length + 1);
  assert.equal(created.commits.at(-1).id, 'llmx-turn-' + accepted.turn.body.turnId);
  assert.equal(created.commits.at(-1).commandCount, 1);
  await action('undo').click();
  assert.equal((await observe('native-undo-creation')).created.length, 0);
  await action('redo').click();
  assert.deepEqual((await observe('native-redo-creation')).created, created.created);
  await action('undo').click();
  const beforeStale = await observe('before-stale-after-undo');
  const stale = await send('Ancien contexte après annulation.', 'rejected');
  assert.deepEqual(stale.receipt.body.entityIds, []);
  const rejected = await observe('stale-after-undo-rejected');
  assert.deepEqual(rejected.created, beforeStale.created);
  assert.deepEqual(rejected.commits, beforeStale.commits);
  assert.equal(await page.locator('#llmx-transcript').getByText('Cette ancienne création est maintenant en place.', { exact: true }).count(), 0,
    'the transcript must show the observed rejection, not the unfulfilled proposal');
  await action('redo').click();
  assert.deepEqual((await observe('redo-survives-rejection')).created, created.created);

  const historyBeforeMath = matching('/history').length;
  const mathTurn = await send('Montre 2 plus 3 avec les cubes.', 'applied');
  assert.match(mathTurn.receipt.body.message, /2 cubes et 3 cubes/);
  assert.equal(await page.locator('#llmx-transcript').getByText('Two plus three make six.', { exact: true }).count(), 0,
    'a model arithmetic error must not survive in the displayed or replayable response');
  assert.equal(matching('/history').length, historyBeforeMath + 1,
    'the French math outcome resolves the exact session voice after replacing an English model reply');
  const taught = await observe('human-math-proposal'); assertMath(taught, 0);
  assert.equal(await page.locator('#llmx-transcript').isVisible(), false,
    'opening the math table keeps every counted cube clear of the transcript');
  const table = taught.created.find(entity => entity.id === 'llmx-created-math');
  const ordinaryCube = taught.created.find(entity => entity.id === 'llmx-created-smoke-cube');
  assert.ok(Math.abs(table.transform.position[0] - ordinaryCube.transform.position[0]) > 5,
    'an earlier ordinary creation must not sit among the counted units');
  await prepareAddition();
  const math0 = await observe('math-two-plus-three-step-0'); assertMath(math0, 0);
  await action('math-next').click();
  const math1 = await observe('math-step-1'); assertMath(math1, 1);
  assert.equal(math1.math.units.filter(unit => JSON.stringify(unit.position)
    !== JSON.stringify(math0.math.units.find(previous => previous.id === unit.id).position)).length, 1);
  assert.equal(math1.commits.length, math0.commits.length + 1, 'a user step creates one native commit');
  await action('undo').click(); assertMath(await observe('math-step-undo'), 0);
  await action('redo').click(); assertMath(await observe('math-step-redo'), 1);
  await page.screenshot({ path: path.join(artifacts, 'llmx-creation-math-desktop.png') });
  await action('math-next').click(); assertMath(await observe('math-step-2'), 2);
  await action('math-next').click();
  const finalMath = await observe('math-result-five'); assertMath(finalMath, 3);
  assert.equal(await action('math-next').isDisabled(), true);
  assert.match(await page.locator('[data-math-result]').textContent(), /5 cubes/);

  await action('math-close').click();
  await openLibrary();
  await page.locator('[data-world-name]').fill('Somme cinq');
  await action('save-as').click();
  const saved = await observe('named-original');
  assert.equal(saved.application.worldName, 'Somme cinq');
  assert.ok(saved.application.activeId);
  await page.locator('[data-world-name]').fill('Somme copie');
  await action('duplicate').click();
  const copyId = await page.locator('[data-worlds]').inputValue();
  assert.notEqual(copyId, saved.application.activeId);
  assert.equal((await observe('duplicate-does-not-switch-world')).application.activeId, saved.application.activeId);
  await page.locator('[data-world-name]').fill('Somme bis');
  await action('rename').click();
  assert.equal(await page.locator('[data-worlds] option').count(), 2);
  assert.match(await page.locator('[data-worlds]').textContent(), /Somme cinq/);
  assert.match(await page.locator('[data-worlds]').textContent(), /Somme bis/);
  await page.screenshot({ path: path.join(artifacts, 'llmx-creation-library.png') });
  await action('load').click();
  await page.getByRole('heading', { name: 'Somme bis', exact: true }).waitFor();
  assert.equal((await observe('open-renamed-copy')).application.activeId, copyId);
  await page.reload({ waitUntil: 'domcontentloaded' }); await ready();
  const reloaded = await observe('reload-named-math'); assertMath(reloaded, 3);
  assert.equal(reloaded.application.activeId, copyId);
  assert.deepEqual(reloaded.created, finalMath.created);
  await send('Ancien contexte après changement de monde.', 'rejected');
  const worldRejected = await observe('stale-after-world-change-rejected');
  assert.deepEqual(worldRejected.created, reloaded.created);
  assert.deepEqual(worldRejected.commits, reloaded.commits);
  await openLibrary();
  await page.locator('[data-worlds]').selectOption(saved.application.activeId);
  await action('load').click();
  await page.getByRole('heading', { name: 'Somme cinq', exact: true }).waitFor();
  assertMath(await observe('reopen-original-named-world'), 3);

  const profileCallStart = calls.length;
  await action('profile').click(); await ready('family');
  const familyInitial = await observe('family-isolated-initial');
  assert.equal(familyInitial.created.length, 0, 'Family must not import the personal world or draft');
  await openLibrary();
  assert.equal(await page.locator('[data-worlds] option').count(), 0, 'Family must not list personal saves');
  await action('close').click();
  await prepareAddition();
  await action('math-next').click();
  assertMath(await observe('family-math-step-1'), 1);
  await page.setViewportSize({ width: 390, height: 844 });
  await action('math-close').click(); await action('math').click();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'mobile page must not overflow horizontally');
  const nextBounds = await action('math-next').boundingBox();
  assert.ok(nextBounds && nextBounds.x >= 0 && nextBounds.x + nextBounds.width <= 390 && nextBounds.y >= 0
    && nextBounds.y + nextBounds.height <= 844, 'the next cube control must remain visible on mobile');
  await page.screenshot({ path: path.join(artifacts, 'llmx-creation-math-mobile.png') });
  await action('math-close').click();
  await page.setViewportSize({ width: 1280, height: 800 });
  await openLibrary();
  await page.locator('[data-world-name]').fill('Famille cubes');
  await action('save-as').click();
  assert.equal(await page.locator('[data-worlds] option').count(), 1);
  assert.match(await page.locator('[data-worlds]').textContent(), /Famille cubes/);
  await action('close').click();
  const familyCalls = calls.slice(profileCallStart).filter(call => !call.path.includes('/assets/'));
  assert.ok(familyCalls.length > 0);
  assert.ok(familyCalls.every(call => call.path.startsWith('/llmx-api/family/')), 'Family traffic stays on the scoped route');
  await action('profile').click(); await ready();
  const personalReturn = await observe('personal-restored-after-family'); assertMath(personalReturn, 3);
  assert.equal(personalReturn.application.activeId, saved.application.activeId);
  await openLibrary();
  assert.equal(await page.locator('[data-worlds] option').count(), 2);
  assert.doesNotMatch(await page.locator('[data-worlds]').textContent(), /Famille cubes/);
  await action('close').click();
  assert.equal(matching('/scene-receipts').length, 4, 'only human scene proposals produce backend receipts');
  assert.equal(matching('/synthesize/stream').length, 0, 'this journey must never request audio');
  assert.equal(matching('/opening').length, 0, 'there is no synthetic opening in this journey');
  assert.deepEqual(errors, []);
  writeFileSync(path.join(artifacts, 'llmx-creation-report.json'), JSON.stringify({
    scope: 'Mounted creation, arithmetic and library controls; intercepted AgentX HTTP, audio off, native API reads only',
    base, elapsedMs: Date.now() - startedAt, calls, navigations, snapshots, browserErrors: errors,
  }, null, 2) + '\n');
  console.log('ok: native creation receipts, stale rejection, arithmetic steps, undo/redo, named worlds and Family isolation');
} catch (error) {
  writeFileSync(path.join(artifacts, 'llmx-creation-failure.json'), JSON.stringify({
    error: String(error), elapsedMs: Date.now() - startedAt, calls, navigations, snapshots, browserErrors: errors,
  }, null, 2) + '\n');
  await page.screenshot({ path: path.join(artifacts, 'llmx-creation-failure.png') }).catch(() => {});
  throw error;
} finally {
  await browser.close();
  if (server) await server.close();
}
