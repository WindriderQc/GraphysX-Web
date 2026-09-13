import { test } from 'node:test';
import assert from 'node:assert/strict';
import { importBrowserModule } from './support/import-browser-module.mjs';

const { LlmXConversationClient, LLMX_SESSION_STORAGE_KEY, llmxSceneContext } =
  await importBrowserModule(new URL('../src/llmx-conversation-client.ts', import.meta.url));
const scene = { schemaVersion: 1, environment: { id: 'night-forge', name: 'Forge nocturne' },
  selectedEntityIds: ['cube'], entities: [{ id: 'cube', type: 'box', position: [1, 2, 3] }] };
const config = { enabled: true, schemaVersion: 1, openingVersion: 1,
  capabilities: { openingTurn: true, sceneContext: true, sceneProposals: false, interrupt: true } };
const turnId = '01234567-89ab-cdef-0123-456789abcdef';
const secondId = '11234567-89ab-cdef-0123-456789abcdef';
const session = (id = 'llmx-owned-session', extra = {}) => ({ sessionId: id, packId: 'personal_operator',
  scopeId: 'personal', turnCount: 0, llmx: { schemaVersion: 1, opening: null }, ...extra });
const json = (data, status = 200) => new Response(JSON.stringify({ ok: true, status: 'success', data }),
  { status, headers: { 'Content-Type': 'application/json' } });
const stream = (events) => new Response(events.map(event => typeof event === 'string' ? event : JSON.stringify(event)).join('\n'),
  { headers: { 'Content-Type': 'application/x-ndjson' } });
const result = (id = turnId, text = 'Bonjour.', extra = {}) => ({ session: session(), turnId: id,
  origin: 'human', reply: { text, language: 'fr', speech: { provider: 'kokoro', voice: 'ff_siwis' } }, ...extra });
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
};
const tick = () => new Promise(resolve => setImmediate(resolve));
const until = async (predicate) => {
  for (let i = 0; i < 20 && !predicate(); i++) await tick();
  assert.ok(predicate(), 'expected asynchronous checkpoint');
};
function memory(saved = null) {
  const values = new Map(saved ? [[LLMX_SESSION_STORAGE_KEY, saved]] : []);
  return { values, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key) };
}
function harness(route, options = {}) {
  const calls = [], storage = options.storage ?? memory();
  const client = new LlmXConversationClient({ storage, ...options, fetch: async (url, init = {}) => {
    const call = { url, init, body: init.body ? JSON.parse(init.body) : undefined };
    calls.push(call);
    if (url === '/llmx-api/config') return json(config);
    if (url === '/llmx-api/sessions') return json({ session: session() }, 201);
    return route(call, calls);
  } });
  return { client, calls, storage };
}
const turnCalls = calls => calls.filter(call => /\/turns\/text$|\/opening$/.test(call.url));

test('disabled configuration makes no session, history, opening or turn request', async () => {
  const calls = [];
  const client = new LlmXConversationClient({ storage: memory('private-other'), fetch: async (url) => {
    calls.push(url); return json({ enabled: false });
  } });
  assert.equal(await client.initialize(), null);
  assert.equal(await client.opening(scene), null);
  await assert.rejects(client.send('Salut', scene), /pas configurée/);
  assert.equal(client.state, 'disabled');
  assert.deepEqual(calls, ['/llmx-api/config']);
});

test('initialization creates one dedicated French session without an automatic opening', async () => {
  const h = harness(() => assert.fail('unexpected request'));
  const [a, b] = await Promise.all([h.client.initialize(), h.client.initialize()]);
  assert.equal(a.sessionId, b.sessionId);
  assert.equal(h.calls.length, 2);
  assert.deepEqual(h.calls[1].body, { language: 'fr', label: 'LLMx · Forge nocturne' });
  assert.equal(h.storage.getItem(LLMX_SESSION_STORAGE_KEY), 'llmx-owned-session');
  assert.deepEqual(h.client.history, []);
  assert.equal(h.client.state, 'idle');
});

