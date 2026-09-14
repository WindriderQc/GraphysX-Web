import { importBrowserModule } from './import-browser-module.mjs';

const connection = await importBrowserModule(new URL('../../src/graphysx-agent-connection.ts', import.meta.url));

/** A 1x1 transparent PNG, so `capture` returns real image bytes without a renderer. */
export const TINY_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

/**
 * A stand-in for a connected browser tab: the real agent loop and tool dispatcher from
 * src/graphysx-agent-connection.ts, driven by fetch against a real relay, over a minimal in-memory world
 * instead of the renderer. Whatever this passes, the transport, revision and reconnect logic passed for real.
 */
export function startFakeGraphysXTab(baseUrl, { label = 'Fake world', slowMs = 150, loop: loopOptions = {} } = {}) {
  const entities = [];
  let revision = 0;
  const world = { id: 'fake-world', label };
  const host = {
    api: { state: () => ({ world, revision, entities, entityCount: entities.length, jointCount: 0, bounds: null, selectedIds: [], paused: false }) },
    frameView: (position, target) => { host.framed = { position, target }; },
    bridge: {
      manifest: () => ({ tools: [
        { path: 'query', summary: 'Read entities', mutates: false },
        { path: 'spawn', summary: 'Add one entity', mutates: true },
        { path: 'remove', summary: 'Remove one entity', mutates: true },
        { path: 'slow', summary: 'A mutation slower than the relay timeout', mutates: true },
      ] }),
      call: async (method, argument) => {
        if (method === 'query') return entities.filter(entity => !argument?.ids || argument.ids.includes(entity.id));
        if (method === 'spawn') {
          if (!argument?.id) return { ok: false, error: 'Entity id required' };
          entities.push(argument); revision++; return { ok: true, id: argument.id };
        }
        if (method === 'remove') { const index = entities.findIndex(entity => entity.id === argument); if (index < 0) return { ok: false, error: 'No such entity' }; entities.splice(index, 1); revision++; return { ok: true }; }
        if (method === 'slow') { await new Promise(resolve => setTimeout(resolve, slowMs)); revision++; return { ok: true }; }
        return { ok: false, error: 'Unknown method' };
      },
    },
  };
  async function post(endpoint, body) {
    const response = await fetch(new URL('/graphysx-agent/' + endpoint, baseUrl), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (!response.headers.get('content-type')?.includes('application/json')) throw new connection.GraphysXRelayError('No relay', response.status);
    const value = await response.json();
    if (!response.ok) throw new connection.GraphysXRelayError(String(value?.error ?? response.status), response.status);
    return value;
  }
  const statuses = [];
  const loop = connection.createGraphysXAgentLoop(host, {
    post, capture: async () => TINY_PNG, retryDelayMs: 20, maxRetryDelayMs: 100, ...loopOptions,
    info: () => ({ title: label, path: '/?agentBridge=1', world, revision }),
    onStatus: (status, detail) => { statuses.push(status); loopOptions.onStatus?.(status, detail); },
  });
  const finished = loop.run();
  return { host, entities, statuses, get revision() { return revision; }, get connection() { return loop.connection; },
    async stop() { loop.stop(); await finished; } };
}
