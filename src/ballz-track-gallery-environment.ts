import {
  Box3,
  Box3Helper,
  BufferGeometry,
  DoubleSide,
  EdgesGeometry,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshStandardMaterial,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  Vector3
} from "three";
import familyJson from "./legacy/ballz-slide-track-family.json";

export const BALLZ_TRACK_GALLERY_ASSET_IDS = [
  "slide1a-legacy-active",
  "level-slides",
  "level-steps",
  "slide-bump",
  "slide-bump-gridtex",
  "ballz-track1"
] as const;

export type BallzTrackGalleryAssetId = typeof BALLZ_TRACK_GALLERY_ASSET_IDS[number];
export type BallzTrackGalleryMaterialMode = "source-evidence" | "diagnostic-groups";
export type BallzTrackGalleryCameraProfile = "overview" | "top";
type Tuple3 = readonly [number, number, number];
type Tuple4 = readonly [number, number, number, number];

type BoundsData = { min: Tuple3; max: Tuple3; size: Tuple3 };
type GeometryData = {
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
  materialIndexByTriangle: number[];
};
type MaterialRecord = {
  format: "MGRP-416";
  materialIndex: number;
  name: string;
  textureName: string | null;
  rgbaSlots: Tuple4[];
  rawRecordSha256: string;
};
type LegacyMaterialRecord = {
  format: "MGR4-172";
  materialIndex: number;
  rgbaSlots: Tuple4[];
  rawRecordSha256: string;
};
type AssetData = {
  id: string;
  label: string;
  role: string;
  source: string;
  bytes: number;
  sha256: string;
  geometrySha256: string;
  vertexCount: number;
  triangleCount: number;
  bounds: BoundsData;
  groups: Array<{ vertexCount: number; vertexStart: number; triangleCount: number; triangleStart: number }>;
  materialIndices: number[];
  uv: { present: boolean; uniquePairCount: number; allIdentical: boolean; finite: boolean };
  topology: {
    edgeCount: number;
    edgeUseCounts: Record<string, number>;
    boundaryEdgeCount: number;
    nonManifoldEdgeCount: number;
    connectedComponents: Array<{ vertexCount: number; bounds: BoundsData }>;
  };
  loaderEvidence: string[];
  embeddedTextureNames: string[];
  embeddedMaterialRecords: MaterialRecord[];
  legacyMaterialRecords: LegacyMaterialRecord[];
  geometry: GeometryData;
};
type TextureEvidence = {
  embeddedName: string;
  source: string;
  bytes: number;
  sha256: string;
  browserPath: string;
  byteIdenticalOutput: boolean;
};
type HostEvidence = {
  status: string;
  position: Tuple3 | null;
  scale: Tuple3 | null;
  materialMode: string;
  staticMeshBody: boolean | null;
  initialCameraPosition?: Tuple3;
  ballSpawn?: Tuple3;
  chaseOffset?: Tuple3;
  gameplayBoundary: string;
};
type NormalizationData = {
  status: "inferred-reversible-display-only";
  basis: string;
  sourceWorldBounds: BoundsData;
  anchor: Tuple3;
  displayScale: number;
  displayBounds: BoundsData;
  inverse: string;
  preservesAspectAndOrientation: boolean;
};
type GalleryAssetEvidence = {
  id: BallzTrackGalleryAssetId;
  host: HostEvidence;
  normalization: NormalizationData;
  resolvedTextureBindings: Array<{ materialIndex: number; textureName: string; resolved: TextureEvidence | null }>;
  unresolvedTextureBindings: string[];
};
type FamilyData = {
  assets: AssetData[];
  remainingGallery: {
    schema: "graphysx.ballz-track-gallery/v1";
    assetIds: BallzTrackGalleryAssetId[];
    purpose: string;
    excludedAliases: Array<{ id: string; reason: string }>;
    excludedRevision: { id: string; reason: string };
    materialPolicy: string;
    textureCatalog: Record<string, TextureEvidence>;
    assets: GalleryAssetEvidence[];
    statusRecommendations: Array<{ id: BallzTrackGalleryAssetId; status: "PARTIAL"; reason: string }>;
  };
};

