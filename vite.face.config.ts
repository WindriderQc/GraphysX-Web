import { defineConfig } from "vite";

/**
 * The LAN embed: one self-contained ES module next to the product build, defining `<llmx-face>`
 * (the docked mask) and `<llmx-stage>` (the math picture alone) for another LAN page (AgentX Household). Everything (three.js, the sculpt JSON) is inlined
 * so the host can relay one file from its own origin. Runs after the main build; never empties dist/.
 */
export default defineConfig({
  publicDir: false,
  build: {
    outDir: "dist/embed",
    emptyOutDir: false,
    copyPublicDir: false,
    lib: { entry: "src/llmx-embed.ts", formats: ["es"], fileName: () => "llmx-face.js" },
    // Vite keeps whitespace in ES library output; the file is relayed as-is, so the bundler squeezes it.
    rollupOptions: { output: { inlineDynamicImports: true, minify: true } },
  },
});
