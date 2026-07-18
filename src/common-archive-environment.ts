import {
  AmbientLight,
  BufferGeometry,
  ClampToEdgeWrapping,
  Float32BufferAttribute,
  Group,
  LoadingManager,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PointLight,
  RepeatWrapping,
  SRGBColorSpace,
  Texture,
  Vector3
} from "three";
import { DDSLoader } from "three/examples/jsm/loaders/DDSLoader.js";
import commonScenesJson from "./legacy/common-scenes.json";

export type CommonArchiveSpaceId = "room1" | "sky-component";
type LoadStatus = "loading" | "ready" | "error" | "disposed";

type CommonSceneGroupData = {
  vertexCount: number;
  vertexStart: number;
  triangleCount: number;
  triangleStart: number;
};

type CommonSceneData = {
  id: string;
  classification: string;
  source: string;
  sha256: string;
  vertexCount: number;
  triangleCount: number;
  bounds: { min: number[]; max: number[]; size: number[] };
  embeddedTextureNames: string[];
  positions: number[];
  normals: number[];
  uvs: number[] | null;
  indices: number[];
  materialIndexByTriangle: number[];
  groups: CommonSceneGroupData[];
};

type CommonScenesData = {
  recoveryAssessment: {
    evidence: string;
    exact: string[];
    inference: string[];
  };
  scenes: CommonSceneData[];
};

export type CommonArchiveEnvironmentOptions = {
  initialSpace?: CommonArchiveSpaceId;
  assetBaseUrl?: string;
  loadingManager?: LoadingManager;
};

export type CommonArchiveEnvironmentState = {
  id: "common-archive-room1-and-sky-component";
  activeSpace: CommonArchiveSpaceId;
  ready: boolean;
  loadStatus: LoadStatus;
  loadError: string | null;
  disposed: boolean;
  visible: boolean;
  orbitAngleRadians: number;
  cameraPosition: [number, number, number];
  lookAt: [number, number, number];
  source: string;
  sourceSha256: string;
  classification: string;
  geometry: {
    vertices: number;
    triangles: number;
    materialGroups: number;
    sourceBounds: { min: number[]; max: number[]; size: number[] };
  };
  textures: string[];
  evidence: {
    exact: string[];
    inference: string[];
  };
};

export const COMMON_ARCHIVE_SPACE_EVIDENCE = {
  room1: {
    source: "common/room.tvm",
    exact: "25-unit inward-facing room shell with one embedded TV3D-logo diffuse/normal material.",
    authoredAssemblyRecovered: false
  },
  "sky-component": {
    source: "common/sky.tvm",
    exact: "Unit-radius inward-facing subdivided skydome: four mid-day side groups plus top/bottom pole caps.",
    authoredAssemblyRecovered: false,
    standaloneSceneEvidence: false
  }
} as const;

const DATA = commonScenesJson as unknown as CommonScenesData;
const DEFAULT_ASSET_BASE_URL = "/assets/textures/common";
const ROOM_ORBIT_RADIUS = 8;
const ROOM_CAMERA_HEIGHT = 10;
const ROOM_LOOK_HEIGHT = 11;
const SKY_DISPLAY_SCALE = 250;

function requireScene(id: string): CommonSceneData {
  const source = DATA.scenes.find((scene) => scene.id === id);
  if (!source) throw new Error(`Common archive source ${id} is missing.`);
  if (source.positions.length !== source.vertexCount * 3) {
    throw new Error(`${source.source} position data is invalid.`);
  }
  if (source.normals.length !== source.vertexCount * 3) {
    throw new Error(`${source.source} normal data is invalid.`);
  }
  if (!source.uvs || source.uvs.length !== source.vertexCount * 2) {
    throw new Error(`${source.source} UV data is invalid.`);
  }
  if (source.indices.length !== source.triangleCount * 3) {
    throw new Error(`${source.source} index data is invalid.`);
  }
  if (source.materialIndexByTriangle.length !== source.triangleCount) {
    throw new Error(`${source.source} material assignments are invalid.`);
  }
  return source;
}

