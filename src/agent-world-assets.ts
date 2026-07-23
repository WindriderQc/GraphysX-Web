import {
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshPhysicalMaterial,
  MeshPhongMaterial,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  Texture,
  TextureLoader
} from "three";

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

type RecoveredPbrProfile = {
  shading: "standard" | "physical";
  roughness: number;
  metalness: number;
  clearcoat?: number;
  clearcoatRoughness?: number;
};

/**
 * Focused presentation profiles for the recovered meshes visitors meet first. These do not
 * rewrite archive payloads or pretend inferred surfaces were recovered; they adapt the old
 * Phong power into intentional PBR finishes while preserving every source colour, texture,
 * group, and geometry byte. Unlisted assets retain their exact legacy Phong path.
 */
function recoveredPbrProfile(assetId: string | null, materialName: string): RecoveredPbrProfile | null {
  if (assetId === "archive-impreza") {
    if (/CHASIS\.JPG/i.test(materialName)) return { shading: "physical", roughness: 0.28, metalness: 0.12, clearcoat: 0.85, clearcoatRoughness: 0.18 };
    if (/VENTANAS/i.test(materialName)) return { shading: "physical", roughness: 0.16, metalness: 0.04, clearcoat: 0.72, clearcoatRoughness: 0.12 };
    if (/UNDERCARRIAGE|CHASIS_A/i.test(materialName)) return { shading: "standard", roughness: 0.78, metalness: 0.02 };
    return { shading: "standard", roughness: 0.72, metalness: 0.04 };
  }
  if (assetId === "archive-cobra") {
    return /tire/i.test(materialName)
      ? { shading: "standard", roughness: 0.9, metalness: 0 }
      : { shading: "physical", roughness: 0.22, metalness: 0.16, clearcoat: 1, clearcoatRoughness: 0.12 };
  }
  if (assetId === "archive-piste-ovale") return { shading: "standard", roughness: 0.8, metalness: 0.02 };
  if (assetId === "archive-slide-large") return { shading: "physical", roughness: 0.36, metalness: 0.08, clearcoat: 0.35, clearcoatRoughness: 0.3 };
  if (assetId === "archive-map1") return { shading: "standard", roughness: 0.82, metalness: 0 };
  return null;
}

export type AgentWorldModelCollisionMesh = {
  /** Flat xyz triples after the asset's fit/recentre/handedness transform. */
  vertices: number[];
  /** Triangle indices into `vertices`. Meshes in one payload are merged with offsets. */
  indices: number[];
  vertexCount: number;
  triangleCount: number;
};

export type ResolvedAgentWorldModelAsset = Required<
  Pick<AgentWorldModelAsset, "format" | "fitSize" | "alphaTest" | "colorKeyTolerance">
> & {
  id: string | null;
  url: string;
  colorKey: string | null;
};

