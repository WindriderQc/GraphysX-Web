import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  Color,
  CubeTexture,
  CubeTextureLoader,
  DirectionalLight,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  LoadingManager,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Raycaster,
  RepeatWrapping,
  Scene,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  Vector2,
  Vector3
} from "three";
import { DDSLoader } from "three/examples/jsm/loaders/DDSLoader.js";
import {
  archiveSkyboxUrls,
  loadArchiveCubeTextureAsync,
  orientArchiveFaceTextures
} from "./archive-skybox";

type Tuple3 = readonly [number, number, number];
type LoadStatus = "loading" | "ready" | "error" | "disposed";

export type SkyboxSelectorId = "clearblue" | "skyx" | "clearnight" | "lostvalley" | "winter";
export type SkyboxSelectorPhase = "icons" | "zooming" | "panorama";

export type SkyboxSelectorEntry = {
  id: SkyboxSelectorId;
  archiveName: "ClearBlue" | "SkyX" | "ClearNight" | "LostValley" | "Winter";
  label: string;
  sourcePath: string;
};

export const SKYBOX_SELECTOR_ENTRIES: readonly SkyboxSelectorEntry[] = [
  { id: "clearblue", archiveName: "ClearBlue", label: "Clear Blue", sourcePath: "Media/Sky/ClearBlue" },
  { id: "skyx", archiveName: "SkyX", label: "SkyX", sourcePath: "Media/Sky/SkyX" },
  { id: "clearnight", archiveName: "ClearNight", label: "Clear Night", sourcePath: "Media/Sky/ClearNight" },
  { id: "lostvalley", archiveName: "LostValley", label: "Lost Valley", sourcePath: "Media/Sky/LostValley" },
  { id: "winter", archiveName: "Winter", label: "Winter", sourcePath: "Media/Sky/Winter" }
] as const;

// Keep the source-authored 45° lens for the selector icons. A panorama fills
// the viewport, so a wider source-aware lens keeps the surviving 256–1024 px
// cube faces visually smaller and avoids magnifying their pixels.
const SKYBOX_PANORAMA_FOV: Record<SkyboxSelectorId, number> = {
  clearblue: 90,
  skyx: 90,
  clearnight: 90,
  lostvalley: 85,
  winter: 90
};

export const SKYBOX_SELECTOR_ARCHIVE_EVIDENCE = {
  source: "Yanik C++ BCKUP/CubXSolution/3DScenes.cpp + CLSkybox.cpp + Scene.cpp",
  quantity: 5,
  iconSize: 50,
  ringRadius: 125,
  iconRotationDegreesPerSecond: 50,
  camera: {
    fovDegrees: 45,
    near: 0.1,
    far: 1000,
    position: [150, 200, 500] as Tuple3,
    lookAt: [0, 0, 0] as Tuple3
  },
  panoramaCamera: {
    position: [1000, 5, 0] as Tuple3,
    lookAt: [0, 3, 0] as Tuple3,
    orbitAim: [10, 0, 10] as Tuple3,
    orbitRadius: 500,
    archiveDegreesPerFrame: 0.1
  },
  selection: "Click a cube; stop icon rotation; chase/zoom into it; enable its day panorama; retain it as the active skybox."
} as const;

export type SkyboxSelectorState = {
  id: "archive-skybox-selector";
  source: string;
  visible: boolean;
  loadStatus: LoadStatus;
  loadError: string | null;
  phase: SkyboxSelectorPhase;
  entries: Array<{
    id: SkyboxSelectorId;
    archiveName: string;
    label: string;
    position: [number, number, number];
    rotationYDegrees: number;
  }>;
  pendingId: SkyboxSelectorId | null;
  activeId: SkyboxSelectorId | null;
  camera: {
    position: [number, number, number];
    fovDegrees: number;
    lookAt: [number, number, number];
  };
  controls: "Archive: click a sky cube";
  transition: "cube ring -> camera zoom -> selected panorama orbit";
};

export type SkyboxSelectorEnvironmentOptions = {
  assetBaseUrl?: string;
  loadingManager?: LoadingManager;
  /** The archive completes zoom on cube collision. This duration recreates that short chase-camera beat. */
  zoomDurationSeconds?: number;
  /** Converts the archived 0.1 degrees/frame panorama orbit to time; 60 FPS is the reference cadence. */
  panoramaOrbitDegreesPerSecond?: number;
};

type SkyIcon = Mesh<BoxGeometry, MeshBasicMaterial[]>;

function tuple(value: Vector3): [number, number, number] {
  return [value.x, value.y, value.z];
}

function smoothStep(value: number): number {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}

/**
 * Isolated runtime reconstruction of CLSkyboxSelectScene.
 * It owns only its group/background/camera state and can be activated or deactivated by a host UI.
 */
export class SkyboxSelectorEnvironment {
  readonly group = new Group();
  readonly ready: Promise<void>;

