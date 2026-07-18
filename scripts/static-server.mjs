import http from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";

// Dependency-free static file server with SPA fallback. Used by scripts/verify.mjs to
// serve a release build for the headless smokes, and by scripts/staging-server.mjs to
// host the UGBrutal staging release. Running in-process (rather than shelling out to
// `vite preview`) keeps teardown reliable on Windows, where killing a shell does not
// kill its child.

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".bin": "application/octet-stream",
  ".hdr": "application/octet-stream",
  ".ktx2": "application/octet-stream",
  ".wasm": "application/wasm",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

async function resolveFile(root, urlPath) {
  // Decode, drop the query, and normalise. Reject anything that escapes the root.
  let rel;
  try {
    rel = decodeURIComponent(urlPath.split("?")[0].split("#")[0]);
  } catch {
    return null;
  }
  const abs = path.resolve(root, "." + path.posix.normalize(rel));
  if (abs !== root && !abs.startsWith(root + path.sep)) return null;

  try {
    const info = await stat(abs);
    if (info.isDirectory()) {
      const index = path.join(abs, "index.html");
      const indexInfo = await stat(index);
      return indexInfo.isFile() ? index : null;
    }
    return info.isFile() ? abs : null;
  } catch {
    return null;
  }
}

/**
 * @param {object} options
 * @param {string} [options.root] Fixed directory to serve.
 * @param {() => Promise<string|null>} [options.resolveRoot] Resolved per request instead of
 *   `root`, so a staging host can be repointed at a new release without a restart.
 */
export function startStaticServer({ root, resolveRoot, port = 4188, host = "127.0.0.1" }) {
  const fixedRoot = root ? path.resolve(root) : null;
  const currentRoot = resolveRoot ?? (async () => fixedRoot);

  const server = http.createServer(async (req, res) => {
    const rootAbs = await currentRoot();
    if (!rootAbs) {
      res.writeHead(503, { "content-type": "text/plain; charset=utf-8" });
      res.end("No release published yet.");
      return;
    }

    const file =
      (await resolveFile(rootAbs, req.url || "/")) ??
      // SPA fallback: unknown paths render the app shell, matching the nginx
      // `try_files $uri $uri/ /index.html` rule used in production.
      (await resolveFile(rootAbs, "/index.html"));

    if (!file) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }

    res.writeHead(200, {
      "content-type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream",
      "cache-control": "no-store",
    });

    // Stream with explicit lifecycle handling. Without this, a read error or a client
    // that goes away mid-transfer surfaces as an unhandled 'error' event and the peer
    // sees ERR_CONNECTION_RESET — which showed up as an intermittent smoke failure on
    // the largest chunk. A flaky gate is worse than no gate, so this is not cosmetic.
    const stream = createReadStream(file);
    stream.on("error", () => res.destroy());
    res.on("close", () => stream.destroy());
    stream.pipe(res);
  });

  // Headless Chromium opens many keep-alive connections and can leave one idle while it
  // parses a multi-megabyte chunk. Node's 5s default would close it underneath the browser
  // mid-page-load, producing a spurious connection reset.
  server.keepAliveTimeout = 72_000;
  server.headersTimeout = 75_000;
  server.requestTimeout = 0;

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      resolve({
        server,
        url: `http://${host === "0.0.0.0" ? "127.0.0.1" : host}:${port}/`,
        close: () => new Promise((done) => server.close(() => done())),
      });
    });
  });
}
