// Graduate the recovered vehicles from the decoded legacy catalog into platform assets.
//
// PRODUCT_SPEC §10: restore (workshop) -> curate -> convert to a stable asset id ->
// import as vocabulary. The vehicles were already *decoded* — `src/legacy/cars-catalog.json`
// holds exact vertex/index/UV arrays for the Impreza, the Low Cobra and the Piste Ovale —
// but that file is only readable by `race-scene.ts`, which mutates the three.js graph
// directly. It is therefore legacy-only: not reachable from `graphysx.agent-world/v2`.
//
// This script does the one legitimate graduation step for a recovered *asset*: it rewrites
// the catalog's geometry into the `graphysx-mesh-json` payload the v2 `model` entity already
// loads (`src/agent-world-assets.ts`), so an ordinary `api.spawn({ type: "model" })` can
// reference it. No behaviour, no runtime code, no three.js — just the mesh, moved onto the
// format the platform already speaks.
//
// Usage: node scripts/vendor-vehicle-meshes.mjs
// Writes: public/assets/vehicles/*.json  and  src/archive-vehicles-manifest.ts
//
// PROVENANCE (SHA-256 of the archive originals, workshop repo `WindriderQc/GraphysX`):
//   impreza  Yanik C++ BCKUP/Media/Models/cars/impreza.3ds
//            87b3890636c2f6849e0c714e8ccec0913140bbc237899b89e8db0e788fb03091
//   cobra    Yanik C++ BCKUP/Media/Models/cars/Low_Cobra.3DS
//            1af174e5f135a530e833fafcaadcef604abbaa159c1d07c2cd189adda40688f6
//   track    AtmelCubx/PisteOvale.tvm
//            88d83fce3dff562cba9211692020629c08caf4356cb98318bb01de51dca70113
// Decoded to `cars-catalog.json` by the workshop's `web-prototype/tools/convert-cars.mjs`
// (3DS chunk walk, Z-up -> Y-up as (x, z, -y); TVM MSTA/MVER/MI16 walk). This script reads
// only that decoded catalog — it never touches the workshop.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "..");
const CATALOG = join(ROOT, "src", "legacy", "cars-catalog.json");
const OUT_DIR = join(ROOT, "public", "assets", "vehicles");
const MANIFEST = join(ROOT, "src", "archive-vehicles-manifest.ts");

const TEX = "/assets/textures/cars";
const catalogBytes = readFileSync(CATALOG);
const catalog = JSON.parse(catalogBytes.toString("utf8"));
const catalogSha = createHash("sha256").update(catalogBytes).digest("hex");

const round = (v) => Math.round(v * 1000) / 1000;

function boundsOf(meshes) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const mesh of meshes) {
    for (let i = 0; i < mesh.positions.length; i += 3) {
      for (let axis = 0; axis < 3; axis += 1) {
        min[axis] = Math.min(min[axis], mesh.positions[i + axis]);
        max[axis] = Math.max(max[axis], mesh.positions[i + axis]);
      }
    }
  }
  return {
    min: min.map(round),
    max: max.map(round),
    size: [round(max[0] - min[0]), round(max[1] - min[1]), round(max[2] - min[2])],
  };
}

/**
 * Bucket faces by material and emit contiguous index groups.
 *
 * `classify` returns the material slot for a face's recorded material name. This reproduces
 * exactly the mapping `race-scene.ts` uses (Material#1 -> livery, Material#2 -> glass,
 * Material #3 -> undercarriage), which is itself read off the 3DS material-face lists.
 */
function groupByMaterial(indices, faceMaterials, materialCount, classify) {
  const buckets = Array.from({ length: materialCount }, () => []);
  const faceCount = Math.floor(indices.length / 3);
  for (let face = 0; face < faceCount; face += 1) {
    const slot = classify(faceMaterials?.[face] ?? "");
    buckets[Math.max(0, Math.min(materialCount - 1, slot))].push(
      indices[face * 3],
      indices[face * 3 + 1],
      indices[face * 3 + 2],
    );
  }
  const grouped = [];
  const groups = [];
  buckets.forEach((bucket, materialIndex) => {
    if (bucket.length === 0) return;
    groups.push({ start: grouped.length, count: bucket.length, materialIndex });
    grouped.push(...bucket);
  });
  return { indices: grouped, groups };
}

