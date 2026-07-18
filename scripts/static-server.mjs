import http from "node:http";
import { readFile, stat } from "node:fs/promises";
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

    // Buffer the file and send it with an explicit Content-Length rather than streaming.
    //
    // Streaming without a Content-Length means chunked transfer encoding, and any hiccup
    // part-way through a large response reaches the browser as ERR_CONNECTION_RESET. That
    // showed up as an intermittent "failed to fetch dynamically imported module" on the
    // 1.4 MB prototype-app chunk, which failed whichever smoke happened to request it —
    // so the same root cause looked like unrelated flakiness in three different tests.
    // An earlier attempt added stream error handling, which reduced it but did not remove
    // it. Deterministic framing does. These files are a few MB at most and this serves
    // localhost, so buffering costs nothing that matters.
    try {
      const body = await readFile(file);
      res.writeHead(200, {
        "content-type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream",
        "content-length": body.length,
        "cache-control": "no-store",
      });
      res.end(body);
    } catch {
      if (!res.headersSent) res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      res.end("Read failed");
    }
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
