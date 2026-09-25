import { defineConfig } from "vite";

/**
 * The `<llmx-face>` embed: one self-contained ES module next to the product build, for another
 * LAN page (AgentX Household) to dock the mask. Everything (three.js, the sculpt JSON) is inlined
 * so the host can relay one file from its own origin. Runs after the main build; never empties dist/.
 */
export default defineConfig({
  publicDir: false,
  build: {
    outDir: "dist/embed",
    emptyOutDir: false,
    copyPublicDir: false,
    lib: { entry: "src/llmx-face-element.ts", formats: ["es"], fileName: () => "llmx-face.js" },
    // Vite keeps whitespace in ES library output; the file is relayed as-is, so the bundler squeezes it.
    rollupOptions: { output: { inlineDynamicImports: true, minify: true } },
  },
});
