import {
  AmbientLight,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  LoadingManager,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  OrthographicCamera,
  PerspectiveCamera,
  PointLight,
  RepeatWrapping,
  SphereGeometry,
  SRGBColorSpace,
  Texture,
  Vector3
} from "three";
import { TeapotGeometry } from "three/examples/jsm/geometries/TeapotGeometry.js";
import { DDSLoader } from "three/examples/jsm/loaders/DDSLoader.js";
import commonScenesJson from "./legacy/common-scenes.json";

type Tuple3 = readonly [number, number, number];
type CommonRoomCamera = PerspectiveCamera | OrthographicCamera;
type LoadStatus = "loading" | "ready" | "error" | "disposed";

type CommonSceneGroupData = {
  vertexCount: number;
  vertexStart: number;
  triangleCount: number;
  triangleStart: number;
};

type CommonSceneData = {
  id: string;
  source: string;
  sha256: string;
  vertexCount: number;
  triangleCount: number;
  positions: number[];
  normals: number[];
  uvs: number[] | null;
  indices: number[];
  materialIndexByTriangle: number[];
  groups: CommonSceneGroupData[];
};

type CommonScenesData = {
  room2ArchiveAssembly: {
    evidence: string;
    room: { position: Tuple3; scale: Tuple3 };
    teapot: { position: Tuple3; scale: Tuple3 };
    lightMarker: { type: string; radius: number; position: Tuple3 };
    light: { position: Tuple3; color: Tuple3 };
    camera: {
      orbitCenter: Tuple3;
      orbitRadius: number;
      lookAt: Tuple3;
      controls: string;
    };
    shading: string;
  };
  scenes: CommonSceneData[];
};

export type CommonRoomEnvironmentOptions = {
  /** Public URL containing the unmodified archived DDS files. */
  assetBaseUrl?: string;
  loadingManager?: LoadingManager;
  shadowMapSize?: number;
  pointLightIntensity?: number;
  /** Original code changes its degree angle by 0.03 per elapsed millisecond. */
  orbitSpeedRadiansPerSecond?: number;
};

export type CommonRoomEnvironmentState = {
  id: "common-room2-shadow-demo";
  source: string;
  sourceSha256: string;
  evidence: string;
  ready: boolean;
  visible: boolean;
  loadStatus: LoadStatus;
  loadError: string | null;
  disposed: boolean;
  orbitAngleRadians: number;
  orbitAngleDegrees: number;
  orbitRadius: number;
  orbitCenter: [number, number, number];
  lookAt: [number, number, number];
  cameraPosition: [number, number, number];
  objects: readonly ["room2", "teapot", "light-marker"];
  light: {
    position: [number, number, number];
    color: string;
    intensity: number;
    visible: boolean;
    castShadow: boolean;
    shadowMapSize: [number, number];
  };
  controls: "A/D orbit";
  recommendedBackground: "#000000";
};

const COMMON_SCENES = commonScenesJson as unknown as CommonScenesData;
const ROOM2_ID = "common-room2-shadow-demo";
const DEFAULT_ASSET_BASE_URL = "/assets/textures/common";
const DEFAULT_ORBIT_SPEED = MathUtils.degToRad(30);
const INITIAL_ORBIT_ANGLE = MathUtils.degToRad(0.01);

function assertFiniteArray(name: string, values: readonly number[], expectedLength: number): void {
  if (values.length !== expectedLength || values.some((value) => !Number.isFinite(value))) {
    throw new Error(`Common Room 2 ${name} data is invalid.`);
  }
}

