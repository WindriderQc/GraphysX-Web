import {
  Box3,
  Color,
  DoubleSide,
  Group,
  HemisphereLight,
  MathUtils,
  Mesh,
  Object3D,
  PerspectiveCamera,
  Vector3
} from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";

type Tuple3 = [number, number, number];
type LoadStatus = "loading" | "ready" | "error" | "disposed";
export type ArchiveBlenderCameraProfile = "source" | "overview";
export type MaisonSubspaceId = "house" | "kitchen";

const LEVEL1_SOURCE = {
  blend: {
    path: String.raw`E:\Media\Datalake\blenderModel\Levels\Level1.blend`,
    bytes: 490292,
    sha256: "0AA62FF04FA06988F7DFF71B429D980B2766A985F1CF6BB13A160278F38B4E9E"
  },
  earlierUnityFbx: {
    path: String.raw`E:\Media\Datalake\bckup\Unity Projects\BallZ\Assets\Models\Level1.fbx`,
    bytes: 234012,
    sha256: "1E398A147CE8B76047544ED09FA5995219C62CAC5CEB631FC5A45F7B157669D6"
  },
  browserFbx: {
    path: "/assets/ballz-blender-level1/level1-best.fbx",
    bytes: 234476,
    sha256: "A7C248041E5E2CCFD0B9455B68535A4F7EF09BD47D9972D3D2BCC718F8C727D6"
  },
  authored: {
    objects: 3,
    meshes: 1,
    cameras: 1,
    lights: 1,
    materials: 1,
    vertices: 356,
    polygons: 354,
    dimensions: [47.121994, 39.944572, 8.414539] as Tuple3
  }
} as const;

const MAISON_SOURCES = {
  house: {
    label: "House",
    blend: {
      path: String.raw`E:\Media\Datalake\blenderModel\Maison\maison.blend`,
      bytes: 576596,
      sha256: "8C9E95FDC5DE981BA451F0C05ACA9B94D347FE0DEE701D557F4CEDA595AC9237"
    },
    browserFbx: {
      path: "/assets/maison-explorer/maison-best.fbx",
      bytes: 87836,
      sha256: "43CB7E5206F56D71ED6BF7986662B3EB504634616FDDA1ED7BFA8875427F8DB7"
    },
    authored: {
      objects: 31,
      meshes: 24,
      cameras: 1,
      lights: 6,
      materials: 1,
      vertices: 216,
      polygons: 148
    },
    missingDependencies: [] as string[]
  },
  kitchen: {
    label: "Kitchen",
    blend: {
      path: String.raw`E:\Media\Datalake\blenderModel\Maison\Cuisine.blend`,
      bytes: 1131088,
      sha256: "C0441E2AC52CC05329A569DC31B056314B9EA5535460EFDDFADBB8B86B966855"
    },
    browserFbx: {
      path: "/assets/maison-explorer/cuisine-best.fbx",
      bytes: 1477852,
      sha256: "24846D8EC083477F87E91F46ED31DA952A575B7F7CD3B234B6D11A4603B5B14E"
    },
    authored: {
      objects: 87,
      meshes: 76,
      empties: 7,
      cameras: 1,
      lights: 3,
      materials: 3,
      vertices: 4244,
      polygons: 3676
    },
    missingDependencies: [
      String.raw`C:\Users\Yanik\Desktop\Maison\31768676_10156115872840631_8145769982148476928_n.jpg (unpacked external reference; absent with 0x0 image data)`
    ]
  }
} as const;

type RuntimeSummary = {
  meshes: number;
  vertices: number;
  triangles: number;
  cameras: number;
  lights: number;
  boundsMin: Tuple3;
  boundsMax: Tuple3;
  boundsSize: Tuple3;
  materials: Array<{
    name: string;
    type: string;
    color: string | null;
    opacity: number;
    transparent: boolean;
  }>;
};

function tuple(vector: Vector3): Tuple3 {
  return [Number(vector.x.toFixed(6)), Number(vector.y.toFixed(6)), Number(vector.z.toFixed(6))];
}

function loadFbx(path: string): Promise<Group> {
  return new Promise((resolve, reject) => {
    new FBXLoader().load(path, resolve, undefined, reject);
  });
}

