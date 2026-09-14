import { test } from 'node:test';
import assert from 'node:assert/strict';
import { importBrowserModule } from './support/import-browser-module.mjs';

const { llmxUrl, createLlmXFetch } = await importBrowserModule(new URL('../src/llmx-transport.ts', import.meta.url));
const origin = 'https://agentx.specialblend.icu';

test('public LLMx reaches the same private Household and VoiX routes as the local relay', () => {
  const routes = [
    ['GET', '/config', '/config'], ['POST', '/sessions', '/sessions'],
    ['GET', '/sessions/recent', '/sessions/recent'],
    ['GET', '/sessions/abc-123/history', '/sessions/abc-123/history'],
    ...['turns/text', 'opening', 'interrupt', 'scene-receipts'].map(action => ['POST', '/sessions/abc-123/' + action, '/sessions/abc-123/' + action]),
  ];
  for (const profile of ['', '/family']) for (const [method, path, target] of routes) {
    assert.equal(llmxUrl('/llmx-api' + profile + path, method, origin), origin + '/api/consumers/nestor/v1/llmx' + profile + target);
  }
  for (const name of ['browser-conversation.js', 'speech-language.js', 'voice-capture-worklet.js']) {
    assert.equal(llmxUrl('/llmx-api/assets/' + name, 'GET', origin), origin + '/assets/household/' + name);
  }
  assert.equal(llmxUrl('/llmx-api/assets/voice-audio.js', 'GET', origin), origin + '/api/voix/player.js');
  assert.equal(llmxUrl('/llmx-api/voices', 'GET', origin), origin + '/api/voix/catalog');
  for (const path of ['transcribe', 'synthesize/stream']) assert.equal(llmxUrl('/llmx-api/' + path, 'POST', origin), origin + '/api/voix/' + path);
  assert.throws(() => llmxUrl('/llmx-api/sessions/abc/history', 'POST', origin), /inconnue/);
  assert.throws(() => llmxUrl('/api/private', 'GET', origin), /inconnue/);
  assert.throws(() => llmxUrl('/llmx-api/config', 'GET', 'http://192.168.2.99'), /HTTPS origin/);
});

test('direct streaming fetch preserves body, cancellation and response while omitting browser credentials', async () => {
  const controller = new AbortController();
  const body = new Blob(['audio']);
  const response = new Response('speech stream');
  const calls = [];
  const fetcher = createLlmXFetch(origin, async (...args) => { calls.push(args); return response; });
  assert.equal(await fetcher('/llmx-api/transcribe', { method: 'POST', body, signal: controller.signal, credentials: 'include' }), response);
  assert.equal(calls[0][0], origin + '/api/voix/transcribe');
  assert.equal(calls[0][1].body, body);
  assert.equal(calls[0][1].signal, controller.signal);
  assert.equal(calls[0][1].credentials, 'omit');
  const abort = new DOMException('cancelled', 'AbortError');
  await assert.rejects(createLlmXFetch(origin, async () => { throw abort; })('/llmx-api/config'), error => error === abort);
  await assert.rejects(createLlmXFetch(origin, async () => { throw new TypeError('Failed to fetch'); })('/llmx-api/config'), /réseau de la maison/);
});

test('development keeps the existing relative relay without changing request options', async () => {
  const init = { method: 'POST', body: '{}' };
  const fetcher = createLlmXFetch('', async (url, options) => {
    assert.equal(url, '/llmx-api/sessions'); assert.equal(options, init); return new Response('{}');
  });
  assert.equal((await fetcher('/llmx-api/sessions', init)).status, 200);
});
