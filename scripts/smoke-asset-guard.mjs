// Fixtures for the product-asset guard.
//
// A guard that has never been seen to fail is not a guard. These drive the comparison
// directly with synthetic modules and a synthetic manifest, so the pass and fail cases are
// both proven without touching the repo's real 345-file manifest — which would make the
// fixtures drift every time an asset is added.
//
// The real end-to-end run is `npm run audit:product-assets`, in the gate alongside these.

import { assetReferences, auditAssetReferences } from "./audit-product-assets.mjs";
import { importSpecifiers } from "./module-graph.mjs";
import { check, report } from "./live-session-harness.mjs";

const results = [];

const manifest = new Set([
  "/assets/textures/registered.png",
  "/assets/sky/winter/px.jpg",
  "/assets/sky/winter/nx.jpg",
]);

const ALLOWLIST = [{ prefix: "/assets/datalake/", reason: "runtime media" }];

// --- the two cases the guard exists for --------------------------------------------------

const missingCase = auditAssetReferences(
  new Map([["fixture-module.ts", ["/assets/textures/never-shipped.png"]]]),
  manifest,
  ALLOWLIST,
);
check(results, "an asset no manifest claims is reported missing",
  missingCase.missing.length === 1 && missingCase.missing[0].url === "/assets/textures/never-shipped.png",
  JSON.stringify(missingCase.missing));
check(results, "the report names the module that referenced it",
  missingCase.missing[0]?.module === "fixture-module.ts", JSON.stringify(missingCase.missing[0]));

const registeredCase = auditAssetReferences(
  new Map([["fixture-module.ts", ["/assets/textures/registered.png"]]]),
  manifest,
  ALLOWLIST,
);
check(results, "a registered asset passes", registeredCase.missing.length === 0, JSON.stringify(registeredCase.missing));

// --- the classes of false positive that made the first run unusable -----------------------

const basePathCase = auditAssetReferences(
  new Map([["skies.ts", ["/assets/sky/winter"]]]),
  manifest,
  ALLOWLIST,
);
check(results, "a directory base path is satisfied by the files inside it",
  basePathCase.missing.length === 0, JSON.stringify(basePathCase.missing));

const unshippedBasePath = auditAssetReferences(
  new Map([["skies.ts", ["/assets/sky/summer"]]]),
  manifest,
  ALLOWLIST,
);
check(results, "a base path with nothing shipped under it still fails",
  unshippedBasePath.missing.length === 1, JSON.stringify(unshippedBasePath.missing));

const allowedCase = auditAssetReferences(
  new Map([["media.ts", ["/assets/datalake/whatever.png"]]]),
  manifest,
  ALLOWLIST,
);
check(results, "an allowlisted URL passes and is reported as an exception, not silently",
  allowedCase.missing.length === 0 && allowedCase.allowed.length === 1 && allowedCase.allowed[0].reason === "runtime media",
  JSON.stringify(allowedCase));

// --- extraction ---------------------------------------------------------------------------

const source = `
  const a = "/assets/textures/one.png";
  const b = '/assets/textures/two.png';
  const dir = "/assets/sky/winter/";
  const glob = "/assets/archives/milky-way/*.jpg";
  const external = "https://example.com/assets/nope.png";
  const built = \`/assets/sky/\${id}/px.jpg\`;
`;
const found = assetReferences(source);
check(results, "single and double quoted asset literals are found",
  found.includes("/assets/textures/one.png") && found.includes("/assets/textures/two.png"), found.join(","));
check(results, "a trailing-slash directory is not treated as a file",
  !found.includes("/assets/sky/winter/"), found.join(","));
check(results, "a glob is not treated as a file", !found.some((url) => url.includes("*")), found.join(","));
check(results, "an interpolated template is skipped rather than half-parsed",
  !found.some((url) => url.includes("$")), found.join(","));
check(results, "an external URL is not mistaken for a public asset",
  !found.some((url) => url.includes("example.com")), found.join(","));

// --- the type-only distinction the two audits disagree about ------------------------------
//
// This is the subtle one. A module reached only through `import type` is erased from the
// bundle and cannot fetch anything, so the asset audit must not walk into it — but the
// clean-host audit must, because an erased import is still a dependency and that is exactly
// how the legacy monolith stayed coupled to the clean host.

const typeOnlySource = `import type { A } from "./only-a-type";\nimport { B } from "./a-value";`;
check(results, "a type-only edge is a dependency when dependencies are the question",
  importSpecifiers(typeOnlySource).includes("./only-a-type"),
  importSpecifiers(typeOnlySource).join(","));
check(results, "a type-only edge is not a runtime edge",
  !importSpecifiers(typeOnlySource, { includeTypeOnly: false }).includes("./only-a-type"),
  importSpecifiers(typeOnlySource, { includeTypeOnly: false }).join(","));
check(results, "a value edge survives both questions",
  importSpecifiers(typeOnlySource, { includeTypeOnly: false }).includes("./a-value"),
  importSpecifiers(typeOnlySource, { includeTypeOnly: false }).join(","));

const mixedSource = `import type { A } from "./both";\nimport { thing } from "./both";`;
check(results, "a module imported both ways is a runtime edge",
  importSpecifiers(mixedSource, { includeTypeOnly: false }).includes("./both"),
  importSpecifiers(mixedSource, { includeTypeOnly: false }).join(","));

const inlineTypeSource = `import { type A, B } from "./inline";`;
check(results, "an inline type specifier still evaluates its module",
  importSpecifiers(inlineTypeSource, { includeTypeOnly: false }).includes("./inline"),
  importSpecifiers(inlineTypeSource, { includeTypeOnly: false }).join(","));

report(results, "smoke-asset-guard");
