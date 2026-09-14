import assert from 'node:assert/strict';
import { test } from 'node:test';
import http from 'node:http';
import { createGraphysXAgentRoute } from '../scripts/graphysx-agent-relay.mjs';
import { startGraphysXMcpClient } from './support/graphysx-mcp-client.mjs';
import { startFakeGraphysXTab, TINY_PNG } from './support/fake-graphysx-tab.mjs';

/** Real stdio MCP processes -> real HTTP relay -> the real tab loop over an in-memory world. */
async function stack(t, relayOptions = {}, tabOptions = {}) {
  const route = createGraphysXAgentRoute({ callTimeoutMs: 400, pollTimeoutMs: 200, ...relayOptions });
  const server = http.createServer((request, response) => { if (!route(request, response)) { response.writeHead(404); response.end(); } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/`;
  const tab = startFakeGraphysXTab(url, tabOptions);
  const clients = [startGraphysXMcpClient(url), startGraphysXMcpClient(url)];
  t.after(async () => { for (const client of clients) client.close(); route.dispose(); await tab.stop(); server.closeAllConnections(); server.close(); });
  for (const client of clients) await client.initialize();
  const json = async (client, name, args) => {
    const result = await client.call(name, args);
    assert.ok(!result.isError, `${name}: ${result.content?.[0]?.text}`);
    return JSON.parse(result.content[0].text);
  };
  const worldId = async (client, previous) => {
    for (let attempt = 0; attempt < 100; attempt++) {
      const current = (await json(client, 'worlds')).worlds.find(world => world.id !== previous);
      if (current) return current.id;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    throw new Error('Tab never connected');
  };
  return { route, tab, clients, json, worldId };
}

test('two MCP clients build an in-memory scene through the relay: stale edits lose, camera and capture preserve receipts', async t => {
  const { tab, clients: [codex, claude], json, worldId } = await stack(t);
  const id = await worldId(codex);
  const listing = await json(claude, 'worlds');
  assert.equal(listing.worlds[0].world.label, 'Fake world');
  assert.equal('token' in listing.worlds[0], false, 'the tab credential never reaches an agent');

  let state = await json(codex, 'observe', { worldId: id });
  assert.deepEqual([state.loaded, state.revision, state.entityCount], [true, 0, 0]);
  await json(codex, 'edit', { worldId: id, expectedRevision: 0, method: 'spawn', args: [{ id: 'base', type: 'box' }] });
  const stale = await claude.call('edit', { worldId: id, expectedRevision: 0, method: 'spawn', args: [{ id: 'top', type: 'box' }] });
  assert.equal(stale.isError, true); assert.match(stale.content[0].text, /Revision conflict/);
  state = await json(claude, 'observe', { worldId: id });
  await json(claude, 'edit', { worldId: id, expectedRevision: state.revision, method: 'spawn', args: [{ id: 'top', type: 'box' }] });
  assert.deepEqual(tab.entities.map(entity => entity.id), ['base', 'top']);
  assert.deepEqual((await json(codex, 'read', { worldId: id, method: 'query', args: [{ ids: ['top'] }] })).result.map(entity => entity.id), ['top']);

  const wrongKind = await codex.call('read', { worldId: id, method: 'spawn', args: [{ id: 'x' }] });
  assert.match(wrongKind.content[0].text, /Use read for observations/);
  const rejected = await codex.call('edit', { worldId: id, expectedRevision: 2, method: 'spawn', args: [{}] });
  assert.match(rejected.content[0].text, /Entity id required/, 'native rejection surfaces as an MCP error');
  assert.equal((await json(codex, 'catalog', { worldId: id, search: 'remove' })).tools.length, 1);

  await json(claude, 'camera', { worldId: id, position: [3, 2, 5], target: [0, 0.5, 0] });
  assert.deepEqual(tab.host.framed, { position: [3, 2, 5], target: [0, 0.5, 0] });
  const capture = await codex.call('capture', { worldId: id });
  assert.equal(capture.isError, undefined, capture.content?.[0]?.text);
  assert.equal(capture.content[0].type, 'image');
  assert.equal(capture.content[0].data, TINY_PNG);
  assert.equal(JSON.parse(capture.content[1].text).revision, 2);
});

test('a tool slower than the relay timeout is reported as uncertain, and the tab keeps serving afterwards', async t => {
  const { tab, clients: [codex], json, worldId } = await stack(t, {}, { slowMs: 600 });
  const id = await worldId(codex);
  const slow = await codex.call('edit', { worldId: id, expectedRevision: 0, method: 'slow', args: [] });
  assert.equal(slow.isError, true); assert.match(slow.content[0].text, /may have applied/);
  await new Promise(resolve => setTimeout(resolve, 400));
  assert.equal(tab.revision, 1, 'the slow edit did apply');
  assert.equal((await json(codex, 'observe', { worldId: id })).revision, 1, 'same tab, still connected');
  assert.equal(tab.statuses.filter(status => status === 'connected').length, 1, 'no reconnect was needed');
});

test('when the relay forgets the tab (restart, stale sweep), the tab reconnects on its own and agents find it again', async t => {
  const { route, tab, clients: [codex], json, worldId } = await stack(t);
  const first = await worldId(codex);
  route.dispose(); // every world is dropped, exactly like a preview restart
  const second = await worldId(codex, first);
  assert.notEqual(second, first);
  assert.equal((await json(codex, 'observe', { worldId: second })).loaded, true);
  assert.ok(tab.statuses.includes('retrying'));
  assert.equal(tab.statuses.filter(status => status === 'connected').length, 2);
});
