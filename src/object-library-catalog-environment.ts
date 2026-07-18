import {
  AmbientLight,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  ConeGeometry,
  CylinderGeometry,
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
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  Vector3
} from "three";
import catalogJson from "./legacy/object-library-catalog.json";

type Tuple3 = [number, number, number];
type LoadStatus = "loading" | "ready" | "error" | "disposed";
export type ObjectLibraryFamily = "all" | "primitive" | "pipe" | "building" | "technology" | "aircraft" | "nature" | "camp" | "port";
export type ObjectLibraryStatusFilter = "all" | "recovered" | "missing" | "unsupported";

type CatalogResolution = { status: string; assetId?: string; reason?: string };
type ArchiveResolution = { status: string; source?: string; bytes?: number; sha256?: string; candidateCount?: number };
type CatalogObject = {
  index: number;
  type: number;
  action: string;
  name: string;
  enabled: boolean;
  mass: number;
  meshControlled: boolean;
  newtonMaterial: number;
  position: Tuple3;
  rotation: Tuple3;
  scale: Tuple3;
  pathToMesh: string;
  textureName: string;
  family: Exclude<ObjectLibraryFamily, "all">;
  archiveResolution: ArchiveResolution;
  catalogResolution: CatalogResolution;
};

type XMaterial = {
  name: string;
  color: [number, number, number, number];
  specularPower: number;
  specular: Tuple3;
  emissive: Tuple3;
  textureName: string | null;
  textureUrl: string | null;
};
type XMesh = {
  name: string;
  vertexCount: number;
  faceCount: number;
  triangleCount: number;
  positions: number[];
  uvs: number[] | null;
  indices: number[];
  groups: Array<{ start: number; count: number; materialIndex: number }>;
  materials: XMaterial[];
};
type XAsset = {
  source: string;
  sha256: string;
  vertexCount: number;
  triangleCount: number;
  materialGroupCount: number;
  meshes: XMesh[];
};
type TvmMaterial = {
  index: number;
  name: string;
  textureName: string | null;
  textureUrl: string | null;
  diffuse: [number, number, number, number];
};
type TvmAsset = {
  source: string;
  sha256: string;
  vertexCount: number;
  triangleCount: number;
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
  groups: Array<{ triangleStart: number; triangleCount: number; materialIndex: number }>;
  materials: TvmMaterial[];
};
type CatalogData = {
  sourceDocument: { source: string; sha256: string; classification: string; objectCount: number };
  evidenceBoundary: { exact: string[]; inspectionOnly: string[]; absent: string[] };
  familyCounts: Record<Exclude<ObjectLibraryFamily, "all">, number>;
  recoveryCounts: Record<string, number>;
  primitiveTextureUrl: string;
  textureRecords: Array<{ url: string; exactMagentaPixelRatio: number; runtimeColorKey: "magenta" | null }>;
  objects: CatalogObject[];
  assets: { x: Record<string, XAsset>; tvm: Record<string, TvmAsset> };
};

export type ObjectLibraryCatalogOptions = {
  loadingManager?: LoadingManager;
};

export type ObjectLibraryCatalogObjectState = {
  index: number;
  name: string;
  family: Exclude<ObjectLibraryFamily, "all">;
  action: string;
  sourcePosition: Tuple3;
  webPosition: Tuple3;
  rotationDegrees: Tuple3;
  scale: Tuple3;
  archiveResolution: string;
  catalogResolution: string;
  sourceAsset: string | null;
  recoveredGeometry: boolean;
  inspectionMarkerOnly: boolean;
  matchesFilter: boolean;
  visible: boolean;
  selected: boolean;
};

export type ObjectLibraryCatalogState = {
  id: "object-library-authored-catalog-grid";
  source: string;
  sourceSha256: string;
  classification: string;
  ready: boolean;
  loadStatus: LoadStatus;
  loadError: string | null;
  disposed: boolean;
  objectCount: 61;
  recoveredCount: 47;
  missingCount: 13;
  unsupportedCount: 1;
  renderedGeometryCount: number;
  inspectionMarkerCount: number;
  familyFilter: ObjectLibraryFamily;
  statusFilter: ObjectLibraryStatusFilter;
  matchingCount: number;
  selectedIndex: number;
  selectedName: string;
  orbitAngleRadians: number;
  zoom: number;
  cameraPosition: Tuple3;
  lookAt: Tuple3;
  physics: { metadataPreserved: true; simulated: false; reason: string };
  objects: ObjectLibraryCatalogObjectState[];
  evidence: CatalogData["evidenceBoundary"];
};

