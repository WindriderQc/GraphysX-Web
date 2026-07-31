// Keeps the preview registry honest.
//
// Nineteen preview harnesses became unreachable and undocumented for one reason: nothing
// named them, so nothing noticed. `src/preview-registry.ts` names them now, and this fails
// if a `*-preview.ts` file exists that the registry does not list — or if the registry lists
// one that no longer exists.
//
// It also enforces the invariant the conversion exists to restore: a preview marked
// `mountable` must not create its own `WebGLRenderer` or call `requestAnimationFrame`. The
// host owns both. `CLAUDE.md`: "One shared frame loop. Never a second `requestAnimationFrame`."

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "src");

const registrySource = await readFile(path.join(SRC, "preview-registry.ts"), "utf8");
const files = (await readdir(SRC)).filter((name) => name.endsWith("-preview.ts")).sort();

const failures = [];

// The registry's ids are derived from the module names by dropping the `-preview` suffix, so
// the two are checkable against each other without importing TypeScript.
const listedIds = new Set([...registrySource.matchAll(/id:\s*"([^"]+)"/g)].map((match) => match[1]));
const fileIds = files.map((name) => name.replace(/-preview\.ts$/, ""));

for (const id of fileIds) {
  if (!listedIds.has(id)) {
    failures.push(`src/${id}-preview.ts exists but preview-registry.ts does not list id "${id}"`);
  }
}
for (const id of listedIds) {
  if (!fileIds.includes(id)) failures.push(`preview-registry.ts lists "${id}" but src/${id}-preview.ts does not exist`);
}

// Which ids the registry marks mountable: the `state` on the same entry as the id.
const mountable = new Set(
  [...registrySource.matchAll(/id:\s*"([^"]+)"[\s\S]{0,400}?state:\s*"mountable"/g)]
    .map((match) => match[1])
    .filter((id) => {
      // Guard against a greedy match spanning into the next entry.
      const entry = registrySource.split(`id: "${id}"`)[1]?.slice(0, 400) ?? "";
      return /state:\s*"mountable"/.test(entry.split(/\bid:\s*"/)[0]);
    }),
);

/**
 * Source with comments removed.
 *
 * The first run of this audit failed on `milky-way-preview.ts` for containing the words
 * "requestAnimationFrame" — inside the comment explaining that it no longer calls it. For a
 * reachability guard a comment match is the safe direction; for this one it is the opposite,
 * because it blocks a correctly converted file. So the check reads code only.
 */
const stripComments = (source) => source
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

for (const id of mountable) {
  const source = stripComments(await readFile(path.join(SRC, `${id}-preview.ts`), "utf8"));
  if (/new WebGLRenderer/.test(source)) {
    failures.push(`src/${id}-preview.ts is marked mountable but creates its own WebGLRenderer — the host owns it`);
  }
  if (/requestAnimationFrame/.test(source)) {
    failures.push(`src/${id}-preview.ts is marked mountable but calls requestAnimationFrame — one shared frame loop`);
  }
  if (!/export function mount\b/.test(source)) {
    failures.push(`src/${id}-preview.ts is marked mountable but exports no mount(context)`);
  }
}

console.log(`preview audit: ${files.length} harness file(s), ${listedIds.size} registered, ${mountable.size} mountable`);
console.log(`  unconverted: ${fileIds.length - mountable.size} (listed and disabled in the index, not hidden)`);

if (failures.length > 0) {
  console.error(`\nFAIL  ${failures.length} preview registry problem(s):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  console.error("\nAdd the harness to src/preview-registry.ts. Conversion recipe: docs/PREVIEWS.md");
  process.exitCode = 1;
} else {
  console.log("\nPASS  audit-previews: every harness is registered, and every mountable one uses the shared bootstrap");
}
