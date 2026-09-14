/** Shared routing for the local relay and the public page's private LAN connection. */
export function llmxTarget(method, pathname) {
  const family = pathname.startsWith('/llmx-api/family/');
  const route = family ? pathname.replace('/llmx-api/family/', '/llmx-api/') : pathname;
  const consumer = '/api/consumers/nestor/v1/llmx' + (family ? '/family' : '');
  const asset = /^\/(?:assets\/household|llmx-api\/assets)\/([^/]+)$/.exec(pathname);
  if (method === 'GET' && asset && ['browser-conversation.js', 'speech-language.js', 'voice-capture-worklet.js', 'voice-audio.js'].includes(asset[1])) {
    return asset[1] === 'voice-audio.js' ? '/api/voix/player.js' : '/assets/household/' + asset[1];
  }
  if (method === 'GET' && route === '/llmx-api/config') return consumer + '/config';
  if (method === 'GET' && route === '/llmx-api/sessions/recent') return consumer + '/sessions/recent';
  if (method === 'POST' && route === '/llmx-api/sessions') return consumer + '/sessions';
  const session = /^\/llmx-api\/sessions\/([a-zA-Z0-9-]{1,80})\/(history|turns\/text|opening|interrupt|scene-receipts)$/.exec(route);
  if (session && ((method === 'GET' && session[2] === 'history') || (method === 'POST' && session[2] !== 'history'))) {
    return consumer + '/sessions/' + session[1] + '/' + session[2];
  }
  if (method === 'GET' && pathname === '/llmx-api/voices') return '/api/voix/catalog';
  if (method === 'POST' && pathname === '/llmx-api/transcribe') return '/api/voix/transcribe';
  if (method === 'POST' && pathname === '/llmx-api/synthesize/stream') return '/api/voix/synthesize/stream';
  return null;
}
