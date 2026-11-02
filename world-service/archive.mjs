// Bounded asynchronous recording and durable checkpoints. Runtime data stays outside Git.
import { open, mkdir, rename, readFile, realpath } from "node:fs/promises";
import { dirname, join, sep } from "node:path";
import { createHash } from "node:crypto";
import { constants, gunzipSync } from "node:zlib";
import { startReplayServer } from "./replay.mjs";
import { recordingParts } from "./segments.mjs";
import { parseRecording } from "./recording.mjs";

export const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export const ARCHIVE_LIMIT = 256 * 1024 * 1024;

export function verifyCheckpoint(value) {
  if (!value?.recovery) return value; // Legacy native snapshots remain explicitly supported.
  const { recovery, ...snapshot } = value;
  const digest = createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
  if (recovery.format !== "graphysx-checkpoint/v1" || recovery.sha256 !== digest) throw new Error("Checkpoint checksum mismatch");
  return snapshot;
}

/**
 * The SHA-256 that names one exact checkpoint: its sealed digest, or for a legacy unsealed
 * snapshot the digest it would be sealed with. A fork records it as its provenance.
 */
export function checkpointDigest(value) {
  const snapshot = verifyCheckpoint(value);
  return value?.recovery ? value.recovery.sha256 : createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}

export function sealCheckpoint(snapshot) {
  return { ...snapshot, recovery: { format: "graphysx-checkpoint/v1", sha256: createHash("sha256").update(JSON.stringify(snapshot)).digest("hex") } };
}

export async function atomicSnapshot(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  const file = await open(temporary, "w", 0o600);
  try { await file.writeFile(JSON.stringify(value)); await file.sync(); } finally { await file.close(); }
  await rename(temporary, path);
  const parent = await open(dirname(path), "r");
  try { await parent.sync(); } finally { await parent.close(); }
}

export class Archive {
  constructor(root, { maxBytes = ARCHIVE_LIMIT, bufferBytes = 8 * 1024 * 1024 } = {}) {
    this.root = root;
    this.maxBytes = maxBytes;
    this.bufferBytes = bufferBytes;
    this.pending = 0;
    this.bytes = 0;
    this.error = null;
    this.tail = Promise.resolve();
    this.file = null;
  }
  async start(id) {
    await this.close();
    this.error = null;
    if (!this.root) return;
    const dir = join(this.root, "instances", id);
    await mkdir(dir, { recursive: true });
    this.file = await open(join(dir, "graphysx-recording.ndjson"), "a+", 0o600);
    this.bytes = (await this.file.stat()).size;
    if (this.bytes) {
      const last = Buffer.alloc(1);
      await this.file.read(last, 0, 1, this.bytes - 1);
      // A crash may leave a torn last line. Preserve it as a skipped line;
      // the resume hello must start on a new line of its own.
      if (last[0] !== 10) { await this.file.writeFile("\n"); this.bytes += 1; }
    }
  }
  write(value) {
    if (!this.file || this.error) return;
    const line = `${JSON.stringify(value)}\n`;
    const bytes = Buffer.byteLength(line);
    if (this.bytes + bytes > this.maxBytes || this.pending + bytes > this.bufferBytes) {
      this.error = "Recording stopped at archive or write-buffer limit; existing bytes retained";
      return;
    }
    this.bytes += bytes;
    this.pending += bytes;
    const file = this.file;
    this.tail = this.tail.then(() => file.writeFile(line)).catch(error => {
      this.error = `Recording write failed: ${error.code || "I/O"}`;
    }).finally(() => { this.pending -= bytes; });
  }
  async flush() {
    await this.tail;
    if (this.file) await this.file.sync();
  }
  async close() {
    await this.flush();
    if (this.file) { await this.file.close(); this.file = null; }
  }
  status() { return { enabled: Boolean(this.root), bytes: this.bytes, pendingBytes: this.pending, error: this.error, maxBytes: this.maxBytes }; }
}

async function readArchive(path, maxBytes, reserve) {
  const file = await open(path, "r");
  try {
    const { size } = await file.stat();
    if (size > maxBytes) throw new Error("Recording exceeds replay memory limit");
    reserve(size);
    // Freeze the opening size. A concurrent live writer cannot grow this allocation.
    const bytes = Buffer.alloc(size);
    let offset = 0;
    while (offset < size) {
      const part = await file.read(bytes, offset, size - offset, offset);
      if (!part.bytesRead) break;
      offset += part.bytesRead;
    }
    return bytes.subarray(0, offset);
  } finally { await file.close(); }
}

/**
 * A gzip segment: the compressed bytes are transient, so only the decoded text is reserved. A
 * segment still being written has no trailer yet; it decodes up to its last flushed line.
 */
async function readCompressedArchive(path, maxBytes, reserve) {
  const packed = await readArchive(path, maxBytes, () => {});
  let bytes;
  try { bytes = gunzipSync(packed, { finishFlush: constants.Z_SYNC_FLUSH, maxOutputLength: maxBytes }); }
  catch (error) {
    if (error.code === "ERR_BUFFER_TOO_LARGE" || error instanceof RangeError) throw new Error("Recording exceeds replay memory limit");
    throw error;
  }
  reserve(bytes.length);
  return bytes;
}

