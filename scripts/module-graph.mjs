// Which modules the product actually reaches, by walking imports from an entry point.
//
// Two audits need this and they need the same answer: `audit-clean-host.mjs` asks whether
// the legacy monolith is reachable, and `audit-product-assets.mjs` asks which modules can
// reference a public asset. Computing reachability twice, slightly differently, is how the
// two would eventually disagree about what "the product" means.
//
// Zero dependencies, no build, no browser.

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

export function resolveSpecifier(specifier, fromFile) {
  if (!specifier.startsWith(".")) return null; // bare import: node_modules, not ours
  const base = path.resolve(path.dirname(fromFile), specifier);
  for (const candidate of [`${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]) {
    if (existsSync(candidate)) return candidate;
  }
  return null; // .css / .json — vite's problem, not a dependency question
}

/**
 * Import specifiers in a module's source.
 *
 * Regex rather than a parser: this must run with no dependencies, and it only needs four
 * shapes — `import … from "x"`, `import type … from "x"`, `export … from "x"` (a re-export
 * is a dependency) and `import("x")`. A specifier appearing inside a comment or string
 * would be a false positive, which is the safe direction for a reachability guard.
 */
export function importSpecifiers(source, { includeTypeOnly = true } = {}) {
  const found = new Set();
  for (const match of source.matchAll(/\bfrom\s+["']([^"']+)["']/g)) found.add(match[1]);
  for (const match of source.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g)) found.add(match[1]);
  if (includeTypeOnly) return [...found];

  // Drop edges that exist only in the type system. `import type { X } from "y"` and
  // `export type { X } from "y"` erase at build time: the module is never evaluated and
  // cannot fetch anything, so it is not on the *runtime* path.
  //
  // The two audits want opposite answers here, which is why this is a parameter rather than
  // a default. Dependency direction (audit-clean-host) counts a type edge as a real
  // dependency — that is exactly how the legacy monolith stayed coupled to the clean host
  // through one erased import. Runtime reachability (audit-product-assets) must not, or it
  // reports assets from modules the production bundle never includes.
  //
  // Only the pure forms are type-only: `import { type A, B }` still evaluates the module.
  const typeOnly = new Set();
  for (const match of source.matchAll(/\b(?:import|export)\s+type\s+[^;]*?\bfrom\s+["']([^"']+)["']/g)) {
    typeOnly.add(match[1]);
  }
  // A specifier imported both ways somewhere in the file is a value import.
  for (const match of source.matchAll(/\b(?:import|export)\s+(?!type\s)[^;]*?\bfrom\s+["']([^"']+)["']/g)) {
    typeOnly.delete(match[1]);
  }
  return [...found].filter((specifier) => !typeOnly.has(specifier));
}

/**
 * Walks from `entry`, following static and dynamic imports.
 *
 * `boundaries` are module basenames that may be *named* by a reachable module but are not
 * entered — the legacy host is referenced from `main.ts` only inside the `?host=legacy`
 * branch, so it is reachable as a name and unreachable as a route.
 *
 * Returns `{ reachable, edgesInto }`: the set of absolute file paths on the product path,
 * and, for each boundary that was named, the modules that named it and how they were reached.
 */
export async function walkModuleGraph({ entry, boundaries = [], includeTypeOnly = true }) {
  const boundarySet = new Set(boundaries);
  const reachable = new Set();
  const edgesInto = new Map();

  async function walk(file, trail) {
    if (reachable.has(file)) return;
    reachable.add(file);

    const source = await readFile(file, "utf8");
    for (const specifier of importSpecifiers(source, { includeTypeOnly })) {
      const resolved = resolveSpecifier(specifier, file);
      if (!resolved) continue;
      const name = path.basename(resolved).replace(/\.tsx?$/, "");
      const nextTrail = [...trail, name];
      if (boundarySet.has(name)) {
        if (!edgesInto.has(name)) edgesInto.set(name, []);
        edgesInto.get(name).push({ importer: file, trail: nextTrail.join(" → ") });
        continue;
      }
      await walk(resolved, nextTrail);
    }
  }

  await walk(entry, [path.basename(entry).replace(/\.tsx?$/, "")]);
  return { reachable, edgesInto };
}