const DATA = catalogJson as unknown as CatalogData;
const CAMERA_UP = new Vector3(0, 1, 0);
const MAGENTA_COLOR_KEY_URLS = new Set(DATA.textureRecords.filter((record) => record.runtimeColorKey === "magenta").map((record) => record.url));

function statusGroup(status: string): Exclude<ObjectLibraryStatusFilter, "all"> {
  if (status.startsWith("recovered-")) return "recovered";
  if (status.startsWith("unsupported-")) return "unsupported";
  return "missing";
}

function colorHex(values: Tuple3 | [number, number, number, number], fallback = 0xb8c0ca): number {
  if (!values.slice(0, 3).every((value) => Number.isFinite(value))) return fallback;
  const channels = values.slice(0, 3).map((value) => Math.round(MathUtils.clamp(value, 0, 1) * 255));
  return (channels[0] << 16) | (channels[1] << 8) | channels[2];
}

function createXGeometry(mesh: XMesh): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.name = `${mesh.name} exact DirectX text geometry`;
  geometry.setAttribute("position", new Float32BufferAttribute(mesh.positions, 3));
  if (mesh.uvs) geometry.setAttribute("uv", new Float32BufferAttribute(mesh.uvs, 2));
  geometry.setIndex(mesh.indices);
  for (const group of mesh.groups) geometry.addGroup(group.start, group.count, group.materialIndex);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function createTvmGeometry(asset: TvmAsset): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.name = `${asset.source} exact TVM geometry`;
  geometry.setAttribute("position", new Float32BufferAttribute(asset.positions, 3));
  geometry.setAttribute("normal", new Float32BufferAttribute(asset.normals, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(asset.uvs, 2));
  geometry.setIndex(asset.indices);
  for (const group of asset.groups) geometry.addGroup(group.triangleStart * 3, group.triangleCount * 3, group.materialIndex);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function applyMagentaColorKey(material: MeshPhongMaterial): void {
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <map_fragment>",
      "#include <map_fragment>\nif (diffuseColor.r > 0.30 && diffuseColor.b > 0.30 && min(diffuseColor.r, diffuseColor.b) - diffuseColor.g > 0.18) discard;"
    );
  };
  material.customProgramCacheKey = () => "object-library-exact-magenta-color-key-v1";
}

function createInspectionLabel(text: string, kind: "missing" | "unsupported"): { sprite: Sprite; texture: CanvasTexture; material: SpriteMaterial } {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 112;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("2D canvas is required for catalog inspection labels.");
  const fill = kind === "unsupported" ? "#e3a934" : "#df625a";
  context.fillStyle = "rgba(7, 12, 19, .92)";
  context.strokeStyle = fill;
  context.lineWidth = 5;
  context.beginPath();
  context.roundRect(3, 3, 506, 106, 18);
  context.fill();
  context.stroke();
  context.fillStyle = fill;
  context.font = "700 25px ui-monospace, SFMono-Regular, Consolas, monospace";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(`${kind === "unsupported" ? "UNSUPPORTED" : "MISSING"} · ${text}`, 256, 56, 480);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const material = new SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false });
  const sprite = new Sprite(material);
  sprite.name = `${text} inspection-only ${kind} label`;
  sprite.position.y = 2.5;
  sprite.scale.set(8.2, 1.8, 1);
  sprite.renderOrder = 1000;
  return { sprite, texture, material };
}

/**
 * Evidence-bounded browser for the 61-entry ObjectLibrary.xml editor grid.
 * Recovered records receive exact serialized transforms; missing/binary records
 * receive labels only and never receive invented replacement models.
 */
export class ObjectLibraryCatalogEnvironment {
  readonly group = new Group();
  readonly ready: Promise<void>;