/** Wheel vertices are stored recentred on their own hub; bake the hub offset back in. */
function offsetPositions(positions, offset) {
  const out = new Array(positions.length);
  for (let i = 0; i < positions.length; i += 3) {
    out[i] = round(positions[i] + offset[0]);
    out[i + 1] = round(positions[i + 1] + offset[1]);
    out[i + 2] = round(positions[i + 2] + offset[2]);
  }
  return out;
}

const written = [];

function write(id, payload, extra) {
  const bounds = boundsOf(payload.meshes);
  const body = { ...payload, bounds, provenance: extra.provenance };
  const json = JSON.stringify(body);
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, `${id}.json`), json);
  const triangles = payload.meshes.reduce((sum, mesh) => sum + mesh.indices.length / 3, 0);
  written.push({
    id,
    url: `/assets/vehicles/${id}.json`,
    label: extra.label,
    // `fitSize` in `AgentWorldModelAsset` uniformly fits the model's *longest* span into that
    // many world units. Setting it to the longest native span therefore reproduces the
    // archive's own scale exactly — 1:1, no guessing.
    nativeFitSize: Math.max(...bounds.size),
    bounds,
    meshCount: payload.meshes.length,
    triangles,
    source: extra.source,
    sha256: extra.sha256,
    notes: extra.notes,
  });
  console.log(
    `${id}: ${payload.meshes.length} meshes, ${triangles} tris, native span ` +
      `${bounds.size.join(" x ")} (${(json.length / 1024).toFixed(0)} KB)`,
  );
}

// ---------------------------------------------------------------- Impreza
{
  const car = catalog.impreza;
  const chassis = groupByMaterial(car.chassis.indices, car.chassis.faceMaterials, 3, (name) => {
    const key = name.toLowerCase().replace(/\s+/g, "");
    return key === "material#2" ? 1 : key === "material#3" ? 2 : 0;
  });
  const meshes = [
    {
      name: "chasis",
      positions: car.chassis.positions,
      uvs: car.chassis.uvs ?? null,
      indices: chassis.indices,
      groups: chassis.groups,
      materials: [
        // Archive material names and their recorded texture file names are kept in the
        // material name so the lineage survives into the running scene graph.
        { name: "Material#1 (CHASIS.JPG)", textureUrl: `${TEX}/ChassisSTi.bmp`, specularPower: 42 },
        { name: "Material#2 (VENTANAS.JPG)", textureUrl: `${TEX}/Windows.bmp`, specularPower: 90 },
        { name: "Material #3 (CHASIS_A.JPG)", textureUrl: `${TEX}/Undercarriage.bmp`, specularPower: 12 },
      ],
    },
    ...car.wheels.map((wheel) => ({
      name: wheel.name,
      positions: offsetPositions(wheel.positions, wheel.offset),
      uvs: wheel.uvs ?? null,
      indices: wheel.indices,
      materials: [{ name: "ruedas (RUEDAS.JPG)", textureUrl: `${TEX}/Wheel.bmp`, specularPower: 16 }],
    })),
  ];
  write("archive-impreza", { meshes }, {
    label: "Subaru Impreza (archive)",
    source: "Yanik C++ BCKUP/Media/Models/cars/impreza.3ds",
    sha256: "87b3890636c2f6849e0c714e8ccec0913140bbc237899b89e8db0e788fb03091",
    provenance: {
      archiveSource: "Yanik C++ BCKUP/Media/Models/cars/impreza.3ds",
      archiveSha256: "87b3890636c2f6849e0c714e8ccec0913140bbc237899b89e8db0e788fb03091",
      decodedBy: "GraphysX workshop web-prototype/tools/convert-cars.mjs",
      decodedCatalog: "src/legacy/cars-catalog.json",
      decodedCatalogSha256: catalogSha,
      vendoredBy: "scripts/vendor-vehicle-meshes.mjs",
    },
    notes: [
      "FAITHFUL: vertex/index/UV arrays verbatim from the decoded 3DS; the three chassis " +
        "material slots and their face assignments; the four wheel hub offsets.",
      "FAITHFUL: textures are the archive's own, vendored under /assets/textures/cars " +
        "(ChassisSTi/Windows/Undercarriage/Wheel .bmp). The catalog records the original " +
        "names CHASIS.JPG / VENTANAS.JPG / CHASIS_A.JPG / RUEDAS.JPG; the shipped BMPs are " +
        "those same maps under the workshop's vendored names.",
      "INFERRED: specular power per slot (the 3DS shininess was not carried into the catalog).",
      "DELIBERATELY ABSENT: wheels are baked into the model at their catalog offsets and do " +
        "not steer or spin. A model entity is one static mesh group; articulation belongs to " +
        "a rig the platform does not have yet.",
    ],
  });
}