/** Read-only archive router: only opaque IDs under this configured root, never caller paths. */
export function replayArchives(root, { maxBytes = ARCHIVE_LIMIT, maxOpen = 4, idleMs = 300_000, cleanupEveryMs = 30_000 } = {}) {
  const cache = new Map();
  let residentBytes = 0;
  const drop = (id, entry) => {
    if (cache.get(id) !== entry) return;
    cache.delete(id);
    residentBytes -= entry.bytes || 0;
    void entry.promise.then(replay => replay.close()).catch(() => {});
  };
  const retireIdle = except => {
    for (const [id, entry] of cache) if (id !== except && entry.running?.spectatorCount === 0) drop(id, entry);
  };
  const handle = async (request, response, url) => {
    const match = /^\/recordings\/([^/]+)(?:\/parts\/(\d{1,6}))?(\/.*)?$/.exec(url.pathname);
    if (!match) return false;
    const fail = (status, error) => { response.writeHead(status, { "content-type": "application/json", "access-control-allow-origin": "*" }); response.end(JSON.stringify({ error })); return true; };
    if (!root || !UUID.test(match[1])) return fail(404, "Unknown recording");
    const id = match[1];
    // Listing segments is metadata-only: it never opens an archive or starts a reader.
    let parts, reference;
    try {
      parts = await recordingParts(root, id);
      try { reference = JSON.parse(await readFile(join(root, "instances", id, "reference.json"), "utf8")); }
      catch (error) { if (error.code !== "ENOENT") throw error; }
      if (reference && !parts.length) parts = [{ id: 0, name: "graphysx-recording.ndjson", bytes: reference.bytes }];
    } catch { return fail(404, "Unknown recording"); }
    if (!match[2] && match[3] === "/parts" && request.method === "GET") {
      response.writeHead(200, { "content-type": "application/json", "access-control-allow-origin": "*", "cache-control": "no-store" });
      response.end(JSON.stringify({ recordingId: id, maxReplayBytes: maxBytes, parts: parts.map(({ id, bytes }) => ({ id, bytes })) }));
      return true;
    }
    const part = match[2] === undefined ? parts[0] : parts.find(part => part.id === Number(match[2]));
    if (!part) return fail(404, "Unknown recording segment");
    const key = `${id}:${part.id}`;
    let replay = cache.get(key);
    if (!replay) {
      if (cache.size >= maxOpen) retireIdle(key);
      if (cache.size >= maxOpen) return fail(429, "Replay capacity reached; close a viewer and retry");
      // Reserve before I/O; simultaneous requests share the same bounded load.
      const promise = (async () => {
        let path = join(root, "instances", id, part.name);
        if (part.id !== 0) reference = null;
        if (reference) {
          if (reference.format !== "graphysx-recording-reference/v1" || typeof reference.path !== "string") throw new Error("Invalid recording reference");
          path = await realpath(join(root, reference.path));
          const base = await realpath(root);
          if (!path.startsWith(base + sep)) throw new Error("Recording escaped configured root");
        }
        const bytes = await (part.compressed ? readCompressedArchive : readArchive)(path, maxBytes, size => {
          if (residentBytes + size > maxBytes) retireIdle(key);
          if (residentBytes + size > maxBytes) throw Object.assign(new Error("Replay byte capacity reached"), { code: "REPLAY_CAPACITY" });
          residentBytes += size;
          replay.bytes = size;
        });
        if (reference && (bytes.length !== reference.bytes || createHash("sha256").update(bytes).digest("hex") !== reference.sha256)) throw new Error("Registered recording changed");
        const recording = parseRecording(bytes.toString("utf8"));
        if (reference) for (const hello of recording.hellos) {
          hello.instanceId = id; hello.recordingId = id; hello.identitySource = "registered-legacy";
        }
        if (recording.hellos[0].instanceId !== id) throw new Error("Recording identity mismatch");
        return startReplayServer({ recording });
      })();
      replay = { promise, used: Date.now() };
      cache.set(key, replay);
    }
    try {
      const running = await replay.promise;
      replay.running = running;
      replay.used = Date.now();
      request.url = `${match[3] || "/"}${url.search}`;
      running.server.emit("request", request, response);
      return true;
    } catch (error) {
      drop(key, replay);
      if (error.code === "REPLAY_CAPACITY") return fail(429, "Replay byte capacity reached; close a viewer and retry");
      return fail(404, "Recording unavailable or invalid");
    }
  };
  const timer = setInterval(() => {
    for (const [id, entry] of cache) if (Date.now() - entry.used > idleMs && entry.running?.spectatorCount === 0) drop(id, entry);
  }, cleanupEveryMs);
  timer.unref();
  return { handle, status: () => ({ openReaders: cache.size, residentBytes, idleTimeoutMs: idleMs }), close: async () => { clearInterval(timer); await Promise.all([...cache.values()].map(entry => entry.promise.then(replay => replay.close()).catch(() => {}))); cache.clear(); residentBytes = 0; } };
}