export type AgentWorldModelCollisionRequest = {
  maxVertices: number;
  maxTriangles: number;
  /** Runs as soon as geometry JSON is validated, before presentation textures are fetched. */
  onReady(mesh: AgentWorldModelCollisionMesh): void;
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
  // 10000, not the original 1000: the cap predates any asset that large, and it was the
  // third hidden pin on mega-worlds after the fixed far plane (fixed by
  // `environment.envelope`, ceiling 100000) and mesh collision (fixed by scene-native
  // trimesh colliders). Level1 2011 ships its recovered mesh at a native 1135.4 — the first
  // asset to hit this line — and shrinking the largest recovered world to fit a stale
  // validator would invert what those two capabilities were built for.
  if (!Number.isFinite(fitSize) || fitSize <= 0 || fitSize > 10000) throw new Error("asset.fitSize must be between 0 and 10000");
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

export async function loadAgentWorldModel(
  target: Group,
  asset: ResolvedAgentWorldModelAsset,
  collision?: AgentWorldModelCollisionRequest,
): Promise<void> {
  const response = await fetch(asset.url);
  if (!response.ok) throw new Error(`Model request failed (${response.status}): ${asset.url}`);
  const payload = await response.json() as AssetPayload;
  validatePayload(payload, collision);
  const fit = modelFit(payload.bounds, asset.fitSize);
  if (target.userData.graphysxDisposed) return;
  // Physics must not wait on presentation assets. A missing/slow texture can make the model
  // ugly, but it must never leave an already-validated static collision surface absent while
  // the rest of the world is stepping.
  if (collision) collision.onReady(collisionMeshFromPayload(payload, fit.scale, fit.offset, fit.mirrorZ));

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
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    const materials = (sourceMesh.materials?.length ? sourceMesh.materials : [{}]).map((sourceMaterial) => {
      const textureUrl = sourceMaterial.textureUrl ?? null;
      const name = sourceMaterial.name ?? "GraphysX recovered material";
      const common = {
        name,
        color: textureUrl ? 0xffffff : tupleColor(sourceMaterial.color, 0xb8c1c9),
        emissive: tupleColor(sourceMaterial.emissive, 0x000000),
        side: DoubleSide,
        map: textureUrl ? textures.get(textureUrl) ?? null : null,
        // `transparent` stays false on purpose: an alpha-tested cutout is opaque as far as
        // sorting and depth are concerned, which is what keeps overlapping leaf quads from
        // flickering against each other.
        alphaTest: asset.alphaTest,
      };
      const profile = recoveredPbrProfile(asset.id, name);
      const material = profile?.shading === "physical"
        ? new MeshPhysicalMaterial({
            ...common,
            roughness: profile.roughness,
            metalness: profile.metalness,
            clearcoat: profile.clearcoat ?? 0,
            clearcoatRoughness: profile.clearcoatRoughness ?? 0,
          })
        : profile?.shading === "standard"
          ? new MeshStandardMaterial({ ...common, roughness: profile.roughness, metalness: profile.metalness })
          : new MeshPhongMaterial({
              ...common,
              specular: tupleColor(sourceMaterial.specular, 0x111111),
              shininess: Math.max(0, Math.min(100, sourceMaterial.specularPower ?? 18)),
            });
      if (profile) {
        material.userData.graphysxRecoveredPbr = true;
        material.userData.graphysxRecoveredProfile = { assetId: asset.id, ...profile };
      }
      return material;
    });
    const mesh = new Mesh(geometry, materials.length === 1 ? materials[0] : materials);
    mesh.name = sourceMesh.name ?? "GraphysX model mesh";
    // Source-owned material slots must not inherit the model entity's generic default teal.
    // The inspector presents these as source materials until slot-aware overrides exist.
    mesh.userData.graphysxMaterialLocked = materials.some((material) => material.userData.graphysxRecoveredPbr === true);
    sourceRoot.add(mesh);
  }

  if (payload.bounds) {
    sourceRoot.scale.set(fit.scale, fit.scale, -fit.scale);
    // Three composes an object's matrix T·R·S — position is applied after, and is NOT
    // scaled. Setting position = -center alongside a scale therefore recentred by the
    // UNSCALED offset, so any model whose fitSize differed from its native span landed
    // off its anchor (and the Z flip mirrored that error's sign). The offset has to go
    // through the same factors the vertices do: world = S·v + p, and p = -S·center puts
    // the bounds centre exactly on the group origin at every fitSize.
    sourceRoot.position.set(...fit.offset);
  }
  target.add(sourceRoot);
}

/** Fetch only validated collision geometry for an already-rendered `auto` model promoted later. */
export async function loadAgentWorldCollisionMesh(
  asset: ResolvedAgentWorldModelAsset,
  limits: Pick<AgentWorldModelCollisionRequest, "maxVertices" | "maxTriangles">,
): Promise<AgentWorldModelCollisionMesh> {
  const response = await fetch(asset.url);
  if (!response.ok) throw new Error(`Model request failed (${response.status}): ${asset.url}`);
  const payload = await response.json() as AssetPayload;
  validatePayload(payload, limits);
  const fit = modelFit(payload.bounds, asset.fitSize);
  return collisionMeshFromPayload(payload, fit.scale, fit.offset, fit.mirrorZ);
}