// ---------------------------------------------------------------- Low Cobra
{
  const car = catalog.cobra;
  const meshes = [
    {
      name: "cobra-body",
      positions: car.chassis.positions,
      uvs: car.chassis.uvs ?? null,
      indices: car.chassis.indices,
      materials: [{ name: "Cobra body (Cobra_Blue.tga)", textureUrl: `${TEX}/cobra_blue.png`, specularPower: 60 }],
    },
    ...car.wheels.map((wheel) => ({
      name: wheel.name,
      positions: offsetPositions(wheel.positions, wheel.offset),
      uvs: wheel.uvs ?? null,
      indices: wheel.indices,
      // No tire texture ships in this repo: the archive's TA_Tire.tga / Tire_trd.tga live in
      // the workshop only. Untextured dark rubber rather than a stand-in pretending to be it.
      materials: [{ name: "Cobra tire (no recovered texture in this repo)", color: [0.016, 0.016, 0.018, 1], specularPower: 8 }],
    })),
  ];
  write("archive-cobra", { meshes }, {
    label: "Low Cobra (archive)",
    source: "Yanik C++ BCKUP/Media/Models/cars/Low_Cobra.3DS",
    sha256: "1af174e5f135a530e833fafcaadcef604abbaa159c1d07c2cd189adda40688f6",
    provenance: {
      archiveSource: "Yanik C++ BCKUP/Media/Models/cars/Low_Cobra.3DS",
      archiveSha256: "1af174e5f135a530e833fafcaadcef604abbaa159c1d07c2cd189adda40688f6",
      decodedBy: "GraphysX workshop web-prototype/tools/convert-cars.mjs",
      decodedCatalog: "src/legacy/cars-catalog.json",
      decodedCatalogSha256: catalogSha,
      vendoredBy: "scripts/vendor-vehicle-meshes.mjs",
    },
    notes: [
      "FAITHFUL: vertex/index/UV arrays and the four tire hub offsets, as decoded.",
      "INFERRED, upstream of this repo: the decoder rotated the source (authored ~200 units " +
        "along X) onto Z and scaled it by 0.024 to sit at Impreza size. That normalisation is " +
        "the workshop's, recorded in convert-cars.mjs, not the archive's own transform.",
      "PARTIAL: the 3DS records four material names ('2 - Default', '19 - Default', " +
        "'20 - Default', '8 - Default') with no texture bindings carried into the catalog, so " +
        "the whole body takes one livery — the same choice race-scene.ts makes. The glass is " +
        "therefore painted with the body map rather than being separately transparent.",
      "DELIBERATELY ABSENT: tire textures (TA_Tire.tga / Tire_trd.tga are workshop-only) and " +
        "wheel articulation.",
    ],
  });
}

