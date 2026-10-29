// Bundles the spike for Node: the browser runtime's TypeScript, Three.js math and Rapier
// WASM all go into one ESM file per entry. `npm` scripts are deliberately not touched.
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    ssr: true,
    outDir: "spike/world-service/.build",
    emptyOutDir: true,
    target: "node22",
    rollupOptions: {
      input: {
        main: "spike/world-service/main.ts",
        index: "spike/world-service/index.ts",
        "runtime-probe": "spike/world-service/runtime-probe.ts",
        "runtime-breadth-probe": "spike/world-service/runtime-breadth-probe.ts",
      },
      output: { format: "es" },
    },
  },
  ssr: { noExternal: true },
  logLevel: "warn",
});
