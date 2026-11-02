// Append-only bounded segments. Never rewrite or purge an existing recording.
import { open, mkdir, readdir, stat, lstat } from "node:fs/promises";
import { join } from "node:path";
import { constants, createGzip } from "node:zlib";
import { ARCHIVE_LIMIT, UUID } from "./archive.mjs";

const PART = /^part-(\d{6})\.ndjson(\.gz)?$/;
const MAX_FILES = 16384;
const QUOTA = "Recording paused at segment, buffer or archive quota; existing segments retained";

/** Metadata only: old monolithic recordings remain segment zero, byte-for-byte. */
export async function recordingParts(root, id) {
  if (!UUID.test(id)) throw new Error("Invalid recording id");
  const dir = join(root, "instances", id);
  const names = await readdir(dir);
  if (names.length > MAX_FILES) throw new Error("Recording metadata limit reached");
  const parts = [];
  for (const name of names) {
    const match = PART.exec(name);
    if (name !== "graphysx-recording.ndjson" && !match) continue;
    const file = await lstat(join(dir, name));
    if (!file.isFile()) continue;
    parts.push({ id: match ? Number(match[1]) : 0, name, bytes: file.size, compressed: Boolean(match?.[2]) });
  }
  return parts.sort((a, b) => a.id - b.id);
}

async function rootBytes(root) {
  let bytes = 0, entries = 0;
  const walk = async dir => {
    for (const item of await readdir(dir, { withFileTypes: true })) {
      if (++entries > MAX_FILES) throw new Error("Archive metadata limit reached");
      const path = join(dir, item.name);
      if (item.isDirectory()) await walk(path);
      else if (item.isFile() && /\.ndjson(\.gz)?$/.test(item.name)) bytes += (await stat(path)).size;
    }
  };
  await walk(root);
  return bytes;
}

/**
 * One gzip member per segment. Every write ends with a sync flush, so the bytes on disk always
 * decode up to the last accepted line, even without the trailer a crash would leave out.
 */
function gzipSegment() {
  const gzip = createGzip();
  let out = [], failure = null;
  gzip.on("data", chunk => out.push(chunk));
  gzip.on("error", error => { failure = error; });
  const take = () => {
    if (failure) throw failure;
    const bytes = Buffer.concat(out);
    out = [];
    return bytes;
  };
  return {
    push: text => new Promise((resolve, reject) => {
      gzip.write(text);
      gzip.flush(constants.Z_SYNC_FLUSH, () => { try { resolve(take()); } catch (error) { reject(error); } });
    }),
    end: () => new Promise((resolve, reject) => {
      gzip.once("end", () => { try { resolve(take()); } catch (error) { reject(error); } });
      gzip.once("error", reject);
      gzip.end();
    }),
  };
}

