import {
  AmbientLight,
  Box3,
  BoxGeometry,
  BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  LoadingManager,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PointLight,
  SphereGeometry,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  Vector3
} from "three";
import manifestJson from "./legacy/ballz-xml-worlds.json";

type Tuple3 = [number, number, number];
type SceneId = "myworld" | "testworld";
type LoadStatus = "loading" | "ready" | "error" | "disposed";

type ResolutionData = {
  status: string;
  path?: string;
  sha256?: string;
  targetName?: string | null;
  reason?: string;
};

type ObjectData = {
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
  assetId: string | null;
  resolution: ResolutionData;
};

type SceneData = {
  id: SceneId;
  source: string;
  sha256: string;
  classification: string;
  assessment: string;
  objectCount: number;
  renderedObjectCount: number;
  resolutionCounts: Record<string, number>;
  objects: ObjectData[];
};

type MaterialData = {
  index: number;
  name: string;
  textureName: string;
  diffuse: [number, number, number, number];
};

type TvmAssetData = {
  path: string;
  sha256: string;
  vertexCount: number;
  triangleCount: number;
  materialFormat: string;
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
  materialIndexByTriangle: number[];
  groups: Array<{ triangleStart: number; triangleCount: number }>;
  materials: MaterialData[];
};

type ManifestData = {
  format: string;
  classification: {
    sceneCount: number;
    assembledDiscoverableWorldCount: number;
    distinctSerializedCompositionCount: number;
    reason: string;
  };
  parserRule: string;
  scenes: SceneData[];
  tvmAssets: Record<string, TvmAssetData>;
  hostEvidence: Record<string, string[]>;
  evidenceBoundary: { exact: string[]; unresolved: string[]; inference: string[] };
};

const DATA = manifestJson as unknown as ManifestData;
const ASSET_BASE = "/assets/ballz-xml-worlds";

export type BallzXmlWorldObjectState = {
  index: number;
  name: string;
  action: string;
  serializedType: number;
  sourcePosition: Tuple3;
  webPosition: Tuple3;
  scale: Tuple3;
  mass: number;
  newtonMaterial: number;
  resolution: string;
  sourceAsset: string | null;
  rendered: boolean;
  visible: boolean;
};

export type BallzXmlWorldsState = {
  id: "ballz-xml-worlds-evidence-preview";
  sceneId: SceneId;
  source: string;
  sourceSha256: string;
  classification: string;
  assessment: string;
  distinctSerializedComposition: true;
  assembledDiscoverableWorld: false;
  ready: boolean;
  loadStatus: LoadStatus;
  loadError: string | null;
  objectCount: number;
  renderedObjectCount: number;
  unresolvedObjectCount: number;
  resolutionCounts: Record<string, number>;
  focusedObjectIndex: number | null;
  orbitAngleRadians: number;
  cameraPosition: Tuple3;
  lookAt: Tuple3;
  physics: { metadataPreserved: true; simulated: false; reason: string };
  exactTvmAssets: Array<{ id: string; vertices: number; triangles: number; materialGroups: number; materialFormat: string }>;
  objects: BallzXmlWorldObjectState[];
  parserRule: string;
  evidence: ManifestData["evidenceBoundary"];
};

export type BallzXmlWorldsEnvironmentOptions = {
  assetBaseUrl?: string;
  loadingManager?: LoadingManager;
  initialScene?: SceneId;
};

function materialColor(material: MaterialData): number {
  const channels = material.diffuse.slice(0, 3).map((value) => Number.isFinite(value) ? MathUtils.clamp(value, 0, 1) : 0.72);
  return (Math.round(channels[0] * 255) << 16) | (Math.round(channels[1] * 255) << 8) | Math.round(channels[2] * 255);
}

