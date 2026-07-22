// The asset store: the media half of the store server. The scene store holds what a
// scene *is*; this holds the files a scene *uses* — textures, converted meshes, sounds —
// imported at runtime instead of vendored at build time.
//
// Why it exists: the v2 library used to be two static TypeScript arrays. Adding one
// texture meant converting offline, regenerating a source file and rebuilding — so a
// 251 MB datalake of recovered media (E:\Media\Datalake\StockRoom and friends) sat
// unreachable. This store gives the editor and the agent API a live import path:
// browse the datalake, copy a file in, serve it back, and the browser registers it
// into the same registries the curated assets live in. Nothing here touches the
// build; production stays static and pruned, and imported media only exists where a
// store is running — exactly like stored scenes.
//
// Zero dependencies, same as scene-store.mjs, and mounted into the same server so
// one `npm run serve:scenes` gives you both.

import { createReadStream } from "node:fs";
import { copyFile, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { basename, dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..");

export const ASSET_STORE_SCHEMA = "graphysx.asset-store/v1";

const DEFAULT_ASSET_DIR = process.env.GRAPHYSX_ASSET_DIR ?? join(REPO_ROOT, ".graphysx-store", "assets");
// The datalake is machine-local by nature (it is a folder of recovered personal media,
// not repo content). The env var is the whole contract. There used to be an E:\ fallback
// for the machine this feature was built for — removed, because a store that silently
// serves a hardcoded path to personal media is exactly the surprise a port-forwarded
// server must not contain. Unset means the /datalake routes answer 503.
const DEFAULT_DATALAKE = process.env.GRAPHYSX_DATALAKE_DIR ?? null;

/** Same shape the scene store enforces, so asset ids and scene ids agree. */
const ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,79}$/;

const TEXTURE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp", ".dds"]);
const MODEL_EXTENSIONS = new Set([".json", ".obj", ".gltf", ".glb", ".fbx", ".stl", ".3ds", ".x", ".tvm", ".blend", ".mtl"]);
const SOUND_EXTENSIONS = new Set([".wav", ".mp3", ".ogg", ".mid", ".flac"]);
/** Formats the browser can convert to graphysx-mesh-json; the rest need offline tooling. */
export const CONVERTIBLE_MODEL_EXTENSIONS = [".obj", ".gltf", ".glb", ".fbx", ".stl", ".3ds"];

const MIME_TYPES = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".bmp": "image/bmp",
  ".webp": "image/webp",
  ".dds": "image/vnd-ms.dds",
  ".json": "application/json; charset=utf-8",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".mid": "audio/midi",
  ".flac": "audio/flac",
  ".obj": "text/plain; charset=utf-8",
  ".mtl": "text/plain; charset=utf-8",
  ".gltf": "model/gltf+json",
  ".glb": "model/gltf-binary",
};

export function mediaKindForFile(fileName) {
  const ext = extname(fileName).toLowerCase();
  if (TEXTURE_EXTENSIONS.has(ext)) return "texture";
  if (SOUND_EXTENSIONS.has(ext)) return "sound";
  if (MODEL_EXTENSIONS.has(ext)) return "model";
  return "file";
}

function mimeFor(fileName) {
  return MIME_TYPES[extname(fileName).toLowerCase()] ?? "application/octet-stream";
}

/** "Grass Sample" out of "GrassSample.jpg"; ids stay filename-shaped, labels stay human. */
function labelForFile(fileName) {
  const stem = fileName.replace(/\.[^.]+$/, "");
  const spaced = stem
    .replace(/[_\-.]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
  return spaced ? spaced[0].toUpperCase() + spaced.slice(1) : fileName;
}

function slugForFile(fileName) {
  const stem = fileName.replace(/\.[^.]+$/, "").toLowerCase();
  const slug = stem.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  return slug || "asset";
}

/**
 * Keep the stored file's name shell-boring: the datalake is full of "Earth (2).jpg" and
 * "EarthMID .jpg", and a URL-hostile name buys nothing once the id carries identity.
 */
function safeFileName(fileName) {
  const ext = extname(fileName).toLowerCase();
  const stem = fileName.slice(0, fileName.length - ext.length);
  const clean = stem.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 80) || "file";
  return `${clean}${ext.toLowerCase()}`;
}

/** Same atomic write + Windows EPERM retry the scene store uses (see scene-store.mjs). */
const RENAME_ATTEMPTS = 5;
const RENAME_RETRY_CODES = new Set(["EPERM", "EACCES", "EBUSY"]);

