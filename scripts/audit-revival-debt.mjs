import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// The mission's 22-item preview/pipeline register as it existed at sweep start. Keep this list
// explicit: a global count would silently change when an unrelated future recovery item lands.
const REGISTER = [
  "Skyboxes", "Heightmaps", "Day/Night", "Spline Flight",
  "Interactive 2D Surfaces",
  "Actor Loop", "Mouse Pick / Aim Line", "Projectile Basics", "Fire / Particles",
  "Tile Semantics", "Export Shape", "Race Conversion",
  "Load XML", "Save XML", "Add X Mesh", "Object Picking",
  "Clock Displays", "Earth Grid", "Domotic Controls",
  "Suzanne Moving Parts", "Shader Pack", "XML Scenes",
];
const INTENTIONALLY_OPEN = new Map([
  ["Shader Pack", "proprietary TV3D shader math is only partly translatable; haze/water/shadow descendants are live and the absent remainder is named"],
]);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const content = await readFile(path.join(ROOT, "src", "archive-content.ts"), "utf8");

function statusFor(label) {
  const marker = `label: ${JSON.stringify(label)}`;
  const start = content.indexOf(marker);
  if (start < 0) throw new Error(`Missing recovery register label: ${label}`);
  const slice = content.slice(start, start + 900);
  const match = slice.match(/status:\s*"(ported|preview|pipeline)"/);
  if (!match) throw new Error(`Missing recovery status beside: ${label}`);
  return match[1];
}

if (REGISTER.length !== 22 || new Set(REGISTER).size !== 22) {
  throw new Error(`The pinned debt register must contain 22 unique entries, found ${REGISTER.length}`);
}
const results = REGISTER.map((label) => ({ label, status: statusFor(label) }));
const open = results.filter((record) => record.status !== "ported");
if (open.length !== INTENTIONALLY_OPEN.size) {
  throw new Error(`Expected ${INTENTIONALLY_OPEN.size} honest open boundaries, found ${open.length}: ${open.map((record) => record.label).join(", ")}`);
}
for (const record of open) {
  if (!INTENTIONALLY_OPEN.has(record.label)) throw new Error(`Unexpected revival debt remains: ${record.label} (${record.status})`);
}
for (const label of INTENTIONALLY_OPEN.keys()) {
  if (!open.some((record) => record.label === label)) throw new Error(`Open boundary was silently relabelled: ${label}`);
}

const ledgers = [
  ["src/archive-buildings.ts", "ARCHIVE_BUILDINGS_NOT_REVIVED", 3, ["revived on the archive surface", "revived in Maison Explorer", "exact interiors are player-visible"]],
  ["src/archive-ballz-levels.ts", "ARCHIVE_BALLZ_NOT_REVIVED", 6, ["player-visible Archive Level 3", "composed v2 Long Canyon", "moving machinery also graduated to a v2 course"]],
  ["src/archive-math-lab.ts", "ARCHIVE_MATH_NOT_REVIVED", 1, ["hardware-input panel", 'verdict: "not-revived"']],
  ["src/archive-playgrounds.ts", "ARCHIVE_PLAYGROUNDS_NOT_REVIVED", 7, ["player-visible Living Forest", "live Orbital Observatory", "dedicated Three.js Playground", "live Input & Device Lab"]],
  ["src/archive-milkyway.ts", "ARCHIVE_MILKYWAY_NOT_REVIVED", 4, ["deliberately not shipped as a second scene", "not revivable — the vocabulary has one texture slot", "does not exist to revive", "not revivable as simulation"]],
];
for (const [file, symbol, expectedRecords, requiredEvidence] of ledgers) {
  const source = await readFile(path.join(ROOT, file), "utf8");
  const start = source.indexOf(`export const ${symbol}`);
  if (start < 0) throw new Error(`${file} no longer exports ${symbol}`);
  const end = source.indexOf("] as const;", start);
  if (end < 0) throw new Error(`${file} no longer terminates ${symbol} as a const ledger`);
  const ledger = source.slice(start, end);
  const recordCount = (ledger.match(/\n\s+(?:record|id):/g) ?? []).length;
  if (recordCount !== expectedRecords) throw new Error(`${symbol} changed from ${expectedRecords} audited records to ${recordCount}; re-audit the ledger`);
  for (const evidence of requiredEvidence) {
    if (!ledger.includes(evidence)) throw new Error(`${symbol} lost audited evidence: ${evidence}`);
  }
}

console.log(JSON.stringify({
  schema: "graphysx.revival-debt-audit/v1",
  registerCount: results.length,
  revivedCount: results.length - open.length,
  open: open.map((record) => ({ ...record, boundary: INTENTIONALLY_OPEN.get(record.label) })),
  ledgersChecked: ledgers.map(([file, , recordCount]) => ({ file, recordCount })),
}, null, 2));
