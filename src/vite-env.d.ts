/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Existing private HTTPS AgentX origin used by the public static LLMx page. */
  readonly VITE_LLMX_AGENTX_ORIGIN?: string;
  /**
   * Where a production visitor's browser finds the scene store, baked in at build time.
   *
   * Unset (the default) means the build makes no store request at all — which is what keeps
   * a storeless deploy's console clean. Set it to a same-origin path such as `/store` once a
   * store is proxied there; see docs/DEPLOYING_THE_STORE.md.
   */
  readonly VITE_GRAPHYSX_STORE_URL?: string;
  /**
   * A model provider for Nestor's requests, baked in at build time. Unset (the default) means the
   * page makes no request and composes the three demonstrations locally; see docs/NESTOR_PROPOSALS.md.
   */
  readonly VITE_GRAPHYSX_PROPOSAL_URL?: string;
  /**
   * Origins allowed to frame the Center as its host (an AgentX Core page), separated by commas
   * or whitespace. Same-origin and loopback hosts are always allowed; nothing else is, so an
   * unset variable means the public Center answers no framing page.
   */
  readonly VITE_GRAPHYSX_HOST_ORIGINS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