test('restore loads only the exact LLMx session and uses audits without a fake human greeting', async () => {
  const restored = session('exact-session', { turnCount: 1,
    llmx: { schemaVersion: 1, opening: { version: 1, status: 'completed', turnId } } });
  const h = harness(call => {
    assert.equal(call.url, '/llmx-api/sessions/exact-session/history');
    return json({ session: restored, turns: [{ clientTurnId: turnId, origin: 'application_opening',
      inputText: '[application event]', replyText: 'Hello, bienvenue.', interrupted: false }],
      history: [{ role: 'user', content: 'Synthetic Hello must not be used.' }] });
  }, { storage: memory('exact-session') });
  await h.client.initialize();
  assert.deepEqual(h.client.history, [{ role: 'assistant', content: 'Hello, bienvenue.', turnId, interrupted: false }]);
  assert.equal(await h.client.opening(scene, { voice: true }), null);
  assert.equal(h.client.latestTurnId, turnId);
  assert.equal(h.calls.length, 2);
});

test('restore retains only the explicit last completed reply with its authoritative speech selection', async () => {
  const savedReply = { turnId, reply: { text: 'Hello, bienvenue.', language: 'fr',
    speech: { provider: 'voxcpm2', voice: 'voice-a', language: 'fr' } } };
  const h = harness(() => json({ session: session('saved'), lastReply: savedReply,
    turns: [{ origin: 'application_opening', clientTurnId: secondId, replyText: 'Incomplete text', outcome: 'failed' }] }),
  { storage: memory('saved') });
  await h.client.initialize();
  assert.deepEqual(h.client.latestReply, savedReply);
  assert.equal(h.client.latestTurnId, secondId);
  await h.client.newSession();
  assert.equal(h.client.latestReply, null);
});

test('raw history cannot supply a replayable voice response when lastReply is absent or malformed', async () => {
  const h = harness(() => json({ session: session('saved'), lastReply: null,
    turns: [{ clientTurnId: turnId, inputText: 'Question', replyText: 'Incomplete reply', outcome: 'cancelled' }] }),
  { storage: memory('saved') });
  await h.client.initialize();
  assert.equal(h.client.latestReply, null);
  const malformed = harness(() => json({ session: session('saved'),
    lastReply: { turnId, reply: { text: 'Hello', speech: { voice: 42 } } } }), { storage: memory('saved') });
  await assert.rejects(malformed.client.initialize(), /Voix LLMx invalide/);
  assert.equal(malformed.client.latestReply, null);
  assert.equal(malformed.client.session, null);
  assert.deepEqual(malformed.client.history, []);
});

for (const status of ['pending', 'cancelled', 'failed', 'skipped', 'uncertain']) {
  test(`restored ${status} opening is never replayed or spoken`, async () => {
    const h = harness(() => json({ session: session('saved', {
      llmx: { schemaVersion: 1, opening: { version: 1, status, turnId, replyText: 'Old hello' } }
    }), turns: [] }), { storage: memory('saved') });
    await h.client.initialize();
    assert.equal(await h.client.opening(scene, { voice: true }), null);
    assert.equal(turnCalls(h.calls).length, 0);
    if (status === 'uncertain') await assert.rejects(h.client.send('Salut', scene), /incertain/);
  });
}

test('failed or mismatched exact restore never adopts a recent/private session or silently creates one', async () => {
  for (const payload of [{ session: session('wrong-session') },
    { session: { sessionId: 'exact-session', packId: 'personal_operator' } }]) {
    const h = harness(() => json(payload), { storage: memory('exact-session') });
    await assert.rejects(h.client.initialize(), /Session LLMx invalide/);
    assert.equal(h.calls.length, 2);
    assert.equal(h.client.session, null);
    assert.equal(h.storage.getItem(LLMX_SESSION_STORAGE_KEY), 'exact-session');
  }
});

