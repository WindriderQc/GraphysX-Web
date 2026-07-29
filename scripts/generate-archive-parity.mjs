import { createHash } from "node:crypto";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ARCHIVE_ROOTS,
  FUNCTIONALITY_RECORDS,
  MEDIA_CATEGORIES,
  MEDIA_EXTENSIONS,
  OUT_OF_SCOPE_PATH_PATTERNS,
} from "./archive-parity-scope.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);

function arg(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

const workshop = arg("--workshop");
const datalake = arg("--datalake");
const output = path.resolve(ROOT, arg("--output") ?? "docs/archive-parity-ledger.json");
if (!workshop || !datalake) {
  throw new Error("Usage: node scripts/generate-archive-parity.mjs --workshop <GraphysX root> --datalake <Datalake root> [--output <file>]");
}

const slash = (value) => value.replaceAll("\\", "/");
const logicalPath = (rootId, relative) => `${rootId}/${slash(relative)}`;

async function filesUnder(directory, skip = () => false) {
  const found = [];
  async function walk(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      const relative = slash(path.relative(directory, absolute));
      if (skip(relative, entry)) continue;
      if (entry.isDirectory()) await walk(absolute);
      else if (entry.isFile()) found.push({ absolute, relative });
    }
  }
  await walk(directory);
  return found;
}

async function sha256(file) {
  return createHash("sha256").update(await readFile(file)).digest("hex");
}

function categoryFor(extension) {
  for (const [category, extensions] of Object.entries(MEDIA_CATEGORIES)) {
    if (extensions.has(extension)) return category;
  }
  throw new Error(`No category for ${extension}`);
}

function isOutOfScope(relative) {
  return OUT_OF_SCOPE_PATH_PATTERNS.some((pattern) => pattern.test(slash(relative)));
}

async function productHashIndex() {
  const index = new Map();
  for (const relativeRoot of ["public/assets", "src/assets", "src/legacy"]) {
    const absoluteRoot = path.join(ROOT, relativeRoot);
    for (const file of await filesUnder(absoluteRoot)) {
      const hash = await sha256(file.absolute);
      const paths = index.get(hash) ?? [];
      paths.push(slash(path.relative(ROOT, file.absolute)));
      index.set(hash, paths);
    }
  }
  return index;
}

