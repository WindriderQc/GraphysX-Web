import { test } from 'node:test';
import assert from 'node:assert/strict';
import { importBrowserModule } from './support/import-browser-module.mjs';

const { LlmXSpeechOutput, llmxSpeechSampleFromRms } =
  await importBrowserModule(new URL('../src/llmx-audio.ts', import.meta.url));
const { llmxFacePresentation } =
  await importBrowserModule(new URL('../src/llmx-presentation.ts', import.meta.url));
const quiet = { playing: false, amplitude: 0, brightness: 0 };
const faceAmplitude = speech => llmxFacePresentation({ assembly: 1, phase: 'idle', speech }).speak;

const { mountLlmXConversation } = await importBrowserModule(new URL('../src/llmx-conversation.ts', import.meta.url));

class ElementFixture extends EventTarget {
  children = [];
  selectors = new Map();
  attributes = new Map();
  scrollHeight = 0;
  scrollTop = 0;
  clientHeight = 0;
  setAttribute(name, value) { this.attributes.set(name, value); }
  append(...elements) { this.children.push(...elements); }
  replaceChildren(...elements) { this.children = elements; }
  remove() {}
  querySelector(selector) {
    if (!this.selectors.has(selector)) this.selectors.set(selector, new ElementFixture());
    return this.selectors.get(selector);
  }
}
async function until(predicate) {
  for (let attempt = 0; attempt < 30 && !predicate(); attempt++) await new Promise(resolve => setImmediate(resolve));
  assert.ok(predicate(), 'expected the mounted conversation to reach the audio checkpoint');
}