function validatePayload(payload: AssetPayload, collision?: Pick<AgentWorldModelCollisionRequest, "maxVertices" | "maxTriangles">): void {
  if (!payload || !Array.isArray(payload.meshes) || payload.meshes.length === 0) throw new Error("Model payload contains no meshes");
  if (payload.meshes.length > 256) throw new Error("Model payload exceeds the 256-mesh limit");
  let totalVertices = 0;
  let totalTriangles = 0;
  for (const mesh of payload.meshes) {
    if (!Array.isArray(mesh.positions) || mesh.positions.length < 9 || mesh.positions.length % 3 !== 0) throw new Error("Model mesh has invalid positions");
    if (!Array.isArray(mesh.indices) || mesh.indices.length < 3 || mesh.indices.length % 3 !== 0) throw new Error("Model mesh has invalid indices");
    const vertexCount = mesh.positions.length / 3;
    for (let index = 0; index < mesh.positions.length; index += 1) {
      if (!Number.isFinite(mesh.positions[index])) throw new Error(`Model mesh position ${index} is not finite`);
    }
    for (let index = 0; index < mesh.indices.length; index += 1) {
      const value = mesh.indices[index];
      if (!Number.isInteger(value) || value < 0 || value >= vertexCount) {
        throw new Error(`Model mesh index ${index} (${String(value)}) is outside 0..${vertexCount - 1}`);
      }
    }
    totalVertices += vertexCount;
    totalTriangles += mesh.indices.length / 3;
    if (collision && (totalVertices > collision.maxVertices || totalTriangles > collision.maxTriangles)) {
      throw new Error(
        `Model colliders support at most ${collision.maxVertices} vertices and ${collision.maxTriangles} triangles; ` +
        `this asset has at least ${totalVertices} vertices and ${totalTriangles} triangles`,
      );
    }
  }
}

function modelFit(bounds: AssetPayload["bounds"], fitSize: number): { scale: number; offset: Tuple3; mirrorZ: boolean } {
  if (!bounds) return { scale: 1, offset: [0, 0, 0], mirrorZ: false };
  const center = bounds.min.map((value, axis) => (value + bounds.max[axis]) / 2) as Tuple3;
  const scale = fitSize / Math.max(...bounds.size, 0.0001);
  return {
    scale,
    offset: [-center[0] * scale, -center[1] * scale, center[2] * scale],
    mirrorZ: true,
  };
}

function collisionMeshFromPayload(
  payload: AssetPayload,
  scale: number,
  offset: Tuple3,
  mirrorZ: boolean,
): AgentWorldModelCollisionMesh {
  const vertices: number[] = [];
  const indices: number[] = [];
  let vertexOffset = 0;
  for (const mesh of payload.meshes) {
    for (let index = 0; index < mesh.positions.length; index += 3) {
      vertices.push(
        mesh.positions[index] * scale + offset[0],
        mesh.positions[index + 1] * scale + offset[1],
        mesh.positions[index + 2] * (mirrorZ ? -scale : scale) + offset[2],
      );
    }
    for (let index = 0; index < mesh.indices.length; index += 3) {
      const first = mesh.indices[index] + vertexOffset;
      const second = mesh.indices[index + 1] + vertexOffset;
      const third = mesh.indices[index + 2] + vertexOffset;
      // The asset loader's Z mirror has a negative determinant. Reverse winding so the
      // authored front face remains the collider's front face after handedness conversion.
      indices.push(first, mirrorZ ? third : second, mirrorZ ? second : third);
    }
    vertexOffset += mesh.positions.length / 3;
  }
  return {
    vertices,
    indices,
    vertexCount: vertices.length / 3,
    triangleCount: indices.length / 3,
  };
}

function tupleColor(value: Tuple3 | [number, number, number, number] | undefined, fallback: number): Color {
  return value ? new Color(value[0], value[1], value[2]) : new Color(fallback);
}