function summarizeRuntime(root: Object3D): RuntimeSummary {
  let meshes = 0;
  let vertices = 0;
  let triangles = 0;
  let cameras = 0;
  let lights = 0;
  const materialRecords = new Map<string, RuntimeSummary["materials"][number]>();
  root.traverse((object) => {
    if ((object as PerspectiveCamera).isCamera) cameras += 1;
    if ((object as { isLight?: boolean }).isLight) lights += 1;
    if (!(object as Mesh).isMesh) return;
    meshes += 1;
    const mesh = object as Mesh;
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      const readable = material as typeof material & { color?: Color };
      const key = `${material.uuid}:${material.name}`;
      materialRecords.set(key, {
        name: material.name || "(unnamed)",
        type: material.type,
        color: readable.color?.isColor ? `#${readable.color.getHexString()}` : null,
        opacity: Number(material.opacity.toFixed(6)),
        transparent: material.transparent
      });
    }
    const positions = mesh.geometry.getAttribute("position");
    vertices += positions?.count ?? 0;
    triangles += (mesh.geometry.index?.count ?? positions?.count ?? 0) / 3;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  });
  root.updateMatrixWorld(true);
  const bounds = new Box3().setFromObject(root);
  return {
    meshes,
    vertices,
    triangles: Math.round(triangles),
    cameras,
    lights,
    boundsMin: tuple(bounds.min),
    boundsMax: tuple(bounds.max),
    boundsSize: tuple(bounds.getSize(new Vector3())),
    materials: [...materialRecords.values()]
  };
}

function normalizeBlenderFbx(root: Group): RuntimeSummary {
  // Blender's FBX exporter writes centimeters. This exact inverse restores the
  // source Blender-unit dimensions before applying only a centering/grounding
  // presentation transform to the parent model group.
  root.scale.setScalar(0.01);
  root.updateMatrixWorld(true);
  const bounds = new Box3().setFromObject(root);
  const center = bounds.getCenter(new Vector3());
  root.position.set(-center.x, -bounds.min.y, -center.z);
  root.traverse((object) => {
    if (!(object as Mesh).isMesh) return;
    const mesh = object as Mesh;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      // Some of these learning-era meshes contain mixed/reversed face winding.
      // Keep the archived material itself, but make both authored sides legible
      // in the browser inspection view.
      material.side = DoubleSide;
      if (material.name !== "__DEFAULT" && material.opacity === 0) {
        // Blender inspection reports alpha 1.0 for every named material in
        // these sources. The 2.79 FBX exporter writes those same materials as
        // fully transparent, so restore the verified source alpha here.
        material.opacity = 1;
        material.transparent = false;
        material.depthWrite = true;
      }
      material.needsUpdate = true;
    }
  });
  root.updateMatrixWorld(true);
  return summarizeRuntime(root);
}

function findSourceCamera(root: Object3D): PerspectiveCamera | null {
  let found: PerspectiveCamera | null = null;
  root.traverse((object) => {
    if (!found && (object as PerspectiveCamera).isPerspectiveCamera) found = object as PerspectiveCamera;
  });
  return found;
}

function disposeRoot(root: Object3D): void {
  const materials = new Set<{ dispose: () => void }>();
  const textures = new Set<{ dispose: () => void }>();
  root.traverse((object) => {
    if (!(object as Mesh).isMesh) return;
    const mesh = object as Mesh;
    mesh.geometry.dispose();
    const objectMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of objectMaterials) {
      materials.add(material);
      for (const value of Object.values(material)) {
        if (value && typeof value === "object" && "isTexture" in value && (value as { isTexture?: boolean }).isTexture) {
          textures.add(value as { dispose: () => void });
        }
      }
    }
  });
  for (const material of materials) material.dispose();
  for (const texture of textures) texture.dispose();
  root.clear();
}

abstract class BlenderVisitCamera {
  protected cameraProfile: ArchiveBlenderCameraProfile = "overview";
  protected orbitAngle = 0.74;
  protected zoom = 1;
  protected readonly lookAt = new Vector3();
  protected overviewRadius = 40;
  protected overviewHeight = 18;
  protected readonly sourceForward = new Vector3(0, 0, -1);
  protected readonly sourceUp = new Vector3(0, 1, 0);

  protected abstract activeModel(): Group | null;