test('Parler and text/replay drive the face equally for identical output RMS', async t => {
  let rms = 0;
  // Two bins with linear magnitudes 0.1 and 0.05; the weighted centroid is bin 40.
  const rawBrightness = (20 * 0.1 + 80 * 0.05) / (0.15 * 255);
  const analyser = {
    fftSize: 0, smoothingTimeConstant: 0,
    connect() {}, disconnect() {},
    getFloatTimeDomainData(waveform) {
      for (let index = 0; index < waveform.length; index++) waveform[index] = index % 2 ? -rms : rms;
    },
    getFloatFrequencyData(spectrum) {
      spectrum.fill(-Infinity); spectrum[20] = -20; spectrum[80] = 20 * Math.log10(0.05);
    },
  };
  let context;
  class TestAudioContext {
    state = 'running';
    destination = {};
    constructor() { context = this; }
    createAnalyser() { return analyser; }
    async resume() {}
    async close() { this.state = 'closed'; }
  }
  let started;
  const playing = new Promise(resolve => { started = resolve; });
  class Player {
    play(_input, signal) {
      started();
      return new Promise(resolve => signal.addEventListener('abort', resolve, { once: true }));
    }
  }
  let observedSpeech = false;
  class Conversation {
    audio = null;
    constructor(io, changed) { this.io = io; this.changed = changed; }
    async start() {
      const signal = new AbortController().signal;
      await this.io.createSession({}, signal);
      this.audio = await this.io.openAudio(signal, () => {});
      this.changed('listening');
    }
    interrupt() {}
    stop() { this.audio = null; }
  }
  const previous = Object.fromEntries(['window', 'document', 'AudioContext', 'fetch'].map(key =>
    [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  globalThis.window = Object.assign(new EventTarget(), {
    AudioContext: TestAudioContext, VoixAudio: { Player },
    NestorConversation: {
      Conversation,
      async openAudio(_signal, _onError, options) {
        observedSpeech = options.observeSpeech;
        return { quiet() {}, close() {}, readSpeechSample: () =>
          ({ playing: rms > 0.00001, amplitude: rms, brightness: rawBrightness }) };
      },
    },
  });
  globalThis.AudioContext = TestAudioContext;
  globalThis.document = Object.assign(new EventTarget(), {
    createElement() { return new ElementFixture(); },
    head: { append(script) { queueMicrotask(() => script.onload()); } },
  });
  const requests = [];
  globalThis.fetch = async url => {
    requests.push(url);
    const data = url === '/llmx-api/config'
      ? { enabled: true, schemaVersion: 1, openingVersion: 1, capabilities: {} }
      : url === '/llmx-api/sessions'
        ? { session: { sessionId: 'audio-test-session', scopeId: 'personal', packId: 'personal_operator',
          turnCount: 0, llmx: { schemaVersion: 1, opening: null } } }
        : assert.fail(`unexpected request ${url}`);
    return new Response(JSON.stringify({ ok: true, status: 'success', data }),
      { headers: { 'Content-Type': 'application/json' } });
  };
  const output = new LlmXSpeechOutput();
  const controller = new AbortController();
  let mounted;
  t.after(() => {
    mounted?.dispose();
    controller.abort(); output.dispose();
    for (const [key, descriptor] of Object.entries(previous)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  assert.equal(await output.enable(), true);
  const textContext = context;
  assert.deepEqual(output.sample(), quiet, 'an enabled but idle player must remain silent');
  const playback = output.play(new Response('audio fixture'), controller.signal);
  await playing;
  const root = new ElementFixture();
  mounted = mountLlmXConversation(root, () => ({ schemaVersion: 1,
    environment: { id: 'audio-fixture', name: 'Audio fixture' } }));
  await until(() => mounted.state().available);
  const microphone = root.children[0].querySelector('[data-talk="microphone"]');
  microphone.dispatchEvent(new Event('click'));
  await until(() => observedSpeech && !microphone.disabled);

  for (const level of [0, 0.0001, 0.002, 0.025, 0.08, 0.125, 0.3]) {
    rms = level;
    // Household readSpeechSample returns raw RMS of the speech bus, not the capture microphone.
    const parler = mounted.sample();
    const replay = output.sample();
    const expected = rms < 0.001 ? 0 : Math.min(1, rms * 8);
    assert.equal(parler.amplitude, expected, `Parler gain at RMS ${rms}`);
    assert.ok(Math.abs(replay.amplitude - expected) < 1e-7, `text/replay gain at RMS ${rms}`);
    assert.equal(parler.playing, replay.playing, `speech activity at RMS ${rms}`);
    assert.ok(Math.abs(faceAmplitude(parler) - faceAmplitude(replay)) < 1e-7,
      `the face receives the same amplitude at RMS ${rms}`);
    const parlerTone = llmxFacePresentation({ assembly: 1, phase: 'idle', speech: parler }).speakTone;
    const replayTone = llmxFacePresentation({ assembly: 1, phase: 'idle', speech: replay }).speakTone;
    assert.ok(Math.abs(parlerTone - replayTone) < 1e-7, `the same spectrum gives the same face tone at RMS ${rms}`);
    assert.ok(Math.abs(parler.brightness - (rms < 0.001 ? 0 : rawBrightness * 4)) < 1e-7,
      `the shared brightness gain is applied once at RMS ${rms}`);
  }
  assert.deepEqual(requests, ['/llmx-api/config', '/llmx-api/sessions'], 'sampling never dispatches speech or inference');
  rms = 0.05;
  mounted.dispose();
  assert.deepEqual(mounted.sample(), quiet, 'a disposed controller must not retain the microphone output sample');
  textContext.state = 'suspended';
  assert.deepEqual(output.sample(), quiet, 'suspended audio must not animate the face');
  textContext.state = 'running';
  controller.abort();
  await playback;
  assert.deepEqual(output.sample(), quiet, 'finished playback must not retain its last amplitude');
});

test('raw speech conversion excludes inactive, silent and invalid amplitudes', () => {
  assert.deepEqual(llmxSpeechSampleFromRms({ playing: false, amplitude: 0.8, brightness: 1 }), quiet);
  for (const amplitude of [0, -1, 0.0001, NaN, Infinity, -Infinity]) {
    assert.deepEqual(llmxSpeechSampleFromRms({ playing: true, amplitude, brightness: 1 }), quiet);
  }
  assert.deepEqual(llmxSpeechSampleFromRms({ playing: true, amplitude: 0.5, brightness: 0.3 }),
    { playing: true, amplitude: 1, brightness: 1 });
  assert.deepEqual(llmxSpeechSampleFromRms({ playing: true, amplitude: 0.025, brightness: 0.1 }),
    { playing: true, amplitude: 0.2, brightness: 0.4 });
});