export class SegmentedArchive {
  /**
   * `compress`: new segments after the first become gzip files (part-NNNNNN.ndjson.gz). Segment
   * size stays measured in uncompressed bytes, so a replay's memory bound is unchanged; the
   * instance and total quotas count the bytes on disk. Segment zero keeps its plain name.
   */
  constructor(root, { maxBytes = ARCHIVE_LIMIT, segmentBytes = Math.min(maxBytes, 32 * 1024 * 1024),
    instanceBytes = maxBytes * 4, totalBytes = maxBytes * 16, bufferBytes = 8 * 1024 * 1024, compress = false, openFile = open } = {}) {
    for (const n of [maxBytes, segmentBytes, instanceBytes, totalBytes, bufferBytes]) {
      if (!Number.isSafeInteger(n) || n <= 0) throw new Error("Archive limits must be positive integer bytes");
    }
    this.root = root; this.segmentBytes = segmentBytes; this.maxBytes = maxBytes; this.compress = Boolean(compress);
    this.instanceLimit = instanceBytes; this.totalLimit = totalBytes; this.bufferBytes = bufferBytes; this.openFile = openFile;
    this.tail = Promise.resolve(); this.file = null; this.gzip = null; this.pending = 0; this.bytes = 0;
    this.error = null; this.part = 0; this.partBytes = 0; this.seed = () => [];
  }
  async start(id) {
    await this.close();
    this.error = null; this.full = false; this.bytes = 0; this.partBytes = 0;
    if (!this.root) return;
    if (!UUID.test(id)) throw new Error("Invalid recording identity");
    this.dir = join(this.root, "instances", id);
    let parts;
    try {
      await mkdir(this.dir, { recursive: true });
      parts = await recordingParts(this.root, id);
      this.total = await rootBytes(this.root);
    } catch (error) {
      this.error = `Recording unavailable: ${error.code || "metadata limit"}; existing segments retained`;
      this.dir = null;
      return;
    }
    this.bytes = parts.reduce((n, part) => n + part.bytes, 0);
    this.part = parts.length ? parts.at(-1).id + 1 : 0;
    // A resume always creates a new segment; existing bytes, including torn tails, stay intact.
    this.rotate = true;
  }
  write(value) {
    if (!this.root || !this.dir || this.error) return;
    const line = JSON.stringify(value) + "\n";
    const size = Buffer.byteLength(line);
    const rotate = this.rotate || this.partBytes + size > this.segmentBytes;
    const prefix = rotate && value.kind !== "hello" ? this.seed().map(x => JSON.stringify(x) + "\n").join("") : "";
    const chunk = prefix + line, bytes = Buffer.byteLength(chunk);
    // Compressed bytes are only known once compressed: the queue enforces the exact quota there.
    if (bytes > this.segmentBytes || this.pending + bytes > this.bufferBytes ||
        this.bytes + bytes > this.instanceLimit || this.total + bytes > this.totalLimit || (this.part + (rotate && !this.rotate ? 1 : 0)) >= 1024) {
      this.error = QUOTA;
      return;
    }
    let path, gzipped = false;
    if (rotate) {
      if (!this.rotate) this.part += 1;
      gzipped = this.compress && this.part !== 0;
      path = join(this.dir, this.part === 0 ? "graphysx-recording.ndjson" : `part-${String(this.part).padStart(6, "0")}.ndjson${gzipped ? ".gz" : ""}`);
      this.rotate = false; this.partBytes = 0;
    }
    this.partBytes += bytes; this.pending += bytes;
    if (!this.compress) { this.bytes += bytes; this.total += bytes; }
    this.tail = this.tail.then(async () => {
      if (this.error?.startsWith("Recording write failed") || this.full) return;
      const next = path && gzipped ? gzipSegment() : null;
      const sink = path ? next : this.gzip;
      const data = sink ? await sink.push(chunk) : chunk;
      if (this.compress && (this.bytes + data.length > this.instanceLimit || this.total + data.length > this.totalLimit)) {
        // Stop before this line, and before creating any new segment. A compressor that already
        // took the line loses its trailer; its segment still decodes up to the last written line.
        this.full = true; this.error = QUOTA;
        if (!path) this.gzip = null;
        return;
      }
      if (path) {
        // No extra await when nothing is open: callers expect the first file promptly.
        if (this.file) await this.closeSegment();
        this.file = await this.openFile(path, "wx", 0o600);
        this.gzip = next;
      }
      await this.file.writeFile(data);
      if (this.compress) { this.bytes += data.length; this.total += data.length; }
    }).catch(error => { this.error = `Recording write failed: ${error.code || "I/O"}; existing segments retained`; })
      .finally(() => { this.pending -= bytes; });
  }
  /** Writes the gzip trailer, then syncs and closes the current segment file. */
  async closeSegment() {
    const file = this.file, gzip = this.gzip;
    this.file = null; this.gzip = null;
    if (!file) return;
    try {
      if (gzip) {
        const trailer = await gzip.end();
        await file.writeFile(trailer);
        this.bytes += trailer.length; this.total += trailer.length;
      }
      await file.sync();
    } finally { await file.close(); }
  }
  async flush() {
    await this.tail;
    if (this.file) try { await this.file.sync(); }
    catch (error) { this.error = `Recording sync failed: ${error.code || "I/O"}; existing segments retained`; }
  }
  async close() {
    await this.tail;
    if (!this.file) return;
    try { await this.closeSegment(); }
    catch (error) { this.error = `Recording close failed: ${error.code || "I/O"}; existing segments retained`; }
  }
  status() {
    return { enabled: Boolean(this.root), bytes: this.bytes, pendingBytes: this.pending, error: this.error,
      maxBytes: this.maxBytes, segmentBytes: this.segmentBytes, segment: this.part,
      instanceMaxBytes: this.instanceLimit, totalMaxBytes: this.totalLimit, compressed: this.compress };
  }
}