test('opening streams the application reply and adds only an assistant history entry', async () => {
  const deltas = [];
  const h = harness(call => {
    assert.match(call.url, /\/opening$/);
    assert.equal(call.body.channel, 'voice');
    assert.equal(call.body.openingVersion, 1);
    assert.match(call.body.requestId, /^[a-zA-Z0-9-]{16,80}$/);
    assert.equal(call.body.text, undefined);
    assert.deepEqual(call.body.sceneContext, scene);
    return stream([{ type: 'delta', delta: 'Hello, bienvenue.' }, { type: 'done', data:
      result(call.body.requestId, 'Hello, bienvenue.', { origin: 'application_opening' }) }]);
  }, { onDelta: delta => deltas.push(delta) });
  const reply = await h.client.opening(scene, { voice: true });
  assert.equal(reply.origin, 'application_opening');
  assert.deepEqual(deltas, ['Hello, bienvenue.']);
  assert.deepEqual(h.client.history.map(row => row.role), ['assistant']);
  assert.equal(await h.client.opening(scene), null);
  assert.equal(turnCalls(h.calls).length, 1);
});

test('a duplicate JSON opening with reply text returns null and emits no text or speech callback', async () => {
  for (const status of ['completed', 'pending', 'uncertain']) {
    const h = harness(() => json({ replayed: false, opening: { status, turnId },
      reply: { text: 'Hello, old answer.' } }, status === 'pending' ? 202 : 200), {
      onDelta: () => assert.fail('duplicate must not emit a delta')
    });
    assert.equal(await h.client.opening(scene), null);
    assert.deepEqual(h.client.history, []);
    assert.equal(h.client.latestTurnId, turnId);
    assert.equal(await h.client.opening(scene), null);
    assert.equal(turnCalls(h.calls).length, 1);
  }
});

test('split NDJSON and UTF-8 chunks, blank lines and an unterminated done line produce the real reply', async () => {
  const answer = 'Écoute, ça va.', bytes = new TextEncoder().encode('\n' + JSON.stringify({ type: 'delta', delta: answer }) + '\r\n' +
    JSON.stringify({ type: 'done', data: result(turnId, answer) }));
  const deltas = [];
  const h = harness(() => new Response(new ReadableStream({ start(controller) {
    for (let i = 0; i < bytes.length; i += 3) controller.enqueue(bytes.slice(i, i + 3));
    controller.close();
  } }), { headers: { 'Content-Type': 'application/x-ndjson' } }));
  const reply = await h.client.send('Bonjour', scene, { turnId, channel: 'voice',
    onDelta: (delta, accumulated) => deltas.push([delta, accumulated]) });
  assert.equal(reply.reply.text, answer);
  assert.deepEqual(deltas, [[answer, answer]]);
  assert.deepEqual(h.client.history.map(message => [message.role, message.content]), [['user', 'Bonjour'], ['assistant', answer]]);
  assert.equal(h.client.latestTurnId, turnId);
  assert.deepEqual(h.client.latestReply, { turnId, reply: reply.reply });
  assert.equal(turnCalls(h.calls)[0].body.channel, 'voice');
  await assert.rejects(h.client.send('Bonjour', scene, { turnId }), /déjà été envoyé/);
});

for (const [name, events] of [
  ['missing done', [{ type: 'delta', delta: 'Partial answer' }]],
  ['malformed JSON', ['{"type":']],
  ['malformed done', [{ type: 'done', data: { session: session(), reply: {} } }]],
  ['wrong session', [{ type: 'done', data: result(turnId, 'Hi', { session: session('another-session') }) }]],
  ['wrong turn', [{ type: 'done', data: result(secondId) }]],
  ['bad delta', [{ type: 'delta', text: 'wrong field' }]],
  ['server error', [{ type: 'error', message: 'inference failed' }]],
  ['event after done', [{ type: 'done', data: result() }, { type: 'delta', delta: 'trailing' }]]
]) {
  test(`${name} rejects without committing partial history or retrying the action`, async () => {
    const h = harness(() => stream(events));
    await assert.rejects(h.client.send('Bonjour', scene, { turnId }));
    assert.deepEqual(h.client.history, []);
    assert.equal(h.client.state, 'error');
    assert.equal(turnCalls(h.calls).length, 1);
    await assert.rejects(h.client.send('Bonjour', scene, { turnId }), /déjà été envoyé/);
    assert.equal(turnCalls(h.calls).length, 1);
  });
}

