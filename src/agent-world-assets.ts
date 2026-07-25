import {
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  FrontSide,
  Group,
  Mesh,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  Texture,
  TextureLoader
} from "three";
import { toCreasedNormals } from "three/examples/jsm/utils/BufferGeometryUtils.js";

export type AgentWorldModelFormat = "graphysx-mesh-json";

export type AgentWorldModelAsset = {
  id?: string;
  url?: string;
  format?: AgentWorldModelFormat;
  /** Uniformly fits the recovered source model inside this many world units. */
  fitSize?: number;
  /**
   * Cutout transparency: discard texels below this alpha, 0..1. Omitted (or 0) leaves the
   * material fully opaque, which is right for everything solid.
   */
  alphaTest?: number;
  /**
   * Colour key, as `#rrggbb`. Texels matching it become transparent.
   *
   * The archive's textures predate alpha channels: foliage is flat quads painted with a
   * key colour — magenta, conventionally — that the original engine punched out at load.
   * The recovered PNGs carry that key as ordinary opaque pixels, so without this a tree
   * renders as a magenta slab. Keying is done once at load, and pairs with `alphaTest`.
   */
  colorKey?: string;
  /** How far a texel may drift from `colorKey` and still be keyed out, 0..1. */
  colorKeyTolerance?: number;
};

/** Broad grouping so an agent can ask for "a tree" without knowing archive file names. */
export type AgentWorldAssetCategory = "vegetation" | "port" | "camp" | "character" | "prop" | "vehicle" | "imported";

export type AgentWorldAssetDescriptor = {
  id: string;
  label: string;
  category: AgentWorldAssetCategory;
  format: AgentWorldModelFormat;
  url: string;
  source: string;
};

/**
 * Generated from the meshes on disk by scripts/build-asset-catalog.mjs. It was five
 * hand-written entries while 63 converted meshes sat unreferenced in public/assets — an
 * asset an agent cannot discover may as well not exist.
 */
import { GRAPHYSX_AGENT_WORLD_ASSET_CATALOG } from "./agent-world-asset-catalog";

export const GRAPHYSX_AGENT_WORLD_ASSETS = GRAPHYSX_AGENT_WORLD_ASSET_CATALOG;

/**
 * Models registered at runtime by the media library (agent-world-media.ts) — meshes
 * converted in the browser and stored on a local asset store. Separate from the
 * generated catalog so the release manifest, which scrapes the catalog file, never
 * claims a file that only a store can serve.
 */
const DYNAMIC_ASSETS: AgentWorldAssetDescriptor[] = [];

/** Replace the imported set (idempotent — a manifest refresh re-registers everything). */
export function registerAgentWorldAssets(descriptors: readonly AgentWorldAssetDescriptor[]): void {
  const catalog = new Set<string>(GRAPHYSX_AGENT_WORLD_ASSETS.map((asset) => asset.id));
  DYNAMIC_ASSETS.length = 0;
  for (const descriptor of descriptors) {
    if (catalog.has(descriptor.id)) continue; // a vendored id always wins
    DYNAMIC_ASSETS.push(descriptor);
  }
}

/** Everything spawnable right now: the vendored catalog plus any store-backed imports. */
export function allAgentWorldAssets(): readonly AgentWorldAssetDescriptor[] {
  return DYNAMIC_ASSETS.length ? [...GRAPHYSX_AGENT_WORLD_ASSETS, ...DYNAMIC_ASSETS] : GRAPHYSX_AGENT_WORLD_ASSETS;
}

type Tuple3 = [number, number, number];
type PayloadMaterial = {
  name?: string;
  color?: [number, number, number, number];
  specularPower?: number;
  specular?: Tuple3;
  emissive?: Tuple3;
  textureUrl?: string | null;
};
type PayloadMesh = {
  name?: string;
  positions: number[];
  uvs?: number[] | null;
  indices: number[];
  groups?: Array<{ start: number; count: number; materialIndex: number }>;
  materials?: PayloadMaterial[];
};
type AssetPayload = {
  bounds?: { min: Tuple3; max: Tuple3; size: Tuple3 };
  meshes: PayloadMesh[];
};