  setCameraProfile(profile: ArchiveBlenderCameraProfile, camera?: PerspectiveCamera): boolean {
    if (profile !== "source" && profile !== "overview") return false;
    this.cameraProfile = profile;
    if (camera) this.applyToCamera(camera);
    return true;
  }

  orbitByRadians(delta: number, camera?: PerspectiveCamera): void {
    if (!Number.isFinite(delta)) return;
    this.cameraProfile = "overview";
    this.orbitAngle += delta;
    if (camera) this.applyToCamera(camera);
  }

  zoomBy(factor: number, camera?: PerspectiveCamera): void {
    if (!Number.isFinite(factor) || factor <= 0) return;
    this.cameraProfile = "overview";
    this.zoom = MathUtils.clamp(this.zoom * factor, 0.45, 2.25);
    if (camera) this.applyToCamera(camera);
  }

  applyToCamera(camera: PerspectiveCamera): void {
    const model = this.activeModel();
    const sourceCamera = model ? findSourceCamera(model) : null;
    if (this.cameraProfile === "source" && sourceCamera) {
      model?.updateMatrixWorld(true);
      sourceCamera.getWorldPosition(camera.position);
      camera.up.copy(this.sourceUp);
      camera.lookAt(camera.position.clone().add(this.sourceForward));
      camera.fov = sourceCamera.fov;
      camera.near = Math.max(0.01, sourceCamera.near * 0.01);
      camera.far = Math.max(250, sourceCamera.far * 0.01);
      camera.updateProjectionMatrix();
      return;
    }
    const radius = this.overviewRadius * this.zoom;
    camera.up.set(0, 1, 0);
    camera.position.set(
      this.lookAt.x + Math.sin(this.orbitAngle) * radius,
      this.lookAt.y + this.overviewHeight * this.zoom,
      this.lookAt.z + Math.cos(this.orbitAngle) * radius
    );
    camera.lookAt(this.lookAt);
    camera.fov = 52;
    camera.near = 0.05;
    camera.far = 500;
    camera.updateProjectionMatrix();
  }

  update(deltaSeconds: number, orbitInput: number, camera?: PerspectiveCamera): void {
    if (orbitInput) {
      this.cameraProfile = "overview";
      this.orbitAngle += orbitInput * Math.max(0, deltaSeconds) * 0.72;
    }
    if (camera) this.applyToCamera(camera);
  }

  protected cameraState(camera: PerspectiveCamera | null): {
    profile: ArchiveBlenderCameraProfile;
    position: Tuple3 | null;
    lookAt: Tuple3;
    orbitAngleRadians: number;
    zoom: number;
  } {
    return {
      profile: this.cameraProfile,
      position: camera ? tuple(camera.position) : null,
      lookAt: tuple(this.lookAt),
      orbitAngleRadians: Number(this.orbitAngle.toFixed(6)),
      zoom: Number(this.zoom.toFixed(6))
    };
  }
}

export type BallzBlenderLevel1State = {
  id: "ballz-blender-level1";
  classification: "complete best-surviving authored geometry visit; no invented race";
  restorationStatus: "RESTORED";
  ready: boolean;
  loadStatus: LoadStatus;
  error: string | null;
  source: typeof LEVEL1_SOURCE;
  runtime: RuntimeSummary | null;
  camera: ReturnType<BlenderVisitCamera["cameraState"]>;
  evidenceBoundary: string;
  presentationAdapters: string[];
};

export class BallzBlenderLevel1Environment extends BlenderVisitCamera {
  readonly group = new Group();
  readonly ready: Promise<void>;
  private model: Group | null = null;
  private runtime: RuntimeSummary | null = null;
  private loadStatus: LoadStatus = "loading";
  private error: string | null = null;
  private lastCamera: PerspectiveCamera | null = null;

  constructor() {
    super();
    this.group.name = "BallZ Blender Level 1 — exact geometry visit";
    this.group.add(new HemisphereLight(new Color("#d9ecff"), new Color("#17212e"), 0.82));
    this.lookAt.set(0, 3.2, 0);
    this.sourceForward.set(-0.651558, -0.445271, -0.61417);
    this.sourceUp.set(-0.324013, 0.895396, -0.305421);
    this.overviewRadius = 58;
    this.overviewHeight = 27;
    this.ready = loadFbx(LEVEL1_SOURCE.browserFbx.path)
      .then((model) => {
        model.name = "Level1.blend best revision FBX export";
        this.runtime = normalizeBlenderFbx(model);
        this.model = model;
        this.group.add(model);
        this.loadStatus = "ready";
      })
      .catch((error: unknown) => {
        this.error = error instanceof Error ? error.message : String(error);
        this.loadStatus = "error";
        throw error;
      });
  }