function room2Source(): CommonSceneData {
  const source = COMMON_SCENES.scenes.find((scene) => scene.id === ROOM2_ID);
  if (!source) {
    throw new Error("Common Room 2 data is absent from common-scenes.json.");
  }
  assertFiniteArray("position", source.positions, source.vertexCount * 3);
  assertFiniteArray("normal", source.normals, source.vertexCount * 3);
  if (!source.uvs) {
    throw new Error("Common Room 2 is missing its archived UV coordinates.");
  }
  assertFiniteArray("UV", source.uvs, source.vertexCount * 2);
  assertFiniteArray("index", source.indices, source.triangleCount * 3);
  if (source.indices.some((index) => !Number.isInteger(index) || index < 0 || index >= source.vertexCount)) {
    throw new Error("Common Room 2 contains an out-of-range geometry index.");
  }
  if (source.materialIndexByTriangle.length !== source.triangleCount) {
    throw new Error("Common Room 2 material assignments do not match its triangle count.");
  }
  return source;
}

function buildRoomGeometry(source: CommonSceneData): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.name = "Common Room 2 archived indexed geometry";
  geometry.setAttribute("position", new Float32BufferAttribute(source.positions, 3));
  geometry.setAttribute("normal", new Float32BufferAttribute(source.normals, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(source.uvs ?? [], 2));
  geometry.setIndex(source.indices);

  for (const group of source.groups) {
    const materialIndex = source.materialIndexByTriangle[group.triangleStart] ?? 0;
    geometry.addGroup(group.triangleStart * 3, group.triangleCount * 3, materialIndex);
  }
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function setTuple(target: Vector3, value: Tuple3): void {
  target.set(value[0], value[1], value[2]);
}

function colorFromTuple(value: Tuple3): Color {
  return new Color(value[0], value[1], value[2]);
}

/**
 * Isolated, non-race reconstruction of the archived Room 2 shadow-mapping demo.
 * Add `group` to a Three.js Scene, await `ready`, and call `update` each frame.
 */
export class CommonRoomEnvironment {
  readonly group = new Group();
  readonly room: Mesh<BufferGeometry, MeshStandardMaterial>;
  readonly teapot: Mesh<TeapotGeometry, MeshStandardMaterial>;
  readonly lightMarker: Mesh<SphereGeometry, MeshBasicMaterial>;
  readonly pointLight: PointLight;
  readonly ready: Promise<void>;

  private readonly roomMaterial: MeshStandardMaterial;
  private readonly teapotMaterial: MeshStandardMaterial;
  private readonly markerMaterial: MeshBasicMaterial;
  private readonly ambientLight: AmbientLight;
  private readonly ddsLoader: DDSLoader;
  private readonly assetBaseUrl: string;
  private readonly orbitCenter: Vector3;
  private readonly lookAtTarget: Vector3;
  private readonly cameraPosition = new Vector3();
  private readonly ownedTextures = new Set<Texture>();
  private readonly orbitRadius: number;
  private readonly orbitSpeed: number;
  private readonly source: CommonSceneData;
  private orbitAngle = INITIAL_ORBIT_ANGLE;
  private status: LoadStatus = "loading";
  private errorMessage: string | null = null;
  private isDisposed = false;

  constructor(options: CommonRoomEnvironmentOptions = {}) {
    this.source = room2Source();
    const assembly = COMMON_SCENES.room2ArchiveAssembly;
    this.assetBaseUrl = (options.assetBaseUrl ?? DEFAULT_ASSET_BASE_URL).replace(/\/$/, "");
    this.ddsLoader = new DDSLoader(options.loadingManager);
    this.orbitCenter = new Vector3(...assembly.camera.orbitCenter);
    this.lookAtTarget = new Vector3(...assembly.camera.lookAt);
    this.orbitRadius = assembly.camera.orbitRadius;
    this.orbitSpeed = options.orbitSpeedRadiansPerSecond ?? DEFAULT_ORBIT_SPEED;

    this.group.name = "Common Room 2 — HLSL Shadow Mapping #23";
    this.group.userData.archiveEnvironment = {
      id: ROOM2_ID,
      source: this.source.source,
      sha256: this.source.sha256,
      evidence: assembly.evidence,
      kind: "standalone-3d-environment"
    };

    this.roomMaterial = new MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.72,
      metalness: 0,
      name: "Room 2 TV3D logo diffuse + tangent-space normal"
    });
    this.room = new Mesh(buildRoomGeometry(this.source), this.roomMaterial);
    this.room.name = "room2.tvm";
    setTuple(this.room.position, assembly.room.position);
    setTuple(this.room.scale, assembly.room.scale);
    this.room.castShadow = true;
    this.room.receiveShadow = true;
    this.group.add(this.room);

    this.teapotMaterial = new MeshStandardMaterial({
      color: 0xb9bec6,
      roughness: 0.55,
      metalness: 0.08,
      name: "Archived demo teapot neutral material"
    });
    this.teapot = new Mesh(new TeapotGeometry(1, 10), this.teapotMaterial);
    this.teapot.name = "CreateTeapot demo object";
    setTuple(this.teapot.position, assembly.teapot.position);
    setTuple(this.teapot.scale, assembly.teapot.scale);
    this.teapot.castShadow = true;
    this.teapot.receiveShadow = true;
    this.group.add(this.teapot);

    this.markerMaterial = new MeshBasicMaterial({ color: colorFromTuple(assembly.light.color) });
    this.lightMarker = new Mesh(
      new SphereGeometry(assembly.lightMarker.radius, 4, 4),
      this.markerMaterial
    );
    this.lightMarker.name = "Archived point-light marker";
    setTuple(this.lightMarker.position, assembly.lightMarker.position);
    this.group.add(this.lightMarker);

    this.pointLight = new PointLight(
      colorFromTuple(assembly.light.color),
      options.pointLightIntensity ?? 3.5,
      0,
      0
    );
    this.pointLight.name = "Room 2 point light";
    setTuple(this.pointLight.position, assembly.light.position);
    this.pointLight.castShadow = true;
    const shadowMapSize = Math.max(128, Math.floor(options.shadowMapSize ?? 1024));
    this.pointLight.shadow.mapSize.set(shadowMapSize, shadowMapSize);
    this.pointLight.shadow.camera.near = 1;
    this.pointLight.shadow.camera.far = 1500;
    this.pointLight.shadow.camera.updateProjectionMatrix();
    this.group.add(this.pointLight);

    // The archived shader adds a 0.15 diffuse floor before shadow composition.
    this.ambientLight = new AmbientLight(0xffffff, 0.15);
    this.ambientLight.name = "meshlight.shade ambient floor";
    this.group.add(this.ambientLight);

    this.updateCameraPosition();
    this.ready = this.loadArchivedTextures();
  }

  /** A/left is +1 and D/right is -1, matching the archived demo. */
  update(deltaSeconds: number, orbitInput = 0, camera?: CommonRoomCamera): CommonRoomEnvironmentState {
    if (!this.isDisposed && Number.isFinite(deltaSeconds) && Number.isFinite(orbitInput)) {
      this.orbitAngle += MathUtils.clamp(orbitInput, -1, 1) * this.orbitSpeed * Math.max(0, deltaSeconds);
      this.orbitAngle = MathUtils.euclideanModulo(this.orbitAngle, Math.PI * 2);
      this.updateCameraPosition();
    }
    if (camera) {
      this.applyToCamera(camera);
    }
    return this.getState();
  }

  applyToCamera(camera: CommonRoomCamera): void {
    camera.position.copy(this.cameraPosition);
    camera.lookAt(this.lookAtTarget);
    camera.updateMatrixWorld();
  }

  setOrbitAngleRadians(angle: number, camera?: CommonRoomCamera): void {
    if (!Number.isFinite(angle)) {
      return;
    }
    this.orbitAngle = MathUtils.euclideanModulo(angle, Math.PI * 2);
    this.updateCameraPosition();
    if (camera) {
      this.applyToCamera(camera);
    }
  }

  orbitByRadians(delta: number, camera?: CommonRoomCamera): void {
    if (Number.isFinite(delta)) {
      this.setOrbitAngleRadians(this.orbitAngle + delta, camera);
    }
  }

  resetOrbit(camera?: CommonRoomCamera): void {
    this.setOrbitAngleRadians(INITIAL_ORBIT_ANGLE, camera);
  }

  getState(): CommonRoomEnvironmentState {
    return {
      id: ROOM2_ID,
      source: this.source.source,
      sourceSha256: this.source.sha256,
      evidence: COMMON_SCENES.room2ArchiveAssembly.evidence,
      ready: this.status === "ready",
      visible: this.group.visible && this.group.parent !== null,
      loadStatus: this.status,
      loadError: this.errorMessage,
      disposed: this.isDisposed,
      orbitAngleRadians: this.orbitAngle,
      orbitAngleDegrees: MathUtils.radToDeg(this.orbitAngle),
      orbitRadius: this.orbitRadius,
      orbitCenter: this.orbitCenter.toArray(),
      lookAt: this.lookAtTarget.toArray(),
      cameraPosition: this.cameraPosition.toArray(),
      objects: ["room2", "teapot", "light-marker"],
      light: {
        position: this.pointLight.position.toArray(),
        color: `#${this.pointLight.color.getHexString()}`,
        intensity: this.pointLight.intensity,
        visible: this.pointLight.visible,
        castShadow: this.pointLight.castShadow,
        shadowMapSize: [this.pointLight.shadow.mapSize.x, this.pointLight.shadow.mapSize.y]
      },
      controls: "A/D orbit",
      recommendedBackground: "#000000"
    };
  }

  dispose(): void {
    if (this.isDisposed) {
      return;
    }
    this.isDisposed = true;
    this.status = "disposed";
    this.group.removeFromParent();
    this.group.clear();
    this.room.geometry.dispose();
    this.teapot.geometry.dispose();
    this.lightMarker.geometry.dispose();
    this.roomMaterial.dispose();
    this.teapotMaterial.dispose();
    this.markerMaterial.dispose();
    for (const texture of this.ownedTextures) {
      texture.dispose();
    }
    this.ownedTextures.clear();
    this.pointLight.shadow.dispose();
  }

  private updateCameraPosition(): void {
    this.cameraPosition.set(
      this.orbitCenter.x + Math.sin(this.orbitAngle) * this.orbitRadius,
      this.orbitCenter.y,
      this.orbitCenter.z - Math.cos(this.orbitAngle) * this.orbitRadius
    );
  }

  private async loadArchivedTextures(): Promise<void> {
    try {
      const colorTexture = await this.ddsLoader.loadAsync(`${this.assetBaseUrl}/tv3dlogo_d.dds`);
      this.ownedTextures.add(colorTexture);
      const normalTexture = await this.ddsLoader.loadAsync(`${this.assetBaseUrl}/tv3dlogo_n.dds`);
      this.ownedTextures.add(normalTexture);

      if (this.isDisposed) {
        colorTexture.dispose();
        normalTexture.dispose();
        this.ownedTextures.clear();
        return;
      }

      for (const texture of [colorTexture, normalTexture]) {
        texture.wrapS = RepeatWrapping;
        texture.wrapT = RepeatWrapping;
        texture.needsUpdate = true;
      }
      colorTexture.colorSpace = SRGBColorSpace;
      this.roomMaterial.map = colorTexture;
      this.roomMaterial.normalMap = normalTexture;
      this.roomMaterial.needsUpdate = true;
      this.status = "ready";
    } catch (error) {
      if (this.isDisposed) {
        return;
      }
      this.status = "error";
      this.errorMessage = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }
}

export async function createCommonRoomEnvironment(
  options: CommonRoomEnvironmentOptions = {}
): Promise<CommonRoomEnvironment> {
  const environment = new CommonRoomEnvironment(options);
  await environment.ready;
  return environment;
}
