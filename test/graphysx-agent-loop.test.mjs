import assert from 'node:assert/strict';
import { test } from 'node:test';
import { importBrowserModule } from './support/import-browser-module.mjs';
const { createGraphysXAgentLoop, GraphysXRelayError } = await importBrowserModule(new URL('../src/graphysx-agent-connection.ts', import.meta.url));

/** A scripted relay: `poll` hands out queued answers (blocking when empty); any endpoint can be told to fail once with a status. */
function scriptedRelay() {
  const calls = [], fail = new Map(), queue = [], waiters = [];
  let connections = 0;
  const post = async (endpoint, body) => {
    calls.push([endpoint, body]);
    const status = fail.get(endpoint);
    if (status) { fail.delete(endpoint); throw new GraphysXRelayError(`scripted ${endpoint} ${status}`, status); }
    if (endpoint === 'connect') return { id: `world-${++connections}`, token: `token-${connections}` };
    if (endpoint !== 'poll') return { ok: true };
    const answer = queue.length ? queue.shift() : await new Promise(resolve => waiters.push(resolve));
    const late = fail.get('poll'); // a failure scheduled while the poll was blocked lands on this poll
    if (late) { fail.delete('poll'); throw new GraphysXRelayError(`scripted poll ${late}`, late); }
    return answer;
  };
  const push = answer => { if (waiters.length) waiters.shift()(answer); else queue.push(answer); };
  const replies = () => calls.filter(([endpoint]) => endpoint === 'reply').map(([, body]) => body);
  return { post, calls, fail, push, replies, get connections() { return connections; } };
}

const host = { api: { state: () => ({ revision: 1 }) }, bridge: { manifest: () => ({ tools: [{ path: 'query', mutates: false }] }), call: async () => 'answer' } };
const settle = () => new Promise(resolve => setImmediate(resolve));
const until = async predicate => { for (let i = 0; i < 500 && !predicate(); i++) await settle(); assert.ok(predicate(), 'condition not reached'); };

test('stopping while a poll resolves never executes the delivered edit', async () => {
  const relay = scriptedRelay();
  let edits = 0;
  const mutableHost = { api: host.api, bridge: {
    manifest: () => ({ tools: [{ path: 'spawn', mutates: true }] }), call: () => { edits++; },
  } };
  const loop = createGraphysXAgentLoop(mutableHost, { post: relay.post, info: () => ({}), capture: async () => '' });
  const finished = loop.run();
  await until(() => relay.calls.at(-1)?.[0] === 'poll');
  loop.stop();
  relay.push({ request: { id: 'late', kind: 'edit', method: 'spawn', expectedRevision: 1 } });
  await finished;
  assert.equal(edits, 0, 'pagehide must prevent a new mutation even when poll wins the abort race');
  assert.equal(relay.replies().length, 0);
});

test('stopping during registration releases the late connection without starting a poll', async () => {
  const calls = [];
  let resolveConnect;
  const loop = createGraphysXAgentLoop(host, { info: () => ({}), capture: async () => '', post: async (endpoint, body) => {
    calls.push([endpoint, body]);
    if (endpoint === 'connect') return new Promise(resolve => { resolveConnect = resolve; });
    return {};
  } });
  const finished = loop.run();
  loop.stop();
  resolveConnect({ id: 'late-world', token: 'late-token' });
  await finished;
  assert.equal(loop.connection, null);
  assert.deepEqual(calls.map(([endpoint]) => endpoint), ['connect', 'disconnect']);
});

test('starting a loop twice still creates only one request consumer', async () => {
  const relay = scriptedRelay();
  const loop = createGraphysXAgentLoop(host, { post: relay.post, info: () => ({}), capture: async () => '' });
  const first = loop.run(), second = loop.run();
  await until(() => relay.calls.at(-1)?.[0] === 'poll');
  assert.equal(relay.connections, 1);
  loop.stop(); relay.push({});
  await Promise.all([first, second]);
});

test('a reply the relay no longer wants (409) does not stop the tab from serving the next request', async () => {
  const relay = scriptedRelay();
  relay.push({ request: { id: 'slow', kind: 'read', method: 'query' } });
  relay.push({ request: { id: 'next', kind: 'read', method: 'query' } });
  relay.fail.set('reply', 409);
  const slept = [];
  const loop = createGraphysXAgentLoop(host, { post: relay.post, info: () => ({}), capture: async () => '', sleep: async ms => { slept.push(ms); } });
  void loop.run();
  await until(() => relay.replies().length === 2);
  assert.deepEqual(slept, [], 'a stale reply is not an outage');
  assert.equal(relay.connections, 1);
  assert.deepEqual(relay.replies().map(reply => reply.id), ['slow', 'next']);
  loop.stop();
});

test('a forgotten world (404) reconnects; other failures keep the world and back off exponentially, then recover', async () => {
  const relay = scriptedRelay();
  const slept = [], statuses = [];
  relay.fail.set('poll', 404);
  const loop = createGraphysXAgentLoop(host, { post: relay.post, info: () => ({}), capture: async () => '', retryDelayMs: 10, maxRetryDelayMs: 25,
    sleep: async ms => { slept.push(ms); }, onStatus: status => statuses.push(status) });
  void loop.run();
  await until(() => relay.connections === 2 && relay.calls.at(-1)[0] === 'poll');
  assert.deepEqual(slept, [10]);
  for (let outage = 1; outage <= 3; outage++) {
    relay.fail.set('poll', 500); relay.push({});
    await until(() => slept.length === outage + 1 && relay.calls.at(-1)[0] === 'poll');
  }
  assert.deepEqual(slept, [10, 10, 20, 25], 'doubling, capped at maxRetryDelayMs');
  assert.equal(relay.connections, 2, 'a 500 is not a reason to abandon the world id');
  relay.push({ request: { id: 'after', kind: 'read', method: 'query' } });
  await until(() => relay.replies().some(reply => reply.id === 'after'));
  assert.deepEqual(relay.replies().at(-1).result, { ok: true, value: { result: 'answer', revision: 1 } });
  assert.deepEqual([...new Set(statuses)], ['connected', 'retrying']);
  assert.deepEqual(loop.stop(), { id: 'world-2', token: 'token-2' });
  relay.push({});
  await until(() => statuses.at(-1) === 'stopped');
});
