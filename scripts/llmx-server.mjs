import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

/** Private server composition; the browser never receives a Household origin or credential. */
export function createLlmXRoute({ householdUrl = process.env.LLMX_HOUSEHOLD_URL, fetchImpl = fetch } = {}) {
  const origin = householdUrl ? new URL(householdUrl) : null;
  if (origin && (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password
      || origin.pathname !== '/' || origin.search || origin.hash)) throw new Error('LLMX_HOUSEHOLD_URL must be a Household origin');
  const consumer = '/api/consumers/nestor/v1/llmx';
  const assets = new Set(['browser-conversation.js', 'speech-language.js', 'voice-capture-worklet.js', 'voice-audio.js']);
  const json = (res, status, data) => {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(data));
  };
  return (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const family = url.pathname.startsWith('/llmx-api/family/');
    const pathname = family ? url.pathname.replace('/llmx-api/family/', '/llmx-api/') : url.pathname;
    const profileConsumer = consumer + (family ? '/family' : '');
    const asset = /^\/(?:assets\/household|llmx-api\/assets)\/([^/]+)$/.exec(url.pathname);
    if (!url.pathname.startsWith('/llmx-api/') && !(asset && assets.has(asset[1]))) return false;
    if (!origin) {
      json(res, pathname === '/llmx-api/config' ? 200 : 503,
        { enabled: false, message: 'La conversation AgentX n’est pas configurée sur ce serveur.' });
      return true;
    }
    const session = /^\/llmx-api\/sessions\/([a-zA-Z0-9-]{1,80})\/(history|turns\/text|opening|interrupt|scene-receipts)$/.exec(pathname);
    const target = req.method === 'GET' && asset && assets.has(asset[1])
      ? asset[1] === 'voice-audio.js' ? '/api/voix/player.js' : '/assets/household/' + asset[1]
      : req.method === 'GET' && pathname === '/llmx-api/config' ? profileConsumer + '/config'
      : req.method === 'GET' && pathname === '/llmx-api/sessions/recent' ? profileConsumer + '/sessions/recent'
      : req.method === 'POST' && pathname === '/llmx-api/sessions' ? profileConsumer + '/sessions'
      : session && ((req.method === 'GET' && session[2] === 'history') || (req.method === 'POST' && session[2] !== 'history'))
        ? profileConsumer + '/sessions/' + session[1] + '/' + session[2]
      : req.method === 'GET' && url.pathname === '/llmx-api/voices' ? '/api/voix/catalog'
      : req.method === 'POST' && url.pathname === '/llmx-api/transcribe' ? '/api/voix/transcribe'
      : req.method === 'POST' && url.pathname === '/llmx-api/synthesize/stream' ? '/api/voix/synthesize/stream'
      : null;
    if (!target) { json(res, 404, { message: 'Action de conversation inconnue.' }); return true; }
    void (async () => {
      const abort = new AbortController();
      const cancel = () => { if (!res.writableEnded) abort.abort(); };
      req.once('aborted', cancel); res.once('close', cancel);
      const timer = setTimeout(() => abort.abort(), 650000);
      try {
        let body;
        if (req.method === 'POST') {
          const chunks = []; let length = 0;
          for await (const chunk of req) {
            length += chunk.length;
            if (length > 32 * 1024 * 1024) { json(res, 413, { message: 'Cette entrée est trop longue.' }); return; }
            chunks.push(chunk);
          }
          body = Buffer.concat(chunks);
        }
        const headers = body ? { 'Content-Type': req.headers['content-type'] || 'application/json' } : {};
        const response = await fetchImpl(new URL(target, origin), { method: req.method, body, headers,
          redirect: 'error', signal: abort.signal });
        if (abort.signal.aborted || res.destroyed) return;
        if (pathname === '/llmx-api/config') {
          if (!response.ok) { json(res, 200, { enabled: false, message: 'Le raccord LLMx attend la mise à jour AgentX.' }); return; }
          const payload = await response.json().catch(() => null);
          const config = payload?.data ?? payload;
          if (!config || Array.isArray(config) || config.schemaVersion !== 1 || config.openingVersion !== 1
              || config.capabilities?.openingTurn !== true || config.capabilities?.interrupt !== true) {
            json(res, 200, { enabled: false, message: 'Le raccord LLMx attend la mise à jour AgentX.' }); return;
          }
          json(res, 200, { ...config, enabled: config.enabled !== false });
          return;
        }
        const responseHeaders = { 'Content-Type': response.headers.get('content-type') || 'application/json',
          'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' };
        for (const name of ['x-voix-provider', 'x-voix-voice', 'x-voix-language']) {
          if (response.headers.has(name)) responseHeaders[name] = response.headers.get(name);
        }
        res.writeHead(response.status, responseHeaders);
        if (response.body) await pipeline(Readable.fromWeb(response.body), res);
        else res.end();
      } catch {
        if (!res.destroyed && !res.headersSent) json(res, 503, { message: 'La connexion à AgentX est interrompue. La Forge reste disponible.' });
        else if (!res.destroyed) res.destroy();
      } finally {
        clearTimeout(timer); req.off('aborted', cancel); res.off('close', cancel);
      }
    })();
    return true;
  };
}
