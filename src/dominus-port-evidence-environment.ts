import {
  AmbientLight,
  Box3,
  BoxGeometry,
  BoxHelper,
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  GridHelper,
  Group,
  LoadingManager,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshPhongMaterial,
  PerspectiveCamera,
  PointLight,
  RepeatWrapping,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  Vector3
} from "three";
import assetManifestJson from "./legacy/dominus-asset-gallery.json";
import familyAuditJson from "./legacy/dominus-family-audit.json";

type Tuple3 = [number, number, number];
type LoadStatus = "loading" | "ready" | "error" | "disposed";
export type DominusPortViewMode = "source-grid" | "selected-asset";

type Bounds = { min: Tuple3; max: Tuple3; size: Tuple3 };
type ManifestAsset = {
  id: string;
  name: string;
  family: string;
  status: "recovered-text-x" | "unsupported-binary-x";
  source: string;
  sha256: string;
  payloadUrl: string | null;
  bounds: Bounds | null;
  vertexCount: number;
  triangleCount: number;
  materialGroupCount: number;
};
type AssetManifest = {
  assets: ManifestAsset[];
  textureRecords: Array<{ url: string; runtimeColorKey: "magenta" | null }>;
};
type AuditPlacement = {
  name: string;
  position: Tuple3;
  rotation: Tuple3;
  scale: Tuple3;
};
type FamilyAudit = {
  references: {
    sourceCodeHits: unknown[];
    authoredSceneDocumentsExcludingObjectLibrary: unknown[];
    objectLibraryLogicalCopyCount: number;
    objectLibraryCopyHashes: Array<{ path: string; bytes: number; sha256: string }>;
  };
  objectLibraryExclusion: {
    source: string;
    totalRecords: number;
    dominusBasenameMatches: number;
    portRows: number;
    allPortRowsHaveZeroRotation: boolean;
    allPortRowsUseScale001: boolean;
    allPortRowsSitAtY0OnFiveUnitXZGrid: boolean;
    authoredHostFieldsPresent: Record<string, boolean>;
    portPlacements: AuditPlacement[];
    conclusion: string;
  };
  absentEvidence: string[];
};
type PayloadMaterial = {
  name: string;
  color: [number, number, number, number];
  specularPower: number;
  specular: Tuple3;
  emissive: Tuple3;
  textureUrl: string | null;
};
type PayloadMesh = {
  name: string;
  positions: number[];
  uvs: number[] | null;
  indices: number[];
  groups: Array<{ start: number; count: number; materialIndex: number }>;
  materials: PayloadMaterial[];
};
type AssetPayload = {
  sha256: string;
  meshes: PayloadMesh[];
};

export type DominusPortPlacementState = {
  index: number;
  id: string;
  sourceName: string;
  status: ManifestAsset["status"];
  sourcePosition: Tuple3;
  sourceRotation: Tuple3;
  sourceScale: Tuple3;
  displayPosition: Tuple3;
  vertices: number;
  triangles: number;
  materialGroups: number;
  selected: boolean;
  visible: boolean;
};

export type DominusPortEvidenceState = {
  id: "dominus-port-evidence";
  classification: "exact ObjectLibrary port-subset evidence view";
  recoveryStatus: "PARTIAL";
  ready: boolean;
  loadStatus: LoadStatus;
  loadError: string | null;
  disposed: boolean;
  sourceDocument: string;
  sourceDocumentSha256: string;
  sourceDocumentBytes: number;
  sourceDocumentLogicalCopies: number;
  sourceRecordCount: 61;
  dominusRecordCount: 41;
  portPlacementCount: 28;
  decodedPlacementCount: 27;
  unsupportedPlacementCount: 1;
  sourceVertexCount: 23594;
  sourceTriangleCount: 13860;
  sourceMaterialGroupCount: 126;
  viewMode: DominusPortViewMode;
  selectedId: string;
  selectedIndex: number;
  selectedDecoded: boolean;
  selectedSourceBounds: Bounds | null;
  orbitAngleRadians: number;
  zoom: number;
  cameraPosition: Tuple3;
  lookAt: Tuple3;
  coordinateSystem: string;
  presentationAdapters: string[];
  exactEvidence: string[];
  absentEvidence: string[];
  conclusion: string;
  placements: DominusPortPlacementState[];
};