async function currentReferenceIndex() {
  const index = new Map();
  const allowed = new Set([".ts", ".mjs", ".md", ".json"]);
  const files = await filesUnder(ROOT, (relative, entry) =>
    entry.isDirectory() && /(^|\/)(\.git|node_modules|dist|output|patches)(\/|$)/i.test(relative),
  );
  const token = /[A-Za-z0-9_ .()!#@+\-/\\]+\.[A-Za-z0-9]{1,8}/g;
  for (const file of files) {
    // Never let the generated ledger become evidence for itself on the next run. It contains
    // every archive basename by design and would otherwise turn almost all SOURCE-ONLY rows
    // into false REVIVED matches after the first regeneration.
    if (path.resolve(file.absolute) === output) continue;
    if (!allowed.has(path.extname(file.relative).toLowerCase())) continue;
    const source = await readFile(file.absolute, "utf8").catch(() => "");
    for (const match of source.matchAll(token)) {
      const basename = path.basename(match[0].trim().replaceAll("\\", "/")).toLowerCase();
      if (!basename.includes(".")) continue;
      const refs = index.get(basename) ?? new Set();
      refs.add(slash(file.relative));
      index.set(basename, refs);
    }
  }
  return index;
}

function parseArchiveScenes(source) {
  const start = source.indexOf("export const ARCHIVE_SCENES");
  const end = source.indexOf("export const SCENE_RECOVERY_ITEMS", start);
  if (start < 0 || end < 0) throw new Error("Cannot locate ARCHIVE_SCENES in src/archive-content.ts");
  const records = [];
  const pattern = /\{\s*family:\s*"([^"]+)",\s*name:\s*"([^"]+)",\s*kind:\s*"([^"]+)",\s*source:\s*"([^"]+)",\s*status:\s*"([^"]+)",\s*revival:\s*"([^"]+)"\s*\}/g;
  for (const match of source.slice(start, end).matchAll(pattern)) {
    const [, family, name, kind, archiveSource, status, revival] = match;
    records.push({
      id: `scene-${records.length + 1}-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`,
      kind: `scene:${kind}`,
      label: name,
      disposition: "REVIVED",
      archiveEvidence: [archiveSource],
      currentEvidence: ["src/archive-content.ts"],
      destination: family,
      note: `${status}: ${revival}`,
      legacyStatus: status,
    });
  }
  if (records.length !== 54) throw new Error(`Expected 54 canonical archive scene records, found ${records.length}`);
  return records;
}

const productHashes = await productHashIndex();
const currentReferences = await currentReferenceIndex();
const media = [];
const roots = [];
for (const descriptor of ARCHIVE_ROOTS) {
  const base = descriptor.base === "workshop" ? workshop : datalake;
  const absoluteRoot = path.resolve(base, descriptor.relative);
  const rootStat = await stat(absoluteRoot).catch(() => null);
  if (!rootStat?.isDirectory()) throw new Error(`Archive root is missing: ${descriptor.id} (${descriptor.relative})`);
  const sourceFiles = await filesUnder(absoluteRoot);
  let selected = 0;
  for (const file of sourceFiles) {
    const extension = path.extname(file.relative).toLowerCase();
    if (!MEDIA_EXTENSIONS.has(extension)) continue;
    selected += 1;
    const info = await stat(file.absolute);
    const hash = await sha256(file.absolute);
    const basename = path.basename(file.relative).toLowerCase();
    const currentEvidence = [...(currentReferences.get(basename) ?? [])].sort();
    const currentDestinations = [...(productHashes.get(hash) ?? [])].sort();
    media.push({
      sourcePath: logicalPath(descriptor.id, file.relative),
      rootId: descriptor.id,
      relativePath: slash(file.relative),
      basename: path.basename(file.relative),
      extension,
      category: categoryFor(extension),
      bytes: info.size,
      sha256: hash,
      sourceRole: isOutOfScope(file.relative) ? "imported/vendor" : "authored-or-unresolved",
      currentDestinations,
      currentEvidence,
    });
  }
  roots.push({ ...descriptor, filesExamined: sourceFiles.length, mediaRecords: selected });
}

media.sort((a, b) => a.sourcePath.localeCompare(b.sourcePath));
const groups = new Map();
for (const record of media) {
  const group = groups.get(record.sha256) ?? [];
  group.push(record);
  groups.set(record.sha256, group);
}
for (const group of groups.values()) {
  group.sort((a, b) => Number(a.sourceRole === "imported/vendor") - Number(b.sourceRole === "imported/vendor") || a.sourcePath.localeCompare(b.sourcePath));
  const canonical = group[0];
  for (const record of group) {
    record.canonicalSourcePath = canonical.sourcePath;
    if (record.bytes === 0) {
      record.disposition = "UNRECOVERABLE";
      record.reason = "Zero-byte archive payload; no media bytes survive.";
    } else if (record !== canonical) {
      record.disposition = "ALIASED";
      record.reason = `Byte-identical SHA-256 alias of ${canonical.sourcePath}.`;
    } else if (record.sourceRole === "imported/vendor") {
      record.disposition = "OUT OF SCOPE";
      record.reason = "Engine, framework or tutorial payload retained in the project tree; not distinct authored GraphysX media.";
    } else if (record.currentDestinations.length > 0 || record.currentEvidence.length > 0) {
      record.disposition = "REVIVED";
      record.reason = record.currentDestinations.length > 0
        ? "Exact bytes ship in the current lazy asset/source registry."
        : "The current product registry or implementation names this source; conversions/adaptations are documented at that destination.";
    } else {
      record.disposition = "SOURCE-ONLY";
      record.reason = "Unique non-empty archive payload found, but no current registry/destination or defensible player-visible binding was found.";
    }
  }
}

const archiveContent = await readFile(path.join(ROOT, "src", "archive-content.ts"), "utf8");
const functionality = [...parseArchiveScenes(archiveContent), ...FUNCTIONALITY_RECORDS]
  .sort((a, b) => a.id.localeCompare(b.id));
const dispositions = ["REVIVED", "SUPERSEDED", "ALIASED", "SOURCE-ONLY", "UNRECOVERABLE", "OUT OF SCOPE"];
const countBy = (records, key) => Object.fromEntries(
  [...new Set(records.map((record) => record[key]))].sort().map((value) => [value, records.filter((record) => record[key] === value).length]),
);
const ledger = {
  schema: "graphysx.archive-parity/v1",
  generatedAt: new Date().toISOString(),
  scope: {
    roots,
    mediaExtensions: [...MEDIA_EXTENSIONS].sort(),
    rule: "Every selected archive path receives a disposition; SHA-256 groups preserve aliases without hiding source paths.",
  },
  summary: {
    mediaPaths: media.length,
    uniqueHashes: groups.size,
    duplicatePaths: media.length - groups.size,
    totalBytesExamined: media.reduce((sum, record) => sum + record.bytes, 0),
    mediaByCategory: countBy(media, "category"),
    mediaByDisposition: countBy(media, "disposition"),
    functionalityRecords: functionality.length,
    functionalityByDisposition: countBy(functionality, "disposition"),
  },
  allowedDispositions: dispositions,
  functionality,
  media,
};
await writeFile(output, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ output: slash(path.relative(ROOT, output)), ...ledger.summary }, null, 2));
