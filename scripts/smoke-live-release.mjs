import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Deployment acceptance is HTTP-only. Actual WebGL behavior is checked locally;
// this proves the activated hostname serves this build, not an old index or SPA fallback.
export async function verifyLiveRelease({ base, expectedSha, buildDir = "dist", attempts = 6, retryMs = 5000 }) {
  if (!base) throw new Error("SMOKE_BASE is required");
  const rootUrl = new URL(base.endsWith("/") ? base : `${base}/`);
  if (!["http:", "https:"].includes(rootUrl.protocol)) throw new Error("SMOKE_BASE must use HTTP(S)");
  if (!/^[0-9a-f]{7,40}$/.test(expectedSha ?? "")) throw new Error("EXPECTED_RELEASE_SHA must be a lowercase Git SHA");
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 20) throw new Error("RELEASE_MANIFEST_ATTEMPTS must be an integer from 1 to 20");
  if (!Number.isFinite(retryMs) || retryMs < 0 || retryMs > 60000) throw new Error("RELEASE_MANIFEST_RETRY_MS must be between 0 and 60000");

  const request = async (relative) => {
    const url = new URL(relative, rootUrl);
    url.searchParams.set("sha", expectedSha);
    const response = await fetch(url, {
      cache: "no-store", headers: { "cache-control": "no-cache" }, signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`${relative}: HTTP ${response.status}`);
    }
    return response;
  };

  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const manifest = await (await request("release.json")).json();
      if (manifest?.schema !== "graphysx.release/v1") throw new Error("unexpected release manifest schema");
      if (manifest.sha !== expectedSha) throw new Error(`expected ${expectedSha}, received ${manifest.sha ?? "no SHA"}`);
      lastError = null;
      break;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise(resolve => setTimeout(resolve, retryMs));
    }
  }
  if (lastError) throw new Error(`Activated release never became authoritative: ${lastError.message}`);

  const buildRoot = path.resolve(buildDir);
  const index = readFileSync(path.join(buildRoot, "index.html"));
  const files = new Map([["index.html", { bytes: index, mime: /^text\/html$/ }]]);
  let moduleCount = 0;
  for (const tag of index.toString("utf8").matchAll(/<(script|link)\b[^>]*>/gi)) {
    const attrs = Object.fromEntries([...tag[0].matchAll(/([\w-]+)\s*=\s*(["'])(.*?)\2/g)].map(match => [match[1].toLowerCase(), match[3]]));
    const script = tag[1].toLowerCase() === "script";
    const rel = (attrs.rel ?? "").split(/\s+/);
    if (!script && !rel.some(value => ["stylesheet", "modulepreload"].includes(value))) continue;
    const reference = script ? attrs.src : attrs.href;
    if (!reference) continue;
    const asset = new URL(reference, rootUrl);
    if (asset.origin !== rootUrl.origin || !asset.pathname.startsWith(rootUrl.pathname)) throw new Error("Build entry assets must belong to the release base");
    const relative = decodeURIComponent(asset.pathname.slice(rootUrl.pathname.length));
    const local = path.resolve(buildRoot, relative);
    const confined = path.relative(buildRoot, local);
    if (!confined || confined.startsWith("..") || path.isAbsolute(confined)) throw new Error("Build entry asset escapes dist");
    if (script && attrs.type === "module") moduleCount++;
    files.set(relative, { bytes: readFileSync(local), mime: rel.includes("stylesheet") ? /^text\/css$/ : /^(?:text|application)\/(?:javascript|ecmascript)$/ });
  }
  if (!moduleCount) throw new Error("Build index has no module entry");

  const verified = [];
  const entries = [...files];
  for (let offset = 0; offset < entries.length; offset += 4) {
    const batch = await Promise.allSettled(entries.slice(offset, offset + 4).map(async ([file, expected]) => {
      const response = await request(file);
      const mime = (response.headers.get("content-type") ?? "").split(";")[0].trim();
      if (!expected.mime.test(mime)) {
        await response.body?.cancel();
        throw new Error(`${file}: unexpected content type ${mime}`);
      }
      const bytes = Buffer.from(await response.arrayBuffer());
      if (!bytes.equals(expected.bytes)) throw new Error(`${file}: served content differs from the release build`);
      return { file, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
    }));
    // Finish bounded sibling requests before rejecting and closing the CLI process.
    const failed = batch.find(result => result.status === "rejected");
    if (failed) throw failed.reason;
    verified.push(...batch.map(result => result.value));
  }
  return { scope: "HTTP release identity and exact entry assets; no browser or visual acceptance", sha: expectedSha, files: verified };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const artifacts = process.env.SMOKE_ARTIFACTS || "output/production-smoke";
  mkdirSync(artifacts, { recursive: true });
  try {
    const receipt = await verifyLiveRelease({
      base: process.env.SMOKE_BASE,
      expectedSha: process.env.EXPECTED_RELEASE_SHA,
      attempts: Number(process.env.RELEASE_MANIFEST_ATTEMPTS || 6),
      retryMs: Number(process.env.RELEASE_MANIFEST_RETRY_MS || 5000),
    });
    writeFileSync(path.join(artifacts, "release-http.json"), JSON.stringify(receipt, null, 2) + "\n");
    console.log(`Production is serving release ${receipt.sha}; ${receipt.files.length} entry files match the build (HTTP only).`);
  } catch (error) {
    writeFileSync(path.join(artifacts, "release-http-failure.json"), JSON.stringify({ error: error.message }) + "\n");
    throw error;
  }
}
