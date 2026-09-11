import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

/** Local-only document mount. IDs come from the catalog; request paths never name files. */
export async function createKidxDocumentRoute({ root = path.resolve("docs/Lego"), catalogPath = path.resolve("src/kidx-document-catalog.json") } = {}) {
  const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
  const files = new Map(catalog.filter((item) => /^[a-z0-9-]+$/.test(item.id)
    && path.basename(item.filename) === item.filename && item.filename.toLowerCase().endsWith(".pdf"))
    .map((item) => [item.id, path.join(root, item.filename)]));
  return (request, response) => {
    const pathname = (request.url ?? "").split("?")[0];
    if (pathname !== "/kidx-document-status" && !pathname.startsWith("/kidx-documents/")) return false;
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405, { Allow: "GET, HEAD" }); response.end(); return true;
    }
    void (async () => {
      if (pathname === "/kidx-document-status") {
        const available = (await Promise.all([...files].map(async ([id, file]) => {
          try { return (await stat(file)).isFile() ? id : null; } catch { return null; }
        }))).filter(Boolean);
        const data = JSON.stringify({ available });
        response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store", "content-length": Buffer.byteLength(data) });
        response.end(request.method === "HEAD" ? undefined : data);
        return;
      }
      const id = /^\/kidx-documents\/([a-z0-9-]+)\.pdf$/.exec(pathname)?.[1];
      const file = id && files.get(id);
      if (!file) { response.writeHead(404); response.end(); return; }
      const info = await stat(file);
      response.writeHead(200, { "content-type": "application/pdf", "content-length": info.size,
        "cache-control": "private, max-age=3600", "x-content-type-options": "nosniff" });
      if (request.method === "HEAD") response.end();
      else {
        const stream = createReadStream(file);
        stream.on("error", () => response.destroy());
        response.on("close", () => stream.destroy());
        stream.pipe(response);
      }
    })().catch(() => { if (!response.headersSent) response.writeHead(404); response.end(); });
    return true;
  };
}
