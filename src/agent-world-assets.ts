import {
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshPhongMaterial,
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
};

/** Broad grouping so an agent can ask for "a tree" without knowing archive file names. */
export type AgentWorldAssetCategory = "vegetation" | "port" | "camp" | "character" | "prop";

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

export type ResolvedAgentWorldModelAsset = Required<Pick<AgentWorldModelAsset, "format" | "fitSize">> & {
  id: string | null;
  url: string;
};

export function resolveAgentWorldModelAsset(source?: AgentWorldModelAsset): ResolvedAgentWorldModelAsset {
  if (!source || (!source.id?.trim() && !source.url?.trim())) {
    throw new Error("A model entity requires asset.id or asset.url");
  }
  const id = source.id?.trim() || null;
  const catalogAsset = id ? GRAPHYSX_AGENT_WORLD_ASSETS.find((candidate) => candidate.id === id) : null;
  if (id && !catalogAsset && !source.url?.trim()) throw new Error(`Unknown model asset: ${id}`);
  const format = source.format ?? catalogAsset?.format ?? "graphysx-mesh-json";
  if (format !== "graphysx-mesh-json") throw new Error(`Unsupported model format: ${String(format)}`);
  const url = source.url?.trim() || catalogAsset?.url || "";
  if (!url) throw new Error("A model entity requires a loadable asset URL");
  const fitSize = source.fitSize ?? 4;
  if (!Number.isFinite(fitSize) || fitSize <= 0 || fitSize > 1000) throw new Error("asset.fitSize must be between 0 and 1000");
  return { id, url, format, fitSize };
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
    const texture = await textureLoader.loadAsync(url);
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
      const material = new MeshPhongMaterial({
        name: sourceMaterial.name ?? "GraphysX recovered material",
        color: textureUrl ? 0xffffff : tupleColor(sourceMaterial.color, 0xb8c1c9),
        specular: tupleColor(sourceMaterial.specular, 0x111111),
        emissive: tupleColor(sourceMaterial.emissive, 0x000000),
        shininess: Math.max(0, Math.min(100, sourceMaterial.specularPower ?? 18)),
        side: DoubleSide,
        map: textureUrl ? textures.get(textureUrl) ?? null : null
      });
      return material;
    });
    const mesh = new Mesh(geometry, materials.length === 1 ? materials[0] : materials);
    mesh.name = sourceMesh.name ?? "GraphysX model mesh";
    sourceRoot.add(mesh);
  }

  const bounds = payload.bounds;
  if (bounds) {
    const center = bounds.min.map((value, axis) => (value + bounds.max[axis]) / 2) as Tuple3;
    const maximumSpan = Math.max(...bounds.size, 0.0001);
    sourceRoot.position.set(-center[0], -center[1], -center[2]);
    const scale = asset.fitSize / maximumSpan;
    sourceRoot.scale.set(scale, scale, -scale);
  }
  target.add(sourceRoot);
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
