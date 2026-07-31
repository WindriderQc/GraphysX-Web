// Every public asset a product module names must actually ship.
//
// `scripts/product-assets.mjs` proves one direction: every file the release manifest claims
// exists on disk. This proves the other, which is the one that bites: a module on the
// product path references `/assets/foo.png`, nothing in the manifest claims it, the
// production build prunes it, and the asset 404s in production while looking perfect in dev
// — where vite serves all of `public/`.
//
// That failure has already happened twice in this tree, and both times the fix was a new
// hand-added line in the manifest. The comments in product-assets.mjs record them: the
// archive sound samples ("until this line they 404'd in production — nothing claimed them")
// and the BallZ level style surfaces ("shipping levels whose floors and walls 404 in
// production while looking perfect in dev"). Neither was caught by a test. This is that test.
//
// Reachability comes from the same module-graph walker `audit-clean-host.mjs` uses, so the
// two audits cannot disagree about what "the product" is.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { walkModuleGraph } from "./module-graph.mjs";
import { productAssetManifest } from "./product-assets.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "src");

/** Named by the product path but never entered — the legacy archive player. */
const LEGACY_BOUNDARY = ["prototype-app", "race-scene"];

/**
 * URLs a product module may reference without the manifest claiming them.
 *
 * Every entry needs a reason. An allowlist without reasons becomes the place failures go to
 * be silenced, and the next person cannot tell a deliberate exception from a suppressed bug.
 * Prefixes match with `startsWith`; exact strings match exactly.
 */
const ALLOWLIST = [
  {
    prefix: "/assets/datalake/",
    reason: "Served at runtime by the scene store's media routes, not built into dist/. Absent by design.",
  },
  {
    prefix: "/assets/uploads/",
    reason: "User-imported media, written at runtime into the store's asset directory.",
  },
  {
    exact: "/assets/import",
    reason: "A scene-store HTTP route (POST /assets/import), not a public file. Shares the /assets prefix by coincidence.",
  },
  {
    prefix: "/assets/references/",
    reason:
      "RaceDefinition.referenceImage. The strings ship (archive-level3-scene value-imports race-definitions "
      + "for ARCHIVE_LEVEL3_ROWS) but the only consumer is prototype-app's archive-reference figure, which is "
      + "?host=legacy. 1.5 MB of screenshots the default route never requests; pruning them is the manifest "
      + "doing its job. If a default-host surface ever renders referenceImage, delete this entry.",
  },
];

const allowlisted = (url) => ALLOWLIST.find((entry) =>
  (entry.prefix && url.startsWith(entry.prefix)) || entry.exact === url);

/**
 * Absolute `/assets/...` string literals in a source file.
 *
 * Literals only. A template like `` `/assets/skies/${id}/px.jpg` `` is invisible here, and
 * that is a stated limitation rather than a silent one: the registries that build URLs
 * dynamically are the ones product-assets.mjs claims wholesale by directory, so the dynamic
 * case is covered by construction rather than by scanning.
 */
export function assetReferences(source) {
  return [...source.matchAll(/["'`](\/assets\/[^"'`\n${}]*)["'`]/g)]
    .map((match) => decodeURIComponent(match[1]))
    // A bare directory prefix is a base path, not a file to ship.
    .filter((url) => !url.endsWith("/"))
    // A glob is documentation of a set, not a URL anything fetches.
    .filter((url) => !url.includes("*"));
}

/**
 * The pure comparison, exported so the fixtures can exercise it without a repo.
 *
 * `references` is `Map<moduleName, string[]>`; `manifest` is the set of shipped urls.
 */
export function auditAssetReferences(references, manifest, allowlist = ALLOWLIST) {
  const isAllowed = (url) => allowlist.find((entry) =>
    (entry.prefix && url.startsWith(entry.prefix)) || entry.exact === url);
  // A registry names a sky by its directory (`/assets/sky/winter`) and the manifest claims
  // the six faces inside it. The base path is satisfied when the manifest ships anything
  // under it — it is a reference to a set, not to a file.
  const prefixes = new Set();
  for (const file of manifest) {
    const parts = file.split("/");
    for (let depth = 2; depth < parts.length; depth += 1) prefixes.add(parts.slice(0, depth).join("/"));
  }

  const missing = [];
  const allowed = [];
  let checked = 0;
  for (const [module, urls] of references) {
    for (const url of urls) {
      checked += 1;
      if (manifest.has(url) || prefixes.has(url)) continue;
      const exception = isAllowed(url);
      if (exception) allowed.push({ module, url, reason: exception.reason });
      else missing.push({ module, url });
    }
  }
  return { missing, allowed, checked };
}

if (process.argv[1]?.endsWith("audit-product-assets.mjs")) {
  // `includeTypeOnly: false` — a module reached only through `import type` is erased from
  // the bundle and cannot fetch anything. Counting it reported four legacy-only reference
  // screenshots (1.5 MB) as production 404s that production never requests.
  const { reachable } = await walkModuleGraph({
    entry: path.join(SRC, "main.ts"),
    boundaries: LEGACY_BOUNDARY,
    includeTypeOnly: false,
  });
  const { files } = await productAssetManifest();
  const manifest = new Set(files);

  const references = new Map();
  for (const file of reachable) {
    const urls = assetReferences(await readFile(file, "utf8"));
    if (urls.length > 0) references.set(path.relative(ROOT, file), urls);
  }

  const { missing, allowed, checked } = auditAssetReferences(references, manifest);

  console.log(`product asset audit: ${checked} asset reference(s) across ${references.size} product module(s)`);
  console.log(`  release manifest claims ${manifest.size} file(s)`);
  if (allowed.length > 0) {
    console.log(`  ${allowed.length} allowlisted runtime/external reference(s):`);
    const byReason = new Map();
    for (const entry of allowed) byReason.set(entry.reason, (byReason.get(entry.reason) ?? 0) + 1);
    for (const [reason, count] of byReason) console.log(`    ${count}× ${reason}`);
  }

  if (missing.length > 0) {
    console.error(`\nFAIL  ${missing.length} product-reachable asset(s) are not in the release manifest:`);
    for (const entry of missing) console.error(`  - ${entry.url}\n      referenced by ${entry.module}`);
    console.error("\nThese resolve in dev (vite serves all of public/) and 404 in production.");
    console.error("Either claim them in scripts/product-assets.mjs, or add an allowlist entry with a reason");
    console.error("in scripts/audit-product-assets.mjs if the URL is served at runtime rather than built.");
    process.exitCode = 1;
  } else {
    console.log("\nPASS  audit-product-assets: every product-reachable asset ships in the release manifest");
  }
}