  private readonly scene: Scene;
  private readonly camera: PerspectiveCamera;
  private readonly textureLoader: TextureLoader;
  private readonly cubeTextureLoader: CubeTextureLoader;
  private readonly assetBaseUrl: string;
  private readonly zoomDurationSeconds: number;
  private readonly panoramaOrbitDegreesPerSecond: number;
  private readonly icons: SkyIcon[] = [];
  private readonly raycaster = new Raycaster();
  private readonly pointer = new Vector2();
  private readonly zoomStart = new Vector3();
  private readonly zoomTarget = new Vector3();
  private readonly lookTarget = new Vector3();
  private readonly ownedTextures = new Set<Texture>();
  private readonly panoramaTextures = new Map<SkyboxSelectorId, CubeTexture>();
  private previousBackground: Scene["background"] = null;
  private previousCamera: {
    position: Vector3;
    quaternion: PerspectiveCamera["quaternion"];
    fov: number;
    near: number;
    far: number;
  } | null = null;
  private status: LoadStatus = "loading";
  private errorMessage: string | null = null;
  private phase: SkyboxSelectorPhase = "icons";
  private pendingId: SkyboxSelectorId | null = null;
  private activeId: SkyboxSelectorId | null = null;
  private zoomElapsed = 0;
  private panoramaOrbitDegrees = 0;
  private visible = false;
  private disposed = false;

  constructor(scene: Scene, camera: PerspectiveCamera, options: SkyboxSelectorEnvironmentOptions = {}) {
    this.scene = scene;
    this.camera = camera;
    this.assetBaseUrl = (options.assetBaseUrl ?? "/assets/sky").replace(/\/$/, "");
    this.zoomDurationSeconds = Math.max(0.15, options.zoomDurationSeconds ?? 0.85);
    this.panoramaOrbitDegreesPerSecond = options.panoramaOrbitDegreesPerSecond ?? 6;
    this.textureLoader = new TextureLoader(options.loadingManager);
    this.cubeTextureLoader = new CubeTextureLoader(options.loadingManager);

    this.group.name = "Archive Skybox Selector — CLSkyboxSelectScene";
    this.group.visible = false;
    this.group.userData.archiveEnvironment = {
      id: "archive-skybox-selector",
      kind: "standalone-3d-selector",
      evidence: SKYBOX_SELECTOR_ARCHIVE_EVIDENCE
    };
    this.scene.add(this.group);
    this.ready = this.buildIcons();
  }

  activate(): void {
    if (this.disposed || this.visible) {
      return;
    }
    this.visible = true;
    this.group.visible = true;
    this.previousBackground = this.scene.background;
    this.previousCamera = {
      position: this.camera.position.clone(),
      quaternion: this.camera.quaternion.clone(),
      fov: this.camera.fov,
      near: this.camera.near,
      far: this.camera.far
    };
    this.resetToIcons();
  }

  deactivate(restoreHostState = true): void {
    if (!this.visible) {
      return;
    }
    this.visible = false;
    this.group.visible = false;
    if (restoreHostState) {
      this.scene.background = this.previousBackground;
      if (this.previousCamera) {
        this.camera.position.copy(this.previousCamera.position);
        this.camera.quaternion.copy(this.previousCamera.quaternion);
        this.camera.fov = this.previousCamera.fov;
        this.camera.near = this.previousCamera.near;
        this.camera.far = this.previousCamera.far;
        this.camera.updateProjectionMatrix();
        this.camera.updateMatrixWorld();
      }
    }
  }

  resetToIcons(): void {
    if (this.disposed) {
      return;
    }
    this.phase = "icons";
    this.pendingId = null;
    this.activeId = null;
    this.zoomElapsed = 0;
    this.panoramaOrbitDegrees = 0;
    this.scene.background = new Color("#000000");
    this.group.visible = this.visible;
    this.camera.fov = SKYBOX_SELECTOR_ARCHIVE_EVIDENCE.camera.fovDegrees;
    this.camera.near = SKYBOX_SELECTOR_ARCHIVE_EVIDENCE.camera.near;
    this.camera.far = SKYBOX_SELECTOR_ARCHIVE_EVIDENCE.camera.far;
    this.camera.position.set(...SKYBOX_SELECTOR_ARCHIVE_EVIDENCE.camera.position);
    this.lookTarget.set(...SKYBOX_SELECTOR_ARCHIVE_EVIDENCE.camera.lookAt);
    this.camera.lookAt(this.lookTarget);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
  }

  selectByIndex(index: number): boolean {
    const entry = SKYBOX_SELECTOR_ENTRIES[index];
    if (!entry) {
      return false;
    }
    return this.select(entry.id);
  }