test('two concurrent human sends cannot both dispatch', async () => {
  const response = deferred();
  const h = harness(() => response.promise);
  const first = h.client.send('Premier', scene, { turnId });
  await assert.rejects(h.client.send('Deuxième', scene, { turnId: secondId }), /déjà en cours/);
  await until(() => turnCalls(h.calls).length === 1);
  response.resolve(stream([{ type: 'done', data: result() }]));
  await first;
  assert.equal(turnCalls(h.calls).length, 1);
});

test('human input before opening dispatch suppresses the opening entirely', async () => {
  const h = harness(call => {
    assert.match(call.url, /\/turns\/text$/);
    return stream([{ type: 'done', data: result(call.body.turnId) }]);
  });
  const opening = h.client.opening(scene);
  const failedOpening = assert.rejects(opening, { name: 'AbortError' });
  const human = h.client.send('Je parle en premier', scene, { turnId });
  await Promise.all([failedOpening, human]);
  assert.equal(turnCalls(h.calls).length, 1);
  assert.equal(h.calls.some(call => call.url.endsWith('/interrupt')), false);
});

test('human input after opening dispatch awaits matching server interruption receipt before sending', async () => {
  const interrupted = deferred(), openingResponse = deferred();
  let openingId, cancellationCount = 0;
  const h = harness(call => {
    if (call.url.endsWith('/opening')) { openingId = call.body.requestId; return openingResponse.promise; }
    if (call.url.endsWith('/interrupt')) {
      assert.equal(call.body.turnId, openingId);
      cancellationCount++;
      return cancellationCount === 1 ? json({ pending: true, interrupted: false, turnId: openingId }, 202) : interrupted.promise;
    }
    return stream([{ type: 'done', data: result(call.body.turnId, 'Réponse humaine') }]);
  });
  const opening = h.client.opening(scene);
  const failedOpening = assert.rejects(opening, { name: 'AbortError' });
  await until(() => Boolean(openingId));
  const human = h.client.send('Arrête, ma question', scene, { turnId });
  await until(() => cancellationCount === 2);
  assert.equal(turnCalls(h.calls).length, 1);
  assert.equal(h.calls.find(call => call.url.endsWith('/opening')).init.signal.aborted, false);
  await assert.rejects(h.client.send('Autre question', scene, { turnId: secondId }), /déjà en cours/);
  interrupted.resolve(json({ interrupted: true, turnId: openingId }));
  const answer = await human;
  openingResponse.resolve(stream([{ type: 'done', data: result(openingId, 'Hello, stale.', { origin: 'application_opening' }) }]));
  await failedOpening;
  assert.equal(answer.reply.text, 'Réponse humaine');
  assert.deepEqual(h.client.history.map(message => message.content), ['Arrête, ma question', 'Réponse humaine']);
});

test('restoring a pending opening requires its interrupt receipt before a new human turn', async () => {
  const calls = [], receipt = deferred();
  const client = new LlmXConversationClient({ storage: memory('saved'), fetch: async (url, init) => {
    calls.push(url);
    if (url.endsWith('/config')) return json(config);
    if (url.endsWith('/history')) return json({ session: session('saved', {
      llmx: { schemaVersion: 1, opening: { status: 'pending', turnId } }
    }), turns: [] });
    if (url.endsWith('/interrupt')) return receipt.promise;
    return stream([{ type: 'done', data: result(JSON.parse(init.body).turnId, 'Oui.', { session: session('saved') }) }]);
  } });
  const sending = client.send('Question', scene, { turnId: secondId });
  await until(() => calls.some(url => url.endsWith('/interrupt')));
  assert.equal(calls.some(url => url.endsWith('/turns/text')), false);
  receipt.resolve(json({ interrupted: true, turnId }));
  await sending;
});

