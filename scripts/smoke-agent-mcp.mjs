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
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
applySmokeTimeout(page);
page.on('pageerror', error => errors.push(String(error)));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
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
  await jsonCall(a, 'camera', { worldId, expectedRevision: state.revision, position: [3, 2.5, 5], target: [0, 0.6, 0] });
  const capture = await a.call('capture', { worldId }); assert.ok(!capture.isError, JSON.stringify(capture));
  const png = Buffer.from(capture.content[0].data, 'base64');
  assert.ok(png.length > 2000, 'capture contains actual rendered pixels');
  writeFileSync(path.join(artifacts, 'world.png'), png);
  writeFileSync(path.join(artifacts, 'state.json'), JSON.stringify(state, null, 2));
  await page.screenshot({ path: path.join(artifacts, 'browser.png') });
  assert.deepEqual(errors, []);
  console.log('GraphysX MCP: two clients, native edits, stale rejection, persistence, camera and rendered capture passed.');
} finally {
  a.close(); b.close(); await browser.close(); route.dispose(); await server.close();
}