// ---------------------------------------------------------------- Piste Ovale
{
  const track = catalog.track;
  write("archive-piste-ovale", {
    meshes: [
      {
        name: "PisteOvale",
        positions: track.positions,
        uvs: track.uvs ?? null,
        indices: track.indices,
        // Flat neutral asphalt. Chosen dark rather than mid-grey because the TVM's material
        // assignments are not decoded and a bright untextured slab under a display light
        // blows out and reads as a solid lump; dark, the banking's own shading describes the
        // shape. It is a *presentation* choice over a gap in the record, not a claim.
        materials: [{ name: "PisteOvale (material groups not decoded)", color: [0.075, 0.08, 0.088, 1], specularPower: 6 }],
      },
    ],
  }, {
    label: "Piste Ovale (archive)",
    source: "AtmelCubx/PisteOvale.tvm",
    sha256: "88d83fce3dff562cba9211692020629c08caf4356cb98318bb01de51dca70113",
    provenance: {
      archiveSource: "AtmelCubx/PisteOvale.tvm",
      archiveSha256: "88d83fce3dff562cba9211692020629c08caf4356cb98318bb01de51dca70113",
      decodedBy: "GraphysX workshop web-prototype/tools/convert-cars.mjs",
      decodedCatalog: "src/legacy/cars-catalog.json",
      decodedCatalogSha256: catalogSha,
      vendoredBy: "scripts/vendor-vehicle-meshes.mjs",
    },
    notes: [
      "FAITHFUL: the decoded TVM vertex/index arrays and the native 150 x 19.4 x 200 extent.",
      "PARTIAL: the TVM holds several material groups but the decoder does not preserve their " +
        "assignments, so this ships as one untextured slab. race-scene.ts papered over that by " +
        "projecting a concrete texture per face; a gallery piece should not invent a surface " +
        "the record does not have, so it stays flat grey and says so.",
      "ARCHIVE FINDING (workshop RECUPERATION_LEDGER.md): PisteOvale was never wired into " +
        "CarScene. The 2008 car drove on heightmap terrain; the oval is an unused asset.",
    ],
  });
}

// ---------------------------------------------------------------- manifest
const manifest = `// GENERATED by scripts/vendor-vehicle-meshes.mjs — do not edit by hand.
//
// The recovered vehicles, converted from the decoded \`src/legacy/cars-catalog.json\` into the
// \`graphysx-mesh-json\` payload a v2 \`model\` entity loads. Each entry carries its archive
// source path and SHA-256 so a scene referencing it keeps its lineage (PRODUCT_SPEC §11).
//
// These are referenced by URL rather than by catalog id: \`src/agent-world-asset-catalog.ts\`
// is generated from \`public/assets/**\` by \`scripts/build-asset-catalog.mjs\` and is a shared
// file. Registering them there is a one-line follow-up — see the report — after which
// \`asset: { id: "archive-impreza" }\` works too and they become discoverable via \`api.assets()\`.

export type ArchiveVehicleRecord = {
  readonly id: string;
  readonly label: string;
  readonly url: string;
  /** Longest native span, in archive units. Passing it as \`fitSize\` reproduces archive scale 1:1. */
  readonly nativeFitSize: number;
  readonly bounds: { readonly min: readonly number[]; readonly max: readonly number[]; readonly size: readonly number[] };
  readonly meshCount: number;
  readonly triangles: number;
  readonly source: string;
  readonly sha256: string;
  /** FAITHFUL / INFERRED / PARTIAL / DELIBERATELY ABSENT, verbatim from the vendoring step. */
  readonly notes: readonly string[];
};

export const ARCHIVE_VEHICLE_MESHES: readonly ArchiveVehicleRecord[] = ${JSON.stringify(written, null, 2)
  .replace(/^/gm, "")} as const;

export function archiveVehicleMesh(id: string): ArchiveVehicleRecord {
  const record = ARCHIVE_VEHICLE_MESHES.find((candidate) => candidate.id === id);
  if (!record) throw new Error(\`Unknown archive vehicle mesh: \${id}\`);
  return record;
}
`;
writeFileSync(MANIFEST, manifest);
console.log(`wrote ${MANIFEST}`);