test('interrupt can mark a fully generated turn while its speech is still playing', async () => {
  const h = harness(call => call.url.endsWith('/interrupt')
    ? json({ interrupted: true, turnId: call.body.turnId }) : stream([{ type: 'done', data: result() }]));
  await h.client.send('Bonjour', scene, { turnId });
  assert.equal(await h.client.interrupt(), null);
  assert.equal(h.calls.some(call => call.url.endsWith('/interrupt')), false);
  assert.deepEqual(await h.client.interrupt(h.client.latestTurnId), { interrupted: true, turnId });
  assert.equal(h.client.history[1].interrupted, true);
  assert.equal(h.client.state, 'idle');
});

test('unconfirmed or mismatched cancellation blocks the next turn and bounds pending polling', async () => {
  for (const reply of [{ pending: true, interrupted: false, turnId }, { interrupted: true, turnId: secondId }]) {
    const h = harness(call => call.url.endsWith('/interrupt') ? json(reply, reply.pending ? 202 : 200)
      : stream([{ type: 'delta', delta: 'partial' }]));
    await assert.rejects(h.client.send('Premier', scene, { turnId }));
    await assert.rejects(h.client.send('Deuxième', scene, { turnId: secondId }), /arrêt/);
    assert.equal(turnCalls(h.calls).length, 1);
    assert.equal(h.calls.filter(call => call.url.endsWith('/interrupt')).length, reply.pending ? 4 : 1);
  }
});

test('an external abort suppresses late deltas and waits for verified cancellation', async () => {
  let source;
  const receipt = deferred(), signal = new AbortController(), deltas = [];
  const h = harness(call => call.url.endsWith('/interrupt') ? receipt.promise : new Response(new ReadableStream({
    start(controller) { source = controller; }
  }), { headers: { 'Content-Type': 'application/x-ndjson' } }), { onDelta: delta => deltas.push(delta) });
  const sent = h.client.send('Bonjour', scene, { turnId, signal: signal.signal });
  const cancelled = assert.rejects(sent, { name: 'AbortError' });
  await until(() => Boolean(source));
  signal.abort();
  source.enqueue(new TextEncoder().encode(JSON.stringify({ type: 'delta', delta: 'late' }) + '\n'));
  await until(() => h.calls.some(call => call.url.endsWith('/interrupt')));
  assert.deepEqual(deltas, []);
  assert.equal(turnCalls(h.calls)[0].init.signal.aborted, false);
  receipt.resolve(json({ interrupted: true, turnId }));
  await cancelled;
  assert.equal(turnCalls(h.calls)[0].init.signal.aborted, true);
  assert.deepEqual(h.client.history, []);
});

test('dispose invalidates callbacks and stops requests immediately, with a separately awaited server receipt', async () => {
  const response = deferred(), receipt = deferred(), deltas = [];
  const h = harness(call => call.url.endsWith('/interrupt') ? receipt.promise : response.promise,
    { onDelta: delta => deltas.push(delta) });
  const sent = h.client.send('Bonjour', scene, { turnId });
  const cancelled = assert.rejects(sent, { name: 'AbortError' });
  await until(() => turnCalls(h.calls).length === 1);
  const disposal = h.client.dispose();
  assert.equal(h.client.dispose(), disposal);
  assert.equal(h.client.state, 'disposed');
  assert.equal(turnCalls(h.calls)[0].init.signal.aborted, true);
  response.resolve(stream([{ type: 'delta', delta: 'stale' }, { type: 'done', data: result() }]));
  await cancelled;
  receipt.resolve(json({ interrupted: true, turnId }));
  await disposal;
  assert.equal(h.client.session, null);
  assert.deepEqual(h.client.history, []);
  assert.deepEqual(deltas, []);
  await assert.rejects(h.client.initialize(), { name: 'AbortError' });
});

