import {
  AmbientLight,
  BufferGeometry,
  CanvasTexture,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  LoadingManager,
  MathUtils,
  Mesh,
  MeshPhongMaterial,
  PerspectiveCamera,
  PointLight,
  RepeatWrapping,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  Vector3
} from "three";
import manifestJson from "./legacy/dominus-asset-gallery.json";

type Tuple3 = [number, number, number];
type LoadStatus = "loading" | "ready" | "error" | "disposed";
export type DominusAssetFamily = "all" | "bush" | "camp" | "character" | "grass" | "port" | "weapon" | "tree";
export type DominusAssetStatusFilter = "all" | "recovered" | "unsupported";

type Bounds = { min: Tuple3; max: Tuple3; size: Tuple3 };
type ManifestAsset = {
  index: number;
  id: string;
  name: string;
  family: Exclude<DominusAssetFamily, "all">;
  status: "recovered-text-x" | "unsupported-binary-x";
  format: string;
  source: string;
  bytes: number;
  sha256: string;
  textureReferences: string[];
  payloadUrl: string | null;
  payloadBytes: number;
  payloadSha256: string | null;
  bounds: Bounds | null;
  meshCount: number;
  vertexCount: number;
  faceCount: number;
  triangleCount: number;
  materialGroupCount: number;
};
type TextureRecord = {
  url: string;
  runtimeColorKey: "magenta" | null;
  exactMagentaPixelRatio: number;
};
type Manifest = {
  id: "dominus-asset-gallery";
  classification: string;
  sourceAudit: { path: string; id: string; canonicalRoot: string };
  evidenceBoundary: { exact: string[]; inspectionOnly: string[]; absent: string[] };
  familyCounts: Record<Exclude<DominusAssetFamily, "all">, number>;
  recoveryCounts: { "recovered-text-x": number; "unsupported-binary-x": number };
  textureRecords: TextureRecord[];
  assets: ManifestAsset[];
};
type PayloadMaterial = {
  name: string;
  color: [number, number, number, number];
  specularPower: number;
  specular: Tuple3;
  emissive: Tuple3;
  textureName: string | null;
  textureUrl: string | null;
};
type PayloadMesh = {
  name: string;
  vertexCount: number;
  faceCount: number;
  triangleCount: number;
  positions: number[];
  uvs: number[] | null;
  indices: number[];
  groups: Array<{ start: number; count: number; materialIndex: number }>;
  materials: PayloadMaterial[];
};
type AssetPayload = {
  source: string;
  sha256: string;
  bounds: Bounds;
  meshCount: number;
  vertexCount: number;
  faceCount: number;
  triangleCount: number;
  materialGroupCount: number;
  normals: string;
  meshes: PayloadMesh[];
};

export type DominusAssetGalleryOptions = { loadingManager?: LoadingManager };
export type DominusAssetListState = {
  index: number;
  id: string;
  name: string;
  family: Exclude<DominusAssetFamily, "all">;
  status: ManifestAsset["status"];
  vertices: number;
  triangles: number;
  materialGroups: number;
  matchesFilter: boolean;
  selected: boolean;
};
export type DominusAssetGalleryState = {
  id: "dominus-asset-gallery";
  classification: string;
  ready: boolean;
  loadStatus: LoadStatus;
  loadError: string | null;
  disposed: boolean;
  assetCount: 65;
  recoveredCount: 63;
  unsupportedCount: 2;
  familyCounts: Manifest["familyCounts"];
  familyFilter: DominusAssetFamily;
  statusFilter: DominusAssetStatusFilter;
  matchingCount: number;
  selectedIndex: number;
  selectedId: string;
  selectedName: string;
  selectedFamily: Exclude<DominusAssetFamily, "all">;
  selectedStatus: ManifestAsset["status"];
  selectedSource: string;
  selectedSha256: string;
  sourceFormat: string;
  sourceBounds: Bounds | null;
  sourceMeshCount: number;
  sourceVertexCount: number;
  sourceTriangleCount: number;
  sourceMaterialGroupCount: number;
  textureReferences: string[];
  renderedGeometry: boolean;
  inspectionMarkerOnly: boolean;
  displayNormalization: { inspectionOnly: true; sourceCenter: Tuple3 | null; uniformScale: number; handedness: "source +Z displayed as web -Z" };
  orbitAngleRadians: number;
  zoom: number;
  cameraPosition: Tuple3;
  lookAt: Tuple3;
  coordinateSystem: string;
  assets: DominusAssetListState[];
  evidence: Manifest["evidenceBoundary"];
};

const DATA = manifestJson as unknown as Manifest;
const COLOR_KEY_URLS = new Set(DATA.textureRecords.filter((record) => record.runtimeColorKey === "magenta").map((record) => record.url));
const CAMERA_TARGET = new Vector3(0, 0, 0);