  private readonly textureLoader: TextureLoader;
  private readonly geometryGroups = new Map<number, Group>();
  private readonly markerGroups = new Map<number, Group>();
  private readonly geometries: BufferGeometry[] = [];
  private readonly materials: Array<MeshPhongMaterial | SpriteMaterial> = [];
  private readonly textures = new Set<Texture>();
  private readonly materialsByTextureUrl = new Map<string, MeshPhongMaterial[]>();
  private readonly primitiveMaterial: MeshPhongMaterial;
  private readonly cameraPosition = new Vector3();
  private readonly lookAt = new Vector3(-20, 6, -15);
  private familyFilter: ObjectLibraryFamily = "all";
  private statusFilter: ObjectLibraryStatusFilter = "all";
  private selectedIndex = 0;
  private orbitAngle = MathUtils.degToRad(24);
  private zoom = 1;
  private baseRadius = 108;
  private baseHeight = 52;
  private loadStatus: LoadStatus = "loading";
  private loadError: string | null = null;
  private disposed = false;

  constructor(options: ObjectLibraryCatalogOptions = {}) {
    this.textureLoader = new TextureLoader(options.loadingManager);
    this.group.name = "ObjectLibrary.xml exact authored catalog grid (not a village)";
    this.group.scale.z = -1;
    this.group.userData.archiveEvidence = DATA.evidenceBoundary;

    this.primitiveMaterial = this.ownMaterial(new MeshPhongMaterial({
      color: 0xffffff,
      shininess: 8,
      side: DoubleSide,
      name: "ObjectLibrary TwoWay primitive material"
    }));

    for (const object of DATA.objects) {
      const kind = statusGroup(object.catalogResolution.status);
      if (kind === "recovered") {
        const objectGroup = this.buildRecoveredObject(object);
        objectGroup.name = `${object.index}: ${object.name}`;
        objectGroup.position.set(...object.position);
        objectGroup.rotation.set(...object.rotation.map(MathUtils.degToRad) as Tuple3);
        objectGroup.scale.set(...object.scale);
        objectGroup.userData.catalogIndex = object.index;
        objectGroup.userData.archiveAction = object.action;
        this.geometryGroups.set(object.index, objectGroup);
        this.group.add(objectGroup);
      } else {
        const marker = new Group();
        marker.name = `${object.index}: ${object.name} inspection marker (no source geometry)`;
        marker.position.set(...object.position);
        const label = createInspectionLabel(object.name, kind);
        this.textures.add(label.texture);
        this.materials.push(label.material);
        marker.add(label.sprite);
        marker.userData.catalogIndex = object.index;
        marker.userData.inspectionOnly = true;
        this.markerGroups.set(object.index, marker);
        this.group.add(marker);
      }
    }

    // ObjectLibrary.xml contains no lighting. These are explicit inspection aids.
    const ambient = new AmbientLight(0xc5d2df, 1.55);
    ambient.name = "Catalog inspection ambient light (inferred)";
    this.group.add(ambient);
    const key = new PointLight(0xffdfb6, 620, 260, 1.2);
    key.position.set(-12, 72, 24);
    key.name = "Catalog inspection key light (inferred)";
    this.group.add(key);

    this.applyFilters(false);
    this.refitCamera();
    this.ready = this.loadTextures();
  }