export type DominusPortEvidenceOptions = { loadingManager?: LoadingManager };

const MANIFEST = assetManifestJson as unknown as AssetManifest;
const AUDIT = familyAuditJson as unknown as FamilyAudit;
const SOURCE_HASH = AUDIT.references.objectLibraryCopyHashes[0];
const PORT_ASSETS = MANIFEST.assets.filter((asset) => asset.family === "port");
const ASSETS_BY_ID = new Map(PORT_ASSETS.map((asset) => [asset.id, asset]));
const COLOR_KEY_URLS = new Set(MANIFEST.textureRecords.filter((record) => record.runtimeColorKey === "magenta").map((record) => record.url));
const OVERVIEW_TARGET = new Vector3(-45, 2.8, -15);

function placementId(name: string): string {
  return name.toLowerCase();
}

function colorHex(values: number[], fallback: number): number {
  if (!values.slice(0, 3).every(Number.isFinite)) return fallback;
  const channels = values.slice(0, 3).map((value) => Math.round(MathUtils.clamp(value, 0, 1) * 255));
  return (channels[0] << 16) | (channels[1] << 8) | channels[2];
}

function applyMagentaColorKey(material: MeshPhongMaterial): void {
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <map_fragment>",
      "#include <map_fragment>\nif (diffuseColor.r > 0.30 && diffuseColor.b > 0.30 && min(diffuseColor.r, diffuseColor.b) - diffuseColor.g > 0.18) discard;"
    );
  };
  material.customProgramCacheKey = () => "dominus-port-evidence-magenta-color-key-v1";
}

/**
 * Renders the only surviving multi-asset Dominus placement evidence: the 28
 * port rows inside ObjectLibrary.xml. This is an editor catalog grid, not a
 * recovered village, and the structured state keeps that distinction explicit.
 */
export class DominusPortEvidenceEnvironment {
  readonly group = new Group();
  readonly ready: Promise<void>;

  private readonly textureLoader: TextureLoader;
  private readonly content = new Group();
  private readonly assetGroups = new Map<string, Group>();
  private readonly textureCache = new Map<string, Texture>();
  private readonly texturePromises = new Map<string, Promise<Texture>>();
  private readonly geometries: BufferGeometry[] = [];
  private readonly materials: Array<MeshPhongMaterial | MeshBasicMaterial> = [];
  private readonly cameraPosition = new Vector3();
  private readonly cameraTarget = new Vector3().copy(OVERVIEW_TARGET);
  private selectionHelper: BoxHelper | null = null;
  private loadStatus: LoadStatus = "loading";
  private loadError: string | null = null;
  private selectedId = "port_const1";
  private viewMode: DominusPortViewMode = "source-grid";
  private orbitAngle = MathUtils.degToRad(34);
  private zoom = 1;
  private disposed = false;

