// The media library: the browser side of the asset store (server/asset-store.mjs).
//
// This is the runtime import path the library never had. The curated registries are
// build-time arrays — right for the recovered archive, useless for "I have 251 MB of
// media on E:\ and want this grass in my scene now". This module talks to the asset
// store, keeps a mirror of its manifest, and registers every imported texture/model
// into the SAME registries the curated assets live in, so an import is immediately:
//
//   - listed by `api.textures()` / `api.assets()` (agents discover it),
//   - resolvable by `texture: { id }` / `asset: { id }` (scenes can persist it),
//   - present in the editor library (humans can click it).
//
// Foreign model formats (OBJ/GLTF/GLB/FBX/STL/3DS) are converted HERE, in the browser,
// with three's own battle-tested loaders, then uploaded as `graphysx-mesh-json` — the
// runtime keeps exactly one model format, and the server stays a dependency-free file
// store that never parses geometry. TVM/.x stay offline-decode (see src/legacy/*).
//
// Everything is store-backed: no store, no imports — the same honest gating the scene
// browser uses. Production static deploys are untouched.

import type { AgentWorldResult } from "./agent-world-runtime";
import {
  registerAgentWorldAssets,
  type AgentWorldAssetDescriptor,
} from "./agent-world-assets";
import {
  registerAgentWorldSounds,
  type AgentWorldSoundDescriptor,
} from "./agent-world-sounds";
import {
  registerAgentWorldTextures,
  type AgentWorldTextureDescriptor,
} from "./agent-world-textures";

export const GRAPHYSX_AGENT_MEDIA_SCHEMA = "graphysx.agent-media/v1";

export type AgentWorldMediaKind = "texture" | "model" | "sound" | "file";

/** One imported asset, as the store records it (url resolved to an absolute URL). */
export type AgentWorldMediaDescriptor = {
  id: string;
  kind: AgentWorldMediaKind;
  label: string;
  category: string;
  format?: "graphysx-mesh-json";
  url: string;
  file: string;
  source: string;
  bytes: number;
  addedAt: string;
  meta?: Record<string, unknown>;
};

export type AgentMediaFolderEntry = { name: string; path: string };
export type AgentMediaFileEntry = {
  name: string;
  path: string;
  bytes: number;
  extension: string;
  kind: AgentWorldMediaKind;
  /** True when the browser can turn this into a spawnable mesh on import. */
  convertible: boolean;
  /** True when importing it will actually be usable in a scene (not just stored). */
  usable: boolean;
};
export type AgentMediaListing = {
  root: string;
  path: string;
  folders: AgentMediaFolderEntry[];
  files: AgentMediaFileEntry[];
};

export type AgentMediaStatus = {
  online: boolean;
  storeUrl: string | null;
  datalake: string | null;
  count: number;
};

export type AgentMediaImportOptions = {
  id?: string;
  label?: string;
  category?: string;
  /** Textures only: the tiling the library should suggest, default [1, 1]. */
  defaultRepeat?: [number, number];
};

export type AgentMediaRegisterOptions = AgentMediaImportOptions & {
  fileName: string;
  kind: AgentWorldMediaKind;
  source?: string;
  data: Blob | ArrayBuffer | string;
};

