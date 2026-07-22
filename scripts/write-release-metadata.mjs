import { writeFile } from "node:fs/promises";
import path from "node:path";

const sha = process.env.GRAPHYSX_RELEASE_SHA ?? "";
if (!/^[0-9a-f]{40}$/.test(sha)) {
  throw new Error("GRAPHYSX_RELEASE_SHA must be a full lowercase Git SHA");
}

const release = {
  schema: "graphysx.release/v1",
  sha,
  runId: process.env.GRAPHYSX_RELEASE_RUN_ID ?? null,
  generatedAt: new Date().toISOString(),
};

const target = path.resolve("dist", "release.json");
await writeFile(target, `${JSON.stringify(release, null, 2)}\n`, "utf8");
console.log(`Wrote ${target} for ${sha}`);