function statusGroup(status: ManifestAsset["status"]): Exclude<DominusAssetStatusFilter, "all"> {
  return status === "recovered-text-x" ? "recovered" : "unsupported";
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
  material.customProgramCacheKey = () => "dominus-gallery-exact-magenta-color-key-v1";
}

function createBinaryLabel(name: string): { group: Group; geometryTexture: CanvasTexture; material: SpriteMaterial } {
  const canvas = document.createElement("canvas");
  canvas.width = 768;
  canvas.height = 220;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("2D canvas is required for the binary asset label.");
  context.fillStyle = "rgba(8, 13, 21, .94)";
  context.strokeStyle = "#e3aa42";
  context.lineWidth = 8;
  context.beginPath();
  context.roundRect(6, 6, 756, 208, 26);
  context.fill();
  context.stroke();
  context.fillStyle = "#e3aa42";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = "800 38px ui-monospace, Consolas, monospace";
  context.fillText("BINARY DIRECTX X", 384, 82);
  context.fillStyle = "#e9edf2";
  context.font = "700 31px ui-monospace, Consolas, monospace";
  context.fillText(name, 384, 145, 700);
  context.fillStyle = "#879baa";
  context.font = "500 21px ui-monospace, Consolas, monospace";
  context.fillText("preserved · not decoded · no proxy", 384, 187);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const material = new SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false });
  const sprite = new Sprite(material);
  sprite.scale.set(10.5, 3, 1);
  const group = new Group();
  group.name = `${name} unsupported binary inspection label`;
  group.add(sprite);
  return { group, geometryTexture: texture, material };
}

/** A one-model-at-a-time browser for the audited Dominus source asset family. */
export class DominusAssetGalleryEnvironment {
  readonly group = new Group();
  readonly ready: Promise<void>;

  private readonly textureLoader: TextureLoader;
  private readonly stage = new Group();
  private readonly textureCache = new Map<string, Texture>();
  private readonly cameraPosition = new Vector3();
  private readonly currentGeometries: BufferGeometry[] = [];
  private readonly currentMaterials: Array<MeshPhongMaterial | SpriteMaterial> = [];
  private readonly currentLabelTextures: CanvasTexture[] = [];
  private familyFilter: DominusAssetFamily = "all";
  private statusFilter: DominusAssetStatusFilter = "all";
  private selectedIndex = 0;
  private loadStatus: LoadStatus = "loading";
  private loadError: string | null = null;
  private displayScale = 1;
  private sourceCenter: Tuple3 | null = null;
  private orbitAngle = MathUtils.degToRad(28);
  private zoom = 1;
  private requestSerial = 0;
  private disposed = false;
  private renderedGeometry = false;
  private markerOnly = false;

  constructor(options: DominusAssetGalleryOptions = {}) {
    this.textureLoader = new TextureLoader(options.loadingManager);
    this.group.name = "Dominus source asset gallery — no authored composition";
    this.group.userData.archiveEvidence = DATA.evidenceBoundary;
    this.stage.name = "single selected asset inspection stage";
    this.group.add(this.stage);
    const ambient = new AmbientLight(0xc3d2df, 0.72);
    ambient.name = "Dominus gallery ambient light (inspection only)";
    this.group.add(ambient);
    const key = new PointLight(0xfff4e8, 105, 80, 1.25);
    key.position.set(7, 11, 9);
    key.name = "Dominus gallery key light (inspection only)";
    this.group.add(key);
    const rim = new PointLight(0x73a7d4, 46, 70, 1.4);
    rim.position.set(-9, 5, -8);
    rim.name = "Dominus gallery rim light (inspection only)";
    this.group.add(rim);
    this.updateCameraPosition();
    this.ready = this.selectIndex(0).then(() => undefined);
  }

