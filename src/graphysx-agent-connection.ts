import type { PlatformHost } from './platform-host';

type ToolRequest = { id: string; kind: string; method?: string; args?: unknown[]; expectedRevision?: number; search?: string; position?: number[]; target?: number[] };
type Connection = { id: string; token: string };
type WorldInfo = { title?: string; path?: string; world?: unknown; revision?: number };

/** A relay answer the loop can reason about: 404/410 mean "this world is gone", 409 means "that reply is no longer wanted". */
export class GraphysXRelayError extends Error {
  constructor(message: string, readonly status: number) { super(message); this.name = 'GraphysXRelayError'; }
}

const NO_WORLD = 'No world is loaded in this tab yet; load or create a scene first';

export async function invokeGraphysXAgentTool(host: PlatformHost, request: ToolRequest) {
  const state = host.api.state();
  if (request.kind === 'camera') {
    if (!state) throw new Error(NO_WORLD);
    if (request.expectedRevision !== undefined && request.expectedRevision !== state.revision)
      throw new Error('Revision conflict; observe the current world first');
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
    if (!state) return { loaded: false, revision: null, message: NO_WORLD };
    const entities = [...state.entities].sort((a, b) => Number(b.id.startsWith('llmx-created-')) - Number(a.id.startsWith('llmx-created-')));
    return { loaded: true, world: state.world, revision: state.revision, entityCount: state.entityCount, jointCount: state.jointCount,
      bounds: state.bounds, selectedIds: state.selectedIds, paused: state.paused,
      entities: entities.slice(0, 24).map(entity => ({ id: entity.id, type: entity.type, label: entity.label, position: entity.position })),
      truncated: entities.length > 24, coordinateSystem: 'right-handed; +x east, +y up, -z north' };
  }
  if (!['read', 'edit'].includes(request.kind)) throw new Error('Unknown tool kind');
  const tool = host.bridge.manifest().tools.find(tool => tool.path === request.method);
  if (!tool || !Array.isArray(request.args ?? [])) throw new Error('Unknown tool or invalid arguments; discover the catalog first');
  if (tool.mutates !== (request.kind === 'edit')) throw new Error('Use read for observations and edit for changes');
  if (request.kind === 'edit') {
    if (!state) throw new Error(NO_WORLD);
    if (request.expectedRevision !== state.revision) throw new Error('Revision conflict; read the current world and reconsider the edit');
  }
  const result = await host.bridge.call(tool.path, ...(request.args ?? []));
  if (result && typeof result === 'object' && 'ok' in result && result.ok === false)
    throw new Error(String('error' in result ? result.error : 'World rejected this operation'));
  return { result, revision: host.api.state()?.revision };
}

export type GraphysXAgentLoopOptions = {
  /** POST a JSON body to a relay endpoint (`connect`, `poll`, `reply`, `disconnect`); must throw GraphysXRelayError on a non-2xx answer. */
  post: (endpoint: string, body: unknown) => Promise<any>;
  /** Current tab metadata sent with every connect/poll. */
  info: () => WorldInfo;
  /** Base64 PNG of the current frame. */
  capture: () => Promise<string>;
  sleep?: (ms: number) => Promise<void>;
  retryDelayMs?: number;
  maxRetryDelayMs?: number;
  onStatus?: (status: 'connected' | 'retrying' | 'stopped', detail?: string) => void;
};

/**
 * The tab side of the relay: connect, long-poll, execute, reply — forever.
 *
 * Nothing here is allowed to end the loop except `stop()`. A late reply the relay no longer wants (409),
 * a world the relay has forgotten (404/410, e.g. after a preview restart or a long sleep) and plain
 * network failures all lead to a reconnect with exponential backoff, never to a silently dead tab.
 */