/** The `api.media` sub-API — the one asset surface shared by humans and agents. */
export type GraphysXAgentMediaApi = {
  readonly schema: typeof GRAPHYSX_AGENT_MEDIA_SCHEMA;
  /** Where the library stands right now; `online:false` means built-ins only. */
  status(): AgentMediaStatus;
  /** The imported assets known locally (call `refresh()` to re-pull the manifest). */
  list(kind?: AgentWorldMediaKind): readonly AgentWorldMediaDescriptor[];
  /** Re-pull the store manifest and re-register every import. Resolves to the count. */
  refresh(): Promise<AgentWorldResult<number>>;
  /** One directory level of the configured datalake (E:\Media\Datalake by default). */
  browse(path?: string): Promise<AgentWorldResult<AgentMediaListing>>;
  /**
   * Import one datalake file into the library. Textures/sounds are copied server-side;
   * convertible model formats are fetched, converted to `graphysx-mesh-json` in the
   * browser, and uploaded. Resolves to the registered descriptor.
   */
  import(path: string, options?: AgentMediaImportOptions): Promise<AgentWorldResult<AgentWorldMediaDescriptor>>;
  /** Store raw data (drag-dropped file, generated payload) as a library asset. */
  register(options: AgentMediaRegisterOptions): Promise<AgentWorldResult<AgentWorldMediaDescriptor>>;
  /** Remove an imported asset from the store and the registries. */
  remove(id: string): Promise<AgentWorldResult<string>>;
  /**
   * Decode an imported image into a normalized heights grid for `terrain.heights`.
   *
   * The bridge between "I imported a heightmap JPG" and a landform: the runtime already
   * accepts an inline `heights` array (up to 513²) on terrain entities, so no registry is
   * involved — the caller passes the result straight to `spawn`. Luminance is stretched
   * min→0, max→1 because archive heightmaps rarely span the full byte range and a 0.3–0.6
   * band otherwise yields a nearly flat field at any heightScale.
   */
  terrainHeights(id: string, samples?: number): Promise<AgentWorldResult<{ samples: number; heights: number[] }>>;
};

/** Model formats convertible in-browser. `.tvm`/`.x` need the offline workshop tooling. */
export const CONVERTIBLE_MODEL_EXTENSIONS = new Set([".obj", ".gltf", ".glb", ".fbx", ".stl", ".3ds"]);
/** Image formats the runtime's TextureLoader can actually decode (DDS needs converting). */
const LOADABLE_TEXTURE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp"]);

const DEFAULT_STORE_URL = "http://localhost:8788";

type MediaState = {
  baseUrl: string;
  online: boolean;
  datalake: string | null;
  records: AgentWorldMediaDescriptor[];
};

/**
 * `?store=` is honoured at module load, not only via {@link configureAgentWorldMedia}:
 * main.ts configures inside an async store-probe, and an agent (or a smoke) calling
 * `api.media.refresh()` right after boot would race it and talk to the default port —
 * which on a dev box can be a DIFFERENT, live store. The URL param is synchronous truth.
 */
const initialStoreParam = typeof window !== "undefined"
  ? new URLSearchParams(window.location.search).get("store")
  : null;

const state: MediaState = {
  baseUrl: (initialStoreParam ?? DEFAULT_STORE_URL).replace(/\/+$/, ""),
  online: false,
  datalake: null,
  records: [],
};

/** Point the media library at a specific store (the `?store=` override). */
export function configureAgentWorldMedia(storeUrl: string): void {
  state.baseUrl = storeUrl.replace(/\/+$/, "");
}