async function writeAtomic(target, contents) {
  const temporary = `${target}.${process.pid}.tmp`;
  await writeFile(temporary, contents);
  for (let attempt = 1; ; attempt += 1) {
    try {
      await rename(temporary, target);
      return;
    } catch (error) {
      if (attempt >= RENAME_ATTEMPTS || !RENAME_RETRY_CODES.has(error?.code)) {
        await rm(temporary, { force: true }).catch(() => undefined);
        throw error;
      }
      await delay(20 * attempt);
    }
  }
}

function badRequest(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

export function createAssetStore({ dir = DEFAULT_ASSET_DIR, datalakeDir = DEFAULT_DATALAKE } = {}) {
  const manifestPath = join(dir, "manifest.json");
  const filesDir = join(dir, "files");
  const ready = mkdir(filesDir, { recursive: true });
  // All manifest writes flow through one chain — two concurrent imports would otherwise
  // read-modify-write the same JSON and one of them would silently vanish.
  let writeChain = Promise.resolve();

  const queue = (task) => {
    const next = writeChain.then(task, task);
    writeChain = next.then(() => undefined, () => undefined);
    return next;
  };

  async function readManifest() {
    try {
      const parsed = JSON.parse(await readFile(manifestPath, "utf8"));
      return Array.isArray(parsed?.assets) ? parsed.assets : [];
    } catch (error) {
      if (error && error.code === "ENOENT") return [];
      throw error;
    }
  }

  async function writeManifest(assets) {
    await writeAtomic(manifestPath, `${JSON.stringify({ schema: ASSET_STORE_SCHEMA, assets }, null, 2)}\n`);
  }

  /**
   * Any datalake path a request names must land back inside the datalake root once
   * resolved — `..`, absolute paths and drive changes all fail the prefix check.
   */
  function resolveDatalakePath(relative) {
    // 503, not 404: the routes exist, the backing directory does not. A clear "not
    // configured" beats a misleading "not found" when someone wires a new box.
    if (!datalakeDir) throw badRequest("datalake not configured (set GRAPHYSX_DATALAKE_DIR)", 503);
    const cleaned = String(relative ?? "").replace(/[\\/]+/g, sep).replace(/^[\\/]+|[\\/]+$/g, "");
    const absolute = resolve(datalakeDir, cleaned);
    const root = resolve(datalakeDir);
    if (absolute !== root && !absolute.startsWith(root + sep)) {
      throw badRequest(`Path escapes the datalake: ${relative}`);
    }
    return { absolute, relative: cleaned.split(sep).join("/") };
  }

  async function uniqueId(assets, base) {
    const taken = new Set(assets.map((asset) => asset.id));
    if (!taken.has(base)) return base;
    for (let index = 2; index < 1000; index += 1) {
      const candidate = `${base}-${index}`;
      if (!taken.has(candidate)) return candidate;
    }
    throw badRequest(`Could not find a free id near ${base}`, 409);
  }

  async function addAsset({ id, kind, label, category, fileName, source, meta }, writeBody) {
    if (kind !== "texture" && kind !== "model" && kind !== "sound" && kind !== "file") {
      throw badRequest(`Unknown asset kind: ${kind}`);
    }
    await ready;
    return queue(async () => {
      const assets = await readManifest();
      const storedName = safeFileName(fileName);
      const finalId = await uniqueId(assets, id && ID_PATTERN.test(id) ? id : slugForFile(fileName));
      const assetDir = join(filesDir, finalId);
      await mkdir(assetDir, { recursive: true });
      const target = join(assetDir, storedName);
      await writeBody(target);
      const info = await stat(target);
      const record = {
        id: finalId,
        kind,
        label: label?.trim() || labelForFile(fileName),
        category: category?.trim() || "imported",
        format: kind === "model" && storedName.endsWith(".json") ? "graphysx-mesh-json" : undefined,
        url: `/assets/files/${encodeURIComponent(finalId)}/${encodeURIComponent(storedName)}`,
        file: storedName,
        source: source?.trim() || fileName,
        bytes: info.size,
        addedAt: new Date().toISOString(),
        meta: meta && typeof meta === "object" ? meta : undefined,
      };
      assets.push(record);
      await writeManifest(assets);
      return record;
    });
  }

  return {
    dir,
    datalakeDir,

    async list() {
      await ready;
      return readManifest();
    },

    async count() {
      return (await this.list()).length;
    },

    /** Copy one datalake file into the store and register it. */
    async importFromDatalake({ path, id, kind, label, category, meta }) {
      const { absolute, relative } = resolveDatalakePath(path);
      const info = await stat(absolute).catch(() => null);
      if (!info || !info.isFile()) throw badRequest(`No datalake file at ${relative}`, 404);
      const fileName = basename(absolute);
      return addAsset(
        {
          id,
          kind: kind ?? mediaKindForFile(fileName),
          label,
          category,
          fileName,
          source: `Datalake/${relative}`,
          meta,
        },
        (target) => copyFile(absolute, target),
      );
    },

    /** Store an uploaded body (drag-drop, or a browser-converted mesh JSON). */
    async upload({ fileName, id, kind, label, category, source, meta }, body) {
      if (!fileName || typeof fileName !== "string") throw badRequest("An upload requires ?filename=");
      return addAsset(
        {
          id,
          kind: kind ?? mediaKindForFile(fileName),
          label,
          category,
          fileName,
          source: source ?? `Upload/${fileName}`,
          meta,
        },
        (target) => writeAtomic(target, body),
      );
    },

    async remove(id) {
      if (!ID_PATTERN.test(id ?? "")) throw badRequest(`Invalid asset id: ${id}`);
      await ready;
      return queue(async () => {
        const assets = await readManifest();
        const index = assets.findIndex((asset) => asset.id === id);
        if (index === -1) throw badRequest(`Unknown asset: ${id}`, 404);
        assets.splice(index, 1);
        await writeManifest(assets);
        await rm(join(filesDir, id), { recursive: true, force: true }).catch(() => undefined);
        return id;
      });
    },

    /** One directory level of the datalake: folders first, then files with size + kind. */
    async browse(path) {
      const { absolute, relative } = resolveDatalakePath(path ?? "");
      const info = await stat(absolute).catch(() => null);
      if (!info || !info.isDirectory()) throw badRequest(`No datalake folder at ${relative || "/"}`, 404);
      const entries = await readdir(absolute, { withFileTypes: true });
      const folders = [];
      const files = [];
      await Promise.all(entries.map(async (entry) => {
        // Windows filesystem litter that would only be noise in a media browser.
        if (entry.name === "Thumbs.db" || entry.name === "desktop.ini") return;
        if (entry.isDirectory()) {
          folders.push({ name: entry.name, path: relative ? `${relative}/${entry.name}` : entry.name });
          return;
        }
        if (!entry.isFile()) return;
        const fileInfo = await stat(join(absolute, entry.name)).catch(() => null);
        files.push({
          name: entry.name,
          path: relative ? `${relative}/${entry.name}` : entry.name,
          bytes: fileInfo?.size ?? 0,
          extension: extname(entry.name).toLowerCase(),
          kind: mediaKindForFile(entry.name),
        });
      }));
      folders.sort((a, b) => a.name.localeCompare(b.name));
      files.sort((a, b) => a.name.localeCompare(b.name));
      return {
        schema: ASSET_STORE_SCHEMA,
        root: basename(resolve(datalakeDir ?? "")),
        path: relative,
        folders,
        files,
        convertibleModelExtensions: CONVERTIBLE_MODEL_EXTENSIONS,
      };
    },

    /** The absolute path for streaming a raw datalake file (previews and conversion). */
    datalakeFile(path) {
      return resolveDatalakePath(path).absolute;
    },

    /** The absolute path for streaming a stored asset file, or null. */
    async storedFile(id, fileName) {
      if (!ID_PATTERN.test(id ?? "")) return null;
      const assets = await this.list();
      const record = assets.find((asset) => asset.id === id);
      if (!record || record.file !== fileName) return null;
      return join(filesDir, id, record.file);
    },
  };
}

async function readRawBody(request, limitBytes = 192 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limitBytes) throw badRequest("Upload too large", 413);
    chunks.push(chunk);
  }
  if (size === 0) throw badRequest("An upload requires a request body");
  return Buffer.concat(chunks);
}

