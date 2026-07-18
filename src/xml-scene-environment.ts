import {
  AmbientLight,
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
import xmlSceneJson from "./legacy/xml-myworld-copy-scene.json";

type LoadStatus = "loading" | "ready" | "error" | "disposed";
type Tuple3 = [number, number, number];

type XmlResolution = {
  status: string;
  source?: string;
  sha256?: string;
};

type XmlObjectData = {
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
  resolution: XmlResolution;
};

type TvmGroupData = {
  triangleStart: number;
  triangleCount: number;
};

type TvmMaterialData = {
  index: number;
  name: string;
  textureName: string;
  diffuse: [number, number, number, number];
};

type TvmAssetData = {
  source: string;
  sha256: string;
  vertexCount: number;
  triangleCount: number;
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
  materialIndexByTriangle: number[];
  groups: TvmGroupData[];
  materials: TvmMaterialData[];
};

type XmlSelectedSceneData = {
  sourceDocument: {
    id: string;
    source: string;
    sha256: string;
    classification: string;
    assessment: string;
    objectCount: number;
    objects: XmlObjectData[];
  };
  exactTvmAssets: Record<string, TvmAssetData>;
  runtimeEvidence: {
    exact: string[];
    missing: string[];
    inference: string[];
  };
};

export type XmlSceneEnvironmentOptions = {
  assetBaseUrl?: string;
  loadingManager?: LoadingManager;
};

export type XmlSceneObjectState = {
  name: string;
  action: string;
  sourcePosition: Tuple3;
  webPosition: Tuple3;
  scale: Tuple3;
  mass: number;
  meshControlled: boolean;
  resolution: string;
  sourceAsset: string | null;
  rendered: boolean;
  visible: boolean;
};

export type XmlSceneEnvironmentState = {
  id: "xml-myworld-copy-authored-test";
  source: string;
  sourceSha256: string;
  classification: string;
  ready: boolean;
  loadStatus: LoadStatus;
  loadError: string | null;
  disposed: boolean;
  visible: boolean;
  objectCount: number;
  renderedObjectCount: number;
  unresolvedObjectNames: string[];
  primitiveCount: number;
  exactTvmAssets: Array<{ name: string; source: string; vertices: number; triangles: number; materialGroups: number }>;
  physics: {
    metadataPreserved: true;
    simulated: false;
    reason: string;
  };
  orbitAngleRadians: number;
  cameraPosition: Tuple3;
  lookAt: Tuple3;
  objects: XmlSceneObjectState[];
  evidence: XmlSelectedSceneData["runtimeEvidence"];
};

const DATA = xmlSceneJson as unknown as XmlSelectedSceneData;
const DEFAULT_ASSET_BASE_URL = "/assets/xml-scenes";
const PRIMITIVE_TEXTURE = "twoway.jpg";
const CAMERA_CENTER = new Vector3(17, 3.25, -7);
const CAMERA_RADIUS = 33;
const CAMERA_HEIGHT = 16;

function buildTvmGeometry(asset: TvmAssetData): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.name = `${asset.source} exact decoded geometry`;
  geometry.setAttribute("position", new Float32BufferAttribute(asset.positions, 3));
  geometry.setAttribute("normal", new Float32BufferAttribute(asset.normals, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(asset.uvs, 2));
  geometry.setIndex(asset.indices);
  for (const group of asset.groups) {
    geometry.addGroup(
      group.triangleStart * 3,
      group.triangleCount * 3,
      asset.materialIndexByTriangle[group.triangleStart] ?? 0
    );
  }
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function materialColor(material: TvmMaterialData): number {
  const [red, green, blue] = material.diffuse;
  const safe = [red, green, blue].every((value) => Number.isFinite(value) && value >= 0 && value <= 1)
    ? [red, green, blue]
    : [0.8, 0.8, 0.8];
  return (Math.round(safe[0] * 255) << 16) | (Math.round(safe[1] * 255) << 8) | Math.round(safe[2] * 255);
}

/**
 * Evidence-bounded renderer for `MyWorld - Copie.xml`.
 *
 * Six source objects are rendered exactly from serialized primitives/TVMs. The
 * absent Chinese arch is reported but deliberately receives no proxy. Physics
 * metadata is retained in state, while motion stays disabled because the XML
 * does not identify the host gravity/timestep/ground configuration.
 */
export class XmlSceneEnvironment {
  readonly group = new Group();
  readonly ready: Promise<void>;

  private readonly assetBaseUrl: string;
  private readonly textureLoader: TextureLoader;
  private readonly objectGroups = new Map<string, Group>();
  private readonly geometries: BufferGeometry[] = [];
  private readonly materials: MeshStandardMaterial[] = [];
  private readonly textures = new Set<Texture>();
  private readonly primitiveMaterial: MeshStandardMaterial;
  private readonly tvmMaterials = new Map<string, MeshStandardMaterial[]>();
  private readonly cameraPosition = new Vector3();
  private orbitAngle = 0;
  private loadStatus: LoadStatus = "loading";
  private loadError: string | null = null;
  private disposed = false;

  constructor(options: XmlSceneEnvironmentOptions = {}) {
    this.assetBaseUrl = (options.assetBaseUrl ?? DEFAULT_ASSET_BASE_URL).replace(/\/$/, "");
    this.textureLoader = new TextureLoader(options.loadingManager);
    this.group.name = "MyWorld - Copie.xml exact recoverable composition";
    this.group.scale.z = -1;
    this.group.userData.archiveEvidence = DATA.runtimeEvidence;

    this.primitiveMaterial = this.ownMaterial(new MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.72,
      metalness: 0,
      name: "XML TwoWay primitive material"
    }));

    for (const object of DATA.sourceDocument.objects) {
      if (!object.enabled || object.resolution.status === "missing-file") continue;
      const objectGroup = this.buildObject(object);
      if (!objectGroup) continue;
      objectGroup.name = object.name;
      objectGroup.position.set(...object.position);
      objectGroup.rotation.set(
        MathUtils.degToRad(object.rotation[0]),
        MathUtils.degToRad(object.rotation[1]),
        MathUtils.degToRad(object.rotation[2])
      );
      objectGroup.scale.set(...object.scale);
      objectGroup.userData.xmlObjectIndex = object.index;
      objectGroup.userData.archiveAction = object.action;
      this.objectGroups.set(object.name, objectGroup);
      this.group.add(objectGroup);
    }

    // Lighting is only an inspection aid; the XML contains no light records.
    const ambient = new AmbientLight(0xa9bdd5, 1.65);
    ambient.name = "XML preview ambient light (inferred)";
    this.group.add(ambient);
    const key = new PointLight(0xffdfb8, 135, 120, 1.2);
    key.name = "XML preview key light (inferred)";
    key.position.set(12, 24, -6);
    this.group.add(key);

    this.updateCameraPosition();
    this.ready = this.loadExactTextures();
  }

  update(deltaSeconds: number, orbitInput = 0, camera?: PerspectiveCamera): XmlSceneEnvironmentState {
    if (!this.disposed && Number.isFinite(deltaSeconds) && Number.isFinite(orbitInput)) {
      this.orbitAngle = MathUtils.euclideanModulo(
        this.orbitAngle + MathUtils.clamp(orbitInput, -1, 1) * Math.max(0, deltaSeconds) * 0.62,
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

  resetOrbit(camera?: PerspectiveCamera): void {
    this.orbitAngle = 0;
    this.updateCameraPosition();
    if (camera) this.applyToCamera(camera);
  }

  setObjectVisible(name: string, visible: boolean): boolean {
    const object = this.objectGroups.get(name);
    if (!object) return false;
    object.visible = visible;
    return true;
  }

  resetObjectVisibility(): void {
    for (const object of this.objectGroups.values()) object.visible = true;
  }

  applyToCamera(camera: PerspectiveCamera): void {
    camera.position.copy(this.cameraPosition);
    camera.lookAt(CAMERA_CENTER);
    camera.near = 0.1;
    camera.far = 180;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  }

  getState(): XmlSceneEnvironmentState {
    const unresolved = DATA.sourceDocument.objects.filter((object) => !this.objectGroups.has(object.name));
    return {
      id: "xml-myworld-copy-authored-test",
      source: DATA.sourceDocument.source,
      sourceSha256: DATA.sourceDocument.sha256,
      classification: DATA.sourceDocument.classification,
      ready: this.loadStatus === "ready",
      loadStatus: this.loadStatus,
      loadError: this.loadError,
      disposed: this.disposed,
      visible: this.group.visible && this.group.parent !== null,
      objectCount: DATA.sourceDocument.objectCount,
      renderedObjectCount: this.objectGroups.size,
      unresolvedObjectNames: unresolved.map((object) => object.name),
      primitiveCount: DATA.sourceDocument.objects.filter((object) => object.resolution.status === "procedural-primitive").length,
      exactTvmAssets: Object.entries(DATA.exactTvmAssets).map(([name, asset]) => ({
        name,
        source: asset.source,
        vertices: asset.vertexCount,
        triangles: asset.triangleCount,
        materialGroups: asset.groups.length
      })),
      physics: {
        metadataPreserved: true,
        simulated: false,
        reason: "The XML has masses/material IDs but no host gravity, timestep, ground or interaction configuration."
      },
      orbitAngleRadians: this.orbitAngle,
      cameraPosition: this.cameraPosition.toArray(),
      lookAt: CAMERA_CENTER.toArray(),
      objects: DATA.sourceDocument.objects.map((object) => {
        const rendered = this.objectGroups.get(object.name);
        return {
          name: object.name,
          action: object.action,
          sourcePosition: object.position,
          webPosition: [object.position[0], object.position[1], -object.position[2]],
          scale: object.scale,
          mass: object.mass,
          meshControlled: object.meshControlled,
          resolution: object.resolution.status,
          sourceAsset: object.resolution.source ?? null,
          rendered: Boolean(rendered),
          visible: rendered?.visible ?? false
        };
      }),
      evidence: DATA.runtimeEvidence
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
  }

  private ownMaterial(material: MeshStandardMaterial): MeshStandardMaterial {
    this.materials.push(material);
    return material;
  }

  private ownGeometry<T extends BufferGeometry>(geometry: T): T {
    this.geometries.push(geometry);
    return geometry;
  }

  private buildObject(object: XmlObjectData): Group | null {
    const group = new Group();
    let mesh: Mesh | null = null;
    if (object.action === "PHYSICCUBE") {
      mesh = new Mesh(this.ownGeometry(new BoxGeometry(1, 1, 1)), this.primitiveMaterial);
    } else if (object.action === "PHYSICSPHERE") {
      mesh = new Mesh(this.ownGeometry(new SphereGeometry(1, 24, 24)), this.primitiveMaterial);
    } else if (object.action === "PHYSICSCYLINDER" || object.action === "PHYSICCYLINDER") {
      mesh = new Mesh(this.ownGeometry(new CylinderGeometry(1, 1, 1, 12, 1, false)), this.primitiveMaterial);
      mesh.rotation.z = -Math.PI / 2;
    } else if (object.action === "PHYSICCONE") {
      mesh = new Mesh(this.ownGeometry(new ConeGeometry(1, 1, 12, 1, false)), this.primitiveMaterial);
      mesh.rotation.z = -Math.PI / 2;
    } else {
      const asset = DATA.exactTvmAssets[object.name];
      if (!asset) return null;
      const materials = asset.materials.map((material) => this.ownMaterial(new MeshStandardMaterial({
        color: material.textureName ? 0xffffff : materialColor(material),
        roughness: material.name === "Canopy" ? 0.28 : 0.72,
        metalness: material.name === "Canopy" ? 0.08 : 0,
        transparent: material.textureName.toLowerCase().endsWith(".png"),
        alphaTest: material.textureName.toLowerCase().endsWith(".png") ? 0.02 : 0,
        name: `${object.name}/${material.name}`
      })));
      this.tvmMaterials.set(object.name, materials);
      mesh = new Mesh(this.ownGeometry(buildTvmGeometry(asset)), materials);
    }
    mesh.name = `${object.name} rendered source object`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return group;
  }

  private updateCameraPosition(): void {
    this.cameraPosition.set(
      CAMERA_CENTER.x + Math.sin(this.orbitAngle) * CAMERA_RADIUS,
      CAMERA_HEIGHT,
      CAMERA_CENTER.z + Math.cos(this.orbitAngle) * CAMERA_RADIUS
    );
  }

  private async loadExactTextures(): Promise<void> {
    try {
      const cache = new Map<string, Texture>();
      const load = async (path: string): Promise<Texture> => {
        const existing = cache.get(path);
        if (existing) return existing;
        const texture = await this.textureLoader.loadAsync(path);
        texture.colorSpace = SRGBColorSpace;
        this.textures.add(texture);
        cache.set(path, texture);
        return texture;
      };

      this.primitiveMaterial.map = await load(`${this.assetBaseUrl}/${PRIMITIVE_TEXTURE}`);
      this.primitiveMaterial.needsUpdate = true;
      for (const [objectName, asset] of Object.entries(DATA.exactTvmAssets)) {
        const materials = this.tvmMaterials.get(objectName);
        if (!materials) continue;
        for (const sourceMaterial of asset.materials) {
          if (!sourceMaterial.textureName) continue;
          const folder = objectName === "Airplane" ? "/airplane" : "";
          materials[sourceMaterial.index].map = await load(`${this.assetBaseUrl}${folder}/${sourceMaterial.textureName}`);
          materials[sourceMaterial.index].needsUpdate = true;
        }
      }
      if (this.disposed) {
        for (const texture of this.textures) texture.dispose();
        this.textures.clear();
        return;
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

export async function createXmlSceneEnvironment(options: XmlSceneEnvironmentOptions = {}): Promise<XmlSceneEnvironment> {
  const environment = new XmlSceneEnvironment(options);
  await environment.ready;
  return environment;
}
