#!/usr/bin/env node
// Packages the standalone Cyber Race page (cyber-race.html, src/cyber-race/) into a folder
// that runs from disk, for Playnite or any launcher:
//   cyber-race.html            single file, JavaScript inlined (works over file://)
//   Cyber Race 1992.cmd        launcher: Edge app window, fullscreen, own profile
//
// The page is not part of the product build (vite.config.ts builds index.html only), so this
// script runs its own Vite build with no config file and writes under output/, never dist/.
//
// Usage: node scripts/package-cyber-race.mjs [outDir]   (default output/cyber-race/package)
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { build } from "vite";

const root = resolve(import.meta.dirname, "..");
const buildDir = join(root, "output", "cyber-race", "build");
const outDir = resolve(process.argv[2] ?? join(root, "output", "cyber-race", "package"));

await build({
  configFile: false,
  root,
  base: "./",
  publicDir: false,
  logLevel: "warn",
  build: {
    outDir: buildDir,
    emptyOutDir: true,
    modulePreload: false,
    assetsInlineLimit: 100_000_000,
    chunkSizeWarningLimit: 1000,
    rollupOptions: { input: join(root, "cyber-race.html") },
  },
});

let html = readFileSync(join(buildDir, "cyber-race.html"), "utf8");
const scripts = [...html.matchAll(/<script type="module" crossorigin src="\.\/(assets\/[^"]+\.js)"><\/script>/g)];
if (scripts.length !== 1) {
  throw new Error(`expected one module script in the build, found ${scripts.length}`);
}
const [tag, path] = scripts[0];
const code = readFileSync(join(buildDir, path), "utf8").replace(/<\/script/gi, "<\\/script");
if (/\bimport\s*\(|^import\s/m.test(code)) {
  throw new Error("the bundle still imports other chunks; it cannot be inlined");
}
const leftovers = readdirSync(join(buildDir, "assets")).filter((f) => !f.endsWith(".js"));
if (leftovers.length > 0) {
  throw new Error(`unexpected non-inlined assets: ${leftovers.join(", ")}`);
}
html = html.replace(tag, () => "").replace("</body>", () => `<script type="module">\n${code}\n</script>\n</body>`);

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "cyber-race.html"), html);

// Edge ships with Windows 11 and speaks WebXR through OpenXR (Quest Link).
// A private --user-data-dir keeps the launched process alive until the window closes,
// so Playnite can track play time, and keeps the game's saved settings apart.
const cmd = [
  "@echo off",
  "rem Cyber Race 1992 - launcher (Playnite: point the play action at this file or at msedge.exe with the same arguments)",
  'set "GAME=%~dp0"',
  'set "URL=file:///%GAME:\\=/%cyber-race.html"',
  'set "EDGE=%ProgramFiles(x86)%\\Microsoft\\Edge\\Application\\msedge.exe"',
  'if not exist "%EDGE%" set "EDGE=%ProgramFiles%\\Microsoft\\Edge\\Application\\msedge.exe"',
  '"%EDGE%" --app="%URL%" --start-fullscreen --user-data-dir="%GAME%profile" --autoplay-policy=no-user-gesture-required --no-first-run --no-default-browser-check --disable-features=Translate --disable-pinch --overscroll-history-navigation=0',
  "",
].join("\r\n");
writeFileSync(join(outDir, "Cyber Race 1992.cmd"), cmd);
console.log(`packaged ${(html.length / 1024).toFixed(0)} KiB into ${outDir}`);
