import { PlaneGeometry } from "three";
import { Heightfield as CannonHeightfield, Quaternion as CannonQuaternion, Vec3 } from "cannon-es";
import HEIGHTMAP_ARCHIVE from "./legacy/heightmaps-archive.json";
import TERRAIN_CARX from "./legacy/terrain-carx.json";

/**
 * Heightmap-backed terrain as first-class `graphysx.agent-world/v2` scene vocabulary.
 *
 * Two pieces of recovered material meet here:
 *
 *  - `src/legacy/heightmaps-archive.json` — three Windows BMP heightmaps from the GraphysX
 *    workshop (`Media/textures n else/Heightmaps`), decoded once at authoring time by
 *    `scripts/vendor-heightmaps.mjs`. The bitmaps themselves are deliberately not vendored:
 *    decoding an image at runtime costs a loader plus a `getImageData` readback on the
 *    first frame, and every source is 8-bit luminance anyway, so a byte-per-sample grid is
 *    the source's own precision at 3% of the size. Each record carries the source path,
 *    SHA-256, native dimensions and bit depth.
 *  - `src/legacy/terrain-carx.json` — the already-recovered 96×96 CarX field, decoded from
 *    `Heightmaps/CarHeightmap.bmp` via `CarScene.cpp CLLand(2,2,-400)`. It predates this
 *    module and is carried across unchanged rather than re-decoded.
 *
 * The sampler is adapted from `applyHeightmap()` in `archive-selector-environments.ts` —
 * same normalised-UV lookup and `computeVertexNormals()` finish — but it reads a decoded
 * grid instead of canvas pixels and interpolates bilinearly, because that host samples a
 * 512px bitmap at native density while a scene entity samples a coarse grid across a
 * configurable mesh and would otherwise stair-step.
 *
 * Terrain carries a **static cannon-es `Heightfield` collider**. This is the point of
 * graduating it: the showroom's previous sine-displaced host decoration had no collider at
 * all, so anything dropped on it fell through the world forever.
 */

export type AgentWorldHeightmapId = "canyon" | "highlands" | "basin" | "carx" | "rolling";

export type AgentWorldHeightmapProvenance = {
  sourcePath: string;
  sourceRepo: string;
  sourceSha256: string;
  nativeSize: [number, number];
  bitsPerPixel: number;
  note: string;
};

export type AgentWorldHeightmapDescriptor = {
  id: AgentWorldHeightmapId;
  label: string;
  description: string;
  /** Edge length of the square sample grid. */
  samples: number;
  /** True when the field is generated rather than recovered from the archive. */
  procedural: boolean;
  provenance: AgentWorldHeightmapProvenance | null;
};

/** The scene-vocabulary field. Every property is optional; the defaults are a usable ground. */
export type AgentWorldTerrain = {
  /**
   * A curated heightmap id, or null when the field is inline. Ignored when `heights` is
   * supplied — and nulled on export in that case, so a document never names a registry
   * entry it is not actually using.
   */
  heightmap?: AgentWorldHeightmapId | null;
  /**
   * Inline height field, row-major from the north-west corner, values 0..1. Its length must
   * be a perfect square. Lets a scene carry terrain no registry entry covers, and lets an
   * agent author a landform outright. Null clears it back to the registry heightmap.
   */
  heights?: number[] | null;
  /** Terrain edge length in world units. */
  size?: number;
  /** Mesh/collider resolution per edge. The collider uses the same grid as the mesh. */
  segments?: number;
  /** World-unit height of a full 0..1 excursion in the source field. */
  heightScale?: number;
  /** Vertical offset applied after scaling, so a field can sit below y=0. */
  heightOffset?: number;
  /** Radius around the local origin levelled into a flat pad, for placing built content. */
  flattenRadius?: number;
  /** Distance over which the flattened disc blends back into the landform. */
  flattenFalloff?: number;
  /**
   * Height the flattened pad is levelled to. Defaults to `heightOffset`, which is the
   * field's own minimum — fine for a pad at the bottom of a valley, useless for composing a
   * plateau above a water level, which is why it is separately settable.
   */
  flattenHeight?: number;
};