  select(id: SkyboxSelectorId): boolean {
    if (this.disposed || this.status !== "ready" || this.phase !== "icons") {
      return false;
    }
    const index = SKYBOX_SELECTOR_ENTRIES.findIndex((entry) => entry.id === id);
    const icon = this.icons[index];
    if (!icon) {
      return false;
    }
    this.pendingId = id;
    this.phase = "zooming";
    this.zoomElapsed = 0;
    this.zoomStart.copy(this.camera.position);
    this.zoomTarget.copy(icon.position);
    void this.ensurePanorama(id);
    return true;
  }

  pickFromNdc(x: number, y: number): SkyboxSelectorId | null {
    if (this.phase !== "icons" || !this.visible) {
      return null;
    }
    this.pointer.set(x, y);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObjects(this.icons, false)[0];
    if (!hit) {
      return null;
    }
    const id = hit.object.userData.skyboxId as SkyboxSelectorId;
    return this.select(id) ? id : null;
  }

  update(deltaSeconds: number): SkyboxSelectorState {
    if (this.disposed || !this.visible) {
      return this.getState();
    }
    const delta = Number.isFinite(deltaSeconds) ? Math.max(0, Math.min(deltaSeconds, 0.1)) : 0;

    if (this.phase !== "zooming") {
      for (const icon of this.icons) {
        icon.rotation.y += (SKYBOX_SELECTOR_ARCHIVE_EVIDENCE.iconRotationDegreesPerSecond * Math.PI / 180) * delta;
      }
    }

    if (this.phase === "zooming" && this.pendingId) {
      this.zoomElapsed += delta;
      const progress = smoothStep(this.zoomElapsed / this.zoomDurationSeconds);
      this.camera.position.lerpVectors(this.zoomStart, this.zoomTarget, progress);
      this.camera.lookAt(this.zoomTarget);
      if (progress >= 1) {
        const completedId = this.pendingId;
        this.activeId = completedId;
        this.pendingId = null;
        this.phase = "panorama";
        this.group.visible = false;
        const panorama = this.panoramaTextures.get(completedId);
        if (panorama) {
          this.scene.background = panorama;
        }
        this.camera.position.set(...SKYBOX_SELECTOR_ARCHIVE_EVIDENCE.panoramaCamera.position);
        this.camera.fov = SKYBOX_PANORAMA_FOV[completedId];
        this.lookTarget.set(...SKYBOX_SELECTOR_ARCHIVE_EVIDENCE.panoramaCamera.lookAt);
        this.camera.lookAt(this.lookTarget);
        this.camera.updateProjectionMatrix();
      }
    } else if (this.phase === "panorama") {
      this.panoramaOrbitDegrees += this.panoramaOrbitDegreesPerSecond * delta;
      const angle = this.panoramaOrbitDegrees * Math.PI / 180;
      const aim = SKYBOX_SELECTOR_ARCHIVE_EVIDENCE.panoramaCamera.orbitAim;
      const radius = SKYBOX_SELECTOR_ARCHIVE_EVIDENCE.panoramaCamera.orbitRadius;
      this.camera.position.set(aim[0] + Math.cos(angle) * radius, 5, aim[2] + Math.sin(angle) * radius);
      this.lookTarget.set(...aim);
      this.camera.lookAt(this.lookTarget);
    }
    this.camera.updateMatrixWorld();
    return this.getState();
  }

  getState(): SkyboxSelectorState {
    return {
      id: "archive-skybox-selector",
      source: SKYBOX_SELECTOR_ARCHIVE_EVIDENCE.source,
      visible: this.visible,
      loadStatus: this.status,
      loadError: this.errorMessage,
      phase: this.phase,
      entries: SKYBOX_SELECTOR_ENTRIES.map((entry, index) => {
        const icon = this.icons[index];
        const position = icon?.position ?? new Vector3(
          Math.cos(index * Math.PI * 2 / SKYBOX_SELECTOR_ENTRIES.length) * SKYBOX_SELECTOR_ARCHIVE_EVIDENCE.ringRadius,
          0,
          Math.sin(index * Math.PI * 2 / SKYBOX_SELECTOR_ENTRIES.length) * SKYBOX_SELECTOR_ARCHIVE_EVIDENCE.ringRadius
        );
        return {
          id: entry.id,
          archiveName: entry.archiveName,
          label: entry.label,
          position: tuple(position),
          rotationYDegrees: ((icon?.rotation.y ?? 0) * 180 / Math.PI) % 360
        };
      }),
      pendingId: this.pendingId,
      activeId: this.activeId,
      camera: {
        position: tuple(this.camera.position),
        fovDegrees: this.camera.fov,
        lookAt: tuple(this.lookTarget)
      },
      controls: "Archive: click a sky cube",
      transition: "cube ring -> camera zoom -> selected panorama orbit"
    };
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.deactivate(true);
    this.disposed = true;
    this.status = "disposed";
    this.scene.remove(this.group);
    for (const icon of this.icons) {
      icon.geometry.dispose();
      icon.material.forEach((material) => material.dispose());
    }
    this.ownedTextures.forEach((texture) => texture.dispose());
    this.panoramaTextures.forEach((texture) => texture.dispose());
    this.icons.length = 0;
    this.group.clear();
  }

