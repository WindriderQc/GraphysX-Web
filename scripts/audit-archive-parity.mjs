import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ARCHIVE_ROOTS, FUNCTIONALITY_RECORDS, MEDIA_EXTENSIONS } from "./archive-parity-scope.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ledgerPath = path.join(ROOT, "docs", "archive-parity-ledger.json");
const ledger = JSON.parse(await readFile(ledgerPath, "utf8"));
const allowed = new Set(["REVIVED", "SUPERSEDED", "ALIASED", "SOURCE-ONLY", "UNRECOVERABLE", "OUT OF SCOPE"]);
const fail = (message) => { throw new Error(`archive parity audit: ${message}`); };

if (ledger.schema !== "graphysx.archive-parity/v1") fail(`unexpected schema ${ledger.schema}`);
if (JSON.stringify(ledger.scope.mediaExtensions) !== JSON.stringify([...MEDIA_EXTENSIONS].sort())) fail("media extension scope changed without regenerating the ledger");
if (JSON.stringify(ledger.scope.roots.map((root) => root.id)) !== JSON.stringify(ARCHIVE_ROOTS.map((root) => root.id))) fail("archive roots changed without regenerating the ledger");
if (ledger.media.length !== ledger.summary.mediaPaths) fail("media summary count does not match records");
if (new Set(ledger.media.map((record) => record.sourcePath)).size !== ledger.media.length) fail("duplicate media sourcePath records");
if (new Set(ledger.functionality.map((record) => record.id)).size !== ledger.functionality.length) fail("duplicate functionality ids");
if (ledger.functionality.length !== 54 + FUNCTIONALITY_RECORDS.length) fail("functionality scope changed without regenerating the ledger");

const groups = new Map();
for (const record of ledger.media) {
  if (!allowed.has(record.disposition)) fail(`${record.sourcePath} has invalid disposition ${record.disposition}`);
  if (!/^[a-f0-9]{64}$/.test(record.sha256)) fail(`${record.sourcePath} has invalid SHA-256`);
  if (!Number.isSafeInteger(record.bytes) || record.bytes < 0) fail(`${record.sourcePath} has invalid byte size`);
  if (!record.reason) fail(`${record.sourcePath} has no evidence-backed reason`);
  const group = groups.get(record.sha256) ?? [];
  group.push(record);
  groups.set(record.sha256, group);
  for (const destination of record.currentDestinations) {
    const absolute = path.join(ROOT, destination);
    const info = await stat(absolute).catch(() => null);
    if (!info?.isFile()) fail(`${record.sourcePath} points at missing current payload ${destination}`);
    const hash = createHash("sha256").update(await readFile(absolute)).digest("hex");
    if (hash !== record.sha256) fail(`${destination} drifted from the ledger hash for ${record.sourcePath}`);
  }
  for (const evidence of record.currentEvidence) {
    if (!(await stat(path.join(ROOT, evidence)).catch(() => null))?.isFile()) fail(`${record.sourcePath} points at missing evidence ${evidence}`);
  }
}
if (groups.size !== ledger.summary.uniqueHashes) fail("unique-hash summary does not match records");
if (ledger.media.length - groups.size !== ledger.summary.duplicatePaths) fail("duplicate-path summary does not match records");
for (const [hash, records] of groups) {
  const canonical = records.find((record) => record.sourcePath === record.canonicalSourcePath);
  if (!canonical) fail(`hash ${hash} has no canonical source record`);
  for (const record of records) {
    if (record.canonicalSourcePath !== canonical.sourcePath) fail(`hash ${hash} has inconsistent canonical aliases`);
    if (record !== canonical && record.bytes > 0 && record.disposition !== "ALIASED") fail(`${record.sourcePath} duplicates ${canonical.sourcePath} but is not ALIASED`);
  }
}

for (const record of ledger.functionality) {
  if (!allowed.has(record.disposition)) fail(`${record.id} has invalid disposition ${record.disposition}`);
  if (!record.archiveEvidence?.length && record.disposition !== "OUT OF SCOPE") fail(`${record.id} has no archive evidence`);
  if (!record.note) fail(`${record.id} has no disposition note`);
  for (const evidence of record.currentEvidence ?? []) {
    if (!(await stat(path.join(ROOT, evidence)).catch(() => null))?.isFile()) fail(`${record.id} points at missing current evidence ${evidence}`);
  }
  if ((record.disposition === "REVIVED" || record.disposition === "SUPERSEDED") && !record.currentEvidence?.length) fail(`${record.id} claims ${record.disposition} without current evidence`);
}

const unresolved = [...ledger.media, ...ledger.functionality].filter((record) => !allowed.has(record.disposition));
if (unresolved.length) fail(`${unresolved.length} records have no disposition`);
console.log(JSON.stringify({
  schema: "graphysx.archive-parity-audit/v1",
  ledger: path.relative(ROOT, ledgerPath).replaceAll("\\", "/"),
  mediaPaths: ledger.media.length,
  uniqueHashes: groups.size,
  aliases: ledger.media.filter((record) => record.disposition === "ALIASED").length,
  functionalityRecords: ledger.functionality.length,
  dispositions: ledger.summary,
}, null, 2));
