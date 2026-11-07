import { fileURLToPath } from "node:url";

// The release gate builds dist/, while the dedicated prototype launcher has an
// isolated output directory. Both drive the same real-relay XR test unchanged.
process.env.SMOKE_DIST_ROOT = fileURLToPath(new URL("../dist/", import.meta.url));
await import("./smoke-ballsy-shared-vr.mjs");
