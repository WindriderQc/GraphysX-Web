import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { startStaticServer } from './static-server.mjs';
import { createGraphysXAgentRoute } from './graphysx-agent-relay.mjs';
import { launchSmokeBrowser, applySmokeTimeout, SMOKE_TIMEOUT } from './smoke-harness.mjs';
import { startGraphysXMcpClient } from '../test/support/graphysx-mcp-client.mjs';

const route = createGraphysXAgentRoute({ callTimeoutMs: SMOKE_TIMEOUT });
const server = await startStaticServer({ root: path.resolve('dist'), port: 0, routeRequest: route });
const browser = await launchSmokeBrowser();
const a = startGraphysXMcpClient(server.url), b = startGraphysXMcpClient(server.url);
const artifacts = process.env.SMOKE_ARTIFACTS || 'output/playwright/agent-mcp';
mkdirSync(artifacts, { recursive: true });
const errors = [];
const recoveryHttpErrors = [];
let resettingRelay = false;
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
applySmokeTimeout(page);
page.on('pageerror', error => errors.push(String(error)));
page.on('console', message => {
  if (message.type() !== 'error') return;
  const error = { text: message.text(), location: message.location() };
  // Clearing the relay intentionally makes the old poll return 404 or 410. Only this
  // exact endpoint and fault-injection window may emit that browser network diagnostic.
  if (resettingRelay && error.location.url === new URL('/graphysx-agent/poll', server.url).href
    && /^Failed to load resource: the server responded with a status of (404|410) /.test(error.text)) recoveryHttpErrors.push(error);
  else errors.push(error);
});
const jsonCall = async (client, name, args) => {
  const result = await client.call(name, args); assert.ok(!result.isError, JSON.stringify(result));
  return JSON.parse(result.content[0].text);
};
async function connected(previous) {
  const deadline = Date.now() + SMOKE_TIMEOUT;
  while (Date.now() < deadline) {
    const { worlds } = await jsonCall(a, 'worlds');
    const current = worlds.find(world => world.id !== previous);
    if (current) return current.id;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Visible browser did not connect to MCP');
}
try {
  await a.initialize(); await b.initialize();
  const prepared = await jsonCall(a, 'new_world');
  await page.goto(prepared.url, { waitUntil: 'domcontentloaded' });
  let worldId = await connected();
  let state = await jsonCall(a, 'observe', { worldId });
  await jsonCall(a, 'edit', { worldId, expectedRevision: state.revision, method: 'create', args: [{ schema: 'graphysx.agent-world/v2', id: 'mcp-shared', label: 'MCP shared world', entities: [
    { id: 'light', type: 'ambient-light', intensity: 1.4 },
    { id: 'codex-cube', type: 'box', transform: { position: [-0.6, 0.5, 0] }, material: { color: '#53b8da' } },
  ] }] });
  state = await jsonCall(b, 'observe', { worldId });
  await jsonCall(b, 'edit', { worldId, expectedRevision: state.revision, method: 'spawn', args: [{ id: 'claude-cube', type: 'box',
    transform: { position: [0.6, 0.5, 0] }, material: { color: '#c5874d' } }] });
  const stale = await a.call('edit', { worldId, expectedRevision: state.revision, method: 'remove', args: ['claude-cube'] });
  assert.equal(stale.isError, true); assert.match(stale.content[0].text, /Revision conflict/);
  state = await jsonCall(a, 'observe', { worldId });
  assert.deepEqual(state.entities.map(entity => entity.id).sort(), ['claude-cube', 'codex-cube', 'light']);
  await jsonCall(a, 'edit', { worldId, expectedRevision: state.revision, method: 'save', args: ['MCP shared scene'] });
  await page.reload({ waitUntil: 'domcontentloaded' });
  worldId = await connected(worldId);
  state = await jsonCall(b, 'observe', { worldId });
  await jsonCall(b, 'edit', { worldId, expectedRevision: state.revision, method: 'load', args: ['MCP shared scene'] });
  state = await jsonCall(a, 'observe', { worldId });
  assert.equal(state.world.id, 'mcp-shared'); assert.equal(state.entityCount, 3);
  const revision = state.revision;
  resettingRelay = true;
  route.dispose();
  worldId = await connected(worldId);
  state = await jsonCall(a, 'observe', { worldId });
  assert.equal(state.world.id, 'mcp-shared'); assert.equal(state.revision, revision);
  resettingRelay = false;
  assert.ok(recoveryHttpErrors.length <= 1, 'one forgotten poll can report the deliberately reset connection');
  // Exercise the browser's real attachment listeners with history-cache lifecycle events.
  // This tests restore wiring without claiming that this headless run entered the browser's cache.
  for (let restore = 0; restore < 2; restore++) {
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })));
    await page.waitForFunction(async () => !(await (await fetch('/graphysx-agent/worlds')).json()).worlds.length);
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
    worldId = await connected(worldId);
    state = await jsonCall(a, 'observe', { worldId });
    assert.equal(state.world.id, 'mcp-shared'); assert.equal(state.revision, revision);
  }
  await jsonCall(a, 'camera', { worldId, position: [3, 2.5, 5], target: [0, 0.6, 0] });
  const capture = await a.call('capture', { worldId }); assert.ok(!capture.isError, JSON.stringify(capture));
  const png = Buffer.from(capture.content[0].data, 'base64');
  assert.ok(png.length > 2000, 'capture contains actual rendered pixels');
  writeFileSync(path.join(artifacts, 'world.png'), png);
  writeFileSync(path.join(artifacts, 'state.json'), JSON.stringify(state, null, 2));
  await page.screenshot({ path: path.join(artifacts, 'browser.png') });
  assert.deepEqual(errors, []);
  console.log('GraphysX MCP: two clients, native edits, stale rejection, persistence, relay reconnect, page lifecycle, camera and rendered capture passed.');
} finally {
  a.close(); b.close(); await browser.close(); route.dispose(); await server.close();
}
