import { randomUUID } from 'node:crypto';

const PREFIX = '/graphysx-agent';
const failure = (message, status = 400) => Object.assign(new Error(message), { status });
const send = (response, status, value) => {
  if (response.destroyed || response.writableEnded) return;
  response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  response.end(JSON.stringify(value));
};

/** Local native clients and pages on this exact origin only. Never exposed through LAN/public hosts. */
export function assertLocalAgentRequest(request) {
  const host = request.headers.host;
  if (!/^(127\.0\.0\.1|localhost):\d+$/.test(host ?? '')
    || !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.socket.remoteAddress)) throw failure('Local computer only', 403);
  if (request.headers.origin && request.headers.origin !== `http://${host}`) throw failure('Origin rejected', 403);
  if (request.headers['sec-fetch-site'] && !['same-origin', 'none'].includes(request.headers['sec-fetch-site'])) throw failure('Cross-site request rejected', 403);
}

async function readBody(request) {
  if (!request.headers['content-type']?.startsWith('application/json')) throw failure('JSON body required', 415);
  const chunks = []; let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > 8 * 1024 * 1024) throw failure('Request too large', 413);
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw failure('Invalid JSON'); }
}

/** Request delivery only; the browser's existing World API owns scene state and revisions. */
export function createGraphysXAgentRoute({ callTimeoutMs = 20_000, pollTimeoutMs = 20_000, staleMs = 60_000 } = {}) {
  const worlds = new Map();
  function remove(world) {
    worlds.delete(world.id);
    if (world.poll) { clearTimeout(world.poll.timer); send(world.poll.response, 410, { error: 'World disconnected' }); }
    for (const pending of world.pending.values()) {
      clearTimeout(pending.timer); pending.reject(failure('World disconnected; inspect before retrying any edit', 410));
    }
    world.pending.clear();
  }
  function deliver(world) {
    if (!world.poll) return;
    const pending = [...world.pending.values()].find(entry => !entry.dispatched);
    if (!pending) return;
    const poll = world.poll; world.poll = null; clearTimeout(poll.timer);
    pending.dispatched = true;
    send(poll.response, 200, { request: pending.request });
  }
  const metadata = value => ({ title: String(value?.title ?? 'GraphysX').slice(0, 120),
    path: String(value?.path ?? '/').slice(0, 240), world: value?.world ? { id: String(value.world.id).slice(0, 120), label: String(value.world.label).slice(0, 120) } : null,
    revision: Number.isSafeInteger(value?.revision) ? value.revision : null });
  async function handle(request, response, pathname) {
    assertLocalAgentRequest(request);
    for (const world of worlds.values()) if (Date.now() - world.seen > staleMs) remove(world);
    if (request.method === 'GET' && pathname === PREFIX + '/worlds')
      return send(response, 200, { worlds: [...worlds.values()].map(({ id, info }) => ({ id, ...info })) });
    if (request.method !== 'POST') throw failure('Method not allowed', 405);
    const body = await readBody(request);
    if (!body || typeof body !== 'object') throw failure('Object body required');
    if (pathname === PREFIX + '/connect') {
      if (worlds.size >= 12) throw failure('Too many connected worlds', 429);
      const world = { id: randomUUID(), token: randomUUID(), info: metadata(body), seen: Date.now(), pending: new Map(), poll: null };
      worlds.set(world.id, world);
      return send(response, 201, { id: world.id, token: world.token });
    }
    const world = worlds.get(body.worldId);
    if (!world) throw failure('World unavailable; list worlds again', 404);
    if (pathname === PREFIX + '/call') {
      if (world.pending.size >= 8) throw failure('World busy', 429);
      if (!body.request || typeof body.request.kind !== 'string') throw failure('Tool request required');
      const id = randomUUID();
      const result = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          const pending = world.pending.get(id); world.pending.delete(id);
          reject(failure(pending?.dispatched ? 'Response timed out; an edit may have applied. Inspect before retrying.' : 'World did not receive the request', 504));
        }, callTimeoutMs);
        world.pending.set(id, { request: { ...body.request, id }, timer, resolve, reject, dispatched: false });
        deliver(world);
      });
      return send(response, 200, result);
    }
    if (body.token !== world.token) throw failure('World credential rejected', 403);
    world.seen = Date.now();
    if (pathname === PREFIX + '/poll') {
      if (world.poll) throw failure('World already polling', 409);
      world.info = metadata(body.info);
      const poll = { response, timer: setTimeout(() => { if (world.poll === poll) world.poll = null; send(response, 200, {}); }, pollTimeoutMs) };
      world.poll = poll;
      response.once('close', () => { clearTimeout(poll.timer); if (world.poll === poll) world.poll = null; });
      deliver(world); return;
    }
    if (pathname === PREFIX + '/reply') {
      const pending = world.pending.get(body.id);
      if (!pending?.dispatched) throw failure('Request no longer pending', 409);
      clearTimeout(pending.timer); world.pending.delete(body.id); pending.resolve(body.result);
      return send(response, 200, { ok: true });
    }
    if (pathname === PREFIX + '/disconnect') { remove(world); return send(response, 200, { ok: true }); }
    throw failure('Route not found', 404);
  }
  const route = (request, response) => {
    const pathname = request.url.split('?')[0];
    if (!pathname.startsWith(PREFIX + '/')) return false;
    void handle(request, response, pathname).catch(error => send(response, error.status ?? 500, { error: error.message }));
    return true;
  };
  route.dispose = () => { for (const world of worlds.values()) remove(world); };
  return route;
}