function buildGeometry(source: CommonSceneData): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.name = `${source.source} exact decoded indexed geometry`;
  geometry.setAttribute("position", new Float32BufferAttribute(source.positions, 3));
  geometry.setAttribute("normal", new Float32BufferAttribute(source.normals, 3));
  // The conversion catalog stores GL-oriented V (1 - source V), while Three's
  // DDSLoader uploads these archived DirectX DDS surfaces with flipY=false.
  // Restore the source V here so texture pixels and mesh coordinates keep the
  // same orientation they had in TV3D.
  const directXDdsUvs = (source.uvs ?? []).map((value, index) => index % 2 === 0 ? value : 1 - value);
  geometry.setAttribute("uv", new Float32BufferAttribute(directXDdsUvs, 2));
  geometry.setIndex(source.indices);
  for (const group of source.groups) {
    geometry.addGroup(
      group.triangleStart * 3,
      group.triangleCount * 3,
      source.materialIndexByTriangle[group.triangleStart] ?? 0
    );
  }
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Isolated recovery of `common/room.tvm` and demonstration of `common/sky.tvm`.
 *
 * The two sources remain separate on purpose. Archive evidence identifies the
 * latter as an inward skydome component; no recovered source loads either one
 * into an authored scene. Camera, lighting and display scale are consequently
 * exposed in state as restoration choices rather than source-authored facts.
 */
export class CommonArchiveEnvironment {
  readonly group = new Group();
  readonly room: Mesh<BufferGeometry, MeshStandardMaterial>;
  readonly sky: Mesh<BufferGeometry, MeshBasicMaterial[]>;
  readonly ready: Promise<void>;

  private readonly roomSource = requireScene("common-room");
  private readonly skySource = requireScene("common-sky-space");
  private readonly roomMaterial: MeshStandardMaterial;
  private readonly skyMaterials: MeshBasicMaterial[];
  private readonly ambientLight: AmbientLight;
  private readonly pointLight: PointLight;
  private readonly ddsLoader: DDSLoader;
  private readonly assetBaseUrl: string;
  private readonly textures = new Set<Texture>();
  private readonly cameraPosition = new Vector3();
  private readonly lookAt = new Vector3();
  private activeSpace: CommonArchiveSpaceId;
  private orbitAngle = 0;
  private loadStatus: LoadStatus = "loading";
  private loadError: string | null = null;
  private disposed = false;

