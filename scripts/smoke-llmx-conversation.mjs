import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { applySmokeTimeout, launchSmokeBrowser, SMOKE_TIMEOUT } from './smoke-harness.mjs';
import { startStaticServer } from './static-server.mjs';

// Controller acceptance with intercepted HTTP and silent audio fixtures. This does not
// qualify real inference, microphone capture, acoustic playback, or homelab deployment.
const artifacts = process.env.SMOKE_ARTIFACTS || 'output/playwright/llmx-conversation';
const startedAt = Date.now();
mkdirSync(artifacts, { recursive: true });
const server = process.env.SMOKE_BASE ? null : await startStaticServer({ root: path.resolve('dist'), port: 0 });
const base = process.env.SMOKE_BASE || server.url;
const browser = await launchSmokeBrowser();
const reports = [];
const fixtures = [];
const selected = new Set((process.env.SMOKE_SCENARIOS || '').split(',').map(value => value.trim()).filter(Boolean));
for (const name of selected) assert.ok(['disabled', 'restore404', 'text', 'audio-intent', 'failed', 'uncertain', 'cleanup503', 'replay'].includes(name),
  'Unknown SMOKE_SCENARIOS entry: ' + name);
const run = name => selected.size === 0 || selected.has(name);
const reportName = 'llmx-conversation' + (selected.size ? '-' + [...selected].join('-') : '');
const savedId = 'smoke-remembered-session';
const savedTurn = '12345678-1234-1234-1234-123456789abc';
const laterFailedTurn = '22345678-1234-1234-1234-123456789abc';
const config = { enabled: true, schemaVersion: 1, openingVersion: 1,
  capabilities: { openingTurn: true, sceneContext: true, sceneProposals: false, interrupt: true, playbackSignals: true } };
const session = (sessionId, opening = null) => ({ sessionId, packId: 'personal_operator', scopeId: 'personal',
  turnCount: opening ? 1 : 0, llmx: { schemaVersion: 1, opening }, voice: { language: 'fr' } });
const speech = { provider: 'voxcpm2', voice: 'smoke-voice-a', language: 'fr' };
const reply = text => ({ text, language: 'fr', speech });
const envelope = data => JSON.stringify({ ok: true, status: 'success', data });