export type ResolvedAgentWorldModelAsset = Required<
  Pick<AgentWorldModelAsset, "format" | "fitSize" | "alphaTest" | "colorKeyTolerance">
> & {
  id: string | null;
  url: string;
  colorKey: string | null;
};

/**
 * Punches a key colour out of a texture, the way the engine these assets were authored for
 * did it at load time.
 *
 * The hex is parsed by hand rather than through `Color`, which would apply an sRGB→linear
 * conversion and then compare against raw bytes that never had one — the key would miss.
 * Distance is euclidean across RGB so a texture that was resaved through a lossy codec, and
 * whose key colour therefore drifted a little, still keys out cleanly.
 */
async function loadColorKeyedTexture(url: string, colorKey: string, tolerance: number): Promise<Texture> {
  const image = await new Promise<HTMLImageElement>((resolveImage, rejectImage) => {
    const element = new Image();
    element.onload = () => resolveImage(element);
    element.onerror = () => rejectImage(new Error(`Texture request failed: ${url}`));
    element.src = url;
  });

  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("A 2D canvas context is required to apply a colour key");
  context.drawImage(image, 0, 0);

  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  const keyRed = Number.parseInt(colorKey.slice(1, 3), 16);
  const keyGreen = Number.parseInt(colorKey.slice(3, 5), 16);
  const keyBlue = Number.parseInt(colorKey.slice(5, 7), 16);
  const limit = tolerance * 255 * Math.SQRT2 * Math.SQRT2; // 0..1 → 0..510, a usable span

  for (let index = 0; index < pixels.data.length; index += 4) {
    const red = pixels.data[index] - keyRed;
    const green = pixels.data[index + 1] - keyGreen;
    const blue = pixels.data[index + 2] - keyBlue;
    if (Math.sqrt(red * red + green * green + blue * blue) <= limit) {
      pixels.data[index + 3] = 0;
      // Zero the colour too. A transparent-but-magenta texel still bleeds its hue into
      // neighbours under bilinear filtering and mipmapping, which reads as a magenta halo
      // around every leaf.
      pixels.data[index] = 0;
      pixels.data[index + 1] = 0;
      pixels.data[index + 2] = 0;
    }
  }
  context.putImageData(pixels, 0, 0);

  const texture = new CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

export function resolveAgentWorldModelAsset(source?: AgentWorldModelAsset): ResolvedAgentWorldModelAsset {
  if (!source || (!source.id?.trim() && !source.url?.trim())) {
    throw new Error("A model entity requires asset.id or asset.url");
  }
  const id = source.id?.trim() || null;
  const catalogAsset = id ? allAgentWorldAssets().find((candidate) => candidate.id === id) : null;
  if (id && !catalogAsset && !source.url?.trim()) throw new Error(`Unknown model asset: ${id}`);
  const format = source.format ?? catalogAsset?.format ?? "graphysx-mesh-json";
  if (format !== "graphysx-mesh-json") throw new Error(`Unsupported model format: ${String(format)}`);
  const url = source.url?.trim() || catalogAsset?.url || "";
  if (!url) throw new Error("A model entity requires a loadable asset URL");
  const fitSize = source.fitSize ?? 4;
  if (!Number.isFinite(fitSize) || fitSize <= 0 || fitSize > 1000) throw new Error("asset.fitSize must be between 0 and 1000");
  const alphaTest = source.alphaTest ?? 0;
  if (!Number.isFinite(alphaTest) || alphaTest < 0 || alphaTest > 1) throw new Error("asset.alphaTest must be between 0 and 1");
  const colorKey = source.colorKey?.trim() || null;
  if (colorKey && !/^#[0-9a-fA-F]{6}$/.test(colorKey)) throw new Error(`asset.colorKey must be #rrggbb: ${colorKey}`);
  const colorKeyTolerance = source.colorKeyTolerance ?? 0.15;
  if (!Number.isFinite(colorKeyTolerance) || colorKeyTolerance < 0 || colorKeyTolerance > 1) {
    throw new Error("asset.colorKeyTolerance must be between 0 and 1");
  }
  return { id, url, format, fitSize, alphaTest, colorKey, colorKeyTolerance };
}

export async function loadAgentWorldModel(target: Group, asset: ResolvedAgentWorldModelAsset): Promise<void> {
  const response = await fetch(asset.url);
  if (!response.ok) throw new Error(`Model request failed (${response.status}): ${asset.url}`);
  const payload = await response.json() as AssetPayload;
  validatePayload(payload);

  const textureLoader = new TextureLoader();
  const textureUrls = [...new Set(payload.meshes.flatMap((mesh) => (mesh.materials ?? [])
    .map((material) => material.textureUrl)
    .filter((url): url is string => Boolean(url))))];
  const textures = new Map<string, Texture>();
  await Promise.all(textureUrls.map(async (url) => {
    const texture = asset.colorKey
      ? await loadColorKeyedTexture(url, asset.colorKey, asset.colorKeyTolerance)
      : await textureLoader.loadAsync(url);
    texture.colorSpace = SRGBColorSpace;
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
    textures.set(url, texture);
  }));
  if (target.userData.graphysxDisposed) {
    textures.forEach((texture) => texture.dispose());
    return;
  }

  const sourceRoot = new Group();
  sourceRoot.name = `${asset.id ?? asset.url} source model`;
  for (const sourceMesh of payload.meshes) {
    const geometry = new BufferGeometry();
    geometry.name = sourceMesh.name ?? "GraphysX recovered mesh";
    geometry.setAttribute("position", new Float32BufferAttribute(sourceMesh.positions, 3));
    if (sourceMesh.uvs?.length) geometry.setAttribute("uv", new Float32BufferAttribute(sourceMesh.uvs, 2));
    geometry.setIndex(sourceMesh.indices);
    for (const group of sourceMesh.groups ?? []) geometry.addGroup(group.start, group.count, group.materialIndex);
    // Recovered .3ds meshes carry no smoothing groups, so a flat vertex-normal average
    // melted hard body panels into one soft blob. Creased normals keep the mesh sharp where
    // adjacent faces meet at more than the threshold (car doors, wheel arches) while still
    // smoothing curved surfaces.
    const shaded = smoothGeometry(geometry, 50);
    shaded.computeBoundingBox();
    shaded.computeBoundingSphere();
    const materials = (sourceMesh.materials?.length ? sourceMesh.materials : [{}]).map((sourceMaterial) => {
      const textureUrl = sourceMaterial.textureUrl ?? null;
      const name = (sourceMaterial.name ?? "").toLowerCase();
      // Glass slots (recovered as an opaque window photo pasted on the body) read as solid
      // plastic. Detect them by material/texture name and let light through.
      const isGlass = /glass|window|windshield|windscreen|screen|vitre/.test(name)
        || /window|glass/i.test(textureUrl ?? "");
      // .3ds gives Phong specularPower; map it to a PBR roughness so the paint catches the
      // scene's RoomEnvironment IBL like every other (MeshStandard) surface in the platform.
      // Before this, models were MeshPhong and received *no* environment light at all, so
      // cars read dark, flat and plastic against a PBR room. High shininess -> smoother.
      const shininess = Math.max(0, Math.min(100, sourceMaterial.specularPower ?? 18));
      const specular = tupleColor(sourceMaterial.specular, 0x111111);
      const specularLuma = (specular.r + specular.g + specular.b) / 3;
      const material = new MeshStandardMaterial({
        name: sourceMaterial.name ?? "GraphysX recovered material",
        color: textureUrl ? 0xffffff : tupleColor(sourceMaterial.color, 0xb8c1c9),
        emissive: tupleColor(sourceMaterial.emissive, 0x000000),
        roughness: isGlass ? 0.08 : Math.max(0.16, Math.min(0.92, 1 - shininess / 120)),
        // Painted bodywork is a dielectric; only a genuinely bright specular slot reads as
        // metal (chrome/trim). Keeps the paint from going mirror-black under IBL.
        metalness: isGlass ? 0.0 : (specularLuma > 0.35 ? 0.6 : 0.05),
        map: textureUrl ? textures.get(textureUrl) ?? null : null,
        // Interiors show through DoubleSide on thin coincident glass; glass renders front-only
        // to avoid z-fighting against the body panel behind it. Solid bodywork keeps DoubleSide
        // because the recovered -Z mirror flips winding.
        side: isGlass ? FrontSide : DoubleSide,
        transparent: isGlass,
        opacity: isGlass ? 0.34 : 1,
        depthWrite: !isGlass,
        alphaTest: asset.alphaTest
      });
      return material;
    });
    const mesh = new Mesh(shaded, materials.length === 1 ? materials[0] : materials);
    mesh.name = sourceMesh.name ?? "GraphysX model mesh";
    sourceRoot.add(mesh);
  }

  const bounds = payload.bounds;
  if (bounds) {
    const center = bounds.min.map((value, axis) => (value + bounds.max[axis]) / 2) as Tuple3;
    const maximumSpan = Math.max(...bounds.size, 0.0001);
    const scale = asset.fitSize / maximumSpan;
    sourceRoot.scale.set(scale, scale, -scale);
    // Three composes an object's matrix T·R·S — position is applied after, and is NOT
    // scaled. Setting position = -center alongside a scale therefore recentred by the
    // UNSCALED offset, so any model whose fitSize differed from its native span landed
    // off its anchor (and the Z flip mirrored that error's sign). The offset has to go
    // through the same factors the vertices do: world = S·v + p, and p = -S·center puts
    // the bounds centre exactly on the group origin at every fitSize.
    sourceRoot.position.set(-center[0] * scale, -center[1] * scale, center[2] * scale);
  }
  target.add(sourceRoot);
}

/**
 * Recovered .3ds geometry has no smoothing groups. A plain `computeVertexNormals` averages
 * across every shared vertex, melting hard car panels into a blob; flat shading facets curved
 * surfaces. `toCreasedNormals` returns a non-indexed geometry whose vertices are smoothed only
 * where adjacent faces meet under the threshold, preserving real creases. On any failure we
 * fall back to averaged normals on the original geometry.
 */
function smoothGeometry(geometry: BufferGeometry, creaseAngleDegrees: number): BufferGeometry {
  try {
    const creased = toCreasedNormals(geometry, (creaseAngleDegrees * Math.PI) / 180);
    if (creased.getAttribute("normal")) return creased;
  } catch {
    // fall through
  }
  geometry.computeVertexNormals();
  return geometry;
}

function validatePayload(payload: AssetPayload): void {
  if (!payload || !Array.isArray(payload.meshes) || payload.meshes.length === 0) throw new Error("Model payload contains no meshes");
  if (payload.meshes.length > 256) throw new Error("Model payload exceeds the 256-mesh limit");
  for (const mesh of payload.meshes) {
    if (!Array.isArray(mesh.positions) || mesh.positions.length < 9 || mesh.positions.length % 3 !== 0) throw new Error("Model mesh has invalid positions");
    if (!Array.isArray(mesh.indices) || mesh.indices.length < 3 || mesh.indices.length % 3 !== 0) throw new Error("Model mesh has invalid indices");
  }
}

function tupleColor(value: Tuple3 | [number, number, number, number] | undefined, fallback: number): Color {
  return value ? new Color(value[0], value[1], value[2]) : new Color(fallback);
}