  update(deltaSeconds: number, orbitInput = 0, camera?: PerspectiveCamera): ObjectLibraryCatalogState {
    if (!this.disposed && Number.isFinite(deltaSeconds) && Number.isFinite(orbitInput)) {
      this.orbitAngle = MathUtils.euclideanModulo(
        this.orbitAngle + MathUtils.clamp(orbitInput, -1, 1) * Math.max(0, deltaSeconds) * 0.68,
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
    this.zoom = MathUtils.clamp(this.zoom * factor, 0.42, 2.4);
    this.updateCameraPosition();
    if (camera) this.applyToCamera(camera);
  }

  setFamilyFilter(filter: ObjectLibraryFamily, camera?: PerspectiveCamera): boolean {
    if (!(filter === "all" || Object.hasOwn(DATA.familyCounts, filter))) return false;
    this.familyFilter = filter;
    this.applyFilters(true);
    this.refitCamera();
    if (camera) this.applyToCamera(camera);
    return true;
  }

  setStatusFilter(filter: ObjectLibraryStatusFilter, camera?: PerspectiveCamera): boolean {
    if (!(filter === "all" || filter === "recovered" || filter === "missing" || filter === "unsupported")) return false;
    this.statusFilter = filter;
    this.applyFilters(true);
    this.refitCamera();
    if (camera) this.applyToCamera(camera);
    return true;
  }

  selectIndex(index: number): boolean {
    const object = DATA.objects[index];
    if (!object || !this.matches(object)) return false;
    this.selectedIndex = index;
    return true;
  }

  selectNext(direction = 1): boolean {
    const matching = DATA.objects.filter((object) => this.matches(object));
    if (!matching.length) return false;
    const current = matching.findIndex((object) => object.index === this.selectedIndex);
    const next = MathUtils.euclideanModulo((current < 0 ? 0 : current) + Math.sign(direction || 1), matching.length);
    this.selectedIndex = matching[next].index;
    return true;
  }

  reset(camera?: PerspectiveCamera): void {
    this.familyFilter = "all";
    this.statusFilter = "all";
    this.selectedIndex = 0;
    this.orbitAngle = MathUtils.degToRad(24);
    this.zoom = 1;
    this.applyFilters(false);
    this.refitCamera();
    if (camera) this.applyToCamera(camera);
  }

  applyToCamera(camera: PerspectiveCamera): void {
    camera.up.copy(CAMERA_UP);
    camera.position.copy(this.cameraPosition);
    camera.lookAt(this.lookAt);
    camera.near = 0.08;
    camera.far = 520;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  }

  getState(): ObjectLibraryCatalogState {
    const objects = DATA.objects.map((object): ObjectLibraryCatalogObjectState => {
      const geometry = this.geometryGroups.get(object.index);
      const marker = this.markerGroups.get(object.index);
      const matchesFilter = this.matches(object);
      return {
        index: object.index,
        name: object.name,
        family: object.family,
        action: object.action,
        sourcePosition: object.position,
        webPosition: [object.position[0], object.position[1], -object.position[2]],
        rotationDegrees: object.rotation,
        scale: object.scale,
        archiveResolution: object.archiveResolution.status,
        catalogResolution: object.catalogResolution.status,
        sourceAsset: this.sourceAssetFor(object),
        recoveredGeometry: Boolean(geometry),
        inspectionMarkerOnly: Boolean(marker),
        matchesFilter,
        visible: Boolean((geometry ?? marker)?.visible),
        selected: object.index === this.selectedIndex
      };
    });
    const matching = objects.filter((object) => object.matchesFilter);
    return {
      id: "object-library-authored-catalog-grid",
      source: DATA.sourceDocument.source,
      sourceSha256: DATA.sourceDocument.sha256,
      classification: DATA.sourceDocument.classification,
      ready: this.loadStatus === "ready",
      loadStatus: this.loadStatus,
      loadError: this.loadError,
      disposed: this.disposed,
      objectCount: 61,
      recoveredCount: 47,
      missingCount: 13,
      unsupportedCount: 1,
      renderedGeometryCount: matching.filter((object) => object.recoveredGeometry).length,
      inspectionMarkerCount: matching.filter((object) => object.inspectionMarkerOnly).length,
      familyFilter: this.familyFilter,
      statusFilter: this.statusFilter,
      matchingCount: matching.length,
      selectedIndex: this.selectedIndex,
      selectedName: DATA.objects[this.selectedIndex]?.name ?? "",
      orbitAngleRadians: this.orbitAngle,
      zoom: this.zoom,
      cameraPosition: this.cameraPosition.toArray(),
      lookAt: this.lookAt.toArray(),
      physics: {
        metadataPreserved: true,
        simulated: false,
        reason: "ObjectLibrary.xml is an editor asset grid and contains no host gravity, timestep, collision ground or interaction rules."
      },
      objects,
      evidence: DATA.evidenceBoundary
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.loadStatus = "disposed";
    this.group.removeFromParent();
    this.group.clear();
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
    for (const texture of this.textures) texture.dispose();
    this.geometries.length = 0;
    this.materials.length = 0;
    this.textures.clear();
    this.geometryGroups.clear();
    this.markerGroups.clear();
    this.materialsByTextureUrl.clear();
  }

  private ownGeometry<T extends BufferGeometry>(geometry: T): T {
    this.geometries.push(geometry);
    return geometry;
  }

  private ownMaterial<T extends MeshPhongMaterial>(material: T): T {
    this.materials.push(material);
    return material;
  }

  private registerTextureMaterial(url: string | null, material: MeshPhongMaterial): void {
    if (!url) return;
    const registered = this.materialsByTextureUrl.get(url) ?? [];
    registered.push(material);
    this.materialsByTextureUrl.set(url, registered);
  }

  private buildRecoveredObject(object: CatalogObject): Group {
    const group = new Group();
    const status = object.catalogResolution.status;
    if (status === "recovered-procedural") {
      let geometry: BufferGeometry;
      if (object.action === "PHYSICSPHERE") geometry = new SphereGeometry(1, 24, 18);
      else if (object.action === "PHYSICSCYLINDER" || object.action === "PHYSICCYLINDER") geometry = new CylinderGeometry(1, 1, 1, 12, 1, false);
      else if (object.action === "PHYSICCONE") geometry = new ConeGeometry(1, 1, 12, 1, false);
      else geometry = new BoxGeometry(1, 1, 1);
      const mesh = new Mesh(this.ownGeometry(geometry), this.primitiveMaterial);
      if (object.action.includes("CYLINDER") || object.action === "PHYSICCONE") mesh.rotation.z = -Math.PI / 2;
      mesh.name = `${object.name} recovered procedural geometry`;
      group.add(mesh);
      return group;
    }

    if (status === "recovered-text-x") {
      const asset = DATA.assets.x[object.catalogResolution.assetId ?? ""];
      if (!asset) throw new Error(`${object.name}: recovered X asset payload is absent`);
      for (const sourceMesh of asset.meshes) {
        const materials = sourceMesh.materials.map((sourceMaterial) => {
          const alphaTexture = Boolean(sourceMaterial.textureUrl?.endsWith(".png"));
          const material = this.ownMaterial(new MeshPhongMaterial({
            name: `${object.name}/${sourceMesh.name}/${sourceMaterial.name}`,
            color: sourceMaterial.textureUrl ? 0xffffff : colorHex(sourceMaterial.color),
            specular: colorHex(sourceMaterial.specular, 0x111111),
            emissive: colorHex(sourceMaterial.emissive, 0x000000),
            shininess: MathUtils.clamp(sourceMaterial.specularPower, 0, 100),
            transparent: alphaTexture,
            alphaTest: alphaTexture ? 0.08 : 0,
            side: DoubleSide
          }));
          this.registerTextureMaterial(sourceMaterial.textureUrl, material);
          if (sourceMaterial.textureUrl && MAGENTA_COLOR_KEY_URLS.has(sourceMaterial.textureUrl)) applyMagentaColorKey(material);
          return material;
        });
        const mesh = new Mesh(this.ownGeometry(createXGeometry(sourceMesh)), materials);
        mesh.name = `${object.name}/${sourceMesh.name} recovered X mesh`;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
      }
      return group;
    }

    const asset = DATA.assets.tvm[object.catalogResolution.assetId ?? ""];
    if (!asset) throw new Error(`${object.name}: recovered TVM asset payload is absent`);
    const materials = asset.materials.map((sourceMaterial) => {
      const alphaTexture = Boolean(sourceMaterial.textureUrl?.endsWith(".png"));
      const material = this.ownMaterial(new MeshPhongMaterial({
        name: `${object.name}/${sourceMaterial.name}`,
        color: sourceMaterial.textureUrl ? 0xffffff : colorHex(sourceMaterial.diffuse),
        shininess: sourceMaterial.name === "Canopy" ? 32 : 5,
        transparent: alphaTexture || sourceMaterial.diffuse[3] < 1,
        opacity: MathUtils.clamp(sourceMaterial.diffuse[3], 0, 1),
        alphaTest: alphaTexture ? 0.04 : 0,
        side: DoubleSide
      }));
      this.registerTextureMaterial(sourceMaterial.textureUrl, material);
      if (sourceMaterial.textureUrl && MAGENTA_COLOR_KEY_URLS.has(sourceMaterial.textureUrl)) applyMagentaColorKey(material);
      return material;
    });
    const mesh = new Mesh(this.ownGeometry(createTvmGeometry(asset)), materials);
    mesh.name = `${object.name} recovered TVM mesh`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return group;
  }

  private matches(object: CatalogObject): boolean {
    const familyMatches = this.familyFilter === "all" || object.family === this.familyFilter;
    const statusMatches = this.statusFilter === "all" || statusGroup(object.catalogResolution.status) === this.statusFilter;
    return familyMatches && statusMatches;
  }

  private sourceAssetFor(object: CatalogObject): string | null {
    const assetId = object.catalogResolution.assetId ?? "";
    if (object.catalogResolution.status === "recovered-text-x") return DATA.assets.x[assetId]?.source ?? null;
    if (object.catalogResolution.status === "recovered-tvm") return DATA.assets.tvm[assetId]?.source ?? null;
    return object.archiveResolution.source ?? null;
  }

  private applyFilters(ensureSelection: boolean): void {
    for (const object of DATA.objects) {
      const visible = this.matches(object);
      const target = this.geometryGroups.get(object.index) ?? this.markerGroups.get(object.index);
      if (target) target.visible = visible;
    }
    if (ensureSelection && !this.matches(DATA.objects[this.selectedIndex])) {
      this.selectedIndex = DATA.objects.find((object) => this.matches(object))?.index ?? 0;
    }
  }

  private refitCamera(): void {
    const matches = DATA.objects.filter((object) => this.matches(object));
    if (!matches.length) {
      this.lookAt.set(0, 0, 0);
      this.baseRadius = 30;
      this.baseHeight = 12;
      this.updateCameraPosition();
      return;
    }
    const xs = matches.map((object) => object.position[0]);
    const ys = matches.map((object) => object.position[1]);
    const zs = matches.map((object) => -object.position[2]);
    const min = [Math.min(...xs), Math.min(...ys), Math.min(...zs)];
    const max = [Math.max(...xs), Math.max(...ys), Math.max(...zs)];
    this.lookAt.set((min[0] + max[0]) / 2, (min[1] + max[1]) / 2 + 2, (min[2] + max[2]) / 2);
    const horizontalSpan = Math.max(max[0] - min[0], max[2] - min[2], 8);
    const verticalSpan = Math.max(max[1] - min[1], 5);
    this.baseRadius = Math.max(18, horizontalSpan * 1.18 + verticalSpan * 0.72);
    this.baseHeight = Math.max(8, verticalSpan * 0.8 + horizontalSpan * 0.38);
    this.zoom = 1;
    this.updateCameraPosition();
  }

  private updateCameraPosition(): void {
    this.cameraPosition.set(
      this.lookAt.x + Math.sin(this.orbitAngle) * this.baseRadius * this.zoom,
      this.lookAt.y + this.baseHeight * this.zoom,
      this.lookAt.z + Math.cos(this.orbitAngle) * this.baseRadius * this.zoom
    );
  }

  private async loadTextures(): Promise<void> {
    try {
      const urls = [DATA.primitiveTextureUrl, ...this.materialsByTextureUrl.keys()];
      const uniqueUrls = [...new Set(urls.filter(Boolean))];
      const loaded = await Promise.all(uniqueUrls.map(async (url) => {
        const texture = await this.textureLoader.loadAsync(url);
        texture.colorSpace = SRGBColorSpace;
        texture.wrapS = RepeatWrapping;
        texture.wrapT = RepeatWrapping;
        this.textures.add(texture);
        return [url, texture] as const;
      }));
      if (this.disposed) return;
      const byUrl = new Map(loaded);
      this.primitiveMaterial.map = byUrl.get(DATA.primitiveTextureUrl) ?? null;
      this.primitiveMaterial.needsUpdate = true;
      for (const [url, materials] of this.materialsByTextureUrl) {
        const texture = byUrl.get(url);
        if (!texture) continue;
        for (const material of materials) {
          material.map = texture;
          material.needsUpdate = true;
        }
      }
      this.loadStatus = "ready";
    } catch (error) {
      if (this.disposed) return;
      this.loadStatus = "error";
      this.loadError = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }
}

export async function createObjectLibraryCatalogEnvironment(options: ObjectLibraryCatalogOptions = {}): Promise<ObjectLibraryCatalogEnvironment> {
  const environment = new ObjectLibraryCatalogEnvironment(options);
  await environment.ready;
  return environment;
}
