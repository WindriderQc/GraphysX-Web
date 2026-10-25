import { readFileSync } from "node:fs";
import path from "node:path";
import { defineConfig, type Plugin } from "vite";

/**
 * The DiskX LAN embed: one self-contained ES module, `dist/embed/diskx.js`, defining
 * `<diskx-city>` for an AgentX Core page that relays it from its own origin (CSP 'self', no
 * CORS), like `llmx-face.js`. Everything is inlined so the host relays a single file:
 * - DiskX's own stylesheet is injected by the module itself;
 * - the brand webfonts are left out (the page falls back to system fonts) because a relayed
 *   single file cannot carry their woff2 URLs;
 * - the editor, which `<diskx-city>` never opens (`interactive: false`), is replaced by a stub
 *   so its code does not ride along.
 * Runs after the main build; never empties dist/.
 */
function singleFileDiskx(): Plugin {
  const INLINE = "\0diskx-inline-css:";
  const EMPTY = "\0diskx-empty";
  const EDITOR = "\0diskx-editor-stub";
  return {
    name: "graphysx-diskx-single-file",
    enforce: "pre",
    resolveId(source, importer) {
      if (source.startsWith("@fontsource/")) return EMPTY;
      if (source.endsWith(".css") && importer) return `${INLINE}${path.resolve(path.dirname(importer), source)}.inline.js`;
      if (source === "./platform-editor" && importer?.endsWith("platform-host.ts")) return EDITOR;
      return null;
    },
    load(id) {
      if (id === EMPTY) return "export default undefined;";
      if (id === EDITOR) return "export class PlatformEditor { constructor() { throw new Error('The editor is not part of the DiskX embed'); } }";
      if (id.startsWith(INLINE)) {
        const file = id.slice(INLINE.length, -".inline.js".length);
        const css = readFileSync(file, "utf8");
        return `if (typeof document !== "undefined" && !document.querySelector('style[data-diskx-css="${path.basename(file)}"]')) {
  const style = document.createElement("style"); style.dataset.diskxCss = ${JSON.stringify(path.basename(file))};
  style.textContent = ${JSON.stringify(css)}; document.head.append(style);
}
export default undefined;`;
      }
      return null;
    },
  };
}

export default defineConfig({
  publicDir: false,
  plugins: [singleFileDiskx()],
  build: {
    outDir: "dist/embed",
    emptyOutDir: false,
    copyPublicDir: false,
    lib: { entry: "src/diskx-embed.ts", formats: ["es"], fileName: () => "diskx.js" },
    rollupOptions: { output: { codeSplitting: false, minify: true } },
  },
});
