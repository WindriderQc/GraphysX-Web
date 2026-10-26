import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDiskxRoute } from '../scripts/diskx-server.mjs';
function request(route, url, method = 'GET') {
  return new Promise(resolve => {
    const res = { destroyed: false, writableEnded: false, headersSent: false, once() {},
      writeHead(status) { this.status = status; this.headersSent = true; },
      end(body) { this.writableEnded = true; resolve({ status: this.status, body: JSON.parse(body) }); } };
    assert.equal(route({ url, method }, res), true);
  });
}
test('Janitor relay exposes fixed GET reads only and never run/generate/approve', async () => {
  const targets = [];
  const route = createDiskxRoute({ dataUrl: 'https://example.invalid', fetchImpl: async target => {
    targets.push(String(target)); return new Response(JSON.stringify({ status: 'success', data: {} }));
  } });
  assert.equal((await request(route, '/diskx-api/janitor-strategy')).status, 200);
  assert.equal((await request(route, '/diskx-api/janitor-groups?offset=20&limit=20&execute=true')).status, 200);
  assert.deepEqual(targets, ['https://example.invalid/api/data-toolbox/janitor/strategy/latest', 'https://example.invalid/api/data-toolbox/janitor/strategy/latest/groups?offset=20&limit=20']);
  assert.equal((await request(route, '/diskx-api/janitor-strategy', 'POST')).status, 405);
  assert.equal((await request(route, '/diskx-api/janitor-run')).status, 404);
  assert.equal((await request(route, '/diskx-api/volumes')).status, 404, 'volumes ride inside summary; the relay declares none');
  assert.equal((await request(route, '/diskx-api/janitor-groups?offset=-1')).status, 400);
  assert.equal(targets.length, 2);
  const config = await request(route, '/diskx-api/config');
  assert.equal(config.status, 200);
  assert.equal('volumes' in config.body, false);
});
test('a named group is read by its SHA-256 only', async () => {
  const targets = [];
  const route = createDiskxRoute({ dataUrl: 'https://example.invalid', fetchImpl: async target => {
    targets.push(String(target)); return new Response(JSON.stringify({ status: 'success', data: {} }));
  } });
  const sha = 'a'.repeat(64);
  assert.equal((await request(route, `/diskx-api/janitor-groups?sha256=${sha}`)).status, 200);
  assert.deepEqual(targets, [`https://example.invalid/api/data-toolbox/janitor/strategy/latest/groups?sha256=${sha}`]);
  for (const bad of ['ABC', `${sha},${sha}`, `${sha}x`]) assert.equal((await request(route, `/diskx-api/janitor-groups?sha256=${encodeURIComponent(bad)}`)).status, 400, bad);
  assert.equal(targets.length, 1);
});