export type ResolvedAgentWorldTerrain = {
  heightmap: AgentWorldHeightmapId | null;
  heights: number[] | null;
  size: number;
  segments: number;
  heightScale: number;
  heightOffset: number;
  flattenRadius: number;
  flattenFalloff: number;
  flattenHeight: number;
};

/** Colliders and draw calls both scale with the square of this, so it is a hard ceiling. */
export const AGENT_WORLD_TERRAIN_MAX_SEGMENTS = 160;

type DecodedField = { samples: number; values: Float32Array };

const decodedFields = new Map<AgentWorldHeightmapId, DecodedField>();

function decodeBase64Bytes(encoded: string): Uint8Array {
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

const ARCHIVE_MAPS = HEIGHTMAP_ARCHIVE.maps as unknown as ReadonlyArray<{
  id: string;
  label: string;
  samples: number;
  encodedHeights: string;
  provenance: AgentWorldHeightmapProvenance & { sourceBytes: number; rawLuminanceRange: number[] };
}>;

const ARCHIVE_DESCRIPTIONS: Record<string, string> = {
  canyon: "Deep cut canyon with steep walls and a flat run-out floor. The most dramatic archive field.",
  highlands: "Rolling upland ridges with broad saddles. Reads well at showroom scale and walks nicely.",
  basin: "A wide shallow basin ringed by low hills — the natural fit for a water plane.",
};

export const GRAPHYSX_AGENT_WORLD_HEIGHTMAPS: readonly AgentWorldHeightmapDescriptor[] = [
  ...ARCHIVE_MAPS.map((map): AgentWorldHeightmapDescriptor => ({
    id: map.id as AgentWorldHeightmapId,
    label: map.label,
    description: ARCHIVE_DESCRIPTIONS[map.id] ?? "Recovered GraphysX heightmap.",
    samples: map.samples,
    procedural: false,
    provenance: {
      sourcePath: map.provenance.sourcePath,
      sourceRepo: map.provenance.sourceRepo,
      sourceSha256: map.provenance.sourceSha256,
      nativeSize: map.provenance.nativeSize,
      bitsPerPixel: map.provenance.bitsPerPixel,
      note: map.provenance.note,
    },
  })),
  {
    id: "carx",
    label: "CarX Land",
    description: "The CarX driving field, recovered ahead of this module and reused unchanged.",
    samples: TERRAIN_CARX.size,
    procedural: false,
    provenance: {
      sourcePath: "Heightmaps/CarHeightmap.bmp",
      sourceRepo: "WindriderQc/GraphysX",
      sourceSha256: "(carried from src/legacy/terrain-carx.json)",
      nativeSize: [TERRAIN_CARX.size, TERRAIN_CARX.size],
      bitsPerPixel: 24,
      note: TERRAIN_CARX.source,
    },
  },
  {
    id: "rolling",
    label: "Rolling (procedural)",
    description:
      "Deterministic sine/cosine swell. Not archive data — the fallback so a scene with no heightmap still has ground.",
    samples: 65,
    procedural: true,
    provenance: null,
  },
];

const DEFAULT_TERRAIN: ResolvedAgentWorldTerrain = {
  heightmap: "rolling",
  heights: null,
  size: 120,
  segments: 96,
  heightScale: 6,
  heightOffset: 0,
  flattenRadius: 0,
  flattenFalloff: 12,
  flattenHeight: Number.NaN,
};

export function isAgentWorldHeightmap(value: unknown): value is AgentWorldHeightmapId {
  return GRAPHYSX_AGENT_WORLD_HEIGHTMAPS.some((map) => map.id === value);
}

export function findAgentWorldHeightmap(id: AgentWorldHeightmapId): AgentWorldHeightmapDescriptor {
  const descriptor = GRAPHYSX_AGENT_WORLD_HEIGHTMAPS.find((map) => map.id === id);
  if (!descriptor) throw new Error(`Unknown GraphysX heightmap: ${String(id)}`);
  return descriptor;
}

/** Validate + clamp a terrain field into the fully-specified form the runtime and export use. */
export function resolveAgentWorldTerrain(
  source?: AgentWorldTerrain,
  base: ResolvedAgentWorldTerrain = DEFAULT_TERRAIN,
): ResolvedAgentWorldTerrain {
  const input = source ?? {};
  let heights: number[] | null = base.heights;
  if (input.heights !== undefined) {
    if (input.heights === null) {
      heights = null;
    } else {
      if (!Array.isArray(input.heights)) throw new Error("terrain.heights must be an array of numbers");
      const samples = Math.round(Math.sqrt(input.heights.length));
      if (samples < 2 || samples * samples !== input.heights.length) {
        throw new Error(`terrain.heights length must be a perfect square of at least 4 (got ${input.heights.length})`);
      }
      if (samples > 513) throw new Error("terrain.heights supports at most a 513x513 grid");
      if (input.heights.some((value) => !Number.isFinite(value))) throw new Error("terrain.heights must contain finite numbers");
      heights = input.heights.map((value) => clamp(value, 0, 1));
    }
  }

  let heightmap: AgentWorldHeightmapId | null = base.heightmap;
  if (input.heightmap === null) {
    heightmap = null;
  } else if (input.heightmap !== undefined) {
    if (!isAgentWorldHeightmap(input.heightmap)) {
      throw new Error(
        `Unknown heightmap: ${String(input.heightmap)}. Use one of ${GRAPHYSX_AGENT_WORLD_HEIGHTMAPS.map((m) => m.id).join(", ")}`,
      );
    }
    heightmap = input.heightmap;
  }
  // Inline heights win, and blank the registry reference so an export says which one it is.
  if (heights) heightmap = null;
  if (!heights && !heightmap) heightmap = "rolling";

  return {
    heightmap,
    heights,
    size: clamp(input.size ?? base.size, 1, 2000),
    segments: Math.round(clamp(input.segments ?? base.segments, 2, AGENT_WORLD_TERRAIN_MAX_SEGMENTS)),
    heightScale: clamp(input.heightScale ?? base.heightScale, 0, 500),
    heightOffset: clamp(input.heightOffset ?? base.heightOffset, -500, 500),
    flattenRadius: clamp(input.flattenRadius ?? base.flattenRadius, 0, 1000),
    flattenFalloff: clamp(input.flattenFalloff ?? base.flattenFalloff, 0.001, 1000),
    // `?? heightOffset` would not work: the base carries a resolved number, so an explicit
    // default has to be recovered here rather than inherited.
    flattenHeight: clamp(
      input.flattenHeight ?? (Number.isFinite(base.flattenHeight) ? base.flattenHeight : (input.heightOffset ?? base.heightOffset)),
      -500,
      500,
    ),
  };
}

/** The raw 0..1 source field for a resolved terrain, decoded and memoised. */
function sourceField(terrain: ResolvedAgentWorldTerrain): DecodedField {
  if (terrain.heights) {
    const samples = Math.round(Math.sqrt(terrain.heights.length));
    return { samples, values: Float32Array.from(terrain.heights) };
  }
  const id = terrain.heightmap ?? "rolling";
  const cached = decodedFields.get(id);
  if (cached) return cached;

  let field: DecodedField;
  if (id === "rolling") {
    // The procedural fallback. Deliberately deterministic — no RNG — so a scene without
    // archive data still reloads to the identical landform.
    const samples = 65;
    const values = new Float32Array(samples * samples);
    for (let row = 0; row < samples; row += 1) {
      for (let column = 0; column < samples; column += 1) {
        const u = (column / (samples - 1)) * 2 - 1;
        const v = (row / (samples - 1)) * 2 - 1;
        const swell = Math.sin(u * 3.1) * Math.cos(v * 2.7) + 0.5 * Math.sin(u * 1.3 + v * 1.9);
        values[row * samples + column] = clamp((swell + 1.5) / 3, 0, 1);
      }
    }
    field = { samples, values };
  } else if (id === "carx") {
    const samples = TERRAIN_CARX.size;
    field = { samples, values: Float32Array.from(TERRAIN_CARX.heights as number[]) };
  } else {
    const record = ARCHIVE_MAPS.find((map) => map.id === id);
    if (!record) throw new Error(`Unknown GraphysX heightmap: ${id}`);
    const bytes = decodeBase64Bytes(record.encodedHeights);
    const values = new Float32Array(bytes.length);
    for (let index = 0; index < bytes.length; index += 1) values[index] = bytes[index] / 255;
    field = { samples: record.samples, values };
  }
  decodedFields.set(id, field);
  return field;
}

/**
 * World-space heights for every vertex of the terrain mesh, in `PlaneGeometry` vertex order
 * (row-major, row 0 at the far/-Z edge). The mesh and the collider are built from this one
 * array, so what you see and what you land on cannot drift apart.
 */
/**
 * Where the flatten blend actually starts, once the pad is discretised onto the grid.
 *
 * The naive reading — blend from `flattenRadius` — flattens each *vertex* by its own
 * distance from the origin. But nothing ever stands on a vertex: content rests on the
 * bilinear *cell* between four of them. A cell that straddles `flattenRadius` has flat
 * inner corners and an un-flattened outer one, so it ramps, and the pad is really only
 * level out to the last grid ring strictly inside the radius. On the showroom terrain
 * (`size` 150, `segments` 96 → a 1.5625-unit cell, `flattenRadius` 12) that put the first
 * sloping ground at r≈10.2 rather than 12 — and because a cannon-es sphere has no rolling
 * resistance, a gradient of 0.004 is enough to send a dropped ball rolling off the pad and
 * down the landform instead of coming to rest. That is the whole of the long-standing
 * "collider disagrees with the mesh near the flatten rim" defect: the two agree exactly,
 * they were simply both describing a pad that stops short of its stated radius.
 *
 * A point of the disc is at most one cell diagonal from the corners of the cell it lands
 * in, so pushing the blend out by `cell * √2` guarantees every cell the disc touches has
 * all four corners flattened — i.e. `flattenRadius` becomes a promise the surface keeps.
 * The falloff length is unchanged, so the landform returns over the same distance.
 */
function flattenInnerEdge(terrain: ResolvedAgentWorldTerrain): number {
  return terrain.flattenRadius + (terrain.size / terrain.segments) * Math.SQRT2;
}

export function sampleTerrainHeights(terrain: ResolvedAgentWorldTerrain): Float32Array {
  const field = sourceField(terrain);
  const stride = terrain.segments + 1;
  const out = new Float32Array(stride * stride);
  const half = terrain.size / 2;
  const step = terrain.size / terrain.segments;
  const flattenEdge = flattenInnerEdge(terrain);

  for (let row = 0; row < stride; row += 1) {
    // v runs 0..1 across the field the same way `applyHeightmap` read it: north edge first.
    const v = row / terrain.segments;
    for (let column = 0; column < stride; column += 1) {
      const u = column / terrain.segments;
      let height = bilinear(field, u, v) * terrain.heightScale + terrain.heightOffset;
      if (terrain.flattenRadius > 0) {
        const x = -half + column * step;
        const z = -half + row * step;
        const distance = Math.hypot(x, z);
        // 0 inside the disc, 1 past the falloff — so built content sits on a level pad and
        // the landform returns smoothly rather than at a visible seam.
        const blend = smoothstep(flattenEdge, flattenEdge + terrain.flattenFalloff, distance);
        height = terrain.flattenHeight + (height - terrain.flattenHeight) * blend;
      }
      out[row * stride + column] = height;
    }
  }
  return out;
}

function bilinear(field: DecodedField, u: number, v: number): number {
  const maximum = field.samples - 1;
  const x = clamp(u, 0, 1) * maximum;
  const y = clamp(v, 0, 1) * maximum;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(maximum, x0 + 1);
  const y1 = Math.min(maximum, y0 + 1);
  const tx = x - x0;
  const ty = y - y0;
  const a = field.values[y0 * field.samples + x0];
  const b = field.values[y0 * field.samples + x1];
  const c = field.values[y1 * field.samples + x0];
  const d = field.values[y1 * field.samples + x1];
  return a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) + c * (1 - tx) * ty + d * tx * ty;
}

