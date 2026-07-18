import {
  AmbientLight,
  Box3,
  DirectionalLight,
  GridHelper,
  Group,
  MathUtils,
  Mesh,
  PerspectiveCamera,
  Vector3
} from "three";
import { loadArchivedVehicle3ds, type ArchivedVehicle3dsResult } from "./vehicle-pack-loader";

import gt4ModelUrl from "./assets/vehicles/gt4.3DS?url";
import gt4TextureUrl from "./assets/vehicles/GT4 WORK.jpg?url";
import cobraModelUrl from "./assets/vehicles/Low_Cobra.3DS?url";
import cobraBodyTextureUrl from "./assets/vehicles/CobTex.tga?url";
import cobraDiskTextureUrl from "./assets/vehicles/Disk_brk.tga?url";
import cobraGlassTextureUrl from "./assets/vehicles/Glass.tga?url";
import cobraHeadTextureUrl from "./assets/vehicles/Head_lt.tga?url";
import cobraSidewallTextureUrl from "./assets/vehicles/TA_Tire.tga?url";
import cobraTailTextureUrl from "./assets/vehicles/Tail_lt.tga?url";
import cobraTreadTextureUrl from "./assets/vehicles/Tire_trd.tga?url";

export type VehiclePackId = "gt4" | "low-cobra";

type VehiclePackRecord = {
  id: VehiclePackId;
  label: string;
  source: string;
  modelUrl: string;
  objects: number;
  vertices: number;
  triangles: number;
  materials: number;
  textureReferences: string[];
  tvm: { source: string; vertices: number; triangles: number };
};

const VEHICLES: Record<VehiclePackId, VehiclePackRecord> = {
  gt4: {
    id: "gt4",
    label: "GT4",
    source: "Yanik C++ BCKUP/Media/Models/cars/gt4.3DS",
    modelUrl: gt4ModelUrl,
    objects: 14,
    vertices: 10_740,
    triangles: 8_345,
    materials: 2,
    textureReferences: ["GT4 WORK.JPG"],
    tvm: { source: "Media/Models/cars/GT4.tvm", vertices: 12_916, triangles: 8_345 }
  },
  "low-cobra": {
    id: "low-cobra",
    label: "Low Cobra",
    source: "Yanik C++ BCKUP/Media/Models/cars/Low_Cobra.3DS",
    modelUrl: cobraModelUrl,
    objects: 10,
    vertices: 6_961,
    triangles: 3_266,
    materials: 7,
    textureReferences: [
      "COBTEX.TGA",
      "TA_TIRE.TGA",
      "TIRE_TRD.TGA",
      "DISK_BRK.TGA",
      "HEAD_LT.TGA",
      "TAIL_LT.TGA",
      "GLASS.TGA"
    ],
    tvm: { source: "Media/Models/cars/Low Cobra.tvm", vertices: 7_298, triangles: 3_266 }
  }
};

const TEXTURE_URLS = new Map<string, string>([
  ["gt4 work.jpg", gt4TextureUrl],
  ["cobtex.tga", cobraBodyTextureUrl],
  ["disk_brk.tga", cobraDiskTextureUrl],
  ["glass.tga", cobraGlassTextureUrl],
  ["head_lt.tga", cobraHeadTextureUrl],
  ["ta_tire.tga", cobraSidewallTextureUrl],
  ["tail_lt.tga", cobraTailTextureUrl],
  ["tire_trd.tga", cobraTreadTextureUrl]
]);

export type VehiclePackEnvironmentState = {
  id: "archived-vehicle-pack-source-gallery";
  selectedVehicleId: VehiclePackId;
  label: string;
  source: string;
  ready: boolean;
  loadStatus: "loading" | "ready" | "error" | "disposed";
  loadError: string | null;
  objectCount: number;
  vertexCount: number;
  triangleCount: number;
  materialCount: number;
  textureReferences: string[];
  tvmEvidence: { source: string; vertices: number; triangles: number };
  selectorBinding: false;
  physicsBinding: false;
  playable: false;
  status: "PIPELINE";
  orbitAngleRadians: number;
  cameraPosition: [number, number, number];
  lookAt: [number, number, number];
  compatibilityOverrides: string[];
  fidelityBoundary: string;
  evidenceBoundary: string;
};

