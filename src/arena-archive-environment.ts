import {
  Box3,
  Color,
  DirectionalLight,
  DoubleSide,
  Euler,
  Group,
  HemisphereLight,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  Vector3
} from "three";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";

type Tuple3 = [number, number, number];
type LoadStatus = "loading" | "ready" | "error" | "disposed";
export type ArenaArchiveCameraProfile = "source" | "overview";

const SOURCE = {
  unityScene: {
    path: String.raw`E:\Media\Datalake\bckup\Unity Projects\Arena\Assets\Arena.unity`,
    bytes: 8748,
    sha256: "8DAB1C507DA98E94CA13CA68192DF6DAA98B6C442630A6251F76797934D02CAB"
  },
  obj: {
    path: "/assets/arena-archive/Arena.obj",
    bytes: 6417,
    sha256: "AE582845AC6EAB09C65430EED51E866AD40E787CBF4B652DE0B4A9DBE620BE45"
  },
  mtl: {
    path: "/assets/arena-archive/Arena.mtl",
    bytes: 144,
    sha256: "547D290E4DC5B7826667B2DFB59F8918E97B1980599C99B9CF54819436316668"
  },
  material: {
    path: "/assets/arena-archive/arena.mat",
    bytes: 2048,
    sha256: "D12CDD3744F38A1D86C62EBD3B01247ECD6E7C7B5F668B0117B1828D07FCDC55",
    shader: "Unity Standard",
    color: "#ffffff",
    metallic: 0,
    smoothness: 0.5
  },
  atlas: {
    path: "/assets/arena-archive/arena.png",
    bytes: 532134,
    sha256: "B643EBC1B13BA2C04F8D32DF35B2874CF3717F7057BCC36CEFD2F3C321572245",
    dimensions: [1024, 1024] as [number, number]
  },
  authored: {
    objects: 1,
    meshes: 1,
    vertices: 48,
    faces: 44,
    dimensions: [40, 2, 40] as Tuple3,
    objectPosition: [1.4151101, 0.69250107, -1.6516027] as Tuple3,
    cameraPosition: [0, 1, -10] as Tuple3,
    cameraEulerDegrees: [0, 0, 0] as Tuple3,
    cameraFov: 60,
    lightPosition: [0, 7.51, -13.44] as Tuple3,
    lightEulerDegrees: [50, -49.32, 0] as Tuple3
  }
} as const;

export type ArenaArchiveState = {
  restorationStatus: "RESTORED";
  classification: string;
  loadStatus: LoadStatus;
  loadError: string | null;
  source: typeof SOURCE;
  camera: {
    profile: ArenaArchiveCameraProfile;
    position: Tuple3;
    lookAt: Tuple3;
    orbitAngleRadians: number;
    sourceTransformExact: boolean;
  };
  runtime: {
    meshes: number;
    vertices: number;
    triangles: number;
    boundsSize: Tuple3;
    material: {
      atlasLoaded: boolean;
      metalness: number;
      roughness: number;
      doubleSidedAdapter: boolean;
    };
  };
  presentationAdapters: string[];
};

function tuple(vector: Vector3): Tuple3 {
  return [Number(vector.x.toFixed(6)), Number(vector.y.toFixed(6)), Number(vector.z.toFixed(6))];
}

function disposeObject(root: Object3D): void {
  const materials = new Set<MeshStandardMaterial>();
  const textures = new Set<Texture>();
  root.traverse((object) => {
    if (!(object as Mesh).isMesh) return;
    const mesh = object as Mesh;
    mesh.geometry.dispose();
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      const standard = material as MeshStandardMaterial;
      materials.add(standard);
      if (standard.map) textures.add(standard.map);
    }
  });
  for (const material of materials) material.dispose();
  for (const texture of textures) texture.dispose();
}

export class ArenaArchiveEnvironment {
  readonly group = new Group();
  readonly ready: Promise<void>;

  private model: Group | null = null;
  private material: MeshStandardMaterial | null = null;
  private loadStatus: LoadStatus = "loading";
  private loadError: string | null = null;
  private cameraProfile: ArenaArchiveCameraProfile = "overview";
  private orbitAngle = 0.72;
  private zoom = 1;
  private readonly lookAt = new Vector3(...SOURCE.authored.objectPosition).add(new Vector3(0, 1.1, 0));
  private cameraPosition = new Vector3(29, 23, 30);
  private runtime = {
    meshes: 0,
    vertices: 0,
    triangles: 0,
    boundsSize: [0, 0, 0] as Tuple3
  };

  constructor() {
    this.group.name = "ArenaArchiveEnvironment";

    const fill = new HemisphereLight(0xaec9df, 0x352b22, 1.4);
    fill.name = "PresentationAdapter_HemisphereFill";
    this.group.add(fill);

    const sourceLight = new DirectionalLight(0xffffff, 1);
    sourceLight.name = "Source_UnityDirectionalLight";
    const sourceEuler = new Euler(
      MathUtils.degToRad(SOURCE.authored.lightEulerDegrees[0]),
      MathUtils.degToRad(SOURCE.authored.lightEulerDegrees[1]),
      MathUtils.degToRad(SOURCE.authored.lightEulerDegrees[2]),
      "YXZ"
    );
    const forward = new Vector3(0, 0, 1).applyEuler(sourceEuler).normalize();
    sourceLight.position.copy(this.lookAt).addScaledVector(forward, -32);
    sourceLight.target.position.copy(this.lookAt);
    this.group.add(sourceLight, sourceLight.target);

    this.ready = this.load();
  }

