// Append-only bounded segments. Never rewrite or purge an existing recording.
import { open, mkdir, readdir, stat, lstat } from "node:fs/promises";
import { join } from "node:path";
import { ARCHIVE_LIMIT, UUID } from "./archive.mjs";

const PART = /^part-(\d{6})\.ndjson$/;
const MAX_FILES = 16384;

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
    parts.push({ id: match ? Number(match[1]) : 0, name, bytes: file.size });
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
      else if (item.isFile() && item.name.endsWith(".ndjson")) bytes += (await stat(path)).size;
    }
  };
  await walk(root);
  return bytes;
}

export class SegmentedArchive {
  constructor(root, { maxBytes = ARCHIVE_LIMIT, segmentBytes = Math.min(maxBytes, 32 * 1024 * 1024),
    instanceBytes = maxBytes * 4, totalBytes = maxBytes * 16, bufferBytes = 8 * 1024 * 1024, openFile = open } = {}) {
    for (const n of [maxBytes, segmentBytes, instanceBytes, totalBytes, bufferBytes]) {
      if (!Number.isSafeInteger(n) || n <= 0) throw new Error("Archive limits must be positive integer bytes");
    }
    this.root = root; this.segmentBytes = segmentBytes; this.maxBytes = maxBytes;
    this.instanceLimit = instanceBytes; this.totalLimit = totalBytes; this.bufferBytes = bufferBytes; this.openFile = openFile;
    this.tail = Promise.resolve(); this.file = null; this.pending = 0; this.bytes = 0;
    this.error = null; this.part = 0; this.partBytes = 0; this.seed = () => [];
  }
  async start(id) {
    await this.close();
    this.error = null; this.bytes = 0; this.partBytes = 0;
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
    if (bytes > this.segmentBytes || this.pending + bytes > this.bufferBytes ||
        this.bytes + bytes > this.instanceLimit || this.total + bytes > this.totalLimit || (this.part + (rotate && !this.rotate ? 1 : 0)) >= 1024) {
      this.error = "Recording paused at segment, buffer or archive quota; existing segments retained";
      return;
    }
    let path;
    if (rotate) {
      if (!this.rotate) this.part += 1;
      path = join(this.dir, this.part === 0 ? "graphysx-recording.ndjson" : `part-${String(this.part).padStart(6, "0")}.ndjson`);
      this.rotate = false; this.partBytes = 0;
    }
    this.partBytes += bytes; this.bytes += bytes; this.total += bytes; this.pending += bytes;
    this.tail = this.tail.then(async () => {
      if (this.error?.startsWith("Recording write failed")) return;
      if (path) {
        if (this.file) { await this.file.sync(); await this.file.close(); this.file = null; }
        this.file = await this.openFile(path, "wx", 0o600);
      }
      await this.file.writeFile(chunk);
    }).catch(error => { this.error = `Recording write failed: ${error.code || "I/O"}; existing segments retained`; })
      .finally(() => { this.pending -= bytes; });
  }
  async flush() {
    await this.tail;
    if (this.file) try { await this.file.sync(); }
    catch (error) { this.error = `Recording sync failed: ${error.code || "I/O"}; existing segments retained`; }
  }
  async close() {
    await this.flush();
    if (this.file) {
      try { await this.file.close(); }
      catch (error) { this.error = `Recording close failed: ${error.code || "I/O"}; existing segments retained`; }
      finally { this.file = null; }
    }
  }
  status() {
    return { enabled: Boolean(this.root), bytes: this.bytes, pendingBytes: this.pending, error: this.error,
      maxBytes: this.maxBytes, segmentBytes: this.segmentBytes, segment: this.part,
      instanceMaxBytes: this.instanceLimit, totalMaxBytes: this.totalLimit };
  }
}