  private async buildIcons(): Promise<void> {
    try {
      const iconSets = await Promise.all(SKYBOX_SELECTOR_ENTRIES.map(async (entry) => {
        const basePath = `${this.assetBaseUrl}/${entry.id}`;
        const textures = orientArchiveFaceTextures(
          await Promise.all(archiveSkyboxUrls(basePath).map((url) => this.textureLoader.loadAsync(url)))
        );
        textures.forEach((texture) => {
          texture.colorSpace = SRGBColorSpace;
          this.ownedTextures.add(texture);
        });
        return textures;
      }));

      iconSets.forEach((textures, index) => {
        const entry = SKYBOX_SELECTOR_ENTRIES[index];
        // The archived selector renders its icons against a black, unfogged
        // scene. Keep the host preview's prior fog from washing all five
        // textured cubes down to near-black silhouettes.
        const materials = textures.map((map) => new MeshBasicMaterial({ map, toneMapped: false, fog: false }));
        const icon = new Mesh(new BoxGeometry(50, 50, 50), materials);
        const angle = index * Math.PI * 2 / SKYBOX_SELECTOR_ENTRIES.length;
        icon.position.set(
          Math.cos(angle) * SKYBOX_SELECTOR_ARCHIVE_EVIDENCE.ringRadius,
          0,
          Math.sin(angle) * SKYBOX_SELECTOR_ARCHIVE_EVIDENCE.ringRadius
        );
        icon.name = `${entry.archiveName} SkyboxCubeIcon`;
        icon.userData.skyboxId = entry.id;
        icon.userData.archiveName = entry.archiveName;
        this.icons.push(icon);
        this.group.add(icon);
      });
      this.status = "ready";
    } catch (error) {
      this.status = "error";
      this.errorMessage = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  private async ensurePanorama(id: SkyboxSelectorId): Promise<CubeTexture | null> {
    const cached = this.panoramaTextures.get(id);
    if (cached) {
      return cached;
    }
    try {
      const texture = await loadArchiveCubeTextureAsync(this.cubeTextureLoader, `${this.assetBaseUrl}/${id}`);
      this.panoramaTextures.set(id, texture);
      if (this.activeId === id && this.phase === "panorama") {
        this.scene.background = texture;
      }
      return texture;
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : String(error);
      return null;
    }
  }
}

type ImprezaGeometryData = {
  positions: number[];
  indices: number[];
  uvs: number[];
};

type ImprezaCatalog = {
  source: string;
  impreza: {
    chassis: ImprezaGeometryData & { faceMaterials: string[] };
    wheels: Array<ImprezaGeometryData & { name: string; offset: number[] }>;
    materials: Array<{ name: string; texture: string }>;
  };
};

export const CAR_SELECTOR_ENTRIES = [
  {
    id: "impreza",
    archiveName: "Impreza",
    label: "Subaru Impreza",
    modelSource: "Media/Cars/chassis.tvm + wheel_l.tvm + wheel_r.tvm",
    textureSources: ["Windows.bmp", "UnderCarriage.bmp", "ChassisSTI.bmp", "Wheel.bmp"]
  }
] as const;

export type CarSelectorId = typeof CAR_SELECTOR_ENTRIES[number]["id"];

export const CAR_SELECTOR_ARCHIVE_EVIDENCE = {
  source: "Yanik C++ BCKUP/CubXSolution/3DScenes.cpp + 3DScenes.h + Vehicule.cpp",
  quantity: 1,
  names: ["Impreza"],
  ringRadius: 30,
  archiveSpawnPosition: [30, 100, 0] as Tuple3,
  terrain: {
    heightmap: "Media/Heightmaps/height.jpg",
    texture: "Media/ground.jpg",
    size: [100, 100] as const,
    origin: [-50, 0, -50] as Tuple3
  },
  water: {
    height: 2,
    distortionTexture: "Media/distortiontexture.dds",
    extent: [-2048, -2048, 2048, 2048] as const
  },
  camera: {
    fovDegrees: 45,
    near: 0.1,
    far: 1000,
    position: [75, 100, 50] as Tuple3,
    lookAt: [0, 0, 0] as Tuple3
  },
  selection: "MeshClickedAction is present but empty; the archive previewed one Impreza and never committed a car selection."
} as const;

export type ArchiveFreeCameraInput = {
  walk: number;
  strafe: number;
  raise: number;
  mouseDeltaX: number;
  mouseDeltaY: number;
};

export type CarSelectorState = {
  id: "archive-car-selector";
  source: string;
  visible: boolean;
  loadStatus: LoadStatus;
  loadError: string | null;
  entries: Array<{
    id: CarSelectorId;
    archiveName: string;
    label: string;
    position: [number, number, number];
  }>;
  selectionImplementedInArchive: false;
  selectedId: null;
  inspectedId: CarSelectorId | null;
  car: {
    spawnPosition: [number, number, number];
    currentPosition: [number, number, number];
    fallingUnderArchiveGravity: boolean;
    wheelCount: 4;
    materialSlots: readonly ["ChassisSTI", "Windows", "UnderCarriage"];
  };
  terrain: {
    ready: boolean;
    source: string;
    size: [100, 100];
    heightScaleFidelity: "estimated";
  };
  water: { height: 2; distortionSource: string };
  camera: { position: [number, number, number]; lookAt: [number, number, number]; fovDegrees: number };
  controls: "Archive free camera: walk / strafe / raise + mouse deltas; car click callback was empty";
};

export type CarSelectorEnvironmentOptions = {
  assetBaseUrl?: string;
  carTextureBaseUrl?: string;
  loadingManager?: LoadingManager;
  terrainHeightScale?: number;
  simulateArchiveGravity?: boolean;
};

/**
 * Evidence-bounded reconstruction of CLCarSelectScene.
 * The scene is restored as a one-car preview; it intentionally does not invent a selection commit absent from the C++.
 */
export class CarSelectorEnvironment {
  readonly group = new Group();
  readonly carGroup = new Group();
  readonly ready: Promise<void>;

  private readonly scene: Scene;
  private readonly camera: PerspectiveCamera;
  private readonly assetBaseUrl: string;
  private readonly carTextureBaseUrl: string;
  private readonly textureLoader: TextureLoader;
  private readonly ddsLoader: DDSLoader;
  private readonly terrainGeometry = new PlaneGeometry(100, 100, 64, 64);
  private readonly terrainMaterial = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.92 });
  private readonly terrain: Mesh<PlaneGeometry, MeshStandardMaterial>;
  private readonly waterMaterial = new MeshBasicMaterial({
    color: new Color("#0b5f79"),
    transparent: true,
    opacity: 0.52,
    side: DoubleSide,
    depthWrite: false
  });
  private readonly water: Mesh<PlaneGeometry, MeshBasicMaterial>;
  private readonly keyLight: DirectionalLight;
  private readonly raycaster = new Raycaster();
  private readonly pointer = new Vector2();
  private readonly lookTarget = new Vector3();
  private readonly ownedTextures = new Set<Texture>();
  private readonly terrainHeightScale: number;
  private readonly simulateGravity: boolean;
  private readonly spawnPosition = new Vector3(...CAR_SELECTOR_ARCHIVE_EVIDENCE.archiveSpawnPosition);
  private previousBackground: Scene["background"] = null;
  private previousCamera: {
    position: Vector3;
    quaternion: PerspectiveCamera["quaternion"];
    fov: number;
    near: number;
    far: number;
  } | null = null;
  private status: LoadStatus = "loading";
  private errorMessage: string | null = null;
  private terrainReady = false;
  private groundAtCar = 0;
  private carVerticalVelocity = 0;
  private inspectedId: CarSelectorId | null = null;
  private visible = false;
  private disposed = false;