  protected activeModel(): Group | null {
    return this.model;
  }

  override applyToCamera(camera: PerspectiveCamera): void {
    this.lastCamera = camera;
    super.applyToCamera(camera);
  }

  override update(deltaSeconds: number, orbitInput: number, camera?: PerspectiveCamera): void {
    if (camera) this.lastCamera = camera;
    super.update(deltaSeconds, orbitInput, camera);
  }

  reset(camera?: PerspectiveCamera): void {
    this.cameraProfile = "overview";
    this.orbitAngle = 0.74;
    this.zoom = 1;
    if (camera) this.applyToCamera(camera);
  }

  getState(): BallzBlenderLevel1State {
    return {
      id: "ballz-blender-level1",
      classification: "complete best-surviving authored geometry visit; no invented race",
      restorationStatus: "RESTORED",
      ready: this.loadStatus === "ready",
      loadStatus: this.loadStatus,
      error: this.error,
      source: LEVEL1_SOURCE,
      runtime: this.runtime,
      camera: this.cameraState(this.lastCamera),
      evidenceBoundary: "The saved Blender scene contains one authored level mesh, one camera and one point light, but no surviving host scene, BallZ spawn, physics, controls, checkpoints, rules or objective. Completion means an exact geometry/camera/light visit, not a fabricated race.",
      presentationAdapters: [
        "Blender FBX centimeters are inverted by an exact 0.01 scale.",
        "The source composition is centered and grounded as a parent-only reversible visit transform.",
        "Double-sided drawing exposes mixed archived face winding without changing geometry or replacing its material.",
        "Named FBX materials exported at opacity 0 are restored to the verified .blend alpha 1.0.",
        "The source camera keeps its exported position/lens and uses the inspected Blender world forward/up vectors after the exact (x, z, -y) axis mapping.",
        "A neutral hemisphere fill makes the gray source material readable without replacing the archived point light or material.",
        "Overview orbit is optional; Source Camera applies the saved Blender camera."
      ]
    };
  }

  dispose(): void {
    if (this.model) disposeRoot(this.model);
    this.group.clear();
    this.model = null;
    this.loadStatus = "disposed";
  }
}

type MaisonSubspaceState = {
  id: MaisonSubspaceId;
  label: string;
  ready: boolean;
  visible: boolean;
  source: (typeof MAISON_SOURCES)[MaisonSubspaceId];
  runtime: RuntimeSummary | null;
};

export type MaisonExplorerState = {
  id: "maison-explorer";
  classification: "complete best-surviving house and kitchen explorer";
  restorationStatus: "RESTORED";
  ready: boolean;
  loadStatus: LoadStatus;
  error: string | null;
  activeSubspace: MaisonSubspaceId;
  subspaces: MaisonSubspaceState[];
  camera: ReturnType<BlenderVisitCamera["cameraState"]>;
  sourceDependencyBoundary: string;
  presentationAdapters: string[];
};

export class MaisonExplorerEnvironment extends BlenderVisitCamera {
  readonly group = new Group();
  readonly ready: Promise<void>;
  private readonly models: Partial<Record<MaisonSubspaceId, Group>> = {};
  private readonly runtime: Partial<Record<MaisonSubspaceId, RuntimeSummary>> = {};
  private activeSubspace: MaisonSubspaceId = "house";
  private loadStatus: LoadStatus = "loading";
  private error: string | null = null;
  private lastCamera: PerspectiveCamera | null = null;

  constructor() {
    super();
    this.group.name = "Maison Explorer — best house and kitchen compositions";
    this.group.add(new HemisphereLight(new Color("#fff4df"), new Color("#27313b"), 0.9));
    this.ready = Promise.all(
      (["house", "kitchen"] as MaisonSubspaceId[]).map(async (id) => {
        const model = await loadFbx(MAISON_SOURCES[id].browserFbx.path);
        model.name = `${MAISON_SOURCES[id].label} best .blend export`;
        this.runtime[id] = normalizeBlenderFbx(model);
        this.models[id] = model;
        model.visible = id === this.activeSubspace;
        this.group.add(model);
      })
    )
      .then(() => {
        this.loadStatus = "ready";
        this.configureOverviewFromActive();
      })
      .catch((error: unknown) => {
        this.error = error instanceof Error ? error.message : String(error);
        this.loadStatus = "error";
        throw error;
      });
  }