test('dispose during initialization cannot restore a late session or rewrite browser storage', async () => {
  const response = deferred(), storage = memory('saved');
  const h = harness(() => response.promise, { storage });
  const initialized = h.client.initialize();
  const cancelled = assert.rejects(initialized, { name: 'AbortError' });
  await until(() => h.calls.length === 2);
  await h.client.dispose();
  response.resolve(json({ session: session('saved'), turns: [] }));
  await cancelled;
  assert.equal(h.client.session, null);
  assert.equal(storage.getItem(LLMX_SESSION_STORAGE_KEY), 'saved');
});

test('dispose preserves an interruption failure instead of turning stale callbacks into a success receipt', async () => {
  const response = deferred(), receipt = deferred();
  const h = harness(call => call.url.endsWith('/interrupt') ? receipt.promise : response.promise);
  const sent = h.client.send('Question', scene, { turnId });
  const cancelled = assert.rejects(sent, { name: 'AbortError' });
  await until(() => turnCalls(h.calls).length === 1);
  const interrupting = h.client.interrupt();
  const failedInterrupt = assert.rejects(interrupting, /arrêt/);
  const disposal = h.client.dispose();
  const failedDisposal = assert.rejects(disposal, /arrêt/);
  receipt.resolve(json({ interrupted: false, turnId }, 503));
  response.resolve(stream([{ type: 'done', data: result() }]));
  await Promise.all([failedInterrupt, failedDisposal, cancelled]);
  assert.equal(h.client.state, 'disposed');
  assert.deepEqual(h.client.history, []);
});

test('newSession rejects late old results and waits for cancellation before creating the replacement', async () => {
  const oldResponse = deferred(), receipt = deferred();
  const h = harness(call => call.url.endsWith('/interrupt') ? receipt.promise : oldResponse.promise);
  const sent = h.client.send('Old question', scene, { turnId });
  const cancelled = assert.rejects(sent, { name: 'AbortError' });
  await until(() => turnCalls(h.calls).length === 1);
  const replacement = h.client.newSession({ language: 'en', agentId: 'main' });
  assert.equal(h.calls.filter(call => call.url === '/llmx-api/sessions').length, 1);
  receipt.resolve(json({ interrupted: true, turnId }));
  await replacement;
  const creations = h.calls.filter(call => call.url === '/llmx-api/sessions');
  assert.equal(creations.length, 2);
  assert.equal(creations[1].body.language, 'en');
  oldResponse.resolve(stream([{ type: 'done', data: result() }]));
  await cancelled;
  assert.deepEqual(h.client.history, []);
  assert.equal(h.client.state, 'idle');
});

test('an explicit new session recovers terminal or uncertain openings without interrupting them', async () => {
  for (const status of ['completed', 'uncertain', 'failed', 'cancelled', 'skipped']) {
    const h = harness(call => {
      assert.ok(call.url.endsWith('/history'), 'terminal opening must not be interrupted');
      return json({ session: session('saved', { llmx: { schemaVersion: 1, opening: { status, turnId } } }),
        turns: [{ origin: 'application_opening', clientTurnId: turnId, inputText: '', replyText: 'Hello, partial.',
          outcome: status === 'failed' ? 'failed' : status === 'cancelled' ? 'cancelled' : 'completed' }] });
    }, { storage: memory('saved') });
    await h.client.initialize();
    if (status === 'failed' || status === 'cancelled') {
      assert.equal(h.client.history[0].outcome, status);
      assert.equal(h.client.history[0].interrupted, true);
    }
    assert.equal(await h.client.interrupt(), null);
    await h.client.newSession();
    assert.equal(h.client.session.sessionId, 'llmx-owned-session');
    assert.equal(h.calls.some(call => call.url.endsWith('/interrupt')), false);
  }
});