async function storeFetch<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${state.baseUrl}${path}`, { cache: "no-store", ...init });
  } catch (error) {
    state.online = false;
    throw new Error(`Asset store unreachable at ${state.baseUrl}: ${error instanceof Error ? error.message : String(error)}`);
  }
  const payload = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok) throw new Error(payload?.error ?? `Asset store responded ${response.status}`);
  state.online = true;
  return payload as T;
}

function absoluteUrl(relative: string): string {
  return new URL(relative, `${state.baseUrl}/`).toString();
}

function extensionOf(fileName: string): string {
  const match = /\.[^.]+$/.exec(fileName.toLowerCase());
  return match ? match[0] : "";
}

/**
 * Mirror the manifest into the live registries. Imported ids join the same lookup the
 * curated vocabulary uses, which is the whole point: `texture: { id: "grass" }` in a
 * scene document works exactly like `texture: { id: "checker" }`.
 */
function registerRecords(records: AgentWorldMediaDescriptor[]): void {
  state.records = records;

  const textures: AgentWorldTextureDescriptor[] = [];
  const models: AgentWorldAssetDescriptor[] = [];
  const sounds: AgentWorldSoundDescriptor[] = [];
  for (const record of records) {
    if (record.kind === "sound") {
      sounds.push({
        id: record.id,
        label: record.label,
        url: record.url,
        category: "imported",
        description: typeof record.meta?.description === "string" ? record.meta.description : `Imported from ${record.source}.`,
        source: record.source,
      });
    }
    if (record.kind === "texture" && LOADABLE_TEXTURE_EXTENSIONS.has(extensionOf(record.file))) {
      const repeat = Array.isArray(record.meta?.defaultRepeat) ? record.meta.defaultRepeat as [number, number] : [1, 1] as [number, number];
      textures.push({
        id: record.id,
        label: record.label,
        url: record.url,
        category: "imported",
        description: typeof record.meta?.description === "string" ? record.meta.description : `Imported from ${record.source}.`,
        defaultRepeat: repeat,
        source: record.source,
      });
    }
    if (record.kind === "model" && record.format === "graphysx-mesh-json") {
      models.push({
        id: record.id,
        label: record.label,
        category: "imported",
        format: "graphysx-mesh-json",
        url: record.url,
        source: record.source,
      });
    }
  }
  registerAgentWorldTextures(textures);
  registerAgentWorldAssets(models);
  registerAgentWorldSounds(sounds);
}

function ok<T>(value: T): AgentWorldResult<T> {
  return { ok: true, revision: 0, value };
}

function fail<T>(error: unknown): AgentWorldResult<T> {
  return { ok: false, revision: 0, error: error instanceof Error ? error.message : String(error) };
}

async function refresh(): Promise<AgentWorldResult<number>> {
  try {
    const payload = await storeFetch<{ datalake: string | null; assets: AgentWorldMediaDescriptor[] }>("/assets");
    state.datalake = payload.datalake ?? null;
    const records = (payload.assets ?? []).map((record) => ({ ...record, url: absoluteUrl(record.url) }));
    registerRecords(records);
    return ok(records.length);
  } catch (error) {
    return fail(error);
  }
}

async function browse(path = ""): Promise<AgentWorldResult<AgentMediaListing>> {
  try {
    const payload = await storeFetch<AgentMediaListing & { convertibleModelExtensions?: string[] }>(
      `/datalake?path=${encodeURIComponent(path)}`,
    );
    const files = payload.files.map((file) => ({
      ...file,
      convertible: CONVERTIBLE_MODEL_EXTENSIONS.has(file.extension),
      usable:
        (file.kind === "texture" && LOADABLE_TEXTURE_EXTENSIONS.has(file.extension))
        || (file.kind === "model" && CONVERTIBLE_MODEL_EXTENSIONS.has(file.extension))
        || file.kind === "sound",
    }));
    return ok({ root: payload.root, path: payload.path, folders: payload.folders, files });
  } catch (error) {
    return fail(error);
  }
}

async function register(options: AgentMediaRegisterOptions): Promise<AgentWorldResult<AgentWorldMediaDescriptor>> {
  try {
    const query = new URLSearchParams({ filename: options.fileName, kind: options.kind });
    if (options.id) query.set("id", options.id);
    if (options.label) query.set("label", options.label);
    if (options.category) query.set("category", options.category);
    if (options.source) query.set("source", options.source);
    const meta: Record<string, unknown> = {};
    if (options.defaultRepeat) meta.defaultRepeat = options.defaultRepeat;
    if (Object.keys(meta).length) query.set("meta", JSON.stringify(meta));
    const record = await storeFetch<AgentWorldMediaDescriptor>(`/assets/upload?${query.toString()}`, {
      method: "POST",
      body: options.data,
    });
    await refresh();
    return ok({ ...record, url: absoluteUrl(record.url) });
  } catch (error) {
    return fail(error);
  }
}

async function importPath(path: string, options: AgentMediaImportOptions = {}): Promise<AgentWorldResult<AgentWorldMediaDescriptor>> {
  const extension = extensionOf(path);
  try {
    // Foreign mesh formats take the conversion path: fetch the bytes, parse with three's
    // loaders, upload the runtime's own format. Everything else is a server-side copy.
    if (CONVERTIBLE_MODEL_EXTENSIONS.has(extension)) {
      const converted = await convertDatalakeModel(path, options);
      return register({
        fileName: `${converted.slug}.json`,
        kind: "model",
        id: options.id,
        label: options.label ?? converted.label,
        category: options.category ?? "imported",
        source: `Datalake/${path}`,
        data: JSON.stringify(converted.payload),
      });
    }
    const meta: Record<string, unknown> = {};
    if (options.defaultRepeat) meta.defaultRepeat = options.defaultRepeat;
    const record = await storeFetch<AgentWorldMediaDescriptor>("/assets/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        path,
        id: options.id,
        label: options.label,
        category: options.category,
        ...(Object.keys(meta).length ? { meta } : {}),
      }),
    });
    await refresh();
    return ok({ ...record, url: absoluteUrl(record.url) });
  } catch (error) {
    return fail(error);
  }
}

async function remove(id: string): Promise<AgentWorldResult<string>> {
  try {
    await storeFetch<{ removed: string }>(`/assets/${encodeURIComponent(id)}`, { method: "DELETE" });
    await refresh();
    return ok(id);
  } catch (error) {
    return fail(error);
  }
}

async function terrainHeights(id: string, samples = 129): Promise<AgentWorldResult<{ samples: number; heights: number[] }>> {
  try {
    if (!Number.isInteger(samples) || samples < 2 || samples > 513) {
      throw new Error("samples must be an integer between 2 and 513 (the runtime's terrain.heights limit)");
    }
    const record = state.records.find((candidate) => candidate.id === id);
    if (!record) throw new Error(`Unknown media asset: ${id} (refresh() first?)`);
    if (record.kind !== "texture") throw new Error(`${id} is a ${record.kind}, not an image`);

    const image = await new Promise<HTMLImageElement>((resolveImage, rejectImage) => {
      const element = new Image();
      // The store sends `access-control-allow-origin: *`; anonymous keeps the canvas clean.
      element.crossOrigin = "anonymous";
      element.onload = () => resolveImage(element);
      element.onerror = () => rejectImage(new Error(`Image request failed: ${record.url}`));
      element.src = record.url;
    });

    // Let the canvas do the resampling: drawing the full bitmap into a samples×samples
    // surface is a box filter over each cell, which is exactly the smoothing a collider
    // grid wants (per-pixel point sampling of a 1222px scan aliases into spikes).
    const canvas = document.createElement("canvas");
    canvas.width = samples;
    canvas.height = samples;
    const draw = canvas.getContext("2d", { willReadFrequently: true });
    if (!draw) throw new Error("A 2D canvas context is required to decode a heightmap");
    draw.drawImage(image, 0, 0, samples, samples);
    const pixels = draw.getImageData(0, 0, samples, samples).data;

    const heights = new Array<number>(samples * samples);
    let minimum = Infinity;
    let maximum = -Infinity;
    for (let index = 0; index < heights.length; index += 1) {
      const offset = index * 4;
      const luminance = 0.2126 * pixels[offset]! + 0.7152 * pixels[offset + 1]! + 0.0722 * pixels[offset + 2]!;
      heights[index] = luminance;
      if (luminance < minimum) minimum = luminance;
      if (luminance > maximum) maximum = luminance;
    }
    const span = maximum - minimum;
    for (let index = 0; index < heights.length; index += 1) {
      // A flat image is honest flat ground, not a divide-by-zero.
      const value = span > 0.0001 ? (heights[index]! - minimum) / span : 0;
      heights[index] = Math.round(value * 10000) / 10000;
    }
    return ok({ samples, heights });
  } catch (error) {
    return fail(error);
  }
}

const mediaApi: GraphysXAgentMediaApi = {
  schema: GRAPHYSX_AGENT_MEDIA_SCHEMA,
  status: () => ({
    online: state.online,
    storeUrl: state.online ? state.baseUrl : null,
    datalake: state.datalake,
    count: state.records.length,
  }),
  list: (kind) => (kind ? state.records.filter((record) => record.kind === kind) : state.records),
  refresh,
  browse,
  import: importPath,
  register,
  remove,
  terrainHeights,
};

/** One media library per tab — both API implementations hand out the same object. */
export function getAgentWorldMediaApi(): GraphysXAgentMediaApi {
  return mediaApi;
}

// --------------------------------------------------------------------- conversion

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
  uvs?: number[];
  indices: number[];
  groups?: Array<{ start: number; count: number; materialIndex: number }>;
  materials?: PayloadMaterial[];
};
type MeshPayload = {
  bounds: { min: Tuple3; max: Tuple3; size: Tuple3 };
  meshes: PayloadMesh[];
  provenance?: { source: string; converter: string; warnings: string[] };
};

type ConvertedModel = { payload: MeshPayload; label: string; slug: string; warnings: string[] };

/**
 * Fetch one datalake model and convert it to `graphysx-mesh-json`.
 *
 * Two sign conventions matter here and both are deliberate:
 *
 * - `loadAgentWorldModel` applies `scale.set(s, s, -s)` because the archive payloads are
 *   left-handed TV3D exports. Three's loaders hand back right-handed geometry, so Z is
 *   negated (and winding reversed) HERE, and the runtime's flip restores the original.
 * - GLTF texture coordinates assume `flipY:false`; the runtime loads textures with the
 *   default `flipY:true`, so V is inverted for GLTF sources.
 */
async function convertDatalakeModel(path: string, options: AgentMediaImportOptions): Promise<ConvertedModel> {
  const three = await import("three");
  const extension = extensionOf(path);
  const fileName = path.split("/").pop() ?? path;
  const label = options.label ?? fileName.replace(/\.[^.]+$/, "");
  const slug = (options.id ?? label).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "model";
  const warnings: string[] = [];

  const fileUrl = (relative: string): string => {
    const folder = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
    const target = folder ? `${folder}/${relative}` : relative;
    return `${state.baseUrl}/datalake/file?path=${encodeURIComponent(target)}`;
  };

  // Relative resource requests (a .3ds naming FUS.BMP, a .gltf naming a .bin) must come
  // back through the datalake endpoint — a query-string URL breaks native relative
  // resolution, so the manager rewrites every non-absolute request explicitly.
  const manager = new three.LoadingManager();
  manager.setURLModifier((url) => {
    if (/^(https?:|data:|blob:)/i.test(url)) return url;
    return fileUrl(url.replace(/^\.?\//, ""));
  });
  // Loaders return their scene before the textures they queued have arrived; baking then
  // would read empty images and quietly produce colour-only materials. Track whether the
  // manager started anything so the bake can wait for it (bounded — a dead texture URL
  // must not wedge an import).
  let managerStarted = false;
  manager.onStart = () => { managerStarted = true; };
  const waitForResources = async (): Promise<void> => {
    if (!managerStarted) return;
    await new Promise<void>((resolveWait) => {
      const timer = window.setTimeout(() => resolveWait(), 15000);
      manager.onLoad = () => {
        window.clearTimeout(timer);
        resolveWait();
      };
    });
  };

  const response = await fetch(`${state.baseUrl}/datalake/file?path=${encodeURIComponent(path)}`);
  if (!response.ok) throw new Error(`Could not read ${path} from the datalake (${response.status})`);
  const buffer = await response.arrayBuffer();

  let root: import("three").Object3D;
  let flipUvV = false;
  if (extension === ".obj") {
    const { OBJLoader } = await import("three/examples/jsm/loaders/OBJLoader.js");
    root = new OBJLoader(manager).parse(new TextDecoder().decode(buffer));
    warnings.push("OBJ materials (.mtl) are not applied; set colours or a texture after import.");
  } else if (extension === ".glb" || extension === ".gltf") {
    const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
    const gltf = await new GLTFLoader(manager).parseAsync(buffer, "");
    root = gltf.scene;
    flipUvV = true;
  } else if (extension === ".fbx") {
    const { FBXLoader } = await import("three/examples/jsm/loaders/FBXLoader.js");
    root = new FBXLoader(manager).parse(buffer, "");
  } else if (extension === ".stl") {
    const { STLLoader } = await import("three/examples/jsm/loaders/STLLoader.js");
    const geometry = new STLLoader().parse(buffer);
    root = new three.Mesh(geometry, new three.MeshPhongMaterial());
  } else if (extension === ".3ds") {
    const { TDSLoader } = await import("three/examples/jsm/loaders/TDSLoader.js");
    root = new TDSLoader(manager).parse(buffer, "");
  } else {
    throw new Error(`No browser converter for ${extension} — convert offline and import the JSON.`);
  }

  await waitForResources();
  const payload = await bakeObjectToPayload(root, { flipUvV, warnings, label, source: `Datalake/${path}` });
  return { payload, label, slug, warnings };
}

/** Walk a parsed Object3D and bake it (world transforms applied) into the payload format. */
async function bakeObjectToPayload(
  root: import("three").Object3D,
  context: { flipUvV: boolean; warnings: string[]; label: string; source: string },
): Promise<MeshPayload> {
  const three = await import("three");
  root.updateMatrixWorld(true);

  const meshes: PayloadMesh[] = [];
  const min: Tuple3 = [Infinity, Infinity, Infinity];
  const max: Tuple3 = [-Infinity, -Infinity, -Infinity];
  const textureUploads = new Map<import("three").Texture, string | null>();

  const sourceMeshes: import("three").Mesh[] = [];
  root.traverse((child) => {
    if ((child as import("three").Mesh).isMesh) sourceMeshes.push(child as import("three").Mesh);
  });
  if (!sourceMeshes.length) throw new Error("The file parsed but contains no meshes.");
  if (sourceMeshes.length > 256) {
    context.warnings.push(`Model has ${sourceMeshes.length} meshes; only the first 256 were kept (runtime limit).`);
    sourceMeshes.length = 256;
  }

  for (const sourceMesh of sourceMeshes) {
    let geometry = sourceMesh.geometry.clone();
    geometry.applyMatrix4(sourceMesh.matrixWorld);
    if (!geometry.index) {
      const count = geometry.getAttribute("position")?.count ?? 0;
      geometry.setIndex([...Array(count).keys()]);
    }

    const positionAttribute = geometry.getAttribute("position");
    if (!positionAttribute || positionAttribute.count < 3) continue;
    // 4 decimals: sub-0.1mm at metre scale, and it keeps a raw-scan STL's JSON from
    // ballooning with 17-digit doubles (measured 62 MB → ~24 MB on the octopus scan).
    const trim = (value: number): number => Math.round(value * 10000) / 10000;
    const positions: number[] = new Array(positionAttribute.count * 3);
    for (let index = 0; index < positionAttribute.count; index += 1) {
      const x = trim(positionAttribute.getX(index));
      const y = trim(positionAttribute.getY(index));
      // Right-handed → the archive's left-handed convention (see convertDatalakeModel).
      const z = trim(-positionAttribute.getZ(index));
      positions[index * 3] = x;
      positions[index * 3 + 1] = y;
      positions[index * 3 + 2] = z;
      if (x < min[0]) min[0] = x;
      if (y < min[1]) min[1] = y;
      if (z < min[2]) min[2] = z;
      if (x > max[0]) max[0] = x;
      if (y > max[1]) max[1] = y;
      if (z > max[2]) max[2] = z;
    }

    const uvAttribute = geometry.getAttribute("uv");
    let uvs: number[] | undefined;
    if (uvAttribute && uvAttribute.count === positionAttribute.count) {
      uvs = new Array(uvAttribute.count * 2);
      for (let index = 0; index < uvAttribute.count; index += 1) {
        uvs[index * 2] = trim(uvAttribute.getX(index));
        uvs[index * 2 + 1] = trim(context.flipUvV ? 1 - uvAttribute.getY(index) : uvAttribute.getY(index));
      }
    }

    // The Z negation mirrors the geometry, so triangle winding reverses with it.
    const sourceIndex = geometry.index!;
    const indices: number[] = new Array(sourceIndex.count);
    for (let index = 0; index < sourceIndex.count; index += 3) {
      indices[index] = sourceIndex.getX(index);
      indices[index + 1] = sourceIndex.getX(index + 2);
      indices[index + 2] = sourceIndex.getX(index + 1);
    }

    const sourceMaterials = Array.isArray(sourceMesh.material) ? sourceMesh.material : [sourceMesh.material];
    const materials: PayloadMaterial[] = [];
    for (const sourceMaterial of sourceMaterials) {
      materials.push(await bakeMaterial(three, sourceMaterial, textureUploads, context));
    }

    const groups = geometry.groups?.length
      ? geometry.groups
          .map((group) => ({
            start: group.start,
            count: group.count === Infinity ? sourceIndex.count - group.start : group.count,
            materialIndex: Math.min(group.materialIndex ?? 0, materials.length - 1),
          }))
          .filter((group) => group.count > 0)
      : undefined;

    meshes.push({
      name: sourceMesh.name || undefined,
      positions,
      ...(uvs ? { uvs } : {}),
      indices,
      ...(groups ? { groups } : {}),
      ...(materials.length ? { materials } : {}),
    });
    geometry.dispose();
  }

  if (!meshes.length) throw new Error("No usable geometry survived conversion.");
  const size: Tuple3 = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  return {
    bounds: { min, max, size },
    meshes,
    provenance: {
      source: context.source,
      converter: "agent-world-media (in-browser three.js conversion)",
      warnings: context.warnings,
    },
  };
}

/**
 * Flatten one three material into the payload's Phong-ish shape. A texture map, when the
 * loader managed to fetch one, is re-encoded to PNG and stored as its own library file so
 * the converted mesh never references back into the datalake.
 */
async function bakeMaterial(
  three: typeof import("three"),
  material: import("three").Material,
  uploads: Map<import("three").Texture, string | null>,
  context: { warnings: string[]; label: string },
): Promise<PayloadMaterial> {
  const anyMaterial = material as import("three").MeshStandardMaterial & import("three").MeshPhongMaterial;
  const color = anyMaterial.color instanceof three.Color ? anyMaterial.color : new three.Color(0xb8c1c9);
  const emissive = anyMaterial.emissive instanceof three.Color ? anyMaterial.emissive : new three.Color(0x000000);

  let textureUrl: string | null = null;
  const map = anyMaterial.map ?? null;
  if (map) {
    if (!uploads.has(map)) uploads.set(map, await uploadBakedTexture(map, context));
    textureUrl = uploads.get(map) ?? null;
  }

  return {
    name: material.name || undefined,
    color: [color.r, color.g, color.b, anyMaterial.opacity ?? 1],
    emissive: [emissive.r, emissive.g, emissive.b],
    specular: [0.067, 0.067, 0.067],
    specularPower: typeof anyMaterial.shininess === "number" ? anyMaterial.shininess : 18,
    textureUrl,
  };
}

/** Draw a loaded texture image to a canvas, encode PNG, store it as a library file. */
async function uploadBakedTexture(
  texture: import("three").Texture,
  context: { warnings: string[]; label: string },
): Promise<string | null> {
  try {
    const image = texture.image as { width?: number; height?: number } | undefined;
    if (!image || !image.width || !image.height) return null;
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const draw = canvas.getContext("2d");
    if (!draw) return null;
    draw.drawImage(texture.image as CanvasImageSource, 0, 0);
    const blob = await new Promise<Blob | null>((resolveBlob) => canvas.toBlob(resolveBlob, "image/png"));
    if (!blob) return null;
    const stored = await register({
      fileName: `${context.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-map.png`,
      kind: "file",
      category: "model-texture",
      label: `${context.label} map`,
      source: "Baked during model conversion",
      data: blob,
    });
    return stored.ok && stored.value ? stored.value.url : null;
  } catch (error) {
    context.warnings.push(`A texture could not be baked (${error instanceof Error ? error.message : String(error)}); the material keeps its colour only.`);
    return null;
  }
}