  constructor(options: DominusPortEvidenceOptions = {}) {
    this.textureLoader = new TextureLoader(options.loadingManager);
    this.group.name = "Dominus port ObjectLibrary evidence — exact catalog grid, not an authored village";
    this.group.userData.archiveEvidence = {
      source: AUDIT.objectLibraryExclusion.source,
      classification: "editor object-library grid",
      authoredVillage: false
    };
    this.content.name = "28 exact ObjectLibrary port rows";
    this.group.add(this.content);

    const grid = new GridHelper(60, 12, 0x7f6a42, 0x263642);
    grid.name = "inspection-only five-unit catalog grid";
    grid.position.set(-45, -0.02, -15);
    this.group.add(grid);

    const ambient = new AmbientLight(0xb8cad6, 1.05);
    ambient.name = "inspection-only ambient light";
    this.group.add(ambient);
    const key = new PointLight(0xffe9c5, 360, 120, 1.35);
    key.position.set(-30, 34, 6);
    key.name = "inspection-only key light";
    this.group.add(key);
    const fill = new PointLight(0x79b5dc, 240, 120, 1.5);
    fill.position.set(-69, 17, -38);
    fill.name = "inspection-only fill light";
    this.group.add(fill);

    this.updateCameraPosition();
    this.ready = this.loadAll();
  }

  update(deltaSeconds: number, orbitInput = 0, camera?: PerspectiveCamera): DominusPortEvidenceState {
    if (!this.disposed && Number.isFinite(deltaSeconds) && Number.isFinite(orbitInput)) {
      this.orbitAngle = MathUtils.euclideanModulo(
        this.orbitAngle + MathUtils.clamp(orbitInput, -1, 1) * Math.max(0, deltaSeconds) * 0.5,
        Math.PI * 2
      );
      this.updateCameraPosition();
    }
    if (camera) this.applyToCamera(camera);
    return this.getState();
  }

  orbitByRadians(delta: number, camera?: PerspectiveCamera): void {
    if (!Number.isFinite(delta)) return;
    this.orbitAngle = MathUtils.euclideanModulo(this.orbitAngle + delta, Math.PI * 2);
    this.updateCameraPosition();
    if (camera) this.applyToCamera(camera);
  }

  zoomBy(factor: number, camera?: PerspectiveCamera): void {
    if (!Number.isFinite(factor) || factor <= 0) return;
    this.zoom = MathUtils.clamp(this.zoom * factor, 0.42, 2.3);
    this.updateCameraPosition();
    if (camera) this.applyToCamera(camera);
  }

  selectById(id: string, focus = true, camera?: PerspectiveCamera): boolean {
    const normalized = placementId(id);
    if (!ASSETS_BY_ID.has(normalized)) return false;
    this.selectedId = normalized;
    this.viewMode = focus ? "selected-asset" : this.viewMode;
    this.updateAssetVisibility();
    this.updateSelectionHelper();
    this.updateCameraTarget();
    this.updateCameraPosition();
    if (camera) this.applyToCamera(camera);
    return true;
  }

  selectNext(direction = 1, camera?: PerspectiveCamera): boolean {
    const current = AUDIT.objectLibraryExclusion.portPlacements.findIndex((placement) => placementId(placement.name) === this.selectedId);
    const index = MathUtils.euclideanModulo((current < 0 ? 0 : current) + Math.sign(direction || 1), AUDIT.objectLibraryExclusion.portPlacements.length);
    return this.selectById(AUDIT.objectLibraryExclusion.portPlacements[index].name, true, camera);
  }

  selectFromObject(object: { parent: unknown; userData: Record<string, unknown> }, camera?: PerspectiveCamera): boolean {
    let cursor: { parent: unknown; userData: Record<string, unknown> } | null = object;
    while (cursor) {
      const id = cursor.userData.dominusPortAssetId;
      if (typeof id === "string") return this.selectById(id, true, camera);
      cursor = cursor.parent && typeof cursor.parent === "object"
        ? cursor.parent as { parent: unknown; userData: Record<string, unknown> }
        : null;
    }
    return false;
  }

  showSourceGrid(camera?: PerspectiveCamera): void {
    this.viewMode = "source-grid";
    this.updateAssetVisibility();
    this.updateCameraTarget();
    this.updateCameraPosition();
    if (camera) this.applyToCamera(camera);
  }

