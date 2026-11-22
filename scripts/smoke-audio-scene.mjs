import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { applySmokeTimeout, launchSmokeBrowser, useLightRender } from './smoke-harness.mjs';

const base = process.env.SMOKE_BASE || 'http://127.0.0.1:4188/';
const output = path.resolve(process.env.SMOKE_ARTIFACTS || 'output/playwright/audio-scene');
await mkdir(output, { recursive: true });
const browser = await launchSmokeBrowser();
const errors = [];
const receipt = { replacements: {} };
const save = () => writeFile(path.join(output, 'audio-scene.json'), JSON.stringify(receipt, null, 2));
try {
  const page = applySmokeTimeout(await browser.newPage({ viewport: { width: 900, height: 650 } }));
  await useLightRender(page, { resolution: .5 });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(new URL('?host=standalone', base).href);
  await page.waitForFunction(() => Boolean(window.__GRAPHYSX_HOST__));
  await page.mouse.click(455, 280);
  await page.waitForFunction(() => window.__GRAPHYSX_HOST__.audio.listener.context.state === 'running');
  await page.evaluate(() => {
    const { api, audio } = window.__GRAPHYSX_HOST__;
    const context = audio.listener.context;
    const decode = context.decodeAudioData.bind(context);
    const held = [];
    context.decodeAudioData = (bytes, onSuccess) => {
      const decoded = decode(bytes);
      const gate = Promise.withResolvers();
      const delivery = Promise.all([decoded, gate.promise]).then(([buffer]) => {
        onSuccess(buffer);
        return buffer;
      });
      held.push({ gate, delivery });
      return delivery;
    };
    const must = result => { if (!result.ok) throw Error(result.error); };
    const url = name => '/assets/quest3/audio/reactor-loop.wav?audio-test=' + name;
    const anchor = (name, position = [0, 1, 0]) => ({
      id: 'anchor', type: 'box', transform: { position },
      interactions: [{ id: 'cue', type: 'play-sound', sound: url(name), refDistance: 3 }],
    });
    const load = (label, entities) => must(api.load({
      schema: 'graphysx.agent-world/v2', id: 'audio-scene-test', label, entities,
    }));
    window.__qaAudio = { held, load, anchor, must, url, async finish(index, fail = false) {
      const { gate, delivery } = held[index];
      if (fail) gate.reject(new DOMException('Injected decode failure', 'EncodingError'));
      else gate.resolve();
      await delivery.catch(error => { if (!fail) throw error; });
      // Drain the loader's promise chain before checking started Web Audio nodes.
      await new Promise(resolve => setTimeout(resolve, 0));
    } };
  });
  const waitForDecode = index => page.waitForFunction(index => window.__qaAudio.held.length > index, index);
  for (const [index, mode] of ['missing-target', 'same-id', 'same-scene-reuse'].entries()) {
    const before = await page.evaluate(mode => {
      const { api, audio } = window.__GRAPHYSX_HOST__;
      const { anchor, load, must } = window.__qaAudio;
      load('Old scene', [anchor(mode)]);
      must(api.interact('anchor', 'cue'));
      return audio.oneShotCount;
    }, mode);
    await waitForDecode(index);
    receipt.replacements[mode] = await page.evaluate(async ({ mode, index, before }) => {
      const { api, audio, world } = window.__GRAPHYSX_HOST__;
      const { anchor, load, must, finish } = window.__qaAudio;
      const old = world.getEntityObject('anchor');
      if (mode === 'same-scene-reuse') {
        must(api.remove('anchor'));
        must(api.spawn(anchor(mode, [5, 1, 0])));
      } else load('New scene', mode === 'same-id' ? [anchor(mode, [5, 1, 0])] : []);
      await finish(index);
      const current = world.getEntityObject('anchor');
      return { started: audio.oneShotCount - before, replacedObject: current !== old,
        attached: current?.children.filter(child => child.panner instanceof PannerNode).length ?? 0 };
    }, { mode, index, before });
  }
  await save();
  for (const result of Object.values(receipt.replacements)) {
    assert.deepEqual(result, { started: 0, replacedObject: true, attached: 0 });
  }

  await page.evaluate(() => {
    const { api } = window.__GRAPHYSX_HOST__;
    const { anchor, load, must } = window.__qaAudio;
    load('Current scene', [anchor('live', [2, 1, -3])]);
    must(api.interact('anchor', 'cue'));
    must(api.interact('anchor', 'cue'));
  });
  await waitForDecode(3);
  receipt.current = await page.evaluate(async () => {
    const { world } = window.__GRAPHYSX_HOST__;
    const { load, finish } = window.__qaAudio;
    await finish(3);
    const object = world.getEntityObject('anchor');
    object.updateWorldMatrix(true, true);
    const sounds = object.children.filter(child => child.panner instanceof PannerNode);
    const active = sounds.map(node => ({ playing: node.isPlaying, hrtf: node.panner.panningModel,
      reference: node.getRefDistance(), position: node.getWorldPosition(object.position.clone()).toArray() }));
    load('Next scene', []);
    return { active, released: sounds.every(node => !node.isPlaying && !node.parent) };
  });
  assert.deepEqual(receipt.current.active, Array.from({ length: 2 }, () => ({
    playing: true, hrtf: 'HRTF', reference: 3, position: [2, 1, -3],
  })));
  assert.equal(receipt.current.released, true);

  await page.evaluate(() => {
    const { api, audio } = window.__GRAPHYSX_HOST__;
    const { url, must } = window.__qaAudio;
    must(api.spawn({ id: 'retry', type: 'sound', sound: { source: url('retry') } }));
    audio.sync();
  });
  await waitForDecode(4);
  await page.evaluate(async () => {
    const { api, audio } = window.__GRAPHYSX_HOST__;
    const { finish, must } = window.__qaAudio;
    await finish(4, true);
    must(api.update('retry', { sound: { volume: .4 } }));
    audio.sync();
  });
  await waitForDecode(5);
  await page.evaluate(() => window.__qaAudio.finish(5));
  await page.waitForFunction(() => {
    const object = window.__GRAPHYSX_HOST__.world.getEntityObject('retry');
    const sound = object.children.find(child => child.panner instanceof PannerNode);
    // Three ramps the gain over time instead of setting its AudioParam immediately.
    return sound?.isPlaying && Math.abs(sound.getVolume() - .4) < .0001;
  });
  receipt.retry = await page.evaluate(() => {
    const { audio, world } = window.__GRAPHYSX_HOST__;
    const object = world.getEntityObject('retry');
    const sounds = object.children.filter(child => child.panner instanceof PannerNode);
    return { playing: audio.playingCount, attached: sounds.length, volume: Number(sounds[0]?.getVolume().toFixed(3)) };
  });
  assert.deepEqual(receipt.retry, { playing: 1, attached: 1, volume: .4 });

  await page.evaluate(() => {
    const { audio } = window.__GRAPHYSX_HOST__;
    const { load, url } = window.__qaAudio;
    load('Old loop scene', [{ id: 'loop', type: 'sound', sound: { source: url('shared-loop') } }]);
    audio.sync();
  });
  await waitForDecode(6);
  receipt.sharedLoop = await page.evaluate(async () => {
    const { audio, world } = window.__GRAPHYSX_HOST__;
    const { load, url, finish } = window.__qaAudio;
    const old = world.getEntityObject('loop').children.find(child => child.panner instanceof PannerNode);
    load('New loop scene', [{ id: 'loop', type: 'sound', sound: { source: url('shared-loop') } }]);
    audio.sync();
    const current = world.getEntityObject('loop').children.find(child => child.panner instanceof PannerNode);
    await finish(6);
    return { newNode: current !== old, oldDetached: old.parent === null, oldPlaying: old.isPlaying,
      currentPlaying: current?.isPlaying === true, playing: audio.playingCount };
  });
  await save();
  assert.deepEqual(receipt.sharedLoop, { newNode: true, oldDetached: true, oldPlaying: false, currentPlaying: true, playing: 1 });
  assert.deepEqual(errors, []);
  console.log('PASS audio decode stays with its scene and positional owner; failed sources can retry.');
} finally {
  await browser.close();
}