/**
 * Exact non-driving source inspector for the two orphaned vehicle packs.
 * No selector or vehicle-physics connection is invented here: the archived
 * selector contains only Impreza and its click callback is empty.
 */
export class VehiclePackEnvironment {
  readonly group = new Group();
  readonly ready: Promise<void>;

  private selectedVehicleId: VehiclePackId = "gt4";
  private loadStatus: VehiclePackEnvironmentState["loadStatus"] = "loading";
  private loadError: string | null = null;
  private orbitAngle = -0.72;
  private cameraRadius = 18;
  private readonly cameraTarget = new Vector3(0, 2.2, 0);
  private readonly cameraPosition = new Vector3();
  private readonly results = new Map<VehiclePackId, ArchivedVehicle3dsResult>();
  private readonly modelRoots = new Map<VehiclePackId, Group>();
  private disposed = false;

  constructor() {
    this.group.name = "GT4 and Low Cobra — exact source assets, no driving claim";
    const grid = new GridHelper(42, 28, 0x42627b, 0x1b3549);
    grid.name = "Inspection grid (not archived)";
    this.group.add(grid);
    const ambient = new AmbientLight(0xcfe5ff, 1.35);
    ambient.name = "Inspection ambient light (not archived)";
    const key = new DirectionalLight(0xffefd0, 4.2);
    key.position.set(7, 12, 9);
    key.name = "Inspection key light (not archived)";
    const rim = new DirectionalLight(0x5acbff, 2.4);
    rim.position.set(-8, 5, -7);
    rim.name = "Inspection rim light (not archived)";
    this.group.add(ambient, key, rim);
    this.ready = this.ensureLoaded("gt4").then(() => undefined);
  }

  async selectVehicle(id: VehiclePackId, camera?: PerspectiveCamera): Promise<boolean> {
    if (this.disposed || !(id in VEHICLES)) return false;
    this.selectedVehicleId = id;
    this.orbitAngle = id === "gt4" ? -0.72 : 0.72;
    this.loadStatus = "loading";
    this.syncVisibility();
    await this.ensureLoaded(id);
    if (this.disposed || this.selectedVehicleId !== id) return false;
    this.syncVisibility();
    if (camera) this.applyToCamera(camera);
    return this.results.has(id) && this.loadError === null;
  }

  orbitByRadians(delta: number, camera?: PerspectiveCamera): void {
    if (this.disposed || !Number.isFinite(delta)) return;
    this.orbitAngle = MathUtils.euclideanModulo(this.orbitAngle + delta, Math.PI * 2);
    if (camera) this.applyToCamera(camera);
  }

  update(deltaSeconds: number, orbitInput = 0, camera?: PerspectiveCamera): VehiclePackEnvironmentState {
    if (!this.disposed && Number.isFinite(deltaSeconds) && Number.isFinite(orbitInput)) {
      this.orbitAngle = MathUtils.euclideanModulo(
        this.orbitAngle + MathUtils.clamp(orbitInput, -1, 1) * Math.max(0, deltaSeconds) * 0.52,
        Math.PI * 2
      );
    }
    if (camera) this.applyToCamera(camera);
    return this.getState();
  }

  reset(camera?: PerspectiveCamera): void {
    this.orbitAngle = this.selectedVehicleId === "gt4" ? -0.72 : 0.72;
    if (camera) this.applyToCamera(camera);
  }

