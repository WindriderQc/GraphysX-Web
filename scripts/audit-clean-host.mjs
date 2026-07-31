// Proves the clean default host does not depend on the legacy monolith.
//
// `src/race-scene.ts` is the 9,900-line archive player behind `?host=legacy`. The default
// product route is `src/platform-host.ts` and it is supposed to be independent of it. For a
// while it was independent *except for one type* — three clean modules imported
// `MapEditorTile` from it — which is exactly the shape every coupling has before it becomes
// a real one. `import type` erases at build time, so nothing caught it: the bundle was
// correct and the dependency direction was not.
//
// So this walks the import graph rather than reading the bundle. Starting at `src/main.ts`
// it follows every static and dynamic import, treating the two legacy entry points as
// boundaries it does not cross, and fails if anything reachable on the default route names
// `race-scene`.
//
// Node-only, no browser, no build. Runs in well under a second.

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "src");

/**
 * Modules the default route is allowed to *mention* but never enter.
 *
 * `prototype-app` is the legacy host: `main.ts` imports it dynamically inside the
 * `?host=legacy` branch, so the reference exists on the default path but the module is never
 * loaded there. `race-scene` is what we are proving is unreachable; it is listed so a direct
 * import from `main.ts` itself is reported as a violation rather than silently traversed.
 */
const LEGACY_BOUNDARY = new Set(["prototype-app", "race-scene"]);

/** The module we are proving unreachable. */
const FORBIDDEN = "race-scene";

const ENTRY = "main";

function resolveSpecifier(specifier, fromFile) {
  if (!specifier.startsWith(".")) return null; // node_modules / bare import
  const base = path.resolve(path.dirname(fromFile), specifier);
  for (const candidate of [`${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]) {
    if (existsSync(candidate)) return candidate;
  }
  return null; // .css, .json handled by vite; not part of the dependency question
}

/**
 * Import specifiers in a module.
 *
 * Regex rather than a parser on purpose: this file must run with zero dependencies, and the
 * shapes are all it needs to see — `import ... from "x"`, `import type ... from "x"`,
 * `export ... from "x"` (a re-export is a dependency), and `import("x")`. A specifier inside
 * a string literal or comment would be a false positive; that is the safe direction for a
 * guard, and there are none in this tree.
 */
function specifiers(source) {
  const found = new Set();
  for (const match of source.matchAll(/\bfrom\s+["']([^"']+)["']/g)) found.add(match[1]);
  for (const match of source.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g)) found.add(match[1]);
  return [...found];
}

const visited = new Set();
/** file → the chain of modules that reached it, for a useful failure message. */
const routes = new Map();
const violations = [];

async function walk(file, trail) {
  if (visited.has(file)) return;
  visited.add(file);
  routes.set(file, trail);

  const source = await readFile(file, "utf8");
  for (const specifier of specifiers(source)) {
    const resolved = resolveSpecifier(specifier, file);
    if (!resolved) continue;
    const name = path.basename(resolved).replace(/\.tsx?$/, "");
    const nextTrail = [...trail, name];

    if (name === FORBIDDEN) {
      violations.push({ importer: path.relative(ROOT, file), trail: nextTrail.join(" → ") });
      continue;
    }
    // A boundary module is reachable by name but not entered: `main.ts` mentions
    // `prototype-app` only inside the `?host=legacy` branch.
    if (LEGACY_BOUNDARY.has(name)) continue;
    await walk(resolved, nextTrail);
  }
}

const entry = path.join(SRC, `${ENTRY}.ts`);
await walk(entry, [ENTRY]);

console.log(`clean-host audit: walked ${visited.size} modules from src/${ENTRY}.ts`);
console.log(`  legacy boundaries not entered: ${[...LEGACY_BOUNDARY].join(", ")}`);

if (violations.length > 0) {
  console.error(`\nFAIL  ${violations.length} clean default-host module(s) import the legacy monolith:`);
  for (const violation of violations) console.error(`  - ${violation.importer}\n      via ${violation.trail}`);
  console.error("\nMove the shared declaration into a small platform module (see src/map-editor-tiles.ts)");
  console.error("rather than importing it from race-scene.ts. `import type` erases at build time, so a");
  console.error("green build does not mean the dependency is absent.");
  process.exitCode = 1;
} else {
  console.log(`\nPASS  audit-clean-host: no default-host module reaches ${FORBIDDEN}.ts`);
}