  private async load(): Promise<void> {
    try {
      const [model, atlas] = await Promise.all([
        new OBJLoader().loadAsync(SOURCE.obj.path),
        new TextureLoader().loadAsync(SOURCE.atlas.path)
      ]);
      atlas.colorSpace = SRGBColorSpace;
      atlas.name = "Source_arena.png";
      const material = new MeshStandardMaterial({
        name: "Source_UnityStandard_arena",
        color: new Color(SOURCE.material.color),
        map: atlas,
        metalness: SOURCE.material.metallic,
        roughness: 1 - SOURCE.material.smoothness,
        side: DoubleSide
      });
      this.material = material;
      model.name = "Source_Arena_OBJ";
      model.position.set(...SOURCE.authored.objectPosition);
      model.traverse((object) => {
        if (!(object as Mesh).isMesh) return;
        const mesh = object as Mesh;
        mesh.material = material;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.runtime.meshes += 1;
        const positions = mesh.geometry.getAttribute("position");
        this.runtime.vertices += positions?.count ?? 0;
        this.runtime.triangles += (mesh.geometry.index?.count ?? positions?.count ?? 0) / 3;
      });
      model.updateMatrixWorld(true);
      this.runtime.triangles = Math.round(this.runtime.triangles);
      this.runtime.boundsSize = tuple(new Box3().setFromObject(model).getSize(new Vector3()));
      this.model = model;
      this.group.add(model);
      this.loadStatus = "ready";
    } catch (error) {
      this.loadStatus = "error";
      this.loadError = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  setCameraProfile(profile: ArenaArchiveCameraProfile, camera?: PerspectiveCamera): boolean {
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
    this.zoom = MathUtils.clamp(this.zoom * factor, 0.55, 1.8);
    if (camera) this.applyToCamera(camera);
  }

  reset(camera?: PerspectiveCamera): void {
    this.cameraProfile = "overview";
    this.orbitAngle = 0.72;
    this.zoom = 1;
    if (camera) this.applyToCamera(camera);
  }

  applyToCamera(camera: PerspectiveCamera): void {
    if (this.cameraProfile === "source") {
      camera.position.set(...SOURCE.authored.cameraPosition);
      camera.up.set(0, 1, 0);
      camera.fov = SOURCE.authored.cameraFov;
      camera.far = 500;
      camera.lookAt(new Vector3(...SOURCE.authored.cameraPosition).add(new Vector3(0, 0, 1)));
      this.cameraPosition.copy(camera.position);
      camera.updateProjectionMatrix();
      return;
    }
    const radius = 43 * this.zoom;
    camera.position.set(
      this.lookAt.x + Math.sin(this.orbitAngle) * radius,
      this.lookAt.y + 23 * this.zoom,
      this.lookAt.z + Math.cos(this.orbitAngle) * radius
    );
    camera.up.set(0, 1, 0);
    camera.fov = 52;
    camera.far = 500;
    camera.lookAt(this.lookAt);
    this.cameraPosition.copy(camera.position);
    camera.updateProjectionMatrix();
  }

  update(deltaSeconds: number, orbitInput: number, camera?: PerspectiveCamera): void {
    if (orbitInput !== 0) this.orbitByRadians(orbitInput * deltaSeconds * 0.72, camera);
  }

  getState(): ArenaArchiveState {
    const sourcePosition = new Vector3(...SOURCE.authored.cameraPosition);
    const stateLookAt = this.cameraProfile === "source"
      ? sourcePosition.clone().add(new Vector3(0, 0, 1))
      : this.lookAt;
    return {
      restorationStatus: "RESTORED",
      classification: "Complete exact-asset restoration of the surviving authored Unity Arena scene",
      loadStatus: this.loadStatus,
      loadError: this.loadError,
      source: SOURCE,
      camera: {
        profile: this.cameraProfile,
        position: tuple(this.cameraPosition),
        lookAt: tuple(stateLookAt),
        orbitAngleRadians: Number(this.orbitAngle.toFixed(6)),
        sourceTransformExact: this.cameraProfile === "source"
      },
      runtime: {
        meshes: this.runtime.meshes,
        vertices: this.runtime.vertices,
        triangles: this.runtime.triangles,
        boundsSize: this.runtime.boundsSize,
        material: {
          atlasLoaded: Boolean(this.material?.map),
          metalness: this.material?.metalness ?? SOURCE.material.metallic,
          roughness: this.material?.roughness ?? 1 - SOURCE.material.smoothness,
          doubleSidedAdapter: true
        }
      },
      presentationAdapters: [
        "Readable overview orbit is the default; Source Camera preserves the Unity camera transform and 60° FOV.",
        "A neutral hemisphere fill supplements the surviving Unity directional light for browser inspection.",
        "Double-sided rasterization makes the authored thin wall/floor surfaces readable without changing geometry or UVs."
      ]
    };
  }

  dispose(): void {
    this.loadStatus = "disposed";
    if (this.model) disposeObject(this.model);
    this.model = null;
    this.material = null;
    this.group.clear();
  }
}