  applyToCamera(camera: PerspectiveCamera): void {
    this.cameraPosition.set(
      this.cameraTarget.x + Math.sin(this.orbitAngle) * this.cameraRadius,
      this.cameraTarget.y + 4.4,
      this.cameraTarget.z + Math.cos(this.orbitAngle) * this.cameraRadius
    );
    camera.position.copy(this.cameraPosition);
    camera.lookAt(this.cameraTarget);
    camera.fov = 42;
    camera.near = 0.05;
    camera.far = 160;
    camera.updateProjectionMatrix();
  }

  getState(): VehiclePackEnvironmentState {
    const record = VEHICLES[this.selectedVehicleId];
    const result = this.results.get(this.selectedVehicleId);
    return {
      id: "archived-vehicle-pack-source-gallery",
      selectedVehicleId: this.selectedVehicleId,
      label: record.label,
      source: record.source,
      ready: this.loadStatus === "ready",
      loadStatus: this.loadStatus,
      loadError: this.loadError,
      objectCount: result?.objectCount ?? record.objects,
      vertexCount: result?.vertexCount ?? record.vertices,
      triangleCount: result?.triangleCount ?? record.triangles,
      materialCount: result?.materialNames.length ?? record.materials,
      textureReferences: result?.textureReferences ?? [...record.textureReferences],
      tvmEvidence: { ...record.tvm },
      selectorBinding: false,
      physicsBinding: false,
      playable: false,
      status: "PIPELINE",
      orbitAngleRadians: this.orbitAngle,
      cameraPosition: this.cameraPosition.toArray() as [number, number, number],
      lookAt: this.cameraTarget.toArray() as [number, number, number],
      compatibilityOverrides: result?.compatibilityOverrides ?? [],
      fidelityBoundary: result?.fidelityBoundary ?? "Exact archived 3DS source is loading.",
      evidenceBoundary: "GT4 and Low Cobra were never bound to the archived one-Impreza selector or CLVehicule physics. This is source-asset inspection only."
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.loadStatus = "disposed";
    for (const result of this.results.values()) {
      result.group.traverse((node) => {
        if (!(node instanceof Mesh)) return;
        node.geometry.dispose();
        const materials = Array.isArray(node.material) ? node.material : [node.material];
        for (const material of materials) {
          if ("map" in material && material.map) material.map.dispose();
          material.dispose();
        }
      });
    }
    this.results.clear();
    this.modelRoots.clear();
    this.group.clear();
  }

  private async ensureLoaded(id: VehiclePackId): Promise<void> {
    if (this.results.has(id)) {
      this.loadStatus = "ready";
      this.loadError = null;
      this.syncVisibility();
      return;
    }
    const record = VEHICLES[id];
    try {
      const result = await loadArchivedVehicle3ds({
        label: record.label,
        modelUrl: record.modelUrl,
        textureUrls: TEXTURE_URLS,
        revealBlackTexturedMaterials: true
      });
      if (this.disposed) {
        result.group.traverse((node) => {
          if (node instanceof Mesh) node.geometry.dispose();
        });
        return;
      }
      const displayRoot = new Group();
      displayRoot.name = `${record.label} reversible inspection transform`;
      displayRoot.add(result.group);
      result.group.updateMatrixWorld(true);
      const box = new Box3().setFromObject(result.group);
      const center = box.getCenter(new Vector3());
      const size = box.getSize(new Vector3());
      result.group.position.sub(center);
      result.group.position.y += size.y * 0.5;
      const scale = 12 / Math.max(size.x, size.z, 0.001);
      displayRoot.scale.setScalar(scale);
      this.cameraRadius = 17 + Math.max(0, size.y * scale - 4) * 0.4;
      this.results.set(id, result);
      this.modelRoots.set(id, displayRoot);
      this.group.add(displayRoot);
      this.loadStatus = "ready";
      this.loadError = null;
      this.syncVisibility();
    } catch (error) {
      this.loadStatus = "error";
      this.loadError = error instanceof Error ? error.message : String(error);
    }
  }

  private syncVisibility(): void {
    for (const [id, root] of this.modelRoots) root.visible = id === this.selectedVehicleId;
  }
}