test('explicit new session can leave uncertain work after failed cleanup, without greeting or false acknowledgement', async () => {
  for (const status of [409, 503]) {
    const calls = [], cleanup = deferred();
    let creations = 0;
    const client = new LlmXConversationClient({ storage: memory(), fetch: async (url, init = {}) => {
      const body = init.body ? JSON.parse(init.body) : null;
      calls.push({ url, body });
      if (url.endsWith('/config')) return json(config);
      if (url === '/llmx-api/sessions') return json({ session: session('fresh-session-' + (++creations)) }, 201);
      if (url.endsWith('/interrupt')) return cleanup.promise;
      if (url.includes('/fresh-session-1/')) return stream(['{"type":']);
      assert.ok(url.includes('/fresh-session-2/'));
      return stream([{ type: 'done', data: result(body.turnId, 'Nouvelle réponse.', { session: session('fresh-session-2') }) }]);
    } });
    await assert.rejects(client.send('Ancienne question', scene, { turnId }));
    const replacement = client.newSession();
    const joinedInitialization = client.initialize();
    cleanup.resolve(json({ interrupted: false, turnId }, status));
    const [created, joined] = await Promise.all([replacement, joinedInitialization]);
    assert.equal(created.sessionId, 'fresh-session-2');
    assert.equal(joined.sessionId, created.sessionId);
    assert.equal(creations, 2);
    assert.equal(client.config.enabled, true);
    assert.equal(client.state, 'idle');
    assert.match(client.cleanupWarning, /n’a pas été confirmé/);
    assert.equal(await client.opening(scene), null);
    assert.equal(calls.some(call => call.url.endsWith('/opening')), false);
    await client.send('Je reprends', scene, { turnId: secondId });
    assert.deepEqual(client.history.map(message => message.content), ['Je reprends', 'Nouvelle réponse.']);
    assert.equal(calls.filter(call => call.url.includes('/fresh-session-1/turns/text')).length, 1);
    assert.equal(calls.filter(call => call.url.endsWith('/interrupt')).length, 1);
  }
});

test('dispose still rejects an unconfirmed cleanup while an explicit new session is preparing', async () => {
  const cleanup = deferred();
  const h = harness(call => call.url.endsWith('/interrupt') ? cleanup.promise : stream(['{"type":']));
  await assert.rejects(h.client.send('Question', scene, { turnId }));
  const replacement = h.client.newSession();
  const replaced = assert.rejects(replacement, { name: 'AbortError' });
  const disposal = h.client.dispose();
  const failedDisposal = assert.rejects(disposal, /arrêt/);
  cleanup.resolve(json({ interrupted: false, turnId }, 503));
  await Promise.all([replaced, failedDisposal]);
  assert.equal(h.client.state, 'disposed');
  assert.equal(h.calls.filter(call => call.url === '/llmx-api/sessions').length, 1);
});

test('scene observations are copied, bounded and reject non-finite positions before any request', async () => {
  const copy = llmxSceneContext(scene);
  assert.deepEqual(copy, scene);
  assert.notEqual(copy.entities[0].position, scene.entities[0].position);
  const h = harness(() => assert.fail('invalid context must not reach server'));
  for (const invalid of [{ ...scene, selectedEntityIds: Array(9).fill('cube') },
    { ...scene, entities: Array(25).fill(scene.entities[0]) },
    { ...scene, entities: [{ id: 'cube', type: 'box', position: [Infinity, 0, 0] }] },
    { ...scene, environment: { id: 'x'.repeat(81), name: 'Too long' } }]) {
    await assert.rejects(h.client.send('Bonjour', invalid));
  }
  assert.deepEqual(h.calls, []);
});
