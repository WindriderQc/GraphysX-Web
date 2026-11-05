import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { transpileModule, ModuleKind, ScriptTarget } from 'typescript';
const source = readFileSync(new URL('../src/ecosystem-narration.ts', import.meta.url), 'utf8');
const code = transpileModule(source, { compilerOptions: { module: ModuleKind.ESNext, target: ScriptTarget.ES2022 } }).outputText.replace(/^export /gm, '');
const context = vm.createContext({ AbortController, window: {} });
vm.runInContext(code + '\nglobalThis.create = createTourNarration;', context);
const settle = () => new Promise(resolve => setImmediate(resolve));

test('late completion or failure of a cancelled phrase cannot advance or stop its replacement', async () => {
  let completed = 0, failed = 0;
  const requests = [];
  const narration = context.create(() => completed++, () => failed++);
  narration.setNarrator((text, signal) => new Promise((resolve, reject) => requests.push({ text, signal, resolve, reject })));
  narration.speak('one'); narration.speak('two');
  assert.equal(requests[0].signal.aborted, true);
  requests[0].resolve(); await settle(); assert.equal(completed, 0);
  requests[1].resolve(); await settle(); assert.equal(completed, 1);
  narration.speak('three'); narration.stop(); requests[2].reject(new Error('late'));
  await settle(); assert.equal(failed, 0);
});

test('current transport errors pause narration, and synchronous transports stay fenced', async () => {
  const errors = [];
  const narration = context.create(() => assert.fail('must not advance'), error => errors.push(error.message));
  narration.setNarrator(() => { throw new Error('no voice'); });
  narration.speak('one'); await settle(); assert.deepEqual(errors, ['no voice']);
});