/** The displaced, Y-up terrain mesh geometry, with UVs intact so it can carry a texture. */
export function createTerrainGeometry(terrain: ResolvedAgentWorldTerrain, heights: Float32Array): PlaneGeometry {
  const geometry = new PlaneGeometry(terrain.size, terrain.size, terrain.segments, terrain.segments);
  const position = geometry.attributes.position;
  // Displacement happens before the rotation, so it goes on local Z.
  for (let index = 0; index < position.count; index += 1) position.setZ(index, heights[index]);
  position.needsUpdate = true;
  geometry.rotateX(-Math.PI / 2);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * The static collider, as a cannon-es {@link CannonHeightfield}.
 *
 * Heightfield data is `data[xIndex][yIndex]` with the height on the shape's local +Z, so the
 * shape has to be rotated to stand the field up in Y. The obvious rotation is the -90° about
 * X that the mesh geometry gets, which maps local (x, y, z) to world (x, z, -y) and needs a
 * `segments - yIndex` read because the shape's y index then runs backwards along world Z.
 * That places every *sample* correctly — and is still wrong, subtly, in between them.
 *
 * Both surfaces triangulate each quad, and each picks a diagonal. `PlaneGeometry` splits on
 * b–d (the north-east/south-west diagonal, in mesh row/column order); cannon splits its
 * pillars on the (xi, yi+1)–(xi+1, yi) diagonal. Those are the *same* diagonal in index
 * space — but the single-axis flip mirrors one index and turns it into the opposite one in
 * world space. So the collider was consistently the other triangulation of the same corner
 * heights: identical at every vertex, and up to 0.35 units out mid-quad on the showroom
 * field, which is a step you can feel and cannot see.
 *
 * Mapping the shape's x index along world Z and its y index along world X instead — a plain
 * transpose, `data[row][column]` — reverses the handedness a second time and lands the two
 * diagonals on top of each other. Measured max |collider - mesh| over the whole showroom
 * terrain goes from 0.349 to 0.000. Get the orientation wrong and the collider is the
 * terrain mirrored, which looks fine and lands wrong, so it is worth re-deriving rather than
 * adjusting: local x → world Z, local y → world X, local z (height) → world Y.
 */
export function createTerrainHeightfield(
  terrain: ResolvedAgentWorldTerrain,
  heights: Float32Array,
): { shape: CannonHeightfield; offset: Vec3; orientation: CannonQuaternion } {
  const stride = terrain.segments + 1;
  const elementSize = terrain.size / terrain.segments;
  const data: number[][] = [];
  for (let xIndex = 0; xIndex < stride; xIndex += 1) {
    const column = new Array<number>(stride);
    for (let yIndex = 0; yIndex < stride; yIndex += 1) {
      column[yIndex] = heights[xIndex * stride + yIndex];
    }
    data.push(column);
  }
  const orientation = new CannonQuaternion();
  orientation.setFromEuler(-Math.PI / 2, 0, -Math.PI / 2);
  return {
    shape: new CannonHeightfield(data, { elementSize }),
    // The shape's origin is its first sample, so shift it to centre the field on the entity.
    offset: new Vec3(-terrain.size / 2, 0, -terrain.size / 2),
    orientation,
  };
}

/** Terrain height at a world-space XZ point, or null outside the field. Used for placement. */
export function terrainHeightAt(
  terrain: ResolvedAgentWorldTerrain,
  x: number,
  z: number,
): number | null {
  const half = terrain.size / 2;
  if (x < -half || x > half || z < -half || z > half) return null;
  const field = sourceField(terrain);
  const u = (x + half) / terrain.size;
  const v = (z + half) / terrain.size;
  let height = bilinear(field, u, v) * terrain.heightScale + terrain.heightOffset;
  if (terrain.flattenRadius > 0) {
    // Same discretised pad edge the mesh and collider use, so a placement query agrees with
    // what a body will actually rest on across the whole disc.
    const flattenEdge = flattenInnerEdge(terrain);
    const blend = smoothstep(flattenEdge, flattenEdge + terrain.flattenFalloff, Math.hypot(x, z));
    height = terrain.flattenHeight + (height - terrain.flattenHeight) * blend;
  }
  return height;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp((value - edge0) / (edge1 - edge0 || 1), 0, 1);
  return t * t * (3 - 2 * t);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, Number.isFinite(value) ? value : minimum));
}