  reset(camera?: PerspectiveCamera): void {
    this.selectedId = "port_const1";
    this.viewMode = "source-grid";
    this.orbitAngle = MathUtils.degToRad(34);
    this.zoom = 1;
    this.updateAssetVisibility();
    this.updateSelectionHelper();
    this.updateCameraTarget();
    this.updateCameraPosition();
    if (camera) this.applyToCamera(camera);
  }

  applyToCamera(camera: PerspectiveCamera): void {
    camera.position.copy(this.cameraPosition);
    camera.lookAt(this.cameraTarget);
    camera.near = 0.05;
    camera.far = 240;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  }

  getState(): DominusPortEvidenceState {
    const placements = AUDIT.objectLibraryExclusion.portPlacements.map((placement, index): DominusPortPlacementState => {
      const id = placementId(placement.name);
      const asset = ASSETS_BY_ID.get(id);
      if (!asset) throw new Error(`Dominus port audit placement ${placement.name} has no asset manifest entry.`);
      return {
        index,
        id,
        sourceName: placement.name,
        status: asset.status,
        sourcePosition: placement.position,
        sourceRotation: placement.rotation,
        sourceScale: placement.scale,
        displayPosition: [placement.position[0], placement.position[1], -placement.position[2]],
        vertices: asset.vertexCount,
        triangles: asset.triangleCount,
        materialGroups: asset.materialGroupCount,
        selected: id === this.selectedId,
        visible: this.viewMode === "source-grid" || id === this.selectedId
      };
    });
    const selectedIndex = placements.findIndex((placement) => placement.id === this.selectedId);
    const selected = ASSETS_BY_ID.get(this.selectedId)!;
    return {
      id: "dominus-port-evidence",
      classification: "exact ObjectLibrary port-subset evidence view",
      recoveryStatus: "PARTIAL",
      ready: this.loadStatus === "ready",
      loadStatus: this.loadStatus,
      loadError: this.loadError,
      disposed: this.disposed,
      sourceDocument: AUDIT.objectLibraryExclusion.source,
      sourceDocumentSha256: SOURCE_HASH.sha256,
      sourceDocumentBytes: SOURCE_HASH.bytes,
      sourceDocumentLogicalCopies: AUDIT.references.objectLibraryLogicalCopyCount,
      sourceRecordCount: 61,
      dominusRecordCount: 41,
      portPlacementCount: 28,
      decodedPlacementCount: 27,
      unsupportedPlacementCount: 1,
      sourceVertexCount: 23594,
      sourceTriangleCount: 13860,
      sourceMaterialGroupCount: 126,
      viewMode: this.viewMode,
      selectedId: this.selectedId,
      selectedIndex,
      selectedDecoded: selected.status === "recovered-text-x",
      selectedSourceBounds: selected.bounds,
      orbitAngleRadians: this.orbitAngle,
      zoom: this.zoom,
      cameraPosition: this.cameraPosition.toArray(),
      lookAt: this.cameraTarget.toArray(),
      coordinateSystem: "ObjectLibrary source X/Y/Z is preserved in state; display mirrors source +Z to web -Z and applies each exact 0.01 scale without centering its local mesh.",
      presentationAdapters: [
        "neutral WebGL background",
        "inspection-only lights",
        "five-unit grid aligned to the serialized thumbnail spacing",
        "selection outline and orbit/focus camera; focus isolates the selected thumbnail because many source-local bounds overlap at catalog spacing",
        "amber box for the undecoded binary port_crateshed.X record"
      ],
      exactEvidence: [
        "all 28 port record names and ordering",
        "all serialized positions, zero rotations, 0.01 scales and enabled records",
        "27 decoded DirectX text-X local meshes with exact material groups and surviving textures",
        "one explicit unsupported binary-X boundary at port_crateshed",
        "the single logical ObjectLibrary.xml document hash"
      ],
      absentEvidence: AUDIT.absentEvidence,
      conclusion: AUDIT.objectLibraryExclusion.conclusion,
      placements
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.loadStatus = "disposed";
    this.selectionHelper?.removeFromParent();
    this.selectionHelper?.geometry.dispose();
    this.selectionHelper?.material.dispose();
    this.selectionHelper = null;
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
    for (const texture of this.textureCache.values()) texture.dispose();
    this.textureCache.clear();
    this.texturePromises.clear();
    this.group.removeFromParent();
    this.group.clear();
  }

  private async loadAll(): Promise<void> {
    try {
      await Promise.all(AUDIT.objectLibraryExclusion.portPlacements.map((placement) => this.buildPlacement(placement)));
      if (this.disposed) return;
      this.loadStatus = "ready";
      this.updateAssetVisibility();
      this.updateSelectionHelper();
    } catch (error) {
      if (this.disposed) return;
      this.loadStatus = "error";
      this.loadError = error instanceof Error ? error.message : String(error);
    }
  }

  private async buildPlacement(placement: AuditPlacement): Promise<void> {
    const id = placementId(placement.name);
    const asset = ASSETS_BY_ID.get(id);
    if (!asset) throw new Error(`${placement.name}: no exact gallery manifest record`);
    const wrapper = new Group();
    wrapper.name = `${placement.name} exact ObjectLibrary record`;
    wrapper.userData.dominusPortAssetId = id;
    wrapper.position.set(placement.position[0], placement.position[1], -placement.position[2]);
    wrapper.rotation.set(placement.rotation[0], -placement.rotation[1], placement.rotation[2]);
    wrapper.scale.set(placement.scale[0], placement.scale[1], -placement.scale[2]);
    this.assetGroups.set(id, wrapper);
    this.content.add(wrapper);

    if (asset.status === "unsupported-binary-x") {
      const geometry = new BoxGeometry(105, 105, 105);
      geometry.name = "port_crateshed binary-X undecoded marker";
      const material = new MeshBasicMaterial({ color: 0xe3aa42, wireframe: true, transparent: true, opacity: 0.92 });
      material.name = "unsupported binary-X evidence marker";
      const marker = new Mesh(geometry, material);
      marker.name = "port_crateshed unsupported binary-X marker — no proxy geometry";
      marker.userData.dominusPortAssetId = id;
      wrapper.add(marker);
      this.geometries.push(geometry);
      this.materials.push(material);
      return;
    }

    if (!asset.payloadUrl) throw new Error(`${asset.name}: decoded payload URL missing`);
    const response = await fetch(asset.payloadUrl);
    if (!response.ok) throw new Error(`${asset.name}: payload HTTP ${response.status}`);
    const payload = await response.json() as AssetPayload;
    if (payload.sha256 !== asset.sha256) throw new Error(`${asset.name}: payload/source hash mismatch`);
    const textureUrls = [...new Set(payload.meshes.flatMap((mesh) => mesh.materials.map((material) => material.textureUrl).filter((url): url is string => Boolean(url))))];
    await Promise.all(textureUrls.map((url) => this.loadTexture(url)));

    for (const sourceMesh of payload.meshes) {
      const geometry = new BufferGeometry();
      geometry.name = `${asset.name}/${sourceMesh.name} exact DirectX local geometry`;
      geometry.setAttribute("position", new Float32BufferAttribute(sourceMesh.positions, 3));
      if (sourceMesh.uvs) geometry.setAttribute("uv", new Float32BufferAttribute(sourceMesh.uvs, 2));
      geometry.setIndex(sourceMesh.indices);
      for (const group of sourceMesh.groups) geometry.addGroup(group.start, group.count, group.materialIndex);
      geometry.computeVertexNormals();
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      this.geometries.push(geometry);

      const materials = sourceMesh.materials.map((sourceMaterial) => {
        const material = new MeshPhongMaterial({
          name: `${asset.name}/${sourceMesh.name}/${sourceMaterial.name}`,
          color: sourceMaterial.textureUrl ? 0xffffff : colorHex(sourceMaterial.color, 0xb8c1c9),
          specular: colorHex(sourceMaterial.specular, 0x111111),
          emissive: colorHex(sourceMaterial.emissive, 0x000000),
          shininess: MathUtils.clamp(sourceMaterial.specularPower, 0, 100),
          side: DoubleSide,
          transparent: Boolean(sourceMaterial.textureUrl?.endsWith(".png")),
          alphaTest: sourceMaterial.textureUrl?.endsWith(".png") ? 0.04 : 0
        });
        if (sourceMaterial.textureUrl) material.map = this.textureCache.get(sourceMaterial.textureUrl) ?? null;
        if (sourceMaterial.textureUrl && COLOR_KEY_URLS.has(sourceMaterial.textureUrl)) applyMagentaColorKey(material);
        this.materials.push(material);
        return material;
      });
      const mesh = new Mesh(geometry, materials);
      mesh.name = `${asset.name}/${sourceMesh.name} exact source mesh`;
      mesh.userData.dominusPortAssetId = id;
      wrapper.add(mesh);
    }
  }

  private loadTexture(url: string): Promise<Texture> {
    const existing = this.textureCache.get(url);
    if (existing) return Promise.resolve(existing);
    const pending = this.texturePromises.get(url);
    if (pending) return pending;
    const promise = this.textureLoader.loadAsync(url).then((texture) => {
      texture.colorSpace = SRGBColorSpace;
      texture.wrapS = RepeatWrapping;
      texture.wrapT = RepeatWrapping;
      this.textureCache.set(url, texture);
      this.texturePromises.delete(url);
      return texture;
    });
    this.texturePromises.set(url, promise);
    return promise;
  }

  private updateSelectionHelper(): void {
    this.selectionHelper?.removeFromParent();
    this.selectionHelper?.geometry.dispose();
    this.selectionHelper?.material.dispose();
    this.selectionHelper = null;
    const selected = this.assetGroups.get(this.selectedId);
    if (!selected || !selected.children.length) return;
    this.selectionHelper = new BoxHelper(selected, new Color(0x6ce5ff));
    this.selectionHelper.name = "inspection-only selected source record outline";
    this.group.add(this.selectionHelper);
  }

  private updateAssetVisibility(): void {
    for (const [id, group] of this.assetGroups) group.visible = this.viewMode === "source-grid" || id === this.selectedId;
  }

  private updateCameraTarget(): void {
    if (this.viewMode === "source-grid") {
      this.cameraTarget.copy(OVERVIEW_TARGET);
      return;
    }
    const selected = this.assetGroups.get(this.selectedId);
    if (!selected || !selected.children.length) {
      this.cameraTarget.copy(OVERVIEW_TARGET);
      return;
    }
    new Box3().setFromObject(selected).getCenter(this.cameraTarget);
  }

  private updateCameraPosition(): void {
    let radius = 48;
    let height = 26;
    if (this.viewMode === "selected-asset") {
      const selected = this.assetGroups.get(this.selectedId);
      const size = selected && selected.children.length ? new Box3().setFromObject(selected).getSize(new Vector3()) : new Vector3(5, 5, 5);
      radius = MathUtils.clamp(Math.max(size.x, size.y, size.z) * 1.65, 6, 26);
      height = MathUtils.clamp(radius * 0.46, 3.2, 12);
    }
    radius *= this.zoom;
    height *= this.zoom;
    this.cameraPosition.set(
      this.cameraTarget.x + Math.sin(this.orbitAngle) * radius,
      this.cameraTarget.y + height,
      this.cameraTarget.z + Math.cos(this.orbitAngle) * radius
    );
  }
}

export async function createDominusPortEvidenceEnvironment(options: DominusPortEvidenceOptions = {}): Promise<DominusPortEvidenceEnvironment> {
  const environment = new DominusPortEvidenceEnvironment(options);
  await environment.ready;
  return environment;
}