async function readJsonBody(request, limitBytes = 8 * 1024 * 1024) {
  const body = await readRawBody(request, limitBytes);
  try {
    return JSON.parse(body.toString("utf8"));
  } catch {
    throw badRequest("Request body must be valid JSON");
  }
}

function sendJson(response, status, payload, cors = { "access-control-allow-origin": "*" }) {
  const body = `${JSON.stringify(payload, null, 2)}\n`;
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
    ...cors,
    "access-control-allow-methods": "GET, PUT, POST, DELETE, OPTIONS",
    "access-control-allow-headers": "authorization, x-graphysx-token, content-type",
  });
  response.end(body);
}

async function streamFile(response, absolutePath, { cache, cors } = {}) {
  const info = await stat(absolutePath).catch(() => null);
  if (!info || !info.isFile()) {
    sendJson(response, 404, { error: `No file at ${basename(absolutePath)}` }, cors);
    return;
  }
  response.writeHead(200, {
    "content-type": mimeFor(absolutePath),
    "content-length": info.size,
    // `no-cache`, not a long max-age: remove-then-reimport legitimately reuses a freed id
    // at the same URL, and a day-long cache served the OLD payload to the runtime (found
    // the hard way — a re-imported model kept rendering without its baked textures). The
    // store has no ETags, so "revalidate" means refetch; on a LAN store that is the right
    // trade against silently stale geometry.
    "cache-control": cache ?? "no-cache",
    ...(cors ?? { "access-control-allow-origin": "*" }),
  });
  const stream = createReadStream(absolutePath);
  stream.on("error", () => response.destroy());
  stream.pipe(response);
}