  constructor(scene: Scene, camera: PerspectiveCamera, options: CarSelectorEnvironmentOptions = {}) {
    this.scene = scene;
    this.camera = camera;
    this.assetBaseUrl = (options.assetBaseUrl ?? "/assets/selectors/car").replace(/\/$/, "");
    this.carTextureBaseUrl = (options.carTextureBaseUrl ?? "/assets/textures/cars").replace(/\/$/, "");
    this.textureLoader = new TextureLoader(options.loadingManager);
    this.ddsLoader = new DDSLoader(options.loadingManager);
    this.terrainHeightScale = Math.max(1, options.terrainHeightScale ?? 22);
    this.simulateGravity = options.simulateArchiveGravity ?? true;

    this.group.name = "Archive Car Selector — CLCarSelectScene";
    this.group.visible = false;
    this.group.userData.archiveEnvironment = {
      id: "archive-car-selector",
      kind: "standalone-3d-selector",
      evidence: CAR_SELECTOR_ARCHIVE_EVIDENCE,
      fidelityWarning: "The archive's click callback was empty; no fabricated car-selection commit is provided."
    };
    this.scene.add(this.group);

    this.terrainGeometry.rotateX(-Math.PI / 2);
    this.terrain = new Mesh(this.terrainGeometry, this.terrainMaterial);
    this.terrain.name = "CLLand height.jpg 100x100";
    this.terrain.receiveShadow = true;
    this.group.add(this.terrain);

    const waterGeometry = new PlaneGeometry(4096, 4096, 1, 1);
    waterGeometry.rotateX(-Math.PI / 2);
    this.water = new Mesh(waterGeometry, this.waterMaterial);
    this.water.name = "CLWater y=2 distortiontexture.dds";
    this.water.position.y = CAR_SELECTOR_ARCHIVE_EVIDENCE.water.height;
    this.water.renderOrder = 2;
    this.group.add(this.water);

    this.carGroup.name = "Impreza CLVehicule selector preview";
    this.carGroup.position.copy(this.spawnPosition);
    this.carGroup.userData.carSelectorId = "impreza" satisfies CarSelectorId;
    this.group.add(this.carGroup);

    this.keyLight = new DirectionalLight(0xffffff, 1);
    // Area.cpp uses a white directional vector (-1,-1,+1).
    this.keyLight.position.set(100, 100, -100);
    this.keyLight.target.position.set(0, 0, 0);
    this.keyLight.castShadow = true;
    this.group.add(this.keyLight, this.keyLight.target);

    this.ready = this.loadEnvironmentAssets();
  }