function buildTvmGeometry(asset: TvmAssetData): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.name = `${asset.path} exact decoded TVM geometry`;
  geometry.setAttribute("position", new Float32BufferAttribute(asset.positions, 3));
  geometry.setAttribute("normal", new Float32BufferAttribute(asset.normals, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(asset.uvs, 2));
  geometry.setIndex(asset.indices);
  for (const group of asset.groups) {
    geometry.addGroup(group.triangleStart * 3, group.triangleCount * 3, asset.materialIndexByTriangle[group.triangleStart] ?? 0);
  }
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/** Exact serialized geometry with explicitly inferred inspection camera/lights. */
export class BallzXmlWorldsEnvironment {
  readonly group = new Group();
  readonly ready: Promise<void>;

  private readonly assetBaseUrl: string;
  private readonly textureLoader: TextureLoader;
  private readonly sceneGroups = new Map<SceneId, Group>();
  private readonly objectGroups = new Map<string, Group>();
  private readonly geometries: BufferGeometry[] = [];
  private readonly materials: MeshStandardMaterial[] = [];
  private readonly textures = new Set<Texture>();
  private readonly primitiveMaterial: MeshStandardMaterial;
  private readonly tvmMaterials = new Map<string, MeshStandardMaterial[]>();
  private readonly cameraPosition = new Vector3();
  private readonly cameraTarget = new Vector3();
  private sceneId: SceneId;
  private focusedObjectIndex: number | null = null;
  private orbitAngle = 0;
  private cameraRadius = 20;
  private cameraHeightOffset = 8;
  private loadStatus: LoadStatus = "loading";
  private loadError: string | null = null;
  private disposed = false;

  constructor(options: BallzXmlWorldsEnvironmentOptions = {}) {
    this.assetBaseUrl = (options.assetBaseUrl ?? ASSET_BASE).replace(/\/$/, "");
    this.textureLoader = new TextureLoader(options.loadingManager);
    this.sceneId = options.initialScene ?? "myworld";
    this.group.name = "BallZ2015 XML test compositions (source +Z converted to web -Z)";
    this.group.scale.z = -1;
    this.group.userData.evidenceBoundary = DATA.evidenceBoundary;

    this.primitiveMaterial = this.ownMaterial(new MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.74,
      metalness: 0,
      name: "Exact TwoWay host texture material"
    }));

    for (const scene of DATA.scenes) {
      const sceneGroup = new Group();
      sceneGroup.name = `${scene.source} exact recoverable records`;
      this.sceneGroups.set(scene.id, sceneGroup);
      this.group.add(sceneGroup);
      for (const object of scene.objects) {
        const objectGroup = this.buildObject(scene.id, object);
        if (!objectGroup) continue;
        objectGroup.name = `${object.index}: ${object.name}`;
        objectGroup.position.set(...object.position);
        objectGroup.rotation.set(
          MathUtils.degToRad(object.rotation[0]),
          MathUtils.degToRad(object.rotation[1]),
          MathUtils.degToRad(object.rotation[2])
        );
        objectGroup.userData.serializedObject = object;
        this.objectGroups.set(this.objectKey(scene.id, object.index), objectGroup);
        sceneGroup.add(objectGroup);
      }
    }

    const ambient = new AmbientLight(0xc7d8ec, 1.8);
    ambient.name = "Inferred inspection ambient light";
    this.group.add(ambient);
    const key = new PointLight(0xffdab5, 1200, 1800, 1.2);
    key.name = "Inferred inspection key light";
    key.position.set(180, 360, 240);
    this.group.add(key);

    this.updateSceneVisibility();
    this.fitCamera();
    this.ready = this.loadTextures();
  }

  setScene(sceneId: SceneId, camera?: PerspectiveCamera): boolean {
    if (!this.sceneGroups.has(sceneId)) return false;
    this.sceneId = sceneId;
    this.focusedObjectIndex = null;
    this.orbitAngle = 0;
    this.updateSceneVisibility();
    this.setCurrentObjectsVisible(null);
    this.fitCamera();
    if (camera) this.applyToCamera(camera);
    return true;
  }

  focusObject(index: number | null, camera?: PerspectiveCamera): boolean {
    if (index !== null && !this.objectGroups.has(this.objectKey(this.sceneId, index))) return false;
    this.focusedObjectIndex = index;
    this.setCurrentObjectsVisible(index);
    this.fitCamera();
    if (camera) this.applyToCamera(camera);
    return true;
  }

  focusNext(camera?: PerspectiveCamera): number | null {
    const rendered = this.currentScene.objects.filter((object) => this.objectGroups.has(this.objectKey(this.sceneId, object.index)));
    if (!rendered.length) return null;
    const position = rendered.findIndex((object) => object.index === this.focusedObjectIndex);
    const next = rendered[(position + 1) % rendered.length].index;
    this.focusObject(next, camera);
    return next;
  }

  setObjectVisible(index: number, visible: boolean): boolean {
    const object = this.objectGroups.get(this.objectKey(this.sceneId, index));
    if (!object) return false;
    object.visible = visible;
    return true;
  }

  reset(camera?: PerspectiveCamera): void {
    for (const object of this.objectGroups.values()) object.visible = true;
    this.focusedObjectIndex = null;
    this.orbitAngle = 0;
    this.fitCamera();
    if (camera) this.applyToCamera(camera);
  }

  orbitByRadians(delta: number, camera?: PerspectiveCamera): void {
    if (!Number.isFinite(delta)) return;
    this.orbitAngle = MathUtils.euclideanModulo(this.orbitAngle + delta, Math.PI * 2);
    this.updateCameraPosition();
    if (camera) this.applyToCamera(camera);
  }

  update(deltaSeconds: number, orbitInput = 0, camera?: PerspectiveCamera): BallzXmlWorldsState {
    if (!this.disposed && Number.isFinite(deltaSeconds) && Number.isFinite(orbitInput)) {
      this.orbitAngle = MathUtils.euclideanModulo(
        this.orbitAngle + MathUtils.clamp(orbitInput, -1, 1) * Math.max(0, deltaSeconds) * 0.58,
        Math.PI * 2
      );
      this.updateCameraPosition();
    }
    if (camera) this.applyToCamera(camera);
    return this.getState();
  }

  applyToCamera(camera: PerspectiveCamera): void {
    camera.position.copy(this.cameraPosition);
    camera.lookAt(this.cameraTarget);
    camera.near = Math.max(0.001, this.cameraRadius / 5000);
    camera.far = Math.max(100, this.cameraRadius * 6);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  }

  getState(): BallzXmlWorldsState {
    const scene = this.currentScene;
    const exactAssetIds = [...new Set(scene.objects.map((object) => object.assetId).filter((id): id is string => Boolean(id)))];
    return {
      id: "ballz-xml-worlds-evidence-preview",
      sceneId: this.sceneId,
      source: scene.source,
      sourceSha256: scene.sha256,
      classification: scene.classification,
      assessment: scene.assessment,
      distinctSerializedComposition: true,
      assembledDiscoverableWorld: false,
      ready: this.loadStatus === "ready",
      loadStatus: this.loadStatus,
      loadError: this.loadError,
      objectCount: scene.objectCount,
      renderedObjectCount: scene.renderedObjectCount,
      unresolvedObjectCount: scene.objectCount - scene.renderedObjectCount,
      resolutionCounts: scene.resolutionCounts,
      focusedObjectIndex: this.focusedObjectIndex,
      orbitAngleRadians: this.orbitAngle,
      cameraPosition: this.cameraPosition.toArray(),
      lookAt: this.cameraTarget.toArray(),
      physics: {
        metadataPreserved: true,
        simulated: false,
        reason: "XML retains mass/material metadata but not host gravity, timestep, ground, or interactions."
      },
      exactTvmAssets: exactAssetIds.map((id) => {
        const asset = DATA.tvmAssets[id];
        return { id, vertices: asset.vertexCount, triangles: asset.triangleCount, materialGroups: asset.groups.length, materialFormat: asset.materialFormat };
      }),
      objects: scene.objects.map((object) => {
        const rendered = this.objectGroups.get(this.objectKey(scene.id, object.index));
        return {
          index: object.index,
          name: object.name,
          action: object.action,
          serializedType: object.type,
          sourcePosition: object.position,
          webPosition: [object.position[0], object.position[1], -object.position[2]],
          scale: object.scale,
          mass: object.mass,
          newtonMaterial: object.newtonMaterial,
          resolution: object.resolution.status,
          sourceAsset: object.resolution.path ?? null,
          rendered: Boolean(rendered),
          visible: rendered?.visible ?? false
        };
      }),
      parserRule: DATA.parserRule,
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
    this.objectGroups.clear();
    this.sceneGroups.clear();
  }

  private get currentScene(): SceneData {
    const scene = DATA.scenes.find((candidate) => candidate.id === this.sceneId);
    if (!scene) throw new Error(`Missing BallZ XML scene: ${this.sceneId}`);
    return scene;
  }

  private objectKey(sceneId: SceneId, index: number): string {
    return `${sceneId}:${index}`;
  }

  private ownGeometry<T extends BufferGeometry>(geometry: T): T {
    this.geometries.push(geometry);
    return geometry;
  }

  private ownMaterial(material: MeshStandardMaterial): MeshStandardMaterial {
    this.materials.push(material);
    return material;
  }

  private buildObject(sceneId: SceneId, object: ObjectData): Group | null {
    if (!object.enabled || !["exact-procedural-primitive", "exact-file", "exact-duplicate-target"].includes(object.resolution.status)) return null;
    const group = new Group();
    let mesh: Mesh;
    if (object.action === "PHYSICCUBE") {
      mesh = new Mesh(this.ownGeometry(new BoxGeometry(...object.scale)), this.primitiveMaterial);
    } else if (object.action === "PHYSICSPHERE") {
      mesh = new Mesh(this.ownGeometry(new SphereGeometry(object.scale[0], 24, 24)), this.primitiveMaterial);
    } else if (object.action === "PHYSICSCYLINDER") {
      mesh = new Mesh(this.ownGeometry(new CylinderGeometry(object.scale[0], object.scale[0], object.scale[1], 12, 1, false)), this.primitiveMaterial);
      mesh.rotation.z = -Math.PI / 2;
    } else if (object.action === "PHYSICCONE") {
      mesh = new Mesh(this.ownGeometry(new ConeGeometry(object.scale[0], object.scale[1], 12, 1, false)), this.primitiveMaterial);
      mesh.rotation.z = -Math.PI / 2;
    } else if (object.assetId) {
      const asset = DATA.tvmAssets[object.assetId];
      const materials = asset.materials.map((source) => {
        const alpha = Number.isFinite(source.diffuse[3]) ? MathUtils.clamp(source.diffuse[3], 0, 1) : 1;
        return this.ownMaterial(new MeshStandardMaterial({
          color: source.textureName ? 0xffffff : materialColor(source),
          roughness: 0.7,
          metalness: 0,
          opacity: alpha,
          transparent: alpha < 0.999,
          depthWrite: alpha >= 0.999,
          name: `${sceneId}/${object.assetId}/${source.name}`
        }));
      });
      this.tvmMaterials.set(object.assetId, materials);
      mesh = new Mesh(this.ownGeometry(buildTvmGeometry(asset)), materials);
      group.scale.set(...object.scale);
    } else return null;
    mesh.name = `${sceneId}/${object.index} exact rendered record`;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    group.add(mesh);
    return group;
  }

  private updateSceneVisibility(): void {
    for (const [id, sceneGroup] of this.sceneGroups) sceneGroup.visible = id === this.sceneId;
  }

  private setCurrentObjectsVisible(focusedIndex: number | null): void {
    for (const object of this.currentScene.objects) {
      const rendered = this.objectGroups.get(this.objectKey(this.sceneId, object.index));
      if (rendered) rendered.visible = focusedIndex === null || object.index === focusedIndex;
    }
  }

  private fitCamera(): void {
    const subject = this.focusedObjectIndex === null
      ? this.sceneGroups.get(this.sceneId)
      : this.objectGroups.get(this.objectKey(this.sceneId, this.focusedObjectIndex));
    if (!subject) return;
    subject.updateWorldMatrix(true, true);
    const bounds = new Box3().setFromObject(subject);
    const size = bounds.getSize(new Vector3());
    bounds.getCenter(this.cameraTarget);
    const span = Math.max(size.x, size.y, size.z, 0.08);
    this.cameraRadius = Math.max(0.32, span * 1.28);
    this.cameraHeightOffset = Math.max(span * 0.4, 0.12);
    this.updateCameraPosition();
  }

  private updateCameraPosition(): void {
    this.cameraPosition.set(
      this.cameraTarget.x + Math.sin(this.orbitAngle) * this.cameraRadius,
      this.cameraTarget.y + this.cameraHeightOffset,
      this.cameraTarget.z + Math.cos(this.orbitAngle) * this.cameraRadius
    );
  }

  private async loadTextures(): Promise<void> {
    try {
      const load = async (path: string): Promise<Texture> => {
        const texture = await this.textureLoader.loadAsync(path);
        texture.colorSpace = SRGBColorSpace;
        this.textures.add(texture);
        return texture;
      };
      this.primitiveMaterial.map = await load(`${this.assetBaseUrl}/yellowtwoway.jpg`);
      this.primitiveMaterial.needsUpdate = true;
      const lp = DATA.tvmAssets["airplane-lp"];
      const lpMaterials = this.tvmMaterials.get("airplane-lp");
      if (lpMaterials) {
        for (const material of lp.materials) {
          if (!material.textureName) continue;
          lpMaterials[material.index].map = await load(`${this.assetBaseUrl}/airplane/${material.textureName}`);
          lpMaterials[material.index].needsUpdate = true;
        }
      }
      if (this.disposed) return;
      this.loadStatus = "ready";
    } catch (error) {
      if (this.disposed) return;
      this.loadStatus = "error";
      this.loadError = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }
}

export async function createBallzXmlWorldsEnvironment(options: BallzXmlWorldsEnvironmentOptions = {}): Promise<BallzXmlWorldsEnvironment> {
  const environment = new BallzXmlWorldsEnvironment(options);
  await environment.ready;
  return environment;
}
