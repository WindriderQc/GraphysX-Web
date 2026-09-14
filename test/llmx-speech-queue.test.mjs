import assert from 'node:assert/strict';
import { test } from 'node:test';
import { importBrowserModule } from './support/import-browser-module.mjs';
const { llmxSpeechChunks, playLlmXSpeech } = await importBrowserModule(new URL('../src/llmx-speech-queue.ts', import.meta.url));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const tick = () => new Promise(resolve => setImmediate(resolve));
const text = 'Voici la première phrase avec ses cubes. Voici la deuxième phrase sur les lumières. Voici la troisième phrase dans notre monde.';

test('speech chunks keep the validated French text and decimals without oversized phrases', () => {
  assert.equal(llmxSpeechChunks(text).join(' '), text);
  const decimal = 'La boîte mesure exactement 3.5 mètres de côté.';
  assert.deepEqual(llmxSpeechChunks(decimal), [decimal]);
  assert.ok(llmxSpeechChunks('Un très long discours. '.repeat(100)).every(chunk => chunk.length <= 240));
  assert.deepEqual(llmxSpeechChunks(''), []);
});

test('first phrase plays before later synthesis completes; only one phrase is prefetched with the exact voice', async () => {
  const gate = deferred(), second = deferred(), played = [], synthesized = [];
  const voice = { provider: 'kokoro', voice: 'ff_siwis', language: 'fr' };
  const playing = playLlmXSpeech({ text, language: 'fr', speech: voice }, new AbortController().signal,
    async reply => { synthesized.push(reply); if (synthesized.length === 2) await second.promise; return new Response(reply.text); },
    async response => { played.push(await response.text()); if (played.length === 1) await gate.promise; });
  await tick();
  assert.equal(played.length, 1); assert.equal(synthesized.length, 2);
  assert.ok(synthesized.every(reply => reply.speech === voice && reply.language === 'fr'));
  second.resolve(); await tick(); assert.equal(synthesized.length, 2);
  gate.resolve(); await playing;
  assert.equal(played.join(' '), text); assert.equal(synthesized.length, 3);
});

test('interruption aborts playback and prepared synthesis; no remaining phrase can start', async () => {
  const controller = new AbortController(), signals = [], played = [];
  const playing = playLlmXSpeech({ text }, controller.signal, async (reply, signal) => {
    signals.push(signal); return new Response(reply.text);
  }, async (response, signal) => {
    played.push(await response.text());
    await new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
  });
  await tick(); controller.abort(); await assert.rejects(playing, { name: 'AbortError' });
  assert.equal(played.length, 1); assert.equal(signals.length, 2); assert.ok(signals.every(signal => signal.aborted));
});
