import assert from 'node:assert/strict';
import { test } from 'node:test';
import http from 'node:http';
import { localGraphysXUrl } from '../tools/graphysx-mcp.mjs';
import { startGraphysXMcpClient } from './support/graphysx-mcp-client.mjs';

test('the standard MCP transport initializes and exposes bounded tools to both client processes', async t => {
  const backend = http.createServer((request, response) => {
    response.writeHead(200, { 'content-type': 'application/json' }); response.end(JSON.stringify({ worlds: [] }));
  });
  await new Promise(resolve => backend.listen(0, '127.0.0.1', resolve));
  t.after(() => { backend.closeAllConnections(); backend.close(); });
  for (let i = 0; i < 2; i++) {
    const client = startGraphysXMcpClient(`http://127.0.0.1:${backend.address().port}/`);
    t.after(() => client.close());
    const initialized = await client.initialize();
    assert.equal(initialized.serverInfo.name, 'graphysx');
    const resources = await client.request('resources/list');
    assert.ok(resources.resources.some(resource => resource.uri === 'graphysx://world-api'));
    const reference = await client.request('resources/read', { uri: 'graphysx://world-api' });
    assert.match(reference.contents[0].text, /GraphysX Agent World API/);
    const { tools } = await client.request('tools/list');
    assert.deepEqual(tools.map(tool => tool.name).sort(), ['camera', 'capture', 'catalog', 'edit', 'new_world', 'observe', 'read', 'worlds']);
    assert.equal(tools.find(tool => tool.name === 'read').annotations.readOnlyHint, true);
    assert.equal(tools.find(tool => tool.name === 'edit').annotations.readOnlyHint, false);
    assert.ok(tools.find(tool => tool.name === 'edit').inputSchema.required.includes('expectedRevision'));
    assert.deepEqual(JSON.parse((await client.call('worlds')).content[0].text), { worlds: [] });
    const prepared = JSON.parse((await client.call('new_world')).content[0].text);
    assert.equal(new URL(prepared.url).searchParams.get('agentBridge'), '1');
    assert.equal(new URL(prepared.url).searchParams.get('host'), 'standalone');
    assert.equal((await client.call('edit', {})).isError, true);
    client.close();
  }
});

test('MCP never forwards credentials or requests to non-local endpoints', () => {
  assert.equal(localGraphysXUrl('http://127.0.0.1:4207').hostname, '127.0.0.1');
  for (const url of ['https://example.com', 'http://192.168.2.99:3080', 'http://user:password@localhost:4207', 'http://localhost:4207/private'])
    assert.throws(() => localGraphysXUrl(url), /local HTTP origin/);
});