function isFiniteNumbers(value: unknown, length?: number): value is number[] {
  return Array.isArray(value)
    && (length === undefined || value.length === length)
    && value.every((entry) => typeof entry === "number" && Number.isFinite(entry));
}

function validateFamily(value: unknown): FamilyData {
  if (typeof value !== "object" || value === null) throw new TypeError("BallZ slide/track audit must be an object.");
  const candidate = value as Record<string, unknown>;
  if (!Array.isArray(candidate.assets) || typeof candidate.remainingGallery !== "object" || candidate.remainingGallery === null) {
    throw new TypeError("BallZ slide/track audit is missing its gallery data.");
  }
  const gallery = candidate.remainingGallery as Record<string, unknown>;
  if (gallery.schema !== "graphysx.ballz-track-gallery/v1" || !Array.isArray(gallery.assetIds) || !Array.isArray(gallery.assets)) {
    throw new TypeError("BallZ slide/track gallery schema is incompatible.");
  }
  if (JSON.stringify(gallery.assetIds) !== JSON.stringify(BALLZ_TRACK_GALLERY_ASSET_IDS)) {
    throw new TypeError("BallZ slide/track gallery asset order changed.");
  }
  for (const rawAsset of candidate.assets as Array<Record<string, unknown>>) {
    if (!BALLZ_TRACK_GALLERY_ASSET_IDS.includes(rawAsset.id as BallzTrackGalleryAssetId)) continue;
    const geometry = rawAsset.geometry as Record<string, unknown> | undefined;
    if (!geometry || !isFiniteNumbers(geometry.positions) || !isFiniteNumbers(geometry.normals) || !isFiniteNumbers(geometry.uvs)
      || !isFiniteNumbers(geometry.indices) || !isFiniteNumbers(geometry.materialIndexByTriangle)) {
      throw new TypeError(`BallZ gallery asset ${String(rawAsset.id)} has incomplete exact geometry.`);
    }
    if (geometry.positions.length !== Number(rawAsset.vertexCount) * 3 || geometry.indices.length !== Number(rawAsset.triangleCount) * 3) {
      throw new TypeError(`BallZ gallery asset ${String(rawAsset.id)} geometry totals disagree with its audit.`);
    }
  }
  return value as FamilyData;
}

const FAMILY = validateFamily(familyJson);
const ASSETS = new Map(FAMILY.assets.map((asset) => [asset.id, asset]));
const GALLERY_EVIDENCE = new Map(FAMILY.remainingGallery.assets.map((entry) => [entry.id, entry]));

export const BALLZ_TRACK_GALLERY_EVIDENCE = Object.freeze({
  purpose: FAMILY.remainingGallery.purpose,
  materialPolicy: FAMILY.remainingGallery.materialPolicy,
  excludedAliases: FAMILY.remainingGallery.excludedAliases.map((entry) => Object.freeze({ ...entry })),
  excludedRevision: Object.freeze({ ...FAMILY.remainingGallery.excludedRevision }),
  statusRecommendations: FAMILY.remainingGallery.statusRecommendations.map((entry) => Object.freeze({ ...entry }))
});

