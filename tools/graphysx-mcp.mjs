import { McpServer } from '@modelcontextprotocol/server';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, openSync, closeSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
export function localGraphysXUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname) || url.username || url.password
    || url.pathname !== '/' || url.search || url.hash) throw new Error('GRAPHYSX_URL must be a local HTTP origin');
  return url;
}

export function createGraphysXMcp({ url = process.env.GRAPHYSX_URL ?? 'http://127.0.0.1:4207/',
  autoStart = !['0', 'false', 'no'].includes(String(process.env.GRAPHYSX_AUTOSTART ?? '1').toLowerCase()) } = {}) {
  const base = localGraphysXUrl(url);
  const server = new McpServer({ name: 'graphysx', version: '1.0.0' });
  server.registerResource('world-api', 'graphysx://world-api', { mimeType: 'text/markdown', description: 'Native World API argument shapes, entity types and examples. Read when a tool or entity schema is needed.' },
    async uri => ({ contents: [{ uri: uri.href, mimeType: 'text/markdown', text: readFileSync(path.join(root, 'AGENT_WORLD_API.md'), 'utf8') }] }));
  let starting = null;
  async function request(endpoint, body) {
    const response = await fetch(new URL('/graphysx-agent/' + endpoint, base), { redirect: 'error', signal: AbortSignal.timeout(25_000),
      ...(body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}) });
    if (!response.headers.get('content-type')?.includes('application/json')) throw new Error(`The server at ${base.origin} has no GraphysX agent relay. Use a preview started by scripts/serve-llmx.mjs or the Vite dev server from this checkout, or point GRAPHYSX_URL at one.`);
    const value = await response.json();
    if (!response.ok) throw new Error(value.error ?? `GraphysX HTTP ${response.status}`);
    return value;
  }
  async function worlds() {
    try { return await request('worlds'); }
    catch (error) {
      if (!autoStart || error.cause?.code !== 'ECONNREFUSED') throw error;
      starting ??= (async () => {
        if (!existsSync(path.join(root, 'dist/index.html'))) throw new Error('Build GraphysX once with npm run build before opening its tools.');
        mkdirSync(path.join(root, 'output'), { recursive: true });
        const log = openSync(path.join(root, 'output/graphysx-agent-preview.log'), 'a');
        try {
          const child = spawn(process.execPath, [path.join(root, 'scripts/serve-llmx.mjs'), path.join(root, 'dist')], {
            cwd: root, detached: true, windowsHide: true, stdio: ['ignore', log, log],
            env: { ...process.env, PORT: base.port || '80', LLMX_HOST: '127.0.0.1' },
          });
          child.on('error', () => {}); child.unref();
        } finally { closeSync(log); }
        for (let attempt = 0; attempt < 30; attempt++) {
          await new Promise(resolve => setTimeout(resolve, 150));
          try { return await request('worlds'); } catch (error) { if (error.cause?.code !== 'ECONNREFUSED') throw error; }
        }
        throw new Error('GraphysX preview did not start; inspect output/graphysx-agent-preview.log');
      })().finally(() => { starting = null; });
      return starting;
    }
  }
  const asText = value => ({ content: [{ type: 'text', text: JSON.stringify(value) }] });
  const protect = handler => async args => {
    try { return await handler(args); }
    catch (error) { return { isError: true, content: [{ type: 'text', text: error.message }] }; }
  };
  async function call(worldId, tool) {
    const reply = await request('call', { worldId, request: tool });
    if (!reply?.ok) throw new Error(reply?.error ?? 'World returned no receipt');
    return reply.value;
  }
  const worldId = z.string().uuid().describe('Connected tab id from worlds, not the scene document id.');
  const args = z.array(z.unknown()).default([]).describe('Exact positional arguments documented by the native GraphysX API.');
  const register = (name, description, inputSchema, readOnly, handler) => server.registerTool(name, {
    description, inputSchema: z.object(inputSchema), annotations: { readOnlyHint: readOnly, destructiveHint: name === 'edit', openWorldHint: false },
  }, protect(handler));
  register('worlds', 'Find connected local GraphysX tabs and their current scene/revision. Reuse the requested tab; never guess a world id.', {}, true,
    async () => asText(await worlds()));
  register('new_world', 'Prepare an independent editable scene URL. Open the returned URL in the browser, then find its connected world. Existing tabs are preserved.', {}, false,
    async () => { await worlds(); const url = new URL(base); url.search = new URLSearchParams({ host: 'standalone', agentBridge: '1', agentScene: randomUUID() }).toString();
      return asText({ url: url.href, status: 'Open this URL in the browser to connect the new scene, then call worlds.' }); });
  register('catalog', 'Discover native GraphysX tools and mutability. Search e.g. prefab, formula, light, texture, physics, export; load details only when needed.',
    { worldId, search: z.string().max(100).default('') }, true, async ({ worldId, search }) => asText({ ...await call(worldId, { kind: 'catalog', search }), documentation: 'graphysx://world-api' }));
  register('observe', 'Read a compact world summary and revision. Use read/query to inspect specific entities before editing.', { worldId }, true,
    async ({ worldId }) => asText(await call(worldId, { kind: 'summary' })));
  register('read', 'Call a discovered read-only GraphysX method: query, assets, prefabs, formulas, history, exportDocument, etc. Does not change the world.',
    { worldId, method: z.string().max(80), args }, true, async ({ worldId, method, args }) => asText(await call(worldId, { kind: 'read', method, args })));
  register('edit', 'Call a discovered mutating GraphysX method at the observed revision. Prefer one native actor-attributed commit for related changes. A conflict requires re-observation; never blindly retry an uncertain edit.',
    { worldId, expectedRevision: z.number().int().nonnegative(), method: z.string().max(80), args }, false,
    async ({ worldId, ...request }) => asText(await call(worldId, { kind: 'edit', ...request })));
  register('capture', 'See a PNG of the actual rendered 3D viewport, including the face inset. Inspect it after visual edits; this does not capture surrounding HTML controls.', { worldId }, true,
    async ({ worldId }) => { const { image, mimeType, ...info } = await call(worldId, { kind: 'capture' });
      return { content: [{ type: 'image', data: image, mimeType }, ...asText(info).content] }; });
  const vector = z.tuple([z.number().min(-10_000).max(10_000), z.number().min(-10_000).max(10_000), z.number().min(-10_000).max(10_000)]);
  register('camera', 'Frame the actual main view using world-space camera position and target (+y up). Then capture to inspect the result. Does not edit scene entities or change the revision; pass expectedRevision only to guard against framing a scene that changed since you observed it.',
    { worldId, expectedRevision: z.number().int().nonnegative().optional(), position: vector, target: vector }, false,
    async ({ worldId, ...request }) => asText(await call(worldId, { kind: 'camera', ...request })));
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const server = createGraphysXMcp();
  await server.connect(new StdioServerTransport());
}
