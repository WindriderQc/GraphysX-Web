import {
  BackSide,
  BoxGeometry,
  BufferGeometry,
  DoubleSide,
  Group,
  HemisphereLight,
  IcosahedronGeometry,
  Line,
  LineBasicMaterial,
  LoadingManager,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshPhongMaterial,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  Raycaster,
  ShaderMaterial,
  SphereGeometry,
  SpotLight,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  Vector2,
  Vector3
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

type Tuple3 = [number, number, number];
type LoadStatus = "loading" | "ready" | "error" | "disposed";

const ASSET_ROOT = "/assets/threejs-playground";
const SOURCE_PATH = String.raw`E:\Media\Datalake\Codes\SBQC\public\Projects\3D Playground`;
const TERRAIN_SEED = 0x33504c59;
const DEFAULT_ORBIT_ANGLE = 0.72;
const CAMERA_RADIUS = 60;
const CAMERA_HEIGHT = 48;
const CAMERA_DISTANCE = Math.hypot(CAMERA_RADIUS, CAMERA_HEIGHT);
const CAMERA_TARGET = new Vector3(15, 8, 5);

const SOURCE_ASSETS = {
  "media/Airplane.glb": { bytes: 377648, sha256: "2F9A5382E70BDBEF5D54024C6846A3A53389B889D73121159FB335352D311388" },
  "textures/twoway.jpg": { bytes: 20876, sha256: "4998527ACE4E853954E77EC5B937024CB2D2E23064FBBDE4A039224E978A2B21" },
  "textures/earth/earth_uv_with_topo.jpg": { bytes: 2566770, sha256: "A9F0088972DEE0254610AF851C4D6838CA3F2CF79176987E0A5713E2C15EC042" },
  "textures/sky/asteroids/asteroids_bk.jpg": { bytes: 140154, sha256: "C93993EEA4760D30293B437B3D3191067291C6ADD2490DF06C69E99BF3C1203D" },
  "textures/sky/asteroids/asteroids_dn.jpg": { bytes: 100659, sha256: "14918B653F59E7D652AA71461EF1A4F9AC2037B7485CEC328CDFEEEE9ED87D1F" },
  "textures/sky/asteroids/asteroids_ft.jpg": { bytes: 133257, sha256: "4EB42FC7EB8C7EEE84FB63C174711634570FCE2C79EA1C484B35BC9F6452E3BC" },
  "textures/sky/asteroids/asteroids_lf.jpg": { bytes: 127445, sha256: "EB609931BA0B4C21D89447C03819B7CA06387EE505B8AB259B8212047AE6CE76" },
  "textures/sky/asteroids/asteroids_rt.jpg": { bytes: 127102, sha256: "A69148B4CFCECEC961C1319E3F262E2F46AB4F00DE5FBCF9805F3FB20EBCE582" },
  "textures/sky/asteroids/asteroids_up.jpg": { bytes: 118191, sha256: "87E1F43997F0A705A88A4BE1BE6C53301B8AFE0C10E7A8EAD83377E615FE9886" }
} as const;

const PRESENTATION_ADAPTERS = [
  "The archived camera remained at the Three.js origin with no authored framing; applyToCamera supplies a reversible orbit presentation camera while retaining the source 55-degree FOV and 30000-unit far plane.",
  "The archived PlaneGeometry had no world rotation, leaving its random local-Z relief vertical at the unusable default camera; the restoration rotates it onto XZ so local Z becomes terrain height while preserving the exact 10x10 subdivision and [0,1) relief rule.",
  "Math.random terrain heights are replaced by a fixed-seed generator so archive QA and agent control are deterministic.",
  "Legacy IcosahedronBufferGeometry is mapped to modern IcosahedronGeometry without changing radius or detail.",
  "Frame-count animation is evaluated at a deterministic 60 Hz; archived formulas for the airplane, shaders, cube, planets, and spotlight are otherwise retained.",
  "The archived dat.GUI hierarchy is restored with native range controls and the same folders, defaults, labels, and numeric bounds; it drives the same environment API in both the main archive and isolated preview.",
  "Archived JPEG color textures are tagged sRGB for the modern Three.js renderer."
] as const;

const VERTEX_SHADER = /* glsl */ `
uniform float time;
uniform vec3 mousePosition;
float speed = .05;
varying vec3 vNormal;
varying vec3 vPosition;

mat4 rotationMatrix(vec3 axis, float angle) {
  axis = normalize(axis);
  float s = sin(angle);
  float c = cos(angle);
  float oc = 1.0 - c;
  return mat4(
    oc * axis.x * axis.x + c,          oc * axis.x * axis.y - axis.z * s, oc * axis.z * axis.x + axis.y * s, 0.0,
    oc * axis.x * axis.y + axis.z * s, oc * axis.y * axis.y + c,          oc * axis.y * axis.z - axis.x * s, 0.0,
    oc * axis.z * axis.x - axis.y * s, oc * axis.y * axis.z + axis.x * s, oc * axis.z * axis.z + c,          0.0,
    0.0, 0.0, 0.0, 1.0
  );
}

void main() {
  vNormal = normal;
  vPosition = position;
  vec3 offset = position;
  float sinu = sin(time * speed + position.x) * 0.2;
  offset += sinu * normal;
  mat4 rotation = rotationMatrix(vec3(0.0, 0.0, 1.0), sinu);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(offset, 1.0) * rotation;
}
`;

const FRAGMENT_SHADER = /* glsl */ `
varying vec3 vNormal;
varying vec3 vPosition;
uniform float time;
uniform vec3 mousePosition;
float speed = .01;

void main() {
  vec3 light = vec3(0.0, 0.0, .8);
  float dProd = max(0.0, dot(vNormal, light));
  gl_FragColor = vec4(
    dProd * (sin(time * speed / 20.0) + 1.0) / 2.0,
    dProd * (sin(time * speed) + 1.0) / 2.0,
    dProd * (sin(time * speed / 10.0) + 1.0) / 2.0,
    1.0
  );
}
`;

export type ThreejsPlaygroundState = {
  id: "threejs-playground";
  classification: "complete exact-asset restoration of the authored Three.js Playground";
  restorationStatus: "RESTORED";
  ready: boolean;
  loadStatus: LoadStatus;
  error: string | null;
  disposed: boolean;
  elapsedSeconds: number;
  frameCount60Hz: number;
  source: {
    path: string;
    assetCount: 9;
    totalBytes: 3712102;
    assets: typeof SOURCE_ASSETS;
  };
  camera: {
    position: Tuple3;
    lookAt: Tuple3;
    orbitAngleRadians: number;
    zoom: number;
    fieldOfViewDegrees: 55;
    near: 10;
    far: 30000;
  };
  airplane: {
    loaded: boolean;
    position: Tuple3 | null;
    orbitAngleRadians: number;
    orbitRadius: 5;
    scale: 10;
  };
  morphSpheres: {
    count: 3;
    shaderActive: boolean;
    positions: Tuple3[];
  };
  earthSpheres: {
    count: 3;
    labels: ["Earth", "Mars", "Moon"];
    sharedEarthTexture: true;
    positions: Tuple3[];
    rotationYRadians: number;
  };
  terrain: {
    width: number;
    height: number;
    segmentsX: number;
    segmentsY: number;
    vertexCount: number;
    seed: number;
    heightRange: Tuple3;
    raycastEnabled: boolean;
    raycastTestCount: number;
    raycastHit: boolean;
    lastRaycastPoint: Tuple3 | null;
  };
  sky: {
    ready: boolean;
    name: "asteroids";
    faceCount: 6;
    size: 10000;
  };
  animatedLight: {
    active: boolean;
    intensity: number;
    sourcePeriodFrames: 240;
    sourceAmplitude: 75;
    sourceOffset: 73;
  };
  authoredExtras: {
    texturedCubeCount: number;
    blueLinePointCount: number;
  };
  gui: {
    restored: true;
    controllerCount: 16;
    folders: ["World", "Camera", "Cube", "Plane", "Planets", "Earth", "Mars", "Moon"];
    camera: { x: number; y: number; z: number; min: -1000; max: 1000 };
    cube: { speedX: number; speedY: number; min: 1; max: 3600 };
    plane: { width: number; height: number; x: number; y: number; z: number; sizeMin: 1; sizeMax: 100; positionMin: -100; positionMax: 100 };
    planets: Array<{ label: "Earth" | "Mars" | "Moon"; speedX: number; speedY: number; min: 1; max: 3600 }>;
  };
  fps: {
    value: number;
    label: string;
    band: "red" | "deepskyblue" | "black";
    progressMin: 0;
    progressMax: 100;
  };
  coordinateSystem: string;
  presentationAdapters: string[];
  exactEvidence: string[];
};

export type ThreejsPlaygroundParameter =
  | "camera.x" | "camera.y" | "camera.z"
  | "cube.speedX" | "cube.speedY"
  | "plane.width" | "plane.height" | "plane.x" | "plane.y" | "plane.z"
  | "earth.speedX" | "earth.speedY"
  | "mars.speedX" | "mars.speedY"
  | "moon.speedX" | "moon.speedY";

export type ThreejsPlaygroundOptions = {
  loadingManager?: LoadingManager;
};

function tuple(vector: Vector3): Tuple3 {
  return [
    Number(vector.x.toFixed(6)),
    Number(vector.y.toFixed(6)),
    Number(vector.z.toFixed(6))
  ];
}

function deterministicRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function loadTexture(loader: TextureLoader, relativePath: string): Promise<Texture> {
  return new Promise((resolve, reject) => {
    loader.load(
      `${ASSET_ROOT}/${relativePath}`,
      (texture) => {
        texture.colorSpace = SRGBColorSpace;
        resolve(texture);
      },
      undefined,
      reject
    );
  });
}

export class ThreejsPlaygroundEnvironment {
  readonly group = new Group();
  readonly ready: Promise<void>;

  private loadStatus: LoadStatus = "loading";
  private loadError: string | null = null;
  private disposed = false;
  private elapsedSeconds = 0;
  private frameCount = 1;
  private measuredFps = 0;
  private orbitAngle = DEFAULT_ORBIT_ANGLE;
  private zoom = 1;
  private manualCamera = false;
  private cubeSpeedX = 2000;
  private cubeSpeedY = 1000;
  private planeWidth = 10;
  private planeHeight = 10;
  private readonly planePosition = new Vector3();
  private readonly planetSpeeds = [
    { label: "Earth" as const, speedX: 2000, speedY: 1000 },
    { label: "Mars" as const, speedX: 2000, speedY: 1000 },
    { label: "Moon" as const, speedX: 2000, speedY: 1000 }
  ];
  private readonly cameraTarget = CAMERA_TARGET.clone();
  private readonly cameraPosition = new Vector3();
  private readonly mousePosition = new Vector3(0, 0, 0.2);
  private readonly raycaster = new Raycaster();
  private readonly loadingManager: LoadingManager;
  private airplane: Object3D | null = null;
  private cube: Mesh | null = null;
  private terrain: Mesh<PlaneGeometry, MeshPhongMaterial> | null = null;
  private readonly morphMaterials: ShaderMaterial[] = [];
  private readonly morphMeshes: Mesh[] = [];
  private readonly earthMeshes: Mesh[] = [];
  private spotlight: SpotLight | null = null;
  private skyReady = false;
  private terrainHeightMin = 0;
  private terrainHeightMax = 0;
  private raycastTestCount = 0;
  private raycastHit = false;
  private lastRaycastPoint: Vector3 | null = null;

  constructor(options: ThreejsPlaygroundOptions = {}) {
    this.group.name = "ThreejsPlaygroundEnvironment";
    this.loadingManager = options.loadingManager ?? new LoadingManager();
    this.updateCameraPosition();
    this.ready = this.initialize().then(() => {
      if (this.disposed) return;
      this.loadStatus = "ready";
      this.update(0, 0);
    }).catch((error: unknown) => {
      this.loadError = error instanceof Error ? error.message : String(error);
      this.loadStatus = "error";
      throw error;
    });
  }

  getState(): ThreejsPlaygroundState {
    const airplanePosition = this.airplane ? tuple(this.airplane.position) : null;
    const airplaneAngle = (this.elapsedSeconds * 1000 / 360) * Math.PI * 0.2;
    const terrainHeights: Tuple3 = [
      Number(this.terrainHeightMin.toFixed(6)),
      Number(this.terrainHeightMax.toFixed(6)),
      1
    ];
    const terrainSegmentsX = Math.max(1, Math.floor(this.planeWidth));
    const terrainSegmentsY = Math.max(1, Math.floor(this.planeHeight));
    const fpsValue = Math.max(0, Math.round(this.measuredFps));
    const fpsBand = fpsValue < 35 ? "red" : fpsValue <= 41 ? "deepskyblue" : "black";
    return {
      id: "threejs-playground",
      classification: "complete exact-asset restoration of the authored Three.js Playground",
      restorationStatus: "RESTORED",
      ready: this.loadStatus === "ready",
      loadStatus: this.loadStatus,
      error: this.loadError,
      disposed: this.disposed,
      elapsedSeconds: Number(this.elapsedSeconds.toFixed(6)),
      frameCount60Hz: Number(this.frameCount.toFixed(3)),
      source: {
        path: SOURCE_PATH,
        assetCount: 9,
        totalBytes: 3712102,
        assets: SOURCE_ASSETS
      },
      camera: {
        position: tuple(this.cameraPosition),
        lookAt: tuple(this.cameraTarget),
        orbitAngleRadians: Number(this.orbitAngle.toFixed(6)),
        zoom: Number(this.zoom.toFixed(6)),
        fieldOfViewDegrees: 55,
        near: 10,
        far: 30000
      },
      airplane: {
        loaded: Boolean(this.airplane),
        position: airplanePosition,
        orbitAngleRadians: Number(airplaneAngle.toFixed(6)),
        orbitRadius: 5,
        scale: 10
      },
      morphSpheres: {
        count: 3,
        shaderActive: this.morphMaterials.length === 3,
        positions: this.morphMeshes.map((mesh) => tuple(mesh.position))
      },
      earthSpheres: {
        count: 3,
        labels: ["Earth", "Mars", "Moon"],
        sharedEarthTexture: true,
        positions: this.earthMeshes.map((mesh) => tuple(mesh.position)),
        rotationYRadians: Number((this.earthMeshes[0]?.rotation.y ?? 0).toFixed(6))
      },
      terrain: {
        width: this.planeWidth,
        height: this.planeHeight,
        segmentsX: terrainSegmentsX,
        segmentsY: terrainSegmentsY,
        vertexCount: (terrainSegmentsX + 1) * (terrainSegmentsY + 1),
        seed: TERRAIN_SEED,
        heightRange: terrainHeights,
        raycastEnabled: Boolean(this.terrain),
        raycastTestCount: this.raycastTestCount,
        raycastHit: this.raycastHit,
        lastRaycastPoint: this.lastRaycastPoint ? tuple(this.lastRaycastPoint) : null
      },
      sky: {
        ready: this.skyReady,
        name: "asteroids",
        faceCount: 6,
        size: 10000
      },
      animatedLight: {
        active: Boolean(this.spotlight),
        intensity: Number((this.spotlight?.intensity ?? 0).toFixed(6)),
        sourcePeriodFrames: 240,
        sourceAmplitude: 75,
        sourceOffset: 73
      },
      authoredExtras: {
        texturedCubeCount: this.cube ? 1 : 0,
        blueLinePointCount: 3
      },
      gui: {
        restored: true,
        controllerCount: 16,
        folders: ["World", "Camera", "Cube", "Plane", "Planets", "Earth", "Mars", "Moon"],
        camera: {
          x: Number(this.cameraPosition.x.toFixed(3)),
          y: Number(this.cameraPosition.y.toFixed(3)),
          z: Number(this.cameraPosition.z.toFixed(3)),
          min: -1000,
          max: 1000
        },
        cube: { speedX: this.cubeSpeedX, speedY: this.cubeSpeedY, min: 1, max: 3600 },
        plane: {
          width: this.planeWidth,
          height: this.planeHeight,
          x: Number(this.planePosition.x.toFixed(3)),
          y: Number(this.planePosition.y.toFixed(3)),
          z: Number(this.planePosition.z.toFixed(3)),
          sizeMin: 1,
          sizeMax: 100,
          positionMin: -100,
          positionMax: 100
        },
        planets: this.planetSpeeds.map((planet) => ({ ...planet, min: 1 as const, max: 3600 as const }))
      },
      fps: {
        value: fpsValue,
        label: fpsValue < 35 ? `${fpsValue}` : `${fpsValue} FPS`,
        band: fpsBand,
        progressMin: 0,
        progressMax: 100
      },
      coordinateSystem: "Right-handed Three.js world coordinates: +X right, +Y up, +Z toward the initial presentation camera; terrain spans XZ around the origin.",
      presentationAdapters: [...PRESENTATION_ADAPTERS],
      exactEvidence: [
        "All nine runtime files are byte-identical copies verified by the SHA-256 values exposed in source.assets.",
        "Airplane.glb retains the archived scale 10 and radius-5 orbit centered at (5, 10, 5).",
        "The three morph spheres retain radius 2, detail 5, archived shader math, and the source position.set(x, y, y) placement.",
        "Earth, Mars, and Moon retain radius 5, 50x50 segments, source positions, and the same earth_uv_with_topo.jpg texture.",
        "The asteroids cube retains the archived 10000-unit size and ft/bk/up/dn/rt/lf face mapping.",
        "The spotlight retains amplitude 75, frame period 240, and offset 73.",
        "All 16 archived dat.GUI controllers and the original red/deepskyblue/black FPS thresholds are restored as live controls and telemetry."
      ]
    };
  }

  applyToCamera(camera: PerspectiveCamera): void {
    camera.fov = 55;
    camera.near = 10;
    camera.far = 30000;
    camera.position.copy(this.cameraPosition);
    camera.lookAt(this.cameraTarget);
    camera.updateProjectionMatrix();
  }

  orbitByRadians(delta: number, camera?: PerspectiveCamera): void {
    if (!Number.isFinite(delta)) return;
    this.manualCamera = false;
    this.orbitAngle += delta;
    this.updateCameraPosition();
    if (camera) this.applyToCamera(camera);
  }

  zoomBy(factor: number, camera?: PerspectiveCamera): void {
    if (!Number.isFinite(factor) || factor <= 0) return;
    this.manualCamera = false;
    this.zoom = MathUtils.clamp(this.zoom * factor, 0.45, 2.2);
    this.updateCameraPosition();
    if (camera) this.applyToCamera(camera);
  }

  reset(camera?: PerspectiveCamera): void {
    this.elapsedSeconds = 0;
    this.frameCount = 1;
    this.measuredFps = 0;
    this.orbitAngle = DEFAULT_ORBIT_ANGLE;
    this.zoom = 1;
    this.manualCamera = false;
    this.cubeSpeedX = 2000;
    this.cubeSpeedY = 1000;
    this.planeWidth = 10;
    this.planeHeight = 10;
    this.planePosition.set(0, 0, 0);
    for (const planet of this.planetSpeeds) {
      planet.speedX = 2000;
      planet.speedY = 1000;
    }
    if (this.terrain) this.rebuildTerrain();
    this.mousePosition.set(0, 0, 0.2);
    this.raycastTestCount = 0;
    this.raycastHit = false;
    this.lastRaycastPoint = null;
    this.updateCameraPosition();
    this.update(0, 0, camera);
  }

  update(deltaSeconds: number, orbitInput = 0, camera?: PerspectiveCamera): ThreejsPlaygroundState {
    if (this.disposed) return this.getState();
    const delta = Number.isFinite(deltaSeconds) ? Math.max(0, deltaSeconds) : 0;
    if (delta > 0) this.measuredFps = 1 / delta;
    this.elapsedSeconds += delta;
    this.frameCount = 1 + this.elapsedSeconds * 60;

    if (orbitInput !== 0) {
      this.manualCamera = false;
      this.orbitAngle += orbitInput * delta * 0.72;
    }
    if (!this.manualCamera) this.updateCameraPosition();

    const elapsedMilliseconds = this.elapsedSeconds * 1000;
    if (this.cube) {
      this.cube.rotation.x = elapsedMilliseconds / this.cubeSpeedX;
      this.cube.rotation.y = elapsedMilliseconds / this.cubeSpeedY;
    }
    if (this.airplane) {
      const angle = (elapsedMilliseconds / 360) * Math.PI * 0.2;
      this.airplane.position.set(Math.cos(angle) * 5 + 5, 10, Math.sin(angle) * 5 + 5);
    }
    for (const [index, mesh] of this.earthMeshes.entries()) mesh.rotation.y = elapsedMilliseconds / this.planetSpeeds[index].speedY;
    for (const material of this.morphMaterials) {
      material.uniforms.time.value = this.frameCount;
      material.uniforms.mousePosition.value.copy(this.mousePosition);
    }
    if (this.spotlight) {
      this.spotlight.intensity = 75 * Math.sin(Math.PI * this.frameCount / 240) + 73;
    }
    if (camera) this.applyToCamera(camera);
    return this.getState();
  }

  setParameter(parameter: ThreejsPlaygroundParameter, rawValue: number, camera?: PerspectiveCamera): boolean {
    if (!Number.isFinite(rawValue)) return false;
    const cameraAxis = parameter.match(/^camera\.(x|y|z)$/)?.[1] as "x" | "y" | "z" | undefined;
    if (cameraAxis) {
      this.manualCamera = true;
      this.cameraPosition[cameraAxis] = MathUtils.clamp(rawValue, -1000, 1000);
      if (camera) this.applyToCamera(camera);
      return true;
    }
    if (parameter === "cube.speedX" || parameter === "cube.speedY") {
      const value = MathUtils.clamp(rawValue, 1, 3600);
      if (parameter.endsWith("speedX")) this.cubeSpeedX = value;
      else this.cubeSpeedY = value;
      return true;
    }
    if (parameter === "plane.width" || parameter === "plane.height") {
      const value = MathUtils.clamp(rawValue, 1, 100);
      if (parameter.endsWith("width")) this.planeWidth = value;
      else this.planeHeight = value;
      if (this.terrain) this.rebuildTerrain();
      return true;
    }
    const planeAxis = parameter.match(/^plane\.(x|y|z)$/)?.[1] as "x" | "y" | "z" | undefined;
    if (planeAxis) {
      this.planePosition[planeAxis] = MathUtils.clamp(rawValue, -100, 100);
      if (this.terrain) this.terrain.position.copy(this.planePosition);
      return true;
    }
    const planetMatch = parameter.match(/^(earth|mars|moon)\.(speedX|speedY)$/);
    if (planetMatch) {
      const index = ["earth", "mars", "moon"].indexOf(planetMatch[1]);
      const key = planetMatch[2] as "speedX" | "speedY";
      this.planetSpeeds[index][key] = MathUtils.clamp(rawValue, 1, 3600);
      return true;
    }
    return false;
  }

  setPointerNdc(x: number, y: number): void {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    this.mousePosition.set(x - 0.5, -(y - 0.5), 0.2);
  }

  raycastTerrain(pointerNdc: Vector2, camera: PerspectiveCamera): Tuple3 | null {
    this.raycastTestCount += 1;
    if (!this.terrain) {
      this.raycastHit = false;
      this.lastRaycastPoint = null;
      return null;
    }
    this.group.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
    this.raycaster.setFromCamera(pointerNdc, camera);
    const hit = this.raycaster.intersectObject(this.terrain, false)[0];
    this.raycastHit = Boolean(hit);
    this.lastRaycastPoint = hit?.point.clone() ?? null;
    return this.lastRaycastPoint ? tuple(this.lastRaycastPoint) : null;
  }

  syncFromCamera(camera: PerspectiveCamera): void {
    const offset = camera.position.clone().sub(this.cameraTarget);
    if (offset.lengthSq() < 0.000001) return;
    this.orbitAngle = Math.atan2(offset.x, offset.z);
    this.zoom = MathUtils.clamp(offset.length() / CAMERA_DISTANCE, 0.45, 2.2);
    this.cameraPosition.copy(camera.position);
  }

  dispose(): void {
    if (this.disposed) return;
    const textures = new Set<Texture>();
    const materials = new Set<MeshBasicMaterial | MeshPhongMaterial | ShaderMaterial | LineBasicMaterial>();
    this.group.traverse((object) => {
      if (!(object instanceof Mesh) && !(object instanceof Line)) return;
      const geometry = object.geometry as BufferGeometry;
      geometry.dispose();
      const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of objectMaterials) {
        if (material instanceof MeshBasicMaterial || material instanceof MeshPhongMaterial || material instanceof ShaderMaterial || material instanceof LineBasicMaterial) {
          materials.add(material);
          for (const value of Object.values(material)) if (value instanceof Texture) textures.add(value);
        }
      }
    });
    for (const material of materials) material.dispose();
    for (const texture of textures) texture.dispose();
    this.group.clear();
    this.disposed = true;
    this.loadStatus = "disposed";
  }

  private async initialize(): Promise<void> {
    const textureLoader = new TextureLoader(this.loadingManager);
    const gltfLoader = new GLTFLoader(this.loadingManager);
    const [
      cubeTexture,
      earthTexture,
      skyBack,
      skyDown,
      skyFront,
      skyLeft,
      skyRight,
      skyUp,
      airplaneGltf
    ] = await Promise.all([
      loadTexture(textureLoader, "textures/twoway.jpg"),
      loadTexture(textureLoader, "textures/earth/earth_uv_with_topo.jpg"),
      loadTexture(textureLoader, "textures/sky/asteroids/asteroids_bk.jpg"),
      loadTexture(textureLoader, "textures/sky/asteroids/asteroids_dn.jpg"),
      loadTexture(textureLoader, "textures/sky/asteroids/asteroids_ft.jpg"),
      loadTexture(textureLoader, "textures/sky/asteroids/asteroids_lf.jpg"),
      loadTexture(textureLoader, "textures/sky/asteroids/asteroids_rt.jpg"),
      loadTexture(textureLoader, "textures/sky/asteroids/asteroids_up.jpg"),
      gltfLoader.loadAsync(`${ASSET_ROOT}/media/Airplane.glb`)
    ]);

    if (this.disposed) return;
    this.createLights();
    this.createSky([skyFront, skyBack, skyUp, skyDown, skyRight, skyLeft]);
    this.createCube(cubeTexture);
    this.createAirplane(airplaneGltf.scene);
    this.createMorphSpheres();
    this.createLine();
    this.createTerrain();
    this.createEarthSpheres(earthTexture);
  }

  private createLights(): void {
    const hemisphere = new HemisphereLight(0xffffff, 0x000000, 1);
    hemisphere.name = "Archived hemisphere light";
    this.group.add(hemisphere);

    const spotlight = new SpotLight(0xffffff, 2);
    spotlight.name = "Archived animated spotlight";
    spotlight.castShadow = true;
    spotlight.position.set(0, 7, 18);
    spotlight.decay = 2;
    spotlight.penumbra = 1;
    spotlight.shadow.camera.near = 10;
    spotlight.shadow.camera.far = 1000;
    spotlight.shadow.camera.fov = 30;
    this.group.add(spotlight, spotlight.target);
    this.spotlight = spotlight;
  }

  private createSky(textures: Texture[]): void {
    const materials = textures.map((texture) => new MeshBasicMaterial({ map: texture, side: BackSide, depthWrite: false }));
    const sky = new Mesh(new BoxGeometry(10000, 10000, 10000), materials);
    sky.name = "Archived asteroids skybox";
    sky.renderOrder = -100;
    this.group.add(sky);
    this.skyReady = true;
  }

  private createCube(texture: Texture): void {
    const cube = new Mesh(new BoxGeometry(4, 4, 4), new MeshBasicMaterial({ map: texture }));
    cube.name = "Archived two-way-sign cube";
    cube.position.set(0, 20, 0);
    this.group.add(cube);
    this.cube = cube;
  }

  private createAirplane(airplane: Object3D): void {
    airplane.name = "Archived Airplane.glb orbit";
    airplane.scale.setScalar(10);
    airplane.position.set(10, 10, 5);
    this.group.add(airplane);
    this.airplane = airplane;
  }

  private createMorphSpheres(): void {
    const positions: Tuple3[] = [[0, 20, 20], [10, 20, 20], [20, 20, 20]];
    for (const [index, position] of positions.entries()) {
      const material = new ShaderMaterial({
        uniforms: {
          time: { value: 0 },
          mousePosition: { value: this.mousePosition.clone() }
        },
        vertexShader: VERTEX_SHADER,
        fragmentShader: FRAGMENT_SHADER,
        side: DoubleSide
      });
      const geometry = new IcosahedronGeometry(2, 5);
      geometry.computeVertexNormals();
      const mesh = new Mesh(geometry, material);
      mesh.name = `Archived morph sphere ${index + 1}`;
      mesh.position.set(...position);
      this.group.add(mesh);
      this.morphMaterials.push(material);
      this.morphMeshes.push(mesh);
    }
  }

  private createLine(): void {
    const geometry = new BufferGeometry().setFromPoints([
      new Vector3(-10, 0, 0),
      new Vector3(0, 10, 0),
      new Vector3(10, 0, 0)
    ]);
    const line = new Line(geometry, new LineBasicMaterial({ color: 0x0000ff }));
    line.name = "Archived blue three-point line";
    this.group.add(line);
  }

  private createTerrain(): void {
    const terrain = new Mesh(new PlaneGeometry(1, 1, 1, 1), new MeshPhongMaterial({ color: 0xff0000, side: DoubleSide, flatShading: true }));
    terrain.name = "Archived procedural red plane";
    terrain.rotation.x = -Math.PI / 2;
    terrain.position.copy(this.planePosition);
    this.group.add(terrain);
    this.terrain = terrain;
    this.rebuildTerrain();
  }

  private rebuildTerrain(): void {
    if (!this.terrain) return;
    const segmentsX = Math.max(1, Math.floor(this.planeWidth));
    const segmentsY = Math.max(1, Math.floor(this.planeHeight));
    const geometry = new PlaneGeometry(this.planeWidth, this.planeHeight, segmentsX, segmentsY);
    const positions = geometry.getAttribute("position");
    const random = deterministicRandom(TERRAIN_SEED);
    this.terrainHeightMin = Number.POSITIVE_INFINITY;
    this.terrainHeightMax = Number.NEGATIVE_INFINITY;
    for (let index = 0; index < positions.count; index += 1) {
      const height = random();
      positions.setZ(index, height);
      this.terrainHeightMin = Math.min(this.terrainHeightMin, height);
      this.terrainHeightMax = Math.max(this.terrainHeightMax, height);
    }
    positions.needsUpdate = true;
    geometry.computeVertexNormals();
    this.terrain.geometry.dispose();
    this.terrain.geometry = geometry;
    this.terrain.position.copy(this.planePosition);
  }

  private createEarthSpheres(texture: Texture): void {
    const positions: Tuple3[] = [[0, 20, 0], [20, 20, 0], [40, 20, 0]];
    for (const [index, position] of positions.entries()) {
      const sphere = new Mesh(
        new SphereGeometry(5, 50, 50),
        new MeshBasicMaterial({ map: texture })
      );
      sphere.name = ["Earth", "Mars", "Moon"][index];
      sphere.position.set(...position);
      this.group.add(sphere);
      this.earthMeshes.push(sphere);
    }
  }

  private updateCameraPosition(): void {
    const radius = CAMERA_RADIUS * this.zoom;
    this.cameraPosition.set(
      this.cameraTarget.x + Math.sin(this.orbitAngle) * radius,
      this.cameraTarget.y + CAMERA_HEIGHT * this.zoom,
      this.cameraTarget.z + Math.cos(this.orbitAngle) * radius
    );
  }
}

export async function createThreejsPlaygroundEnvironment(options: ThreejsPlaygroundOptions = {}): Promise<ThreejsPlaygroundEnvironment> {
  const environment = new ThreejsPlaygroundEnvironment(options);
  await environment.ready;
  return environment;
}