  activate(): void {
    if (this.disposed || this.visible) {
      return;
    }
    this.visible = true;
    this.group.visible = true;
    this.previousBackground = this.scene.background;
    this.previousCamera = {
      position: this.camera.position.clone(),
      quaternion: this.camera.quaternion.clone(),
      fov: this.camera.fov,
      near: this.camera.near,
      far: this.camera.far
    };
    this.scene.background = new Color("#05080c");
    this.reset();
  }

  deactivate(restoreHostState = true): void {
    if (!this.visible) {
      return;
    }
    this.visible = false;
    this.group.visible = false;
    if (restoreHostState) {
      this.scene.background = this.previousBackground;
      if (this.previousCamera) {
        this.camera.position.copy(this.previousCamera.position);
        this.camera.quaternion.copy(this.previousCamera.quaternion);
        this.camera.fov = this.previousCamera.fov;
        this.camera.near = this.previousCamera.near;
        this.camera.far = this.previousCamera.far;
        this.camera.updateProjectionMatrix();
        this.camera.updateMatrixWorld();
      }
    }
  }

  reset(): void {
    this.carGroup.position.copy(this.spawnPosition);
    this.carVerticalVelocity = 0;
    this.inspectedId = null;
    this.camera.fov = CAR_SELECTOR_ARCHIVE_EVIDENCE.camera.fovDegrees;
    this.camera.near = CAR_SELECTOR_ARCHIVE_EVIDENCE.camera.near;
    this.camera.far = CAR_SELECTOR_ARCHIVE_EVIDENCE.camera.far;
    this.camera.position.set(...CAR_SELECTOR_ARCHIVE_EVIDENCE.camera.position);
    this.lookTarget.set(...CAR_SELECTOR_ARCHIVE_EVIDENCE.camera.lookAt);
    this.camera.lookAt(this.lookTarget);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
  }

  update(deltaSeconds: number): CarSelectorState {
    if (!this.disposed && this.visible) {
      const delta = Number.isFinite(deltaSeconds) ? Math.max(0, Math.min(deltaSeconds, 0.05)) : 0;
      const restHeight = this.groundAtCar + 1.45;
      if (this.simulateGravity && this.terrainReady && this.carGroup.position.y > restHeight) {
        this.carVerticalVelocity -= 9.800908285 * delta;
        this.carGroup.position.y = Math.max(restHeight, this.carGroup.position.y + this.carVerticalVelocity * delta);
        if (this.carGroup.position.y <= restHeight) {
          this.carVerticalVelocity = 0;
        }
      }
      if (this.waterMaterial.map) {
        this.waterMaterial.map.offset.x = (this.waterMaterial.map.offset.x + delta * 0.5) % 1;
        this.waterMaterial.map.offset.y = (this.waterMaterial.map.offset.y + delta * 0.5) % 1;
      }
    }
    return this.getState();
  }

  /**
   * Exact structural port of the archived free-camera routine.
   * The host supplies elapsed milliseconds because the C++ multiplied movement by engine elapsed time directly.
   */
  applyArchiveCameraControl(input: ArchiveFreeCameraInput, elapsedMilliseconds: number): CarSelectorState {
    if (!this.visible || !Number.isFinite(elapsedMilliseconds)) {
      return this.getState();
    }
    const decay = (value: number): number => value > 0 ? Math.max(0, value - 0.05) : Math.min(0, value + 0.05);
    const walk = decay(input.walk);
    const strafe = decay(input.strafe);
    const raise = decay(input.raise);
    // The archive routine recreated angleX/angleY as zero on every call (and
    // even carries an "angle is never modified?!" comment). Derive the
    // persistent heading from the current view ray before applying deltas so
    // an idle update does not snap the camera from look-at-origin to the
    // horizontal +X axis and hide the car beneath it.
    const priorDirection = this.lookTarget.clone().sub(this.camera.position);
    const priorHorizontal = Math.hypot(priorDirection.x, priorDirection.z);
    const priorYaw = priorHorizontal > 0.0001 ? Math.atan2(priorDirection.z, priorDirection.x) : 0;
    const priorPitch = Math.atan2(priorDirection.y, Math.max(0.0001, priorHorizontal));
    const angleX = Math.max(-1.3, Math.min(1.3, priorPitch - input.mouseDeltaY / 100));
    const angleY = priorYaw - input.mouseDeltaX / 100;
    const elapsed = Math.max(0, elapsedMilliseconds);

    this.camera.position.x += Math.cos(angleY) * walk * elapsed + Math.cos(angleY + Math.PI / 2) * strafe * elapsed;
    this.camera.position.y += raise * elapsed;
    this.camera.position.z += Math.sin(angleY) * walk * elapsed + Math.sin(angleY + Math.PI / 2) * strafe * elapsed;
    const horizontalAim = Math.cos(angleX);
    this.lookTarget.set(
      this.camera.position.x + Math.cos(angleY) * horizontalAim,
      this.camera.position.y + Math.sin(angleX),
      this.camera.position.z + Math.sin(angleY) * horizontalAim
    );
    this.camera.lookAt(this.lookTarget);
    this.camera.updateMatrixWorld();
    return this.getState();
  }

