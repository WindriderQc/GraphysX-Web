// The headless world service: the scene runtime, Rapier WASM and the island rules bundled into
// one Node ESM module (world-service/dist/world.js). The HTTP server around it is plain Node.
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    ssr: true,
    outDir: "world-service/dist",
    emptyOutDir: true,
    target: "node22",
    rollupOptions: {
      input: { world: "world-service/index.ts" },
      output: { format: "es", entryFileNames: "[name].js" },
    },
  },
  ssr: { noExternal: true },
  logLevel: "warn",
});
