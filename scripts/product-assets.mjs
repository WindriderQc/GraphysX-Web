import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Which files under public/ the *product* actually needs, derived from the registries that
// define the editor's vocabulary rather than hand-listed.
//
// public/ is ~120 MB, but the product — the default showroom route, the Scene Editor, and
// everything an agent can reach through `window.__GRAPHYSX__` — only ever requests ~44 MB
// of it. The rest is reachable solely through the legacy archive player at `?host=legacy`
// (milky-way, the ballz worlds, the village, the object library, the dominus galleries…).
// Vite copies public/ verbatim, so every push was shipping ~80 MB of archive to production
// that no production visitor can request.
//
// This module is the manifest. vite.config.ts uses it to copy only these files into dist/
// for a production build; `vite dev` still serves all of public/, so `?host=legacy` keeps
// working locally. Set GRAPHYSX_FULL_ASSETS=1 to build the unpruned 140 MB dist.
//
// The manifest is DERIVED, not maintained by hand: it reads the same registry sources the
// runtime reads. Add a sky, a texture, or a mesh to a registry and it ships automatically.
// Regenerating the asset catalog cannot silently drop a model out of the release.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = path.join(ROOT, "public");

// Every `url: "/assets/..."` / `basePath: "/assets/..."` literal in a registry source.
async function assetLiterals(relSource, key) {
  const src = await readFile(path.join(ROOT, relSource), "utf8");
  const rx = new RegExp(`${key}:\\s*"(/assets/[^"]*)"`, "g");
  return [...src.matchAll(rx)].map((m) => decodeURIComponent(m[1]));
}

/** Every `/assets/...` string literal in a module, whatever key holds it. */
async function anyAssetLiterals(relSource) {
  const src = await readFile(path.join(ROOT, relSource), "utf8");
  return [...src.matchAll(/"(\/assets\/[^"]*)"/g)].map((m) => decodeURIComponent(m[1]));
}

async function filesUnder(relDir) {
  const abs = path.join(PUBLIC, relDir.replace(/^\//, ""));
  const entries = await readdir(abs, { withFileTypes: true });
  return entries.filter((e) => e.isFile()).map((e) => path.posix.join(relDir, e.name));
}

/**
 * The legacy home screen and its Scene Editor card — the surface `scripts/smoke-foundation.mjs`
 * drives — pull a handful of small textures before any archive world is opened. 464 KB total,
 * so they ride along and `?host=legacy` still boots (not *plays*) in a production build.
 * Opening an actual archive world in production will show missing textures; that route is a
 * reference fallback, and the full archive stays available in dev.
 */
const LEGACY_BOOT_ASSETS = [
  "/assets/textures/sun.jpg",
  "/assets/textures/archive/haze.png",
  "/assets/textures/archive/Concrete.jpg",
  "/assets/textures/archive/twoway.jpg",
  "/assets/textures/ball/FireArrow800.jpg",
  "/assets/textures/classic/Alien01_B_diff.bmp",
  "/assets/textures/classic/Alien01_B_normal.bmp",
];

export async function productAssetManifest() {
  const wanted = new Set();

  // Skies: every set in the vocabulary, all six cube faces. Whole directory rather than
  // guessing face names off `extension`, so a set with an odd file still ships complete.
  for (const basePath of await assetLiterals("src/agent-world-skies.ts", "basePath")) {
    for (const file of await filesUnder(basePath)) wanted.add(file);
  }

  // Curated textures the editor palette offers.
  for (const url of await assetLiterals("src/agent-world-textures.ts", "url")) wanted.add(url);
  // The archive sound samples `sound` entities reference by id. Until this line they
  // 404'd in production — nothing claimed them, so the manifest pruned all four.
  for (const url of await assetLiterals("src/agent-world-sounds.ts", "url")) wanted.add(url);
  // The BallZ level styles reference their surfaces by raw URL rather than by registry id, so
  // nothing else claims them and the manifest would prune four of the six — shipping levels whose
  // floors and walls 404 in production while looking perfect in dev. Derived from the module so
  // adding a style cannot silently drop its textures.
  for (const url of await anyAssetLiterals("src/classic-level-style.ts")) wanted.add(url);

  // Every mesh in the generated catalog, plus the textures each mesh's materials name.
  // The mesh JSON carries absolute `textureUrl`s, so this cannot drift from the meshes.
  for (const url of await assetLiterals("src/agent-world-asset-catalog.ts", "url")) {
    wanted.add(url);
    const payload = JSON.parse(await readFile(path.join(PUBLIC, url.replace(/^\//, "")), "utf8"));
    for (const mesh of payload.meshes ?? []) {
      for (const material of mesh.materials ?? []) {
        if (material.textureUrl) wanted.add(decodeURIComponent(material.textureUrl));
      }
    }
  }

  // The World 1 mesh assembly: its records live in the generated port manifest rather
  // than the asset catalog (they are a world, not palette vocabulary), so the release
  // manifest scrapes that module the same way it scrapes the level styles.
  for (const url of await anyAssetLiterals("src/archive-world1-manifest.ts")) wanted.add(url);

  // The front-door galleries are generated release assets rather than runtime vocabulary.
  // Claim the whole generated directory so `npm run assets:shelf-thumbnails` can add or
  // refresh a scene without a second hand-maintained filename list.
  for (const url of await filesUnder("/assets/shelf-thumbnails")) wanted.add(url);

  for (const url of LEGACY_BOOT_ASSETS) wanted.add(url);

  // Fail loudly rather than shipping a release with a hole in the vocabulary.
  const missing = [];
  let bytes = 0;
  for (const url of wanted) {
    try {
      bytes += (await stat(path.join(PUBLIC, url.replace(/^\//, "")))).size;
    } catch {
      missing.push(url);
    }
  }
  if (missing.length) {
    throw new Error(`product asset manifest references ${missing.length} missing file(s):\n  ${missing.join("\n  ")}`);
  }

  return { files: [...wanted].sort(), bytes };
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("product-assets.mjs")) {
  const { files, bytes } = await productAssetManifest();
  console.log(`${files.length} files, ${(bytes / 1048576).toFixed(1)} MB`);
  if (process.argv.includes("--list")) for (const f of files) console.log(f);
}