  /** Car clicks can inspect the recovered mesh, but return no selection because the archived callback is empty. */
  inspectFromNdc(x: number, y: number): CarSelectorId | null {
    if (!this.visible) {
      return null;
    }
    this.pointer.set(x, y);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObject(this.carGroup, true)[0];
    this.inspectedId = hit ? "impreza" : null;
    return this.inspectedId;
  }

  /** Explicitly reflects the empty MeshClickedAction in the archive. */
  selectByIndex(_index: number): false {
    return false;
  }

  getState(): CarSelectorState {
    return {
      id: "archive-car-selector",
      source: CAR_SELECTOR_ARCHIVE_EVIDENCE.source,
      visible: this.visible,
      loadStatus: this.status,
      loadError: this.errorMessage,
      entries: [{
        id: "impreza",
        archiveName: "Impreza",
        label: "Subaru Impreza",
        position: tuple(this.carGroup.position)
      }],
      selectionImplementedInArchive: false,
      selectedId: null,
      inspectedId: this.inspectedId,
      car: {
        spawnPosition: tuple(this.spawnPosition),
        currentPosition: tuple(this.carGroup.position),
        fallingUnderArchiveGravity: this.terrainReady && this.carGroup.position.y > this.groundAtCar + 1.45,
        wheelCount: 4,
        materialSlots: ["ChassisSTI", "Windows", "UnderCarriage"]
      },
      terrain: {
        ready: this.terrainReady,
        source: CAR_SELECTOR_ARCHIVE_EVIDENCE.terrain.heightmap,
        size: [100, 100],
        heightScaleFidelity: "estimated"
      },
      water: {
        height: 2,
        distortionSource: CAR_SELECTOR_ARCHIVE_EVIDENCE.water.distortionTexture
      },
      camera: {
        position: tuple(this.camera.position),
        lookAt: tuple(this.lookTarget),
        fovDegrees: this.camera.fov
      },
      controls: "Archive free camera: walk / strafe / raise + mouse deltas; car click callback was empty"
    };
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.deactivate(true);
    this.disposed = true;
    this.status = "disposed";
    this.scene.remove(this.group);
    this.group.traverse((object) => {
      if (object instanceof Mesh) {
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => material.dispose());
      }
    });
    this.ownedTextures.forEach((texture) => texture.dispose());
    this.group.clear();
  }

  private buildImpreza(catalog: ImprezaCatalog): void {
    const chassis = catalog.impreza.chassis;
    const chassisGeometry = this.buildIndexedGeometry(chassis);
    const nameToMaterialIndex = new Map([
      ["Material#1", 0],
      ["Material#2", 1],
      ["Material #3", 2]
    ]);
    let groupStart = 0;
    let activeMaterial = nameToMaterialIndex.get(chassis.faceMaterials[0]) ?? 0;
    for (let triangle = 1; triangle <= chassis.faceMaterials.length; triangle += 1) {
      const nextMaterial = triangle < chassis.faceMaterials.length
        ? (nameToMaterialIndex.get(chassis.faceMaterials[triangle]) ?? 0)
        : -1;
      if (nextMaterial !== activeMaterial) {
        chassisGeometry.addGroup(groupStart * 3, (triangle - groupStart) * 3, activeMaterial);
        groupStart = triangle;
        activeMaterial = nextMaterial;
      }
    }

    const chassisTexture = this.loadColorTexture(`${this.carTextureBaseUrl}/ChassisSTi.bmp`);
    const windowsTexture = this.loadColorTexture(`${this.carTextureBaseUrl}/Windows.bmp`);
    const undercarriageTexture = this.loadColorTexture(`${this.carTextureBaseUrl}/Undercarriage.bmp`);
    const chassisMesh = new Mesh(chassisGeometry, [
      new MeshStandardMaterial({ map: chassisTexture, color: 0xffffff, roughness: 0.42, metalness: 0.12, side: DoubleSide }),
      new MeshStandardMaterial({
        map: windowsTexture,
        color: 0xffffff,
        roughness: 0.15,
        metalness: 0.22,
        transparent: true,
        opacity: 0.72,
        blending: AdditiveBlending,
        depthWrite: false,
        side: DoubleSide
      }),
      new MeshStandardMaterial({ map: undercarriageTexture, color: 0xffffff, roughness: 0.82, metalness: 0.2, side: DoubleSide })
    ]);
    chassisMesh.name = "Impreza chassis — three archived material slots";
    chassisMesh.castShadow = true;
    chassisMesh.receiveShadow = true;
    this.carGroup.add(chassisMesh);

    const wheelTexture = this.loadColorTexture(`${this.carTextureBaseUrl}/Wheel.bmp`);
    const wheelMaterial = new MeshStandardMaterial({
      map: wheelTexture,
      color: 0xffffff,
      roughness: 0.82,
      metalness: 0.08,
      side: DoubleSide
    });
    for (const wheel of catalog.impreza.wheels) {
      const wheelMesh = new Mesh(this.buildIndexedGeometry(wheel), wheelMaterial);
      wheelMesh.name = wheel.name;
      wheelMesh.position.set(wheel.offset[0] ?? 0, wheel.offset[1] ?? 0, wheel.offset[2] ?? 0);
      wheelMesh.castShadow = true;
      wheelMesh.receiveShadow = true;
      this.carGroup.add(wheelMesh);
    }
  }

  private buildIndexedGeometry(data: ImprezaGeometryData): BufferGeometry {
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(data.positions, 3));
    geometry.setAttribute("uv", new Float32BufferAttribute(data.uvs, 2));
    geometry.setIndex(data.indices);
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  }

  private loadColorTexture(url: string): Texture {
    const texture = this.textureLoader.load(
      url,
      undefined,
      undefined,
      (error) => {
        this.errorMessage = `Texture failed to load: ${url} (${String(error)})`;
      }
    );
    texture.colorSpace = SRGBColorSpace;
    this.ownedTextures.add(texture);
    return texture;
  }

  private async loadEnvironmentAssets(): Promise<void> {
    try {
      const [heightmap, ground, distortion, carsModule] = await Promise.all([
        this.textureLoader.loadAsync(`${this.assetBaseUrl}/height.jpg`),
        this.textureLoader.loadAsync(`${this.assetBaseUrl}/ground.jpg`),
        this.ddsLoader.loadAsync(`${this.assetBaseUrl}/distortiontexture.dds`),
        import("./legacy/cars-catalog.json")
      ]);
      this.buildImpreza(carsModule.default as unknown as ImprezaCatalog);
      heightmap.colorSpace = SRGBColorSpace;
      ground.colorSpace = SRGBColorSpace;
      ground.wrapS = RepeatWrapping;
      ground.wrapT = RepeatWrapping;
      ground.repeat.set(10, 10);
      distortion.wrapS = RepeatWrapping;
      distortion.wrapT = RepeatWrapping;
      this.ownedTextures.add(heightmap);
      this.ownedTextures.add(ground);
      this.ownedTextures.add(distortion);
      this.terrainMaterial.map = ground;
      this.terrainMaterial.needsUpdate = true;
      this.waterMaterial.map = distortion;
      this.waterMaterial.needsUpdate = true;
      await this.applyHeightmap(heightmap);
      this.terrainReady = true;
      this.status = "ready";
    } catch (error) {
      this.status = "error";
      this.errorMessage = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  private async applyHeightmap(texture: Texture): Promise<void> {
    const image = texture.image as CanvasImageSource & { width: number; height: number };
    if (!image || !image.width || !image.height) {
      throw new Error("Car Selector height.jpg loaded without readable image dimensions.");
    }
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) {
      throw new Error("Car Selector could not create a heightmap canvas context.");
    }
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const positions = this.terrainGeometry.getAttribute("position");
    const uvs = this.terrainGeometry.getAttribute("uv");
    const sampleHeight = (u: number, v: number): number => {
      const x = Math.max(0, Math.min(canvas.width - 1, Math.round(u * (canvas.width - 1))));
      const y = Math.max(0, Math.min(canvas.height - 1, Math.round((1 - v) * (canvas.height - 1))));
      const offset = (y * canvas.width + x) * 4;
      const luminance = (pixels[offset] + pixels[offset + 1] + pixels[offset + 2]) / (255 * 3);
      return luminance * this.terrainHeightScale;
    };
    for (let index = 0; index < positions.count; index += 1) {
      positions.setY(index, sampleHeight(uvs.getX(index), uvs.getY(index)));
    }
    positions.needsUpdate = true;
    this.terrainGeometry.computeVertexNormals();
    this.terrainGeometry.computeBoundingBox();
    this.terrainGeometry.computeBoundingSphere();
    this.groundAtCar = sampleHeight(0.8, 0.5);
  }
}
