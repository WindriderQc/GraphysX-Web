/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Where a production visitor's browser finds the scene store, baked in at build time.
   *
   * Unset (the default) means the build makes no store request at all — which is what keeps
   * a storeless deploy's console clean. Set it to a same-origin path such as `/store` once a
   * store is proxied there; see docs/DEPLOYING_THE_STORE.md.
   */
  readonly VITE_GRAPHYSX_STORE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