  constructor(options: CommonArchiveEnvironmentOptions = {}) {
    this.activeSpace = options.initialSpace ?? "room1";
    this.assetBaseUrl = (options.assetBaseUrl ?? DEFAULT_ASSET_BASE_URL).replace(/\/$/, "");
    this.ddsLoader = new DDSLoader(options.loadingManager);

    this.group.name = "Common Room 1 + archived sky component";
    this.group.userData.archiveRecovery = {
      evidence: DATA.recoveryAssessment.evidence,
      exact: DATA.recoveryAssessment.exact,
      inference: DATA.recoveryAssessment.inference
    };

    this.roomMaterial = new MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.68,
      metalness: 0,
      name: "room.tvm embedded TV3D logo diffuse + normal"
    });
    this.room = new Mesh(buildGeometry(this.roomSource), this.roomMaterial);
    this.room.name = "common/room.tvm exact shell";
    // TV3D is left-handed; mirror source Z into Three's right-handed space.
    this.room.scale.z = -1;
    this.room.receiveShadow = true;
    this.group.add(this.room);

    this.skyMaterials = Array.from({ length: 6 }, (_, index) =>
      new MeshBasicMaterial({
        color: 0xffffff,
        depthWrite: false,
        fog: false,
        name: index < 4 ? `sky.tvm mid_day group ${index}` : index === 4 ? "sky.tvm top pole" : "sky.tvm bottom pole"
      })
    );
    this.sky = new Mesh(buildGeometry(this.skySource), this.skyMaterials);
    this.sky.name = "common/sky.tvm exact inward skydome component";
    this.sky.scale.set(SKY_DISPLAY_SCALE, SKY_DISPLAY_SCALE, -SKY_DISPLAY_SCALE);
    this.sky.renderOrder = -100;
    this.group.add(this.sky);

    // No Room 1 assembly code survives. These lights only make the exact shell
    // legible and are recorded as inference by getState().
    this.ambientLight = new AmbientLight(0x9eb7d8, 1.25);
    this.ambientLight.name = "Room 1 restoration ambient light (inferred)";
    this.group.add(this.ambientLight);
    this.pointLight = new PointLight(0xffd8a8, 80, 35, 1.4);
    this.pointLight.name = "Room 1 restoration point light (inferred)";
    this.pointLight.position.set(0, 18, 0);
    this.group.add(this.pointLight);

    this.updateVisibility();
    this.updateCameraPose();
    this.ready = this.loadTextures();
  }

  getActiveSpace(): CommonArchiveSpaceId {
    return this.activeSpace;
  }

  setActiveSpace(space: CommonArchiveSpaceId, camera?: PerspectiveCamera): void {
    if (space !== "room1" && space !== "sky-component") return;
    this.activeSpace = space;
    this.orbitAngle = 0;
    this.updateVisibility();
    this.updateCameraPose();
    if (camera) this.applyToCamera(camera);
  }

  update(deltaSeconds: number, orbitInput = 0, camera?: PerspectiveCamera): CommonArchiveEnvironmentState {
    if (!this.disposed && Number.isFinite(deltaSeconds) && Number.isFinite(orbitInput)) {
      this.orbitAngle = MathUtils.euclideanModulo(
        this.orbitAngle + MathUtils.clamp(orbitInput, -1, 1) * Math.max(0, deltaSeconds) * 0.75,
        Math.PI * 2
      );
      this.updateCameraPose();
    }
    if (camera) this.applyToCamera(camera);
    return this.getState();
  }

  orbitByRadians(delta: number, camera?: PerspectiveCamera): void {
    if (!Number.isFinite(delta)) return;
    this.orbitAngle = MathUtils.euclideanModulo(this.orbitAngle + delta, Math.PI * 2);
    this.updateCameraPose();
    if (camera) this.applyToCamera(camera);
  }

  resetOrbit(camera?: PerspectiveCamera): void {
    this.orbitAngle = 0;
    this.updateCameraPose();
    if (camera) this.applyToCamera(camera);
  }

  applyToCamera(camera: PerspectiveCamera): void {
    camera.position.copy(this.cameraPosition);
    camera.lookAt(this.lookAt);
    camera.near = this.activeSpace === "sky-component" ? 0.05 : 0.1;
    camera.far = this.activeSpace === "sky-component" ? 600 : 100;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  }

  getState(): CommonArchiveEnvironmentState {
    const source = this.activeSpace === "room1" ? this.roomSource : this.skySource;
    return {
      id: "common-archive-room1-and-sky-component",
      activeSpace: this.activeSpace,
      ready: this.loadStatus === "ready",
      loadStatus: this.loadStatus,
      loadError: this.loadError,
      disposed: this.disposed,
      visible: this.group.visible && this.group.parent !== null,
      orbitAngleRadians: this.orbitAngle,
      cameraPosition: this.cameraPosition.toArray(),
      lookAt: this.lookAt.toArray(),
      source: source.source,
      sourceSha256: source.sha256,
      classification: source.classification,
      geometry: {
        vertices: source.vertexCount,
        triangles: source.triangleCount,
        materialGroups: source.groups.length,
        sourceBounds: source.bounds
      },
      textures: [...new Set(source.embeddedTextureNames)],
      evidence: {
        exact: this.activeSpace === "room1"
          ? [
              COMMON_ARCHIVE_SPACE_EVIDENCE.room1.exact,
              "The DDS filenames are embedded in room.tvm and the decoded mesh preserves its indexed geometry, normals and UVs.",
              "TV3D source +Z is mirrored to web -Z to preserve the source view in Three's right-handed coordinates."
            ]
          : [
              COMMON_ARCHIVE_SPACE_EVIDENCE["sky-component"].exact,
              "No archived source in this repository loads sky.tvm as a standalone scene.",
              "TV3D source +Z is mirrored to web -Z to preserve the source view in Three's right-handed coordinates."
            ],
        inference: this.activeSpace === "room1"
          ? ["Camera orbit and lights are restoration choices; no authored Room 1 assembly was recovered."]
          : ["The 250x display scale and preview camera heading only demonstrate the source skydome component."]
      }
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.loadStatus = "disposed";
    this.group.removeFromParent();
    this.group.clear();
    this.room.geometry.dispose();
    this.sky.geometry.dispose();
    this.roomMaterial.dispose();
    for (const material of this.skyMaterials) material.dispose();
    for (const texture of this.textures) texture.dispose();
    this.textures.clear();
  }

  private updateVisibility(): void {
    const roomVisible = this.activeSpace === "room1";
    this.room.visible = roomVisible;
    this.ambientLight.visible = roomVisible;
    this.pointLight.visible = roomVisible;
    this.sky.visible = !roomVisible;
  }

  private updateCameraPose(): void {
    if (this.activeSpace === "room1") {
      this.cameraPosition.set(
        Math.sin(this.orbitAngle) * ROOM_ORBIT_RADIUS,
        ROOM_CAMERA_HEIGHT,
        Math.cos(this.orbitAngle) * ROOM_ORBIT_RADIUS
      );
      this.lookAt.set(0, ROOM_LOOK_HEIGHT, 0);
      return;
    }
    this.cameraPosition.set(0, 0, 0);
    this.lookAt.set(Math.sin(this.orbitAngle) * 10, 0.08, -Math.cos(this.orbitAngle) * 10);
  }

  private async loadTextures(): Promise<void> {
    try {
      const [roomColor, roomNormal, midDay, topPole, bottomPole] = await Promise.all(
        ["tv3dlogo_d.dds", "tv3dlogo_n.dds", "mid_day.dds", "top_pole.dds", "bottom_pole.dds"].map((name) =>
          this.ddsLoader.loadAsync(`${this.assetBaseUrl}/${name}`)
        )
      );
      for (const texture of [roomColor, roomNormal, midDay, topPole, bottomPole]) this.textures.add(texture);
      if (this.disposed) {
        for (const texture of this.textures) texture.dispose();
        this.textures.clear();
        return;
      }

      roomColor.colorSpace = SRGBColorSpace;
      roomColor.wrapS = RepeatWrapping;
      roomColor.wrapT = RepeatWrapping;
      roomNormal.wrapS = RepeatWrapping;
      roomNormal.wrapT = RepeatWrapping;
      this.roomMaterial.map = roomColor;
      this.roomMaterial.normalMap = roomNormal;
      this.roomMaterial.normalScale.set(0.9, 0.9);
      this.roomMaterial.needsUpdate = true;

      for (const texture of [midDay, topPole, bottomPole]) {
        texture.colorSpace = SRGBColorSpace;
        texture.wrapS = ClampToEdgeWrapping;
        texture.wrapT = ClampToEdgeWrapping;
      }
      for (let index = 0; index < 4; index += 1) {
        this.skyMaterials[index].map = midDay;
        this.skyMaterials[index].needsUpdate = true;
      }
      this.skyMaterials[4].map = topPole;
      this.skyMaterials[4].needsUpdate = true;
      this.skyMaterials[5].map = bottomPole;
      this.skyMaterials[5].needsUpdate = true;
      this.loadStatus = "ready";
    } catch (error) {
      if (this.disposed) return;
      this.loadStatus = "error";
      this.loadError = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }
}

export async function createCommonArchiveEnvironment(
  options: CommonArchiveEnvironmentOptions = {}
): Promise<CommonArchiveEnvironment> {
  const environment = new CommonArchiveEnvironment(options);
  await environment.ready;
  return environment;
}
