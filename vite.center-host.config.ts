import { defineConfig } from "vite";

/**
 * The host end of the Center bridge: one small ES module, `dist/embed/center-host.js`, defining
 * `<graphysx-center>` for an AgentX Core page that frames the Center and relays this file from its
 * own origin (CSP 'self', no CORS), like `diskx.js`. It carries no three.js and no scene code —
 * only the message protocol it shares with the Center bundle, so both ends ship from one build.
 * Runs after the main build; never empties dist/.
 */
export default defineConfig({
  publicDir: false,
  build: {
    outDir: "dist/embed",
    emptyOutDir: false,
    copyPublicDir: false,
    lib: { entry: "src/center-host-embed.ts", formats: ["es"], fileName: () => "center-host.js" },
    rollupOptions: { output: { inlineDynamicImports: true, minify: true } },
  },
});
