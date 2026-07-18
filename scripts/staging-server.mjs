import { readFile } from "node:fs/promises";
import path from "node:path";
import { startStaticServer } from "./static-server.mjs";

// Long-running staging host for UGBrutal (192.168.2.12). It serves whichever release the
// CI runner most recently published, and never needs restarting: the runner writes a new
// release directory and then rewrites `current.txt` to point at it, which is atomic from
// this server's perspective (it re-reads the pointer per request).
//
//   npm run serve:staging
//
// Layout under STAGING_ROOT:
//   releases/<sha>/index.html   published builds
//   current.txt                 one line: the active release directory name

const ROOT = path.resolve(process.env.STAGING_ROOT || "C:/graphysx-staging");
const PORT = Number(process.env.STAGING_PORT || 8099);
const HOST = process.env.STAGING_HOST || "0.0.0.0";

async function resolveRoot() {
  try {
    const name = (await readFile(path.join(ROOT, "current.txt"), "utf8")).trim();
    if (!name) return null;
    const dir = path.resolve(ROOT, "releases", name);
    // Never let the pointer file escape the releases directory.
    const releases = path.join(ROOT, "releases");
    return dir === releases || dir.startsWith(releases + path.sep) ? dir : null;
  } catch {
    return null;
  }
}

const { url } = await startStaticServer({ resolveRoot, port: PORT, host: HOST });
const active = await resolveRoot();
console.log(`GraphysX staging server`);
console.log(`  root:    ${ROOT}`);
console.log(`  local:   ${url}`);
console.log(`  lan:     http://192.168.2.12:${PORT}/`);
console.log(`  release: ${active ?? "(none published yet)"}`);