/**
 * Route anything under /assets or /datalake. Returns true when the request was handled,
 * so the scene store's router can fall through for everything else.
 *
 * `guard` is the scene store's (createStoreGuard in scene-store.mjs): reads of registered
 * assets stay open — scenes reference them, and a shareable scene with unshareable
 * textures would be half a scene — while imports, uploads, deletes and everything under
 * /datalake require the token whenever one is set. The datalake is personal media, not
 * scene content, so even *listing* it is guarded.
 */
export async function handleAssetRequest(store, request, response, url, path, guard) {
  const method = request.method ?? "GET";
  const cors = guard?.corsHeaders(request);
  const denied = () => {
    if (!guard || guard.authorized(request, url)) return false;
    sendJson(response, 401, { error: "This store requires a token (Authorization: Bearer <GRAPHYSX_STORE_TOKEN>)" }, cors);
    return true;
  };

  if (path === "/assets" && method === "GET") {
    sendJson(response, 200, {
      schema: ASSET_STORE_SCHEMA,
      datalake: store.datalakeDir ? basename(resolve(store.datalakeDir)) : null,
      assets: await store.list(),
    }, cors);
    return true;
  }

  if (path === "/assets/import" && method === "POST") {
    if (denied()) return true;
    const body = await readJsonBody(request);
    const record = await store.importFromDatalake(body ?? {});
    sendJson(response, 201, record, cors);
    return true;
  }

  if (path === "/assets/upload" && method === "POST") {
    if (denied()) return true;
    const body = await readRawBody(request);
    let meta;
    const rawMeta = url.searchParams.get("meta");
    if (rawMeta) {
      try {
        meta = JSON.parse(rawMeta);
      } catch {
        throw badRequest("?meta= must be URL-encoded JSON");
      }
    }
    const record = await store.upload({
      fileName: url.searchParams.get("filename") ?? "",
      id: url.searchParams.get("id") ?? undefined,
      kind: url.searchParams.get("kind") ?? undefined,
      label: url.searchParams.get("label") ?? undefined,
      category: url.searchParams.get("category") ?? undefined,
      source: url.searchParams.get("source") ?? undefined,
      meta,
    }, body);
    sendJson(response, 201, record, cors);
    return true;
  }

  const removeMatch = /^\/assets\/([^/]+)$/.exec(path);
  if (removeMatch && method === "DELETE") {
    if (denied()) return true;
    const id = decodeURIComponent(removeMatch[1]);
    sendJson(response, 200, { removed: await store.remove(id) }, cors);
    return true;
  }

  const fileMatch = /^\/assets\/files\/([^/]+)\/([^/]+)$/.exec(path);
  if (fileMatch && method === "GET") {
    const absolute = await store.storedFile(decodeURIComponent(fileMatch[1]), decodeURIComponent(fileMatch[2]));
    if (!absolute) {
      sendJson(response, 404, { error: "Unknown asset file" }, cors);
      return true;
    }
    await streamFile(response, absolute, { cors });
    return true;
  }

  if (path === "/datalake" && method === "GET") {
    if (denied()) return true;
    sendJson(response, 200, await store.browse(url.searchParams.get("path") ?? ""), cors);
    return true;
  }

  if (path === "/datalake/file" && method === "GET") {
    if (denied()) return true;
    const relative = url.searchParams.get("path");
    if (!relative) throw badRequest("?path= is required");
    await streamFile(response, store.datalakeFile(relative), { cache: "no-store", cors });
    return true;
  }

  return false;
}