  protected activeModel(): Group | null {
    return this.models[this.activeSubspace] ?? null;
  }

  private configureOverviewFromActive(): void {
    const runtime = this.runtime[this.activeSubspace];
    const size = runtime?.boundsSize ?? [16, 5, 16];
    this.lookAt.set(0, Math.max(1.2, size[1] * 0.34), 0);
    this.overviewRadius = Math.max(size[0], size[2]) * 1.18;
    this.overviewHeight = Math.max(4, size[1] * 1.2);
    if (this.activeSubspace === "house") {
      this.sourceForward.set(-0.651558, -0.445271, -0.61417);
      this.sourceUp.set(-0.324013, 0.895396, -0.305421);
    } else {
      this.sourceForward.set(0.987497, -0.035048, 0.153694);
      this.sourceUp.set(0.033268, 0.999346, 0.014135);
    }
  }

  selectSubspace(id: MaisonSubspaceId, camera?: PerspectiveCamera): boolean {
    if (id !== "house" && id !== "kitchen") return false;
    this.activeSubspace = id;
    for (const [modelId, model] of Object.entries(this.models)) {
      if (model) model.visible = modelId === id;
    }
    this.configureOverviewFromActive();
    this.cameraProfile = "overview";
    this.orbitAngle = 0.74;
    this.zoom = 1;
    if (camera) this.applyToCamera(camera);
    return true;
  }

  override applyToCamera(camera: PerspectiveCamera): void {
    this.lastCamera = camera;
    super.applyToCamera(camera);
  }

  override update(deltaSeconds: number, orbitInput: number, camera?: PerspectiveCamera): void {
    if (camera) this.lastCamera = camera;
    super.update(deltaSeconds, orbitInput, camera);
  }

  reset(camera?: PerspectiveCamera): void {
    this.cameraProfile = "overview";
    this.orbitAngle = 0.74;
    this.zoom = 1;
    if (camera) this.applyToCamera(camera);
  }

  getState(): MaisonExplorerState {
    const subspaces = (["house", "kitchen"] as MaisonSubspaceId[]).map((id) => ({
      id,
      label: MAISON_SOURCES[id].label,
      ready: Boolean(this.models[id]),
      visible: id === this.activeSubspace,
      source: MAISON_SOURCES[id],
      runtime: this.runtime[id] ?? null
    }));
    return {
      id: "maison-explorer",
      classification: "complete best-surviving house and kitchen explorer",
      restorationStatus: "RESTORED",
      ready: this.loadStatus === "ready",
      loadStatus: this.loadStatus,
      error: this.error,
      activeSubspace: this.activeSubspace,
      subspaces,
      camera: this.cameraState(this.lastCamera),
      sourceDependencyBoundary: "Cuisine.blend retains one unpacked Desktop JPG reference with no embedded pixels and no surviving file. Its affected source material remains the saved diffuse-color material; no substitute photograph is invented.",
      presentationAdapters: [
        "Blender FBX centimeters are inverted by an exact 0.01 scale.",
        "House and Kitchen are centered/grounded independently and selected as subspaces instead of being spatially invented into one floorplan.",
        "Every exported mesh, empty, camera and light from the best .blend revisions remains in its subspace.",
        "Double-sided drawing exposes mixed archived face winding without changing geometry or replacing source materials.",
        "Named FBX materials exported at opacity 0 are restored to the verified .blend alpha 1.0.",
        "Each source camera keeps its exported position/lens and uses its inspected Blender world forward/up vectors after the exact (x, z, -y) axis mapping.",
        "A neutral warm hemisphere fill keeps the source materials readable; original lamps remain present.",
        "Overview orbit is optional; Source Camera applies each saved Blender camera."
      ]
    };
  }

  dispose(): void {
    for (const model of Object.values(this.models)) if (model) disposeRoot(model);
    this.group.clear();
    this.loadStatus = "disposed";
  }
}
