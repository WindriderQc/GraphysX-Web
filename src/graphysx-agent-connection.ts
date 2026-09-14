import type { PlatformHost } from './platform-host';

type ToolRequest = { id: string; kind: string; method?: string; args?: unknown[]; expectedRevision?: number; search?: string; position?: number[]; target?: number[] };

export async function invokeGraphysXAgentTool(host: PlatformHost, request: ToolRequest) {
  if (request.kind === 'camera') {
    if (request.expectedRevision !== host.api.state()?.revision) throw new Error('Revision conflict; observe the current world first');
    for (const vector of [request.position, request.target]) if (!Array.isArray(vector) || vector.length !== 3
      || vector.some(value => !Number.isFinite(value) || Math.abs(value) > 10_000)) throw new Error('Camera coordinates must be three bounded finite numbers');
    if (request.position!.every((value, axis) => value === request.target![axis])) throw new Error('Camera position and target must differ');
    host.frameView(request.position as [number, number, number], request.target as [number, number, number], 0);
    return { position: request.position, target: request.target, revision: host.api.state()?.revision };
  }
  if (request.kind === 'catalog') {
    const manifest = host.bridge.manifest(), query = (request.search ?? '').toLocaleLowerCase();
    return { ...manifest, tools: manifest.tools.filter(tool => !query || `${tool.path} ${tool.summary}`.toLocaleLowerCase().includes(query)) };
  }
  if (request.kind === 'summary') {
    const state = host.api.state();
    if (!state) return null;
    const entities = [...state.entities].sort((a, b) => Number(b.id.startsWith('llmx-created-')) - Number(a.id.startsWith('llmx-created-')));
    return { world: state.world, revision: state.revision, entityCount: state.entityCount, jointCount: state.jointCount,
      bounds: state.bounds, selectedIds: state.selectedIds, paused: state.paused,
      entities: entities.slice(0, 24).map(entity => ({ id: entity.id, type: entity.type, label: entity.label, position: entity.position })),
      truncated: entities.length > 24, coordinateSystem: 'right-handed; +x east, +y up, -z north' };
  }
  if (!['read', 'edit'].includes(request.kind)) throw new Error('Unknown tool kind');
  const tool = host.bridge.manifest().tools.find(tool => tool.path === request.method);
  if (!tool || !Array.isArray(request.args ?? [])) throw new Error('Unknown tool or invalid arguments; discover the catalog first');
  if (tool.mutates !== (request.kind === 'edit')) throw new Error('Use read for observations and edit for changes');
  if (request.kind === 'edit' && request.expectedRevision !== host.api.state()?.revision)
    throw new Error('Revision conflict; read the current world and reconsider the edit');
  const result = await host.bridge.call(tool.path, ...(request.args ?? []));
  if (result && typeof result === 'object' && 'ok' in result && result.ok === false)
    throw new Error(String('error' in result ? result.error : 'World rejected this operation'));
  return { result, revision: host.api.state()?.revision };
}

/** Explicit local attachment to the already-rendered world. No extra browser or simulation. */
export function connectLocalGraphysXAgent(host: PlatformHost) {
  if (!['127.0.0.1', 'localhost'].includes(location.hostname) || location.protocol !== 'http:'
    || new URLSearchParams(location.search).get('agentBridge') !== '1') return;
  const controller = new AbortController();
  let connection: { id: string; token: string } | null = null;
  let stopped = false;
  const info = () => {
    const state = host.api.state();
    return { title: document.title, path: location.pathname + location.search, world: state?.world, revision: state?.revision };
  };
  async function post(path: string, body: unknown) {
    const response = await fetch('/graphysx-agent/' + path, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body), signal: controller.signal });
    if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) throw new Error('Local GraphysX tools unavailable');
    return response.json();
  }
  async function capture() {
    return new Promise<string>((resolve, reject) => {
      const timeout = window.setTimeout(() => { unsubscribe(); reject(new Error('The world is not rendering')); }, 5000);
      const unsubscribe = host.subscribeAfterRender(() => {
        unsubscribe(); clearTimeout(timeout);
        try {
          const source = host.renderer.domElement, image = document.createElement('canvas');
          const ratio = Math.min(1, 1280 / source.width);
          image.width = Math.round(source.width * ratio); image.height = Math.round(source.height * ratio);
          image.getContext('2d')!.drawImage(source, 0, 0, image.width, image.height);
          resolve(image.toDataURL('image/png').split(',')[1]);
        } catch (error) { reject(error); }
      });
    });
  }
  async function run() {
    try {
      connection = await post('connect', info());
      while (!stopped && connection) {
        const message = await post('poll', { worldId: connection.id, token: connection.token, info: info() });
        if (!message.request) continue;
        let result;
        try { result = { ok: true, value: message.request.kind === 'capture'
          ? { image: await capture(), mimeType: 'image/png', ...info() } : await invokeGraphysXAgentTool(host, message.request) }; }
        catch (error) { result = { ok: false, error: error instanceof Error ? error.message : String(error) }; }
        await post('reply', { worldId: connection.id, token: connection.token, id: message.request.id, result });
      }
    } catch { /* A stopped preview or disconnected tab does not affect the authored world. */ }
  }
  const stop = () => {
    stopped = true; controller.abort();
    if (connection) void fetch('/graphysx-agent/disconnect', { method: 'POST', keepalive: true,
      headers: { 'content-type': 'application/json' }, body: JSON.stringify({ worldId: connection.id, token: connection.token }) }).catch(() => {});
  };
  window.addEventListener('pagehide', stop, { once: true });
  void run();
}
