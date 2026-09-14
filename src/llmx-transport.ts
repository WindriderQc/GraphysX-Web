import { llmxTarget } from "../server/llmx-target.mjs";

const configuredOrigin = import.meta.env?.VITE_LLMX_AGENTX_ORIGIN || '';

/** A public static page reaches the owner's existing HTTPS LAN service directly. */
export function llmxUrl(path: string, method = 'GET', origin = configuredOrigin): string {
  if (!origin) return path;
  const base = new URL(origin);
  if (base.protocol !== 'https:' || base.username || base.password || base.pathname !== '/' || base.search || base.hash) {
    throw new Error('VITE_LLMX_AGENTX_ORIGIN must be an HTTPS origin without credentials or a path.');
  }
  const target = llmxTarget(method, path);
  if (!target) throw new Error('Action de conversation inconnue.');
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
