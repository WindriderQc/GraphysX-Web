import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const javascriptMime = /^(?:text|application)\/(?:javascript|ecmascript)$/;
const jsonMime = /^application\/json$/;
const ballsyStatusPath = "store/api/ballsy/status";

function collectEntryFiles(buildRoot, rootUrl) {
  const files = new Map();
  const mainScripts = new Set();
  const resolveAsset = (reference, parent = rootUrl) => {
    const asset = new URL(reference, parent);
    if (asset.origin !== rootUrl.origin || !asset.pathname.startsWith(rootUrl.pathname)) throw new Error("Build entry assets must belong to the release base");
    const relative = decodeURIComponent(asset.pathname.slice(rootUrl.pathname.length));
    const local = path.resolve(buildRoot, relative);
    const confined = path.relative(buildRoot, local);
    if (!confined || confined.startsWith("..") || path.isAbsolute(confined)) throw new Error("Build entry asset escapes dist");
    return { relative, local };
  };
  const addFile = (file, mime) => {
    const { relative, local } = resolveAsset(file);
    files.set(relative, { bytes: readFileSync(local), mime });
  };

  for (const html of ["index.html", "ballsy.html", "ballsy-giant.html"]) {
    addFile(html, /^text\/html$/);
    let moduleCount = 0;
    for (const tag of files.get(html).bytes.toString("utf8").matchAll(/<(script|link)\b[^>]*>/gi)) {
      const attrs = Object.fromEntries([...tag[0].matchAll(/([\w-]+)\s*=\s*(["'])(.*?)\2/g)].map(match => [match[1].toLowerCase(), match[3]]));
      const script = tag[1].toLowerCase() === "script";
      const rel = (attrs.rel ?? "").toLowerCase().split(/\s+/);
      if (!script && !rel.some(value => ["stylesheet", "modulepreload"].includes(value))) continue;
      const reference = script ? attrs.src : attrs.href;
      if (!reference) continue;
      const { relative, local } = resolveAsset(reference, new URL(html, rootUrl));
      const css = rel.includes("stylesheet");
      if (script && attrs.type?.toLowerCase() === "module") moduleCount++;
      files.set(relative, { bytes: readFileSync(local), mime: css ? /^text\/css$/ : javascriptMime });
      if (html === "index.html" && !css) mainScripts.add(relative);
    }
    if (!moduleCount) throw new Error(`Build ${html} has no module entry`);
  }

  // Vite emits a literal dynamic import (including no-interpolation backticks).
  // Resolve that reference, rather than accepting any possibly stale matching file in dist.
  // This deliberately checks only the VR entry, not the recursive JS import graph.
  const vrEntries = new Set();
  for (const script of mainScripts) {
    const source = files.get(script).bytes.toString("utf8");
    for (const imported of source.matchAll(/\bimport\s*\(\s*(["'`])([^"'`\\$]+)\1\s*\)/g)) {
      const target = new URL(imported[2], new URL(script, rootUrl));
      if (!/^vr-lab-app(?:-[\w-]+)?\.js$/.test(path.posix.basename(target.pathname))) continue;
      const { relative, local } = resolveAsset(imported[2], new URL(script, rootUrl));
      vrEntries.add(relative);
      files.set(relative, { bytes: readFileSync(local), mime: javascriptMime });
    }
  }
  if (vrEntries.size !== 1) throw new Error("Build index must reference exactly one dynamic vr-lab-app entry");

  // The three local controller assets in src/xr/vr-input.ts. glTF can be served
  // as its registered JSON type, JSON, or the static server's binary default.
  addFile("assets/xr/profiles/profilesList.json", jsonMime);
  addFile("assets/xr/profiles/generic-trigger/profile.json", jsonMime);
  addFile("assets/xr/profiles/generic-trigger/controller.gltf", /^(?:model\/gltf\+json|application\/(?:json|octet-stream))$/);
  return files;
}

async function requireMime(response, file, expected) {
  const mime = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!expected.test(mime)) {
    await response.body?.cancel();
    throw new Error(`${file}: unexpected content type ${mime}`);
  }
}

async function requireNoAllowOrigin(response, file) {
  if (response.headers.has("access-control-allow-origin")) {
    await response.body?.cancel();
    throw new Error(`${file}: unexpected Access-Control-Allow-Origin header`);
  }
}

// Deployment acceptance is HTTP-only. Actual WebGL behavior is checked locally;
// this proves the activated hostname serves this build, not an old index or SPA fallback.
export async function verifyLiveRelease({ base, expectedSha, buildDir = "dist", attempts = 6, retryMs = 5000 }) {
  if (!base) throw new Error("SMOKE_BASE is required");
  const rootUrl = new URL(base.endsWith("/") ? base : `${base}/`);
  if (!["http:", "https:"].includes(rootUrl.protocol)) throw new Error("SMOKE_BASE must use HTTP(S)");
  if (!/^[0-9a-f]{7,40}$/.test(expectedSha ?? "")) throw new Error("EXPECTED_RELEASE_SHA must be a lowercase Git SHA");
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 20) throw new Error("RELEASE_MANIFEST_ATTEMPTS must be an integer from 1 to 20");
  if (!Number.isFinite(retryMs) || retryMs < 0 || retryMs > 60000) throw new Error("RELEASE_MANIFEST_RETRY_MS must be between 0 and 60000");

  const request = async (relative, { origin, expectedStatus } = {}) => {
    const url = new URL(relative, rootUrl);
    url.searchParams.set("sha", expectedSha);
    const response = await fetch(url, {
      cache: "no-store", headers: { "cache-control": "no-cache", ...(origin ? { origin } : {}) }, signal: AbortSignal.timeout(15000),
      // Origin checks must reach this endpoint, not succeed after a redirect elsewhere.
      ...(origin ? { redirect: "error" } : {}),
    });
    if (expectedStatus === undefined ? !response.ok : response.status !== expectedStatus) {
      await response.body?.cancel();
      throw new Error(`${relative}: HTTP ${response.status}${expectedStatus === undefined ? "" : ` (expected ${expectedStatus})`}`);
    }
    return response;
  };

  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await request("release.json");
      await requireMime(response, "release.json", jsonMime);
      const manifest = await response.json();
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
  const files = collectEntryFiles(buildRoot, rootUrl);

  const verified = [];
  const entries = [...files];
  for (let offset = 0; offset < entries.length; offset += 4) {
    const batch = await Promise.allSettled(entries.slice(offset, offset + 4).map(async ([file, expected]) => {
      const response = await request(file);
      await requireMime(response, file, expected.mime);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (!bytes.equals(expected.bytes)) throw new Error(`${file}: served content differs from the release build`);
      return { file, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
    }));
    // Finish bounded sibling requests before rejecting and closing the CLI process.
    const failed = batch.find(result => result.status === "rejected");
    if (failed) throw failed.reason;
    verified.push(...batch.map(result => result.value));
  }
  // Browser-origin acceptance also exercises the public proxy's protocol forwarding.
  // Never supply forwarding headers from this client: only the actual proxy may set them.
  const statusResponse = await request(ballsyStatusPath, { origin: rootUrl.origin, expectedStatus: 200 });
  await requireMime(statusResponse, ballsyStatusPath, jsonMime);
  await requireNoAllowOrigin(statusResponse, ballsyStatusPath);
  const status = await statusResponse.json();
  if (status?.schema !== "ballsy-room/v1") throw new Error(`${ballsyStatusPath}: unexpected Ballsy relay schema`);
  // This is a header value only. Both requests go to the same public status URL.
  const foreignOrigin = rootUrl.origin === "https://ballsy-origin-check.invalid" ? "https://ballsy-other-origin.invalid" : "https://ballsy-origin-check.invalid";
  const refusedResponse = await request(ballsyStatusPath, { origin: foreignOrigin, expectedStatus: 403 });
  await requireMime(refusedResponse, ballsyStatusPath, jsonMime);
  await requireNoAllowOrigin(refusedResponse, ballsyStatusPath);
  const refused = await refusedResponse.json();
  if (typeof refused?.error !== "string" || !refused.error.trim()) throw new Error(`${ballsyStatusPath}: unexpected Ballsy relay rejection`);
  return {
    scope: "HTTP release identity; exact index/Ballsy HTML and immediate entries, VR dynamic entry and three controller assets; Ballsy relay same-origin acceptance and foreign-origin rejection without CORS. Not all assets, gameplay, browser or visual acceptance.",
    sha: expectedSha, files: verified,
    services: [{ path: ballsyStatusPath, method: "GET", schema: status.schema,
      sameOrigin: { origin: rootUrl.origin, status: 200, allowOrigin: false },
      foreignOrigin: { origin: foreignOrigin, status: 403, allowOrigin: false },
    }],
  };
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
    console.log(`Production is serving release ${receipt.sha}; ${receipt.files.length} scoped files match the build and Ballsy relay origin checks pass (HTTP only).`);
  } catch (error) {
    writeFileSync(path.join(artifacts, "release-http-failure.json"), JSON.stringify({ error: error.message }) + "\n");
    throw error;
  }
}
