// Generates the agent-facing model catalog from what is actually on disk.
//
// The catalog used to be five hand-written entries while 63 converted meshes sat in
// public/assets/. Everything an agent cannot see through `assets()` may as well not exist,
// so the list is now derived from the files themselves and regenerated rather than curated
// by hand — a mesh that lands on disk shows up in the catalog.
//
//   node scripts/build-asset-catalog.mjs
//
// Writes src/agent-world-asset-catalog.ts. Commit the result; the build does not run this.

import { readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const VEHICLE_DIR = resolve(ROOT, "public", "assets", "vehicles");
const MESH_DIR = join(ROOT, "public", "assets", "dominus-gallery", "meshes");
const OUT = join(ROOT, "src", "agent-world-asset-catalog.ts");
const URL_PREFIX = "/assets/dominus-gallery/meshes";

/**
 * Ids published before the catalog was generated. Their file names do not match what the
 * derivation would produce, and an id is a stable contract — an agent or a stored scene may
 * already reference them, so they keep their original spelling.
 */
const PINNED_IDS = {
  "port_cottage1.json": "port-cottage",
  "port_lighthouse.json": "port-lighthouse",
  "port_windmill.json": "port-windmill",
  "zoksword.json": "zoksword",
  "zokshield.json": "zokshield",
};

/** Prefix → category. Categories let an agent ask for "a tree" without knowing file names. */
const CATEGORIES = [
  [/^tree_/, "vegetation"],
  [/^bush_/, "vegetation"],
  [/^grass_/, "vegetation"],
  [/^camp\d*_/, "camp"],
  [/^port_/, "port"],
  [/^(renzok|doman|ishad|scale_renzok)/, "character"],
  [/^(sword|shield|zoksword|zokshield)/, "prop"],
];

/** Words the archive spells in lowercase that read badly title-cased. */
const WORDS = {
  cottage: "Cottage", hut: "Hut", house: "House", inn: "Inn", pub: "Pub", shed: "Shed",
  market: "Market", windmill: "Windmill", lighthouse: "Lighthouse", fishhouse: "Fish House",
  maindocks: "Main Docks", smalldocks: "Small Docks", minidock: "Mini Dock",
  shipyard: "Shipyard", shippiece: "Ship Piece", sunkship: "Sunken Ship",
  weathervain: "Weathervane", const: "Construction", post: "Post", tent: "Tent",
  dead: "Dead", green: "Green", reed: "Reed", flower: "Flower",
  zoksword: "Zok Sword", zokshield: "Zok Shield",
};

function categoryOf(file) {
  for (const [pattern, category] of CATEGORIES) if (pattern.test(file)) return category;
  return "prop";
}

function labelOf(stem) {
  return stem
    .split(/[_\s]+/)
    .map((part) => {
      // Trailing digits are archive variant numbers: port_hut03 → Port Hut 03.
      const match = /^([a-z]+)(\d+)$/.exec(part);
      if (match) return `${WORDS[match[1]] ?? titled(match[1])} ${match[2]}`;
      return WORDS[part] ?? titled(part);
    })
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function titled(word) {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function idOf(file, stem) {
  return PINNED_IDS[file] ?? stem.replace(/_/g, "-");
}

/**
 * The catalog as data. Exported so port tools can ask what actually exists rather than
 * assuming — an archive placement table happily references meshes that were never
 * converted, and a scene referencing a missing asset fails to load at runtime.
 */
export async function buildAssetCatalog() {
  const files = (await readdir(MESH_DIR)).filter((file) => file.endsWith(".json")).sort();
  const entries = files.map((file) => {
    const stem = file.slice(0, -5);
    return {
      id: idOf(file, stem),
      label: labelOf(stem),
      category: categoryOf(file),
      format: "graphysx-mesh-json",
      url: `${URL_PREFIX}/${file}`,
      source: `Dominus Art/${stem}.x`,
    };
  });
  // The recovered vehicles are vendored separately from the Dominus meshes but are ordinary
  // `graphysx-mesh-json` payloads, so they register the same way. Registration is what makes
  // them ship: `scripts/product-assets.mjs` derives the release manifest from this catalog, so
  // an unregistered mesh — and every texture it references — is pruned out of `dist/` and 404s
  // in production while working perfectly in dev. Label and source come from each payload's own
  // provenance block rather than being retyped here.
  for (const file of (await readdir(VEHICLE_DIR)).filter((name) => name.endsWith(".json")).sort()) {
    const payload = JSON.parse(await readFile(join(VEHICLE_DIR, file), "utf8"));
    const archiveSource = payload.provenance?.archiveSource ?? "";
    entries.push({
      id: file.slice(0, -5),
      label: labelOf(file.slice(0, -5).replace(/^archive-/, "")),
      category: "vehicle",
      format: "graphysx-mesh-json",
      url: `/assets/vehicles/${file}`,
      source: archiveSource,
    });
  }
  const duplicates = entries.map((entry) => entry.id).filter((id, index, all) => all.indexOf(id) !== index);
  if (duplicates.length > 0) throw new Error(`Duplicate asset ids: ${duplicates.join(", ")}`);
  return entries;
}

/** Archive catalog id (underscored) → published asset id. */
export function publishedAssetId(catalogId) {
  return PINNED_IDS[`${catalogId}.json`] ?? catalogId.replace(/_/g, "-");
}

// Writing the TS file only happens when this is run directly.
if (!process.argv[1] || !process.argv[1].endsWith("build-asset-catalog.mjs")) {
  // Imported as a library — nothing to do.
} else {
const entries = await buildAssetCatalog();

const body = entries
  .map((entry) => `  { id: ${JSON.stringify(entry.id)}, label: ${JSON.stringify(entry.label)}, category: ${JSON.stringify(entry.category)}, format: "graphysx-mesh-json", url: ${JSON.stringify(entry.url)}, source: ${JSON.stringify(entry.source)} }`)
    .join(",\n");

const source = `// GENERATED by scripts/build-asset-catalog.mjs — do not edit by hand.
//
// Every converted mesh on disk, published so agents can discover it through \`assets()\`.
// Regenerate after adding meshes: node scripts/build-asset-catalog.mjs

import type { AgentWorldAssetDescriptor } from "./agent-world-assets";

export const GRAPHYSX_AGENT_WORLD_ASSET_CATALOG: readonly AgentWorldAssetDescriptor[] = [
${body}
] as const;
`;

await writeFile(OUT, source, "utf8");
console.log(`wrote ${entries.length} assets to ${OUT}`);
for (const category of [...new Set(entries.map((entry) => entry.category))].sort()) {
  console.log(`  ${category}: ${entries.filter((entry) => entry.category === category).length}`);
}
}