export function createGraphysXAgentLoop(host: PlatformHost, options: GraphysXAgentLoopOptions) {
  const { post, info, capture, onStatus = () => {} } = options;
  const sleep = options.sleep ?? (ms => new Promise<void>(resolve => setTimeout(resolve, ms)));
  const retryDelayMs = options.retryDelayMs ?? 1000, maxRetryDelayMs = options.maxRetryDelayMs ?? 30_000;
  let connection: Connection | null = null;
  let stopped = false;
  let delay = retryDelayMs;
  let running: Promise<void> | undefined;

  async function execute(request: ToolRequest) {
    try {
      return { ok: true, value: request.kind === 'capture'
        ? { image: await capture(), mimeType: 'image/png', ...info() } : await invokeGraphysXAgentTool(host, request) };
    } catch (error) { return { ok: false, error: error instanceof Error ? error.message : String(error) }; }
  }

  async function iteration() {
    if (!connection) {
      const connected = await post('connect', info()) as Connection;
      if (stopped) {
        await post('disconnect', { worldId: connected.id, token: connected.token }).catch(() => {});
        return;
      }
      connection = connected;
      delay = retryDelayMs;
      onStatus('connected', connection.id);
    }
    const message = await post('poll', { worldId: connection.id, token: connection.token, info: info() });
    if (stopped) return;
    delay = retryDelayMs;
    if (!message?.request) return;
    const result = await execute(message.request);
    if (stopped) return;
    try { await post('reply', { worldId: connection.id, token: connection.token, id: message.request.id, result }); }
    catch (error) {
      // The relay already answered the agent with an "uncertain outcome" timeout; the work is done, keep serving.
      if (!(error instanceof GraphysXRelayError) || error.status !== 409) throw error;
    }
  }

  async function run() {
    while (!stopped) {
      try { await iteration(); }
      catch (error) {
        if (stopped) break;
        const status = error instanceof GraphysXRelayError ? error.status : 0;
        if (status === 404 || status === 410 || status === 403) connection = null;
        onStatus('retrying', `${error instanceof Error ? error.message : String(error)} (retry in ${delay} ms)`);
        await sleep(delay);
        delay = Math.min(delay * 2, maxRetryDelayMs);
      }
    }
    onStatus('stopped');
  }

  function stop() {
    if (stopped) return null;
    stopped = true;
    const current = connection; connection = null;
    return current;
  }

  return { run: () => running ??= run(), stop, get connection() { return connection; } };
}

/** Explicit local attachment to the already-rendered world. No extra browser or simulation. */
export function connectLocalGraphysXAgent(host: PlatformHost) {
  if (!['127.0.0.1', 'localhost'].includes(location.hostname) || location.protocol !== 'http:'
    || new URLSearchParams(location.search).get('agentBridge') !== '1') return;
  const info = () => {
    const state = host.api.state();
    return { title: document.title, path: location.pathname + location.search, world: state?.world, revision: state?.revision };
  };
  async function post(path: string, body: unknown, signal?: AbortSignal) {
    const response = await fetch('/graphysx-agent/' + path, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body), signal, keepalive: path === 'disconnect', redirect: 'error' });
    const json = response.headers.get('content-type')?.includes('application/json');
    if (!json) throw new GraphysXRelayError('Local GraphysX agent relay unavailable on this server', response.status);
    const value = await response.json();
    if (!response.ok) throw new GraphysXRelayError(String(value?.error ?? `Relay HTTP ${response.status}`), response.status);
    return value;
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
  let stopActive: (() => void) | undefined;
  const start = () => {
    if (stopActive) return;
    const controller = new AbortController();
    let lastStatus = '';
    const loop = createGraphysXAgentLoop(host, {
      post: (path, body) => post(path, body, path === 'disconnect' ? undefined : controller.signal), info, capture,
      onStatus: (status, detail) => {
        if (status === lastStatus && status === 'retrying') return; // one warning per outage, not one per attempt
        lastStatus = status;
        if (status === 'connected') console.info(`[graphysx-agent] connected to local relay as world ${detail}`);
        else if (status === 'retrying') console.warn(`[graphysx-agent] relay unreachable, reconnecting: ${detail}`);
      },
    });
    stopActive = () => {
      const connection = loop.stop();
      controller.abort();
      stopActive = undefined;
      if (connection) void post('disconnect', { worldId: connection.id, token: connection.token }).catch(() => {});
    };
    void loop.run();
  };
  window.addEventListener('pagehide', () => stopActive?.());
  // A history-cache restore resumes this same document; module initialization does not run again.
  window.addEventListener('pageshow', event => { if (event.persisted) start(); });
  start();
}
