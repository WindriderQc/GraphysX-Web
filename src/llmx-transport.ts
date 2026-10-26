import { llmxTarget } from "../server/llmx-target.mjs";

const configuredOrigin = import.meta.env?.VITE_LLMX_AGENTX_ORIGIN || '';
const coreHosted = import.meta.env?.VITE_LLMX_CORE_HOSTED === '1';

/** The public Forge remains local; conversations open on Core's private origin. */
export function llmxCoreEntry(profile: 'personal' | 'family', origin = configuredOrigin): string | null {
  if (!origin || coreHosted) return null;
  const url = new URL(llmxUrl('/llmx-api/config', 'GET', origin));
  url.pathname = '/llmx';
  url.search = profile === 'family' ? '?profile=family' : '';
  return url.href;
}

/** A public static page reaches the owner's existing HTTPS LAN service directly. */
export function llmxUrl(path: string, method = 'GET', origin = configuredOrigin, onCore = coreHosted): string {
  if (!origin && !onCore) return path;
  const target = llmxTarget(method, path);
  if (!target) throw new Error('Action de conversation inconnue.');
  if (onCore) return target;
  const base = new URL(origin);
  if (base.protocol !== 'https:' || base.username || base.password || base.pathname !== '/' || base.search || base.hash) {
    throw new Error('VITE_LLMX_AGENTX_ORIGIN must be an HTTPS origin without credentials or a path.');
  }
  return new URL(target, base).href;
}

export function createLlmXFetch(origin = configuredOrigin, fetcher: typeof fetch = globalThis.fetch.bind(globalThis)): typeof fetch {
  return async (input, init) => {
    const path = String(input);
    try {
      return await fetcher(llmxUrl(path, init?.method || 'GET', origin), origin ? { ...init, credentials: 'omit' } : init);
    } catch (error) {
      if (origin && error instanceof TypeError) {
        throw new Error('AgentX est accessible sur ton réseau privé. Connecte-toi au réseau de la maison, puis réessaie.', { cause: error });
      }
      throw error;
    }
  };
}