  update(deltaSeconds: number, orbitInput = 0, camera?: PerspectiveCamera): DominusAssetGalleryState {
    if (!this.disposed && Number.isFinite(deltaSeconds) && Number.isFinite(orbitInput)) {
      this.orbitAngle = MathUtils.euclideanModulo(
        this.orbitAngle + MathUtils.clamp(orbitInput, -1, 1) * Math.max(0, deltaSeconds) * 0.72,
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
    this.zoom = MathUtils.clamp(this.zoom * factor, 0.5, 2.15);
    this.updateCameraPosition();
    if (camera) this.applyToCamera(camera);
  }

  async setFamilyFilter(filter: DominusAssetFamily, camera?: PerspectiveCamera): Promise<boolean> {
    if (!(filter === "all" || Object.hasOwn(DATA.familyCounts, filter))) return false;
    this.familyFilter = filter;
    if (!DATA.assets.some((asset) => this.matches(asset))) this.statusFilter = "all";
    const selected = DATA.assets[this.selectedIndex];
    if (!this.matches(selected)) await this.selectIndex(DATA.assets.find((asset) => this.matches(asset))?.index ?? 0);
    if (camera) this.applyToCamera(camera);
    return true;
  }

  async setStatusFilter(filter: DominusAssetStatusFilter, camera?: PerspectiveCamera): Promise<boolean> {
    if (!(filter === "all" || filter === "recovered" || filter === "unsupported")) return false;
    this.statusFilter = filter;
    if (!DATA.assets.some((asset) => this.matches(asset))) this.familyFilter = "all";
    const selected = DATA.assets[this.selectedIndex];
    if (!this.matches(selected)) await this.selectIndex(DATA.assets.find((asset) => this.matches(asset))?.index ?? 0);
    if (camera) this.applyToCamera(camera);
    return true;
  }

  async selectById(id: string): Promise<boolean> {
    const asset = DATA.assets.find((candidate) => candidate.id === id);
    return asset ? this.selectIndex(asset.index) : false;
  }

  async selectIndex(index: number): Promise<boolean> {
    const asset = DATA.assets[index];
    if (!asset || !this.matches(asset) || this.disposed) return false;
    const request = ++this.requestSerial;
    this.selectedIndex = index;
    this.loadStatus = "loading";
    this.loadError = null;
    this.renderedGeometry = false;
    this.markerOnly = false;
    this.clearCurrent();
    try {
      if (asset.status === "unsupported-binary-x") {
        const label = createBinaryLabel(asset.name);
        this.stage.add(label.group);
        this.currentMaterials.push(label.material);
        this.currentLabelTextures.push(label.geometryTexture);
        this.markerOnly = true;
        this.displayScale = 1;
        this.sourceCenter = null;
      } else {
        if (!asset.payloadUrl) throw new Error(`${asset.name}: payload URL is absent`);
        const response = await fetch(asset.payloadUrl);
        if (!response.ok) throw new Error(`${asset.name}: payload HTTP ${response.status}`);
        const payload = await response.json() as AssetPayload;
        if (request !== this.requestSerial || this.disposed) return false;
        if (payload.sha256 !== asset.sha256) throw new Error(`${asset.name}: payload/source hash mismatch`);
        await this.buildPayload(asset, payload);
        if (request !== this.requestSerial || this.disposed) return false;
        this.renderedGeometry = true;
      }
      if (request === this.requestSerial && !this.disposed) this.loadStatus = "ready";
      return true;
    } catch (error) {
      if (request !== this.requestSerial || this.disposed) return false;
      this.loadStatus = "error";
      this.loadError = error instanceof Error ? error.message : String(error);
      return false;
    }
  }

  async selectNext(direction = 1): Promise<boolean> {
    const matching = DATA.assets.filter((asset) => this.matches(asset));
    if (!matching.length) return false;
    const current = matching.findIndex((asset) => asset.index === this.selectedIndex);
    const next = MathUtils.euclideanModulo((current < 0 ? 0 : current) + Math.sign(direction || 1), matching.length);
    return this.selectIndex(matching[next].index);
  }

  async reset(camera?: PerspectiveCamera): Promise<void> {
    this.familyFilter = "all";
    this.statusFilter = "all";
    this.orbitAngle = MathUtils.degToRad(28);
    this.zoom = 1;
    await this.selectIndex(0);
    this.updateCameraPosition();
    if (camera) this.applyToCamera(camera);
  }

  applyToCamera(camera: PerspectiveCamera): void {
    camera.position.copy(this.cameraPosition);
    camera.lookAt(CAMERA_TARGET);
    camera.near = 0.05;
    camera.far = 100;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  }

  getState(): DominusAssetGalleryState {
    const selected = DATA.assets[this.selectedIndex];
    const assets = DATA.assets.map((asset): DominusAssetListState => ({
      index: asset.index,
      id: asset.id,
      name: asset.name,
      family: asset.family,
      status: asset.status,
      vertices: asset.vertexCount,
      triangles: asset.triangleCount,
      materialGroups: asset.materialGroupCount,
      matchesFilter: this.matches(asset),
      selected: asset.index === this.selectedIndex
    }));
    return {
      id: "dominus-asset-gallery",
      classification: DATA.classification,
      ready: this.loadStatus === "ready",
      loadStatus: this.loadStatus,
      loadError: this.loadError,
      disposed: this.disposed,
      assetCount: 65,
      recoveredCount: 63,
      unsupportedCount: 2,
      familyCounts: DATA.familyCounts,
      familyFilter: this.familyFilter,
      statusFilter: this.statusFilter,
      matchingCount: assets.filter((asset) => asset.matchesFilter).length,
      selectedIndex: selected.index,
      selectedId: selected.id,
      selectedName: selected.name,
      selectedFamily: selected.family,
      selectedStatus: selected.status,
      selectedSource: selected.source,
      selectedSha256: selected.sha256,
      sourceFormat: selected.format,
      sourceBounds: selected.bounds,
      sourceMeshCount: selected.meshCount,
      sourceVertexCount: selected.vertexCount,
      sourceTriangleCount: selected.triangleCount,
      sourceMaterialGroupCount: selected.materialGroupCount,
      textureReferences: selected.textureReferences,
      renderedGeometry: this.renderedGeometry,
      inspectionMarkerOnly: this.markerOnly,
      displayNormalization: {
        inspectionOnly: true,
        sourceCenter: this.sourceCenter,
        uniformScale: this.displayScale,
        handedness: "source +Z displayed as web -Z"
      },
      orbitAngleRadians: this.orbitAngle,
      zoom: this.zoom,
      cameraPosition: this.cameraPosition.toArray(),
      lookAt: CAMERA_TARGET.toArray(),
      coordinateSystem: "Exact local DirectX model coordinates are centered and uniformly scaled for inspection; no inter-asset coordinate system survives.",
      assets,
      evidence: DATA.evidenceBoundary
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.requestSerial += 1;
    this.loadStatus = "disposed";
    this.clearCurrent();
    for (const texture of this.textureCache.values()) texture.dispose();
    this.textureCache.clear();
    this.group.removeFromParent();
    this.group.clear();
  }

  private matches(asset: ManifestAsset): boolean {
    return (this.familyFilter === "all" || asset.family === this.familyFilter)
      && (this.statusFilter === "all" || statusGroup(asset.status) === this.statusFilter);
  }

  private clearCurrent(): void {
    this.stage.clear();
    for (const geometry of this.currentGeometries) geometry.dispose();
    for (const material of this.currentMaterials) material.dispose();
    for (const texture of this.currentLabelTextures) texture.dispose();
    this.currentGeometries.length = 0;
    this.currentMaterials.length = 0;
    this.currentLabelTextures.length = 0;
  }

  private async loadTexture(url: string): Promise<Texture> {
    const existing = this.textureCache.get(url);
    if (existing) return existing;
    const texture = await this.textureLoader.loadAsync(url);
    texture.colorSpace = SRGBColorSpace;
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
    this.textureCache.set(url, texture);
    return texture;
  }

  private async buildPayload(asset: ManifestAsset, payload: AssetPayload): Promise<void> {
    const wrapper = new Group();
    wrapper.name = `${asset.name} derived single-asset inspection normalization`;
    const sourceContent = new Group();
    sourceContent.name = `${asset.name} exact local source geometry`;
    const textureUrls = [...new Set(payload.meshes.flatMap((mesh) => mesh.materials.map((material) => material.textureUrl).filter((url): url is string => Boolean(url))))];
    await Promise.all(textureUrls.map((url) => this.loadTexture(url)));
    for (const sourceMesh of payload.meshes) {
      const geometry = new BufferGeometry();
      geometry.name = `${asset.name}/${sourceMesh.name} exact DirectX text geometry`;
      geometry.setAttribute("position", new Float32BufferAttribute(sourceMesh.positions, 3));
      if (sourceMesh.uvs) geometry.setAttribute("uv", new Float32BufferAttribute(sourceMesh.uvs, 2));
      geometry.setIndex(sourceMesh.indices);
      for (const group of sourceMesh.groups) geometry.addGroup(group.start, group.count, group.materialIndex);
      geometry.computeVertexNormals();
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      this.currentGeometries.push(geometry);
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
        this.currentMaterials.push(material);
        return material;
      });
      const mesh = new Mesh(geometry, materials);
      mesh.name = `${asset.name}/${sourceMesh.name} source mesh`;
      sourceContent.add(mesh);
    }
    const center = payload.bounds.min.map((value, axis) => (value + payload.bounds.max[axis]) / 2) as Tuple3;
    const maximumSpan = Math.max(...payload.bounds.size, 0.0001);
    const uniformScale = 8.5 / maximumSpan;
    sourceContent.position.set(-center[0], -center[1], -center[2]);
    wrapper.scale.set(uniformScale, uniformScale, -uniformScale);
    wrapper.add(sourceContent);
    this.sourceCenter = center;
    this.displayScale = uniformScale;
    this.stage.add(wrapper);
  }

  private updateCameraPosition(): void {
    const radius = 13.2 * this.zoom;
    this.cameraPosition.set(Math.sin(this.orbitAngle) * radius, 4.4 * this.zoom, Math.cos(this.orbitAngle) * radius);
  }
}

export async function createDominusAssetGalleryEnvironment(options: DominusAssetGalleryOptions = {}): Promise<DominusAssetGalleryEnvironment> {
  const environment = new DominusAssetGalleryEnvironment(options);
  await environment.ready;
  return environment;
}