async function fixture(options = {}) {
  const scenarioStartedAt = Date.now();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
  applySmokeTimeout(page);
  const calls = [], errors = [], navigations = [], expectedHttpErrors = new Map();
  const sessions = new Map();
  let sequence = 0, currentSession = session(savedId);
  fixtures.push({ page, calls, errors, navigations });
  page.on('framenavigated', frame => { if (frame === page.mainFrame()) navigations.push(frame.url()); });
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => {
    if (message.type() !== 'error') return;
    const location = message.location().url;
    if (expectedHttpErrors.has(location) && message.text().includes(String(expectedHttpErrors.get(location)))) return;
    errors.push(message.text() + (location ? ' [' + location + ']' : ''));
  });
  await page.addInitScript(({ stored, audioMode, holdPlayback }) => {
    if (stored) localStorage.setItem('graphysx.llmx.session.v1', stored);
    const smoke = window.__LLMX_SMOKE__ = { audioMode, holdPlayback, resumeCalls: 0, played: [], chunks: 0,
      streams: {}, responses: {}, pendingAudio: [], completedGates: [] };
    // A DEV smoke must keep its mounted revision when another agent edits unrelated
    // source files. Disable only Vite's hot-reload socket, never product sockets.
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
    // Keep real Web Audio nodes for the world, but never resume a hardware output.
    // Only the deterministic resume state and the shared-player boundary are faked.
    const NativeContext = window.AudioContext;
    window.AudioContext = class extends NativeContext {
      get state() { return this.smokeState || 'suspended'; }
      resume() {
        smoke.resumeCalls++;
        if (smoke.audioMode === 'delayed') return new Promise(resolve => smoke.pendingAudio.push(() => {
          this.smokeState = 'running'; resolve();
        }));
        if (smoke.audioMode === 'running') this.smokeState = 'running';
        return Promise.resolve();
      }
    };
    smoke.releaseAudio = () => {
      smoke.audioMode = 'running';
      for (const release of smoke.pendingAudio.splice(0)) release();
    };
    smoke.releaseStream = name => {
      if (!smoke.streams[name]) throw new Error('Unknown stream gate: ' + name);
      smoke.streams[name](); delete smoke.streams[name];
    };
    smoke.releaseResponse = name => {
      if (!smoke.responses[name]) throw new Error('Unknown response gate: ' + name);
      smoke.responses[name](); delete smoke.responses[name];
    };
    const nativeFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const response = await nativeFetch(input, init);
      const holdResponse = response.headers.get('X-Smoke-Hold-Response');
      if (holdResponse) {
        // Deliberately deliver after caller abort, to exercise the controller's epoch check.
        await new Promise(resolve => { smoke.responses[holdResponse] = resolve; });
        smoke.completedGates.push(holdResponse);
      }
      if (!response.headers.get('content-type')?.includes('application/x-ndjson')) return response;
      const source = await response.text(), hold = response.headers.get('X-Smoke-Hold-Done');
      let cancelled = false;
      const body = new ReadableStream({
        start(controller) {
          const emit = text => {
            if (cancelled) return;
            const bytes = new TextEncoder().encode(text);
            for (let i = 0; i < bytes.length; i += 3) { controller.enqueue(bytes.slice(i, i + 3)); smoke.chunks++; }
          };
          if (hold) {
            const newline = source.indexOf('\n') + 1;
            emit(source.slice(0, newline));
            smoke.streams[hold] = () => { emit(source.slice(newline)); if (!cancelled) controller.close(); smoke.completedGates.push(hold); };
          } else { emit(source); controller.close(); }
        },
        cancel() { cancelled = true; }
      });
      return new Response(body, { status: response.status, headers: response.headers });
    };
  }, { stored: options.stored ? savedId : null, audioMode: options.audioMode || 'blocked', holdPlayback: options.holdPlayback === true });

  // Development boot probes this optional scene store even for a local LLMx page.
  // Keep that unrelated probe deterministic and offline; never reach a real store.
  await page.route('http://localhost:8788/scenes', route => {
    expectedHttpErrors.set(route.request().url(), 503);
    return route.fulfill({ status: 503, contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: 'Optional store fixture is offline' }) });
  });
  await page.route('**/llmx-api/**', async route => {
    const request = route.request(), url = new URL(request.url()), body = request.postDataJSON();
    const call = { path: url.pathname, method: request.method(), body };
    calls.push(call);
    const json = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: envelope(data) });
    if (url.pathname.endsWith('/config')) return json(options.disabled ? { enabled: false } : config);
    if (url.pathname.includes('/assets/')) {
      let script = '// LLMx smoke fixture: silent transport boundary.\n';
      if (url.pathname.endsWith('/voice-audio.js')) script += `window.VoixAudio = { Player: class {
        async play(input, signal) { const response = await input; signal.throwIfAborted();
          const receipt = { contentType: response.headers.get('content-type'), aborted: false };
          window.__LLMX_SMOKE__.played.push(receipt);
          if (window.__LLMX_SMOKE__.holdPlayback) await new Promise((resolve, reject) => {
            signal.addEventListener('abort', () => { receipt.aborted = true;
              sessionStorage.setItem('llmx-smoke-playback-aborts', String(Number(sessionStorage.getItem('llmx-smoke-playback-aborts') || 0) + 1));
              reject(new DOMException('Silent fixture playback stopped', 'AbortError')); }, { once: true });
          }); }
      } };`;
      if (url.pathname.endsWith('/browser-conversation.js')) script += `window.NestorConversation = {
        Conversation: class { start() { throw new Error('This smoke does not exercise microphone capture'); } },
        openAudio() { throw new Error('This smoke does not exercise microphone capture'); }
      };`;
      return route.fulfill({ contentType: 'text/javascript', body: script });
    }
    if (url.pathname.endsWith('/history')) {
      const requestedId = url.pathname.split('/').at(-2);
      if (sessions.has(requestedId)) return json({ session: sessions.get(requestedId), turns: [], history: [], lastReply: null });
      if (options.restore404 || requestedId !== savedId) {
        expectedHttpErrors.set(url.href, 404);
        return route.fulfill({ status: 404, contentType: 'application/json',
          body: JSON.stringify({ ok: false, message: 'Conversation LLMx introuvable.' }) });
      }
      const status = options.openingStatus || 'completed';
      currentSession = session(savedId, { version: 1, status, turnId: savedTurn, replyText: 'Hello, accueil sauvegardé.' });
      sessions.set(savedId, currentSession);
      return json({ session: currentSession, turns: [{ origin: 'application_opening', clientTurnId: savedTurn,
        inputText: '', replyText: 'Hello, accueil sauvegardé.', outcome: status === 'completed' ? 'completed' : 'failed' },
      ...(options.laterFailedTurn ? [{ origin: 'human', clientTurnId: laterFailedTurn,
        inputText: 'Question interrompue après l’accueil', replyText: 'Réponse jamais achevée', outcome: 'failed' }] : [])],
      history: [], lastReply: status === 'completed' ? { turnId: savedTurn, reply: reply('Hello, accueil sauvegardé.') } : null });
    }
    if (url.pathname === '/llmx-api/sessions') {
      currentSession = session('smoke-created-session-' + (++sequence));
      sessions.set(currentSession.sessionId, currentSession);
      return json({ session: currentSession }, 201);
    }
    if (url.pathname.endsWith('/opening') || url.pathname.endsWith('/turns/text')) {
      const opening = url.pathname.endsWith('/opening'), turnId = opening ? body.requestId : body.turnId;
      call.entrance = await page.evaluate(() => JSON.parse(window.render_game_to_text()).application.entrance.phase);
      const hold = !opening && body.text === 'Arrête ce tour';
      const text = opening ? 'Hello, bienvenue à la Forge.' : hold ? 'Cette fin ne doit jamais apparaître.' : 'Réponse à : ' + body.text;
      if (opening) currentSession = { ...currentSession, turnCount: 1,
        llmx: { schemaVersion: 1, opening: { version: 1, status: 'completed', turnId, replyText: text } } };
      else currentSession = { ...currentSession, turnCount: currentSession.turnCount + 1 };
      sessions.set(currentSession.sessionId, currentSession);
      const result = { session: currentSession, turnId, origin: opening ? 'application_opening' : 'human', reply: reply(text) };
      return route.fulfill({ contentType: 'application/x-ndjson',
        headers: hold ? { 'X-Smoke-Hold-Done': 'human-turn' } : {},
        body: JSON.stringify({ type: 'delta', delta: hold ? 'Brouillon en cours…' : text }) + '\n' +
          JSON.stringify({ type: 'done', data: result }) });
    }
    if (url.pathname.endsWith('/interrupt')) {
      if (options.cleanupFailure) expectedHttpErrors.set(url.href, 503);
      return json({ interrupted: !options.cleanupFailure, turnId: body.turnId }, options.cleanupFailure ? 503 : 200);
    }
    if (url.pathname.endsWith('/synthesize/stream')) {
      const count = calls.filter(call => call.path.endsWith('/synthesize/stream')).length;
      return route.fulfill({ contentType: 'audio/wav', body: 'silent-fixture',
        headers: count <= (options.holdSpeechResponses || 0) ? { 'X-Smoke-Hold-Response': 'speech-' + count } : {} });
    }
    errors.push('Unexpected backend call: ' + url.pathname);
    return route.fulfill({ status: 501, contentType: 'application/json', body: JSON.stringify({ ok: false }) });
  });
  const talk = action => page.locator(`[data-talk="${action}"]`);
  const messages = page.locator('#llmx-transcript');
  await page.goto(`${base}?app=llmx`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Forge nocturne', exact: true }).waitFor();
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).application.entrance.phase === 'ready');
  return { page, calls, errors, talk, messages,
    matching: suffix => calls.filter(call => call.path.endsWith(suffix)),
    async finish(name, expectedNavigations = 1) {
      assert.deepEqual(errors, [], `${name}: browser errors`);
      assert.equal(navigations.length, expectedNavigations, `${name}: the mounted application unexpectedly reloaded`);
      reports.push({ name, elapsedMs: Date.now() - scenarioStartedAt,
        calls: calls.map(call => ({ path: call.path, method: call.method })), browserErrors: errors });
      await page.close();
      console.log('ok: ' + name);
    }
  };
}

