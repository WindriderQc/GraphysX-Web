import { spawn } from "node:child_process";

const base = process.env.SMOKE_BASE;
const expectedSha = process.env.EXPECTED_RELEASE_SHA ?? "";
const attempts = Number(process.env.RELEASE_MANIFEST_ATTEMPTS || 6);
const retryMs = Number(process.env.RELEASE_MANIFEST_RETRY_MS || 5_000);

if (!base) throw new Error("SMOKE_BASE is required");
if (!/^[0-9a-f]{7,40}$/.test(expectedSha)) {
  throw new Error("EXPECTED_RELEASE_SHA must be a lowercase Git SHA");
}
if (!Number.isInteger(attempts) || attempts < 1 || attempts > 20) {
  throw new Error("RELEASE_MANIFEST_ATTEMPTS must be an integer from 1 to 20");
}
if (!Number.isFinite(retryMs) || retryMs < 0 || retryMs > 60_000) {
  throw new Error("RELEASE_MANIFEST_RETRY_MS must be between 0 and 60000");
}

const manifestUrl = new URL("release.json", base.endsWith("/") ? base : `${base}/`);
manifestUrl.searchParams.set("sha", expectedSha);
let lastError = null;

for (let attempt = 1; attempt <= attempts; attempt += 1) {
  try {
    const response = await fetch(manifestUrl, {
      cache: "no-store",
      headers: { "cache-control": "no-cache" },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const manifest = await response.json();
    if (manifest?.schema !== "graphysx.release/v1") throw new Error("unexpected release manifest schema");
    if (manifest.sha !== expectedSha) throw new Error(`expected ${expectedSha}, received ${manifest.sha ?? "no SHA"}`);
    console.log(`Production is serving release ${manifest.sha}`);
    lastError = null;
    break;
  } catch (error) {
    lastError = error;
    if (attempt < attempts) {
      console.warn(`Release manifest attempt ${attempt}/${attempts} failed: ${error.message}`);
      await new Promise((resolve) => setTimeout(resolve, retryMs));
    }
  }
}

if (lastError) throw new Error(`Activated release never became authoritative: ${lastError.message}`);

const child = spawn(process.execPath, ["scripts/smoke-great-slide.mjs"], {
  stdio: "inherit",
  env: { ...process.env, SMOKE_BASE: base },
});
const exitCode = await new Promise((resolve, reject) => {
  child.once("error", reject);
  child.once("close", (code) => resolve(code ?? 1));
});
if (exitCode !== 0) process.exitCode = exitCode;