function buildGeometry(asset: AssetData): BufferGeometry {
  const source = asset.geometry;
  const geometry = new BufferGeometry();
  geometry.name = `${asset.label} exact indexed TVM geometry`;
  geometry.setAttribute("position", new Float32BufferAttribute(source.positions, 3));
  geometry.setAttribute("normal", new Float32BufferAttribute(source.normals, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(source.uvs, 2));
  geometry.setIndex(source.indices);
  geometry.clearGroups();
  if (source.materialIndexByTriangle.length === asset.triangleCount) {
    let startTriangle = 0;
    while (startTriangle < source.materialIndexByTriangle.length) {
      const materialIndex = source.materialIndexByTriangle[startTriangle];
      let endTriangle = startTriangle + 1;
      while (endTriangle < source.materialIndexByTriangle.length && source.materialIndexByTriangle[endTriangle] === materialIndex) endTriangle += 1;
      geometry.addGroup(startTriangle * 3, (endTriangle - startTriangle) * 3, materialIndex);
      startTriangle = endTriangle;
    }
  } else {
    geometry.addGroup(0, source.indices.length, 0);
  }
  if (source.normals.every((value) => Math.abs(value) < 0.000001)) geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function rgbHex(slot: Tuple4, fallback: number): number {
  if (slot.slice(0, 3).every((value) => Math.abs(value) < 0.000001)) return fallback;
  const values = slot.slice(0, 3).map((value) => Math.max(0, Math.min(255, Math.round(value * 255))));
  return (values[0] << 16) | (values[1] << 8) | values[2];
}

const DIAGNOSTIC_COLORS = [0x54c6eb, 0xf4b860, 0x9bdeac, 0xc792ea, 0xff7a90, 0x7aa7ff];

type GalleryEntryRuntime = {
  asset: AssetData;
  evidence: GalleryAssetEvidence;
  root: Group;
  sourceWorld: Group;
  mesh: Mesh<BufferGeometry, MeshStandardMaterial[]>;
  edgeOverlay: LineSegments<EdgesGeometry, LineBasicMaterial>;
  boundsHelper: Box3Helper;
  sourceMaterials: MeshStandardMaterial[];
  diagnosticMaterials: MeshStandardMaterial[];
  usedNeutralFallback: boolean;
  usedComputedNormals: boolean;
};

export type BallzTrackGalleryEnvironmentState = {
  schema: "graphysx.ballz-track-gallery-inspector/v1";
  mode: "evidence-bounded-non-gameplay-gallery";
  selectedAssetId: BallzTrackGalleryAssetId;
  assetsReady: boolean;
  textureLoadErrors: string[];
  playable: false;
  asset: {
    label: string;
    role: string;
    source: string;
    sha256: string;
    geometrySha256: string;
    vertexCount: number;
    triangleCount: number;
    exactMaterialIndices: number[];
    exactGroupCount: number;
    exactBounds: BoundsData;
    topology: AssetData["topology"];
    uv: AssetData["uv"];
    sourceNormals: "all-zero" | "valid-unit-vectors";
    displayNormalAdapter: "computed-for-inspection" | "none";
  };
  hostEvidence: HostEvidence;
  normalization: NormalizationData;
  material: {
    mode: BallzTrackGalleryMaterialMode;
    embeddedRecords: MaterialRecord[];
    legacyRecords: LegacyMaterialRecord[];
    resolvedTextures: Array<{ materialIndex: number; textureName: string; browserPath: string | null; sha256: string | null }>;
    neutralFallback: boolean;
    policy: string;
  };
  diagnostics: { edgesVisible: boolean; boundsVisible: boolean };
  statusRecommendation: { status: "PARTIAL"; reason: string };
  exclusions: typeof BALLZ_TRACK_GALLERY_EVIDENCE.excludedAliases;
};

export class BallzTrackGalleryEnvironment {
  readonly group = new Group();
  readonly ready: Promise<void>;
  readonly staticData = BALLZ_TRACK_GALLERY_EVIDENCE;

  private readonly textureLoader: TextureLoader;
  private readonly textures = new Map<string, Texture>();
  private readonly entries = new Map<BallzTrackGalleryAssetId, GalleryEntryRuntime>();
  private selectedAssetId: BallzTrackGalleryAssetId = "slide1a-legacy-active";
  private materialMode: BallzTrackGalleryMaterialMode = "source-evidence";
  private edgesVisible = true;
  private boundsVisible = false;
  private assetsReady = false;
  private textureLoadErrors: string[] = [];
  private disposed = false;

  constructor(textureLoader = new TextureLoader()) {
    this.textureLoader = textureLoader;
    this.group.name = "BallZ remaining slide/track evidence gallery";
    for (const id of BALLZ_TRACK_GALLERY_ASSET_IDS) this.entries.set(id, this.buildEntry(id));
    this.selectAsset(this.selectedAssetId);
    this.ready = this.loadTextures();
  }

  private buildSourceMaterials(asset: AssetData, evidence: GalleryAssetEvidence): { materials: MeshStandardMaterial[]; fallback: boolean } {
    const materialCount = Math.max(1, ...asset.materialIndices.map((index) => index + 1));
    const hostedOverride = evidence.host.materialMode.includes("override");
    let fallback = false;
    const materials = Array.from({ length: materialCount }, (_, materialIndex) => {
      const record = asset.embeddedMaterialRecords.find((candidate) => candidate.materialIndex === materialIndex);
      let color = 0xcccccc;
      if (!hostedOverride && record) {
        const allZero = record.rgbaSlots.flat().every((value) => value === 0);
        fallback ||= allZero;
        color = rgbHex(record.rgbaSlots[0], 0x91a3b0);
      }
      const material = new MeshStandardMaterial({
        name: hostedOverride
          ? `Host StdMat override — ${asset.id}`
          : record ? `${record.name || `material ${materialIndex}`} — exact embedded evidence` : `Neutral inspection fallback — ${asset.id}`,
        color,
        roughness: 0.7,
        metalness: 0.06,
        side: DoubleSide
      });
      material.userData.textureName = hostedOverride ? null : record?.textureName ?? null;
      material.userData.materialEvidence = hostedOverride ? "exact-host-StdMat-override" : record ? "exact-MGRP-record" : "neutral-inspection-fallback";
      return material;
    });
    return { materials, fallback };
  }

  private buildEntry(id: BallzTrackGalleryAssetId): GalleryEntryRuntime {
    const asset = ASSETS.get(id);
    const evidence = GALLERY_EVIDENCE.get(id);
    if (!asset || !evidence) throw new Error(`BallZ gallery evidence for ${id} is missing.`);
    const geometry = buildGeometry(asset);
    const usedComputedNormals = asset.geometry.normals.every((value) => Math.abs(value) < 0.000001);
    const source = this.buildSourceMaterials(asset, evidence);
    const diagnosticMaterials = source.materials.map((_, index) => new MeshStandardMaterial({
      name: `${asset.id} diagnostic material group ${index}`,
      color: DIAGNOSTIC_COLORS[index % DIAGNOSTIC_COLORS.length],
      roughness: 0.5,
      metalness: 0.12,
      side: DoubleSide
    }));
    const mesh = new Mesh(geometry, source.materials);
    mesh.name = `${asset.label} exact TVM mesh`;
    mesh.position.set(...(evidence.host.position ?? [0, 0, 0]));
    mesh.scale.set(...(evidence.host.scale ?? [1, 1, 1]));
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    const edgeMaterial = new LineBasicMaterial({ color: 0xb7ecff, transparent: true, opacity: 0.34, depthWrite: false });
    const edgeOverlay = new LineSegments(new EdgesGeometry(geometry, 28), edgeMaterial);
    edgeOverlay.name = `${asset.id} diagnostic edges`;
    edgeOverlay.visible = this.edgesVisible;
    mesh.add(edgeOverlay);

    const sourceWorld = new Group();
    sourceWorld.name = `${asset.id} exact source/local coordinates before display normalization`;
    sourceWorld.add(mesh);
    sourceWorld.scale.setScalar(evidence.normalization.displayScale);
    sourceWorld.position.set(
      -evidence.normalization.anchor[0] * evidence.normalization.displayScale,
      -evidence.normalization.anchor[1] * evidence.normalization.displayScale,
      -evidence.normalization.anchor[2] * evidence.normalization.displayScale
    );

    const bounds = new Box3(new Vector3(...evidence.normalization.displayBounds.min), new Vector3(...evidence.normalization.displayBounds.max));
    const boundsHelper = new Box3Helper(bounds, 0xffc857);
    boundsHelper.name = `${asset.id} inferred display bounds`;
    boundsHelper.visible = this.boundsVisible;

    const root = new Group();
    root.name = `${asset.label} isolated visit`;
    root.add(sourceWorld, boundsHelper);
    root.visible = false;
    this.group.add(root);
    return {
      asset,
      evidence,
      root,
      sourceWorld,
      mesh,
      edgeOverlay,
      boundsHelper,
      sourceMaterials: source.materials,
      diagnosticMaterials,
      usedNeutralFallback: source.fallback,
      usedComputedNormals
    };
  }

  private async loadTextures(): Promise<void> {
    const failures: string[] = [];
    await Promise.all(Object.entries(FAMILY.remainingGallery.textureCatalog).map(async ([key, evidence]) => {
      try {
        const texture = await this.textureLoader.loadAsync(evidence.browserPath);
        texture.name = `${evidence.embeddedName} exact archived texture`;
        texture.colorSpace = SRGBColorSpace;
        texture.flipY = false;
        texture.needsUpdate = true;
        this.textures.set(key, texture);
      } catch (error) {
        failures.push(`${evidence.embeddedName}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }));
    this.textureLoadErrors = failures;
    for (const entry of this.entries.values()) {
      for (const material of entry.sourceMaterials) {
        const textureName = material.userData.textureName as string | null;
        material.map = textureName ? this.textures.get(textureName.toLowerCase()) ?? null : null;
        material.needsUpdate = true;
      }
    }
    this.assetsReady = true;
  }

  selectAsset(id: BallzTrackGalleryAssetId): BallzTrackGalleryEnvironmentState {
    if (!BALLZ_TRACK_GALLERY_ASSET_IDS.includes(id)) throw new RangeError(`Unknown BallZ gallery asset ${String(id)}.`);
    this.selectedAssetId = id;
    for (const [entryId, entry] of this.entries) entry.root.visible = entryId === id;
    return this.getState();
  }

  setMaterialMode(mode: BallzTrackGalleryMaterialMode): BallzTrackGalleryEnvironmentState {
    if (mode !== "source-evidence" && mode !== "diagnostic-groups") throw new RangeError(`Unknown BallZ gallery material mode ${String(mode)}.`);
    this.materialMode = mode;
    for (const entry of this.entries.values()) entry.mesh.material = mode === "source-evidence" ? entry.sourceMaterials : entry.diagnosticMaterials;
    return this.getState();
  }

  setEdgesVisible(visible: boolean): BallzTrackGalleryEnvironmentState {
    this.edgesVisible = visible;
    for (const entry of this.entries.values()) entry.edgeOverlay.visible = visible;
    return this.getState();
  }

  setBoundsVisible(visible: boolean): BallzTrackGalleryEnvironmentState {
    this.boundsVisible = visible;
    for (const entry of this.entries.values()) entry.boundsHelper.visible = visible;
    return this.getState();
  }

  sourceWorldToDisplay(assetId: BallzTrackGalleryAssetId, source: Tuple3, target = new Vector3()): Vector3 {
    const evidence = GALLERY_EVIDENCE.get(assetId);
    if (!evidence) throw new RangeError(`Unknown BallZ gallery asset ${String(assetId)}.`);
    return target.set(
      (source[0] - evidence.normalization.anchor[0]) * evidence.normalization.displayScale,
      (source[1] - evidence.normalization.anchor[1]) * evidence.normalization.displayScale,
      (source[2] - evidence.normalization.anchor[2]) * evidence.normalization.displayScale
    );
  }

  displayToSourceWorld(assetId: BallzTrackGalleryAssetId, display: Tuple3, target = new Vector3()): Vector3 {
    const evidence = GALLERY_EVIDENCE.get(assetId);
    if (!evidence) throw new RangeError(`Unknown BallZ gallery asset ${String(assetId)}.`);
    return target.set(
      display[0] / evidence.normalization.displayScale + evidence.normalization.anchor[0],
      display[1] / evidence.normalization.displayScale + evidence.normalization.anchor[1],
      display[2] / evidence.normalization.displayScale + evidence.normalization.anchor[2]
    );
  }

  getCameraProfile(profile: BallzTrackGalleryCameraProfile): { status: "inferred-inspection-camera"; position: [number, number, number]; target: [number, number, number]; fovDegrees: number } {
    const entry = this.entries.get(this.selectedAssetId)!;
    const bounds = entry.evidence.normalization.displayBounds;
    const target: [number, number, number] = [
      (bounds.min[0] + bounds.max[0]) / 2,
      bounds.min[1] + bounds.size[1] * 0.42,
      (bounds.min[2] + bounds.max[2]) / 2
    ];
    const extent = Math.max(...bounds.size, 24);
    return profile === "top"
      ? { status: "inferred-inspection-camera", position: [target[0], target[1] + extent * 1.45, target[2] + 0.001], target, fovDegrees: 48 }
      : { status: "inferred-inspection-camera", position: [target[0] + extent * 0.9, target[1] + extent * 0.62, target[2] + extent * 1.12], target, fovDegrees: 46 };
  }

  getState(): BallzTrackGalleryEnvironmentState {
    const entry = this.entries.get(this.selectedAssetId)!;
    const recommendation = FAMILY.remainingGallery.statusRecommendations.find((candidate) => candidate.id === this.selectedAssetId)!;
    return {
      schema: "graphysx.ballz-track-gallery-inspector/v1",
      mode: "evidence-bounded-non-gameplay-gallery",
      selectedAssetId: this.selectedAssetId,
      assetsReady: this.assetsReady,
      textureLoadErrors: [...this.textureLoadErrors],
      playable: false,
      asset: {
        label: entry.asset.label,
        role: entry.asset.role,
        source: entry.asset.source,
        sha256: entry.asset.sha256,
        geometrySha256: entry.asset.geometrySha256,
        vertexCount: entry.asset.vertexCount,
        triangleCount: entry.asset.triangleCount,
        exactMaterialIndices: [...entry.asset.materialIndices],
        exactGroupCount: entry.asset.groups.length,
        exactBounds: entry.asset.bounds,
        topology: entry.asset.topology,
        uv: entry.asset.uv,
        sourceNormals: entry.usedComputedNormals ? "all-zero" : "valid-unit-vectors",
        displayNormalAdapter: entry.usedComputedNormals ? "computed-for-inspection" : "none"
      },
      hostEvidence: entry.evidence.host,
      normalization: entry.evidence.normalization,
      material: {
        mode: this.materialMode,
        embeddedRecords: entry.asset.embeddedMaterialRecords,
        legacyRecords: entry.asset.legacyMaterialRecords,
        resolvedTextures: entry.evidence.resolvedTextureBindings.map((binding) => ({
          materialIndex: binding.materialIndex,
          textureName: binding.textureName,
          browserPath: binding.resolved?.browserPath ?? null,
          sha256: binding.resolved?.sha256 ?? null
        })),
        neutralFallback: entry.usedNeutralFallback,
        policy: FAMILY.remainingGallery.materialPolicy
      },
      diagnostics: { edgesVisible: this.edgesVisible, boundsVisible: this.boundsVisible },
      statusRecommendation: { status: recommendation.status, reason: recommendation.reason },
      exclusions: BALLZ_TRACK_GALLERY_EVIDENCE.excludedAliases
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.group.removeFromParent();
    for (const entry of this.entries.values()) {
      entry.mesh.geometry.dispose();
      entry.edgeOverlay.geometry.dispose();
      entry.edgeOverlay.material.dispose();
      for (const material of entry.sourceMaterials) material.dispose();
      for (const material of entry.diagnosticMaterials) material.dispose();
      entry.boundsHelper.dispose();
    }
    for (const texture of this.textures.values()) texture.dispose();
    this.entries.clear();
    this.textures.clear();
  }
}