async function checkpoint(predicate) {
  const deadline = Date.now() + SMOKE_TIMEOUT;
  while (!predicate()) {
    if (Date.now() >= deadline) assert.fail('Expected fixture request did not arrive');
    await new Promise(resolve => setTimeout(resolve, 20));
  }
}
const playerCount = page => page.evaluate(() => window.__LLMX_SMOKE__.played.length);
const flush = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const waitIdle = page => page.waitForFunction(() => {
  const conversation = JSON.parse(window.render_game_to_text()).application.conversation;
  return conversation.state === 'idle' && !conversation.speech.playing;
});

try {
  if (run('disabled')) {
    const h = await fixture({ disabled: true });
    await h.page.getByText('La conversation est indisponible. La Forge reste ouverte.', { exact: true }).waitFor();
    assert.equal(await h.page.getByRole('textbox', { name: 'Ton message' }).isDisabled(), true);
    assert.equal(await h.talk('new').isDisabled(), true);
    assert.deepEqual(h.calls.map(call => call.path), ['/llmx-api/config']);
    await h.finish('disabled config leaves the Forge available without conversation requests');
  }
  if (run('restore404')) {
    const h = await fixture({ stored: true, restore404: true });
    await h.page.getByText('Conversation LLMx introuvable.', { exact: true }).waitFor();
    assert.equal(h.matching('/sessions').length, 0);
    assert.equal(await h.talk('new').isEnabled(), true);
    await h.talk('new').click();
    await h.messages.getByText('Hello, bienvenue à la Forge.', { exact: true }).waitFor();
    assert.equal(h.matching('/sessions').length, 1);
    assert.equal(h.matching('/opening').length, 1);
    assert.equal(h.matching('/interrupt').length, 0);
    await h.finish('explicit new conversation recovers a missing exact session');
  }
  if (run('text')) {
    const h = await fixture();
    await h.talk('text').waitFor({ state: 'visible' });
    assert.equal(h.matching('/opening').length, 0);
    await h.talk('text').click();
    await h.messages.getByText('Hello, bienvenue à la Forge.', { exact: true }).waitFor();
    assert.equal(h.matching('/opening')[0].entrance, 'ready');
    assert.equal(h.matching('/opening')[0].body.text, undefined);
    assert.equal(await h.messages.locator('.user').count(), 0);
    await h.page.getByRole('textbox', { name: 'Ton message' }).fill('Écoute, ça va ?');
    await h.talk('send').click();
    await h.messages.getByText('Réponse à : Écoute, ça va ?', { exact: true }).waitFor();
    assert.equal(h.matching('/sessions').length, 1);
    assert.ok(h.matching('/turns/text')[0].path.includes('/smoke-created-session-1/'));
    assert.ok(await h.page.evaluate(() => window.__LLMX_SMOKE__.chunks > 40));
    await h.page.getByRole('textbox', { name: 'Ton message' }).fill('Arrête ce tour');
    await h.talk('send').click();
    await h.messages.getByText('Brouillon en cours…', { exact: true }).waitFor();
    await h.talk('stop').click();
    await checkpoint(() => h.matching('/interrupt').length === 1);
    await h.page.evaluate(() => window.__LLMX_SMOKE__.releaseStream('human-turn'));
    await waitIdle(h.page); await flush(h.page);
    assert.equal(await h.messages.getByText('Cette fin ne doit jamais apparaître.', { exact: true }).count(), 0);
    assert.equal(await h.messages.getByText('Brouillon en cours…', { exact: true }).count(), 0);
    assert.equal(h.matching('/synthesize/stream').length, 0);
    assert.equal(await playerCount(h.page), 0);
    await h.page.screenshot({ path: path.join(artifacts, 'llmx-conversation-text.png') });
    await h.finish('text opening, split NDJSON, session continuity and stopped stale completion');
  }
  if (run('audio-intent')) {
    const h = await fixture({ audioMode: 'delayed' });
    await h.talk('text').waitFor({ state: 'visible' });
    await h.page.waitForFunction(() => window.__LLMX_SMOKE__.pendingAudio.length > 0);
    await h.talk('text').click();
    await h.messages.getByText('Hello, bienvenue à la Forge.', { exact: true }).waitFor();
    await h.page.evaluate(() => window.__LLMX_SMOKE__.releaseAudio());
    await flush(h.page);
    assert.equal(await h.talk('sound').getAttribute('aria-pressed'), 'false');
    assert.equal(h.matching('/opening').length, 1);
    assert.equal(h.matching('/synthesize/stream').length, 0);
    assert.equal(await playerCount(h.page), 0);
    await h.finish('choosing text defeats a late automatic audio enable');
  }
  for (const status of ['failed', 'uncertain']) {
    if (!run(status)) continue;
    const h = await fixture({ stored: true, openingStatus: status });
    await h.page.getByText('Conversation retrouvée. Reprends à ton rythme.', { exact: true }).waitFor();
    assert.equal(h.matching('/opening').length, 0);
    assert.equal(await h.talk('replay').isHidden(), true);
    await h.talk('new').click();
    await h.messages.getByText('Hello, bienvenue à la Forge.', { exact: true }).waitFor();
    assert.equal(h.matching('/sessions').length, 1);
    assert.equal(h.matching('/interrupt').length, 0);
    await h.finish(`explicit new conversation recovers a ${status} opening without replay`);
  }
  if (run('cleanup503')) {
    const h = await fixture({ cleanupFailure: true });
    await h.talk('text').waitFor({ state: 'visible' });
    await h.page.getByRole('textbox', { name: 'Ton message' }).fill('Arrête ce tour');
    await h.talk('send').click();
    await h.messages.getByText('Brouillon en cours…', { exact: true }).waitFor();
    await h.talk('stop').click();
    await checkpoint(() => h.matching('/interrupt').length > 0);
    await h.page.waitForFunction(() => JSON.parse(window.render_game_to_text()).application.conversation.state === 'error');
    await h.page.evaluate(() => window.__LLMX_SMOKE__.releaseStream('human-turn'));
    await h.talk('new').click();
    await h.page.waitForFunction(() => {
      const conversation = JSON.parse(window.render_game_to_text()).application.conversation;
      return conversation.available && conversation.state === 'idle';
    });
    assert.match(await h.page.locator('[data-status]').textContent(), /conversation précédente/);
    assert.equal(h.matching('/sessions').length, 2);
    assert.equal(h.matching('/opening').length, 0, 'unconfirmed old work must not start another automatic greeting');
    assert.equal(await h.talk('new').isEnabled(), true);
    await h.page.getByRole('textbox', { name: 'Ton message' }).fill('Nouvelle question');
    await h.talk('send').click();
    await h.messages.getByText('Réponse à : Nouvelle question', { exact: true }).waitFor();
    const turns = h.matching('/turns/text');
    assert.equal(turns.length, 2);
    assert.ok(turns[0].path.includes('/smoke-created-session-1/'));
    assert.ok(turns[1].path.includes('/smoke-created-session-2/'));
    assert.equal(h.matching('/synthesize/stream').length, 0);
    await h.finish('cleanup 503 leaves an honest warning and a usable explicit new conversation');
  }
  if (run('replay')) {
    const h = await fixture({ stored: true, audioMode: 'running', holdSpeechResponses: 2,
      laterFailedTurn: true, holdPlayback: true });
    await h.talk('replay').waitFor({ state: 'visible' });
    assert.equal(h.matching('/opening').length, 0);
    assert.equal(h.matching('/synthesize/stream').length, 0);
    await h.talk('replay').click();
    await h.page.waitForFunction(() => Boolean(window.__LLMX_SMOKE__.responses['speech-1']));
    await h.page.getByRole('button', { name: 'Environnements', exact: true }).click();
    await h.page.getByRole('dialog', { name: 'Vos environnements' }).getByRole('button', { name: 'Revenir au décor d’origine', exact: true }).click();
    await h.page.evaluate(() => window.__LLMX_SMOKE__.releaseResponse('speech-1'));
    await h.page.waitForFunction(() => window.__LLMX_SMOKE__.completedGates.includes('speech-1'));
    await flush(h.page);
    assert.equal(await playerCount(h.page), 0);
    await h.talk('replay').click();
    await h.page.waitForFunction(() => Boolean(window.__LLMX_SMOKE__.responses['speech-2']));
    await h.page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
      window.__LLMX_SMOKE__.releaseResponse('speech-2');
    });
    await h.page.waitForFunction(() => window.__LLMX_SMOKE__.completedGates.includes('speech-2'));
    await flush(h.page);
    assert.equal(await playerCount(h.page), 0);
    await h.page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
    await h.talk('replay').click();
    await h.page.waitForFunction(() => window.__LLMX_SMOKE__.played.length === 1);
    await h.talk('sound').click();
    await h.page.waitForFunction(() => window.__LLMX_SMOKE__.played[0].aborted);
    await checkpoint(() => h.matching('/interrupt').length === 3);
    assert.equal(await h.talk('sound').getAttribute('aria-pressed'), 'false');
    await h.talk('replay').click();
    await h.page.waitForFunction(() => window.__LLMX_SMOKE__.played.length === 2);
    await h.page.screenshot({ path: path.join(artifacts, 'llmx-conversation-replay.png') });
    await h.page.getByRole('button', { name: 'Quitter LLMx', exact: true }).click();
    await h.page.getByRole('button', { name: 'LLMx · Forge nocturne', exact: true }).waitFor();
    await checkpoint(() => h.matching('/interrupt').length === 4);
    // Exit deliberately loads the Center document. Keep the synchronous audio-stop
    // receipt across that real navigation rather than reading the discarded window.
    assert.equal(await h.page.evaluate(() => sessionStorage.getItem('llmx-smoke-playback-aborts')), '2');
    assert.equal(new URL(h.page.url()).searchParams.has('app'), false);
    const requests = h.matching('/synthesize/stream');
    assert.equal(requests.length, 4);
    for (const request of requests) assert.deepEqual(request.body,
      { text: 'Hello, accueil sauvegardé.', language: 'fr', provider: 'voxcpm2', voice: 'smoke-voice-a' });
    const interruptions = h.matching('/interrupt');
    assert.equal(interruptions.length, 4);
    assert.ok(interruptions.every(request => request.body.turnId === savedTurn),
      'stopping restored reply A must interrupt A, even when the newest audit is failed turn B');
    assert.equal(h.matching('/opening').length, 0);
    await h.finish('environment, visibility, mute and exit stop the exact restored reply and preserve its voice', 2);
  }
  writeFileSync(path.join(artifacts, reportName + '-report.json'), JSON.stringify({
    scope: 'Mounted LLMx controller, intercepted backend and silent audio fixtures; no live inference or acoustic acceptance',
    base, elapsedMs: Date.now() - startedAt, selected: [...selected], scenarios: reports
  }, null, 2) + '\n');
} catch (error) {
  writeFileSync(path.join(artifacts, reportName + '-failure.json'), JSON.stringify({
    error: String(error), elapsedMs: Date.now() - startedAt, completed: reports,
    fixtures: fixtures.map(({ calls, errors, navigations }) => ({ calls, errors, navigations }))
  }, null, 2) + '\n');
  for (const context of browser.contexts()) for (const page of context.pages()) {
    await page.screenshot({ path: path.join(artifacts, reportName + '-failure.png') }).catch(() => {});
  }
  throw error;
} finally {
  await browser.close();
  if (server) await server.close();
}
