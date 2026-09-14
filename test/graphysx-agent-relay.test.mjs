import assert from 'node:assert/strict';
import { test } from 'node:test';
import http from 'node:http';
import { createGraphysXAgentRoute, assertLocalAgentRequest } from '../scripts/graphysx-agent-relay.mjs';

async function fixture(t, options) {
  const route = createGraphysXAgentRoute(options);
  const server = http.createServer((req, res) => { if (!route(req, res)) { res.writeHead(404); res.end(); } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { route.dispose(); server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}/graphysx-agent/`;
  const request = async (endpoint, body, headers = {}) => {
    const response = await fetch(base + endpoint, body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
    return { status: response.status, value: await response.json() };
  };
  const { value: connection } = await request('connect', { title: 'Test world', world: { id: 'test', label: 'Test' }, revision: 0 });
  const credentials = { worldId: connection.id, token: connection.token };
  return { request, credentials };
}

test('two external agents address the same native tab and receive their own exact receipts', async t => {
  const { request, credentials } = await fixture(t);
  const listing = await request('worlds');
  assert.equal(listing.value.worlds[0].id, credentials.worldId);
  assert.equal('token' in listing.value.worlds[0], false);
  const a = request('call', { worldId: credentials.worldId, request: { kind: 'read', method: 'query', args: [{ ids: ['codex'] }] } });
  const b = request('call', { worldId: credentials.worldId, request: { kind: 'read', method: 'query', args: [{ ids: ['claude'] }] } });
  for (let i = 0; i < 2; i++) {
    const polled = await request('poll', { ...credentials, info: { revision: i } });
    const delivered = polled.value.request;
    assert.equal((await request('reply', { ...credentials, token: 'wrong', id: delivered.id, result: {} })).status, 403);
    assert.equal((await request('reply', { ...credentials, id: delivered.id, result: { ok: true, value: delivered.args[0].ids } })).status, 200);
  }
  assert.deepEqual((await a).value, { ok: true, value: ['codex'] });
  assert.deepEqual((await b).value, { ok: true, value: ['claude'] });
  await request('disconnect', credentials);
  assert.equal((await request('worlds')).value.worlds.length, 0);
});

test('undelivered timed-out edits are removed; dispatched timeout warns about an uncertain outcome', async t => {
  const { request, credentials } = await fixture(t, { callTimeoutMs: 60, pollTimeoutMs: 30 });
  const edit = { worldId: credentials.worldId, request: { kind: 'edit' } };
  const expired = await request('call', edit);
  assert.equal(expired.status, 504); assert.match(expired.value.error, /did not receive/);
  assert.deepEqual((await request('poll', credentials)).value, {});
  const dispatched = request('call', edit);
  const polled = await request('poll', credentials);
  assert.ok(polled.value.request.id);
  const uncertain = await dispatched;
  assert.equal(uncertain.status, 504); assert.match(uncertain.value.error, /may have applied/);
  assert.equal((await request('reply', { ...credentials, id: polled.value.request.id, result: {} })).status, 409);
});

test('relay rejects public/LAN access, cross-origin browser requests and non-JSON mutations', async t => {
  const local = { headers: { host: '127.0.0.1:4207' }, socket: { remoteAddress: '127.0.0.1' } };
  assert.doesNotThrow(() => assertLocalAgentRequest(local));
  for (const bad of [
    { ...local, headers: { host: 'evil.example:4207' } },
    { ...local, socket: { remoteAddress: '192.168.2.10' } },
    { ...local, headers: { ...local.headers, origin: 'https://evil.example' } },
    { ...local, headers: { ...local.headers, 'sec-fetch-site': 'cross-site' } },
  ]) assert.throws(() => assertLocalAgentRequest(bad), error => error.status === 403);
  const { request } = await fixture(t);
  assert.equal((await request('connect', {}, { origin: 'https://evil.example' })).status, 403);
  assert.equal((await request('connect', {}, { 'content-type': 'text/plain' })).status, 415);
});
