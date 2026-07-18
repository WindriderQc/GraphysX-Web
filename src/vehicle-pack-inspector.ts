import {
  ACESFilmicToneMapping,
  AmbientLight,
  Box3,
  Color,
  DirectionalLight,
  GridHelper,
  Group,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer
} from "three";
import { loadArchivedVehicle3ds, type ArchivedVehicle3dsResult } from "./vehicle-pack-loader";

import gt4ModelUrl from "../../Yanik C++ BCKUP/Media/Models/cars/gt4.3DS?url";
import gt4TextureUrl from "../../Yanik C++ BCKUP/Media/Models/cars/GT4 WORK.jpg?url";
import cobraModelUrl from "../../Yanik C++ BCKUP/Media/Models/cars/Low_Cobra.3DS?url";
import cobraBodyTextureUrl from "../../Yanik C++ BCKUP/Media/Models/cars/CobTex.tga?url";
import cobraDiskTextureUrl from "../../Yanik C++ BCKUP/Media/Models/cars/Disk_brk.tga?url";
import cobraGlassTextureUrl from "../../Yanik C++ BCKUP/Media/Models/cars/Glass.tga?url";
import cobraHeadTextureUrl from "../../Yanik C++ BCKUP/Media/Models/cars/Head_lt.tga?url";
import cobraSidewallTextureUrl from "../../Yanik C++ BCKUP/Media/Models/cars/TA_Tire.tga?url";
import cobraTailTextureUrl from "../../Yanik C++ BCKUP/Media/Models/cars/Tail_lt.tga?url";
import cobraTreadTextureUrl from "../../Yanik C++ BCKUP/Media/Models/cars/Tire_trd.tga?url";

type VehicleId = "gt4" | "low-cobra";

type VehicleEvidence = {
  id: VehicleId;
  label: string;
  modelUrl: string;
  source: string;
  objects: number;
  vertices: number;
  triangles: number;
  materials: number;
  textureReferences: string[];
  tvm: { file: string; vertices: number; triangles: number };
};

const vehicles: Record<VehicleId, VehicleEvidence> = {
  gt4: {
    id: "gt4",
    label: "GT4",
    modelUrl: gt4ModelUrl,
    source: "Media/Models/cars/gt4.3DS",
    objects: 14,
    vertices: 10_740,
    triangles: 8_345,
    materials: 2,
    textureReferences: ["GT4 WORK.JPG"],
    tvm: { file: "Media/Models/cars/GT4.tvm", vertices: 12_916, triangles: 8_345 }
  },
  "low-cobra": {
    id: "low-cobra",
    label: "Low Cobra",
    modelUrl: cobraModelUrl,
    source: "Media/Models/cars/Low_Cobra.3DS",
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
    tvm: { file: "Media/Models/cars/Low Cobra.tvm", vertices: 7_298, triangles: 3_266 }
  }
};

const textureUrls = new Map<string, string>([
  ["gt4 work.jpg", gt4TextureUrl],
  ["cobtex.tga", cobraBodyTextureUrl],
  ["disk_brk.tga", cobraDiskTextureUrl],
  ["glass.tga", cobraGlassTextureUrl],
  ["head_lt.tga", cobraHeadTextureUrl],
  ["ta_tire.tga", cobraSidewallTextureUrl],
  ["tail_lt.tga", cobraTailTextureUrl],
  ["tire_trd.tga", cobraTreadTextureUrl]
]);

const canvas = requireElement<HTMLCanvasElement>("vehicle-canvas");
const stage = requireElement<HTMLElement>("stage");
const facts = requireElement<HTMLElement>("facts");
const status = requireElement<HTMLElement>("status");
const gt4Button = requireElement<HTMLButtonElement>("select-gt4");
const cobraButton = requireElement<HTMLButtonElement>("select-cobra");

const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = SRGBColorSpace;
renderer.toneMapping = ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

const scene = new Scene();
scene.background = new Color(0x0a1825);
scene.add(new AmbientLight(0xc6ddf5, 1.35));
const keyLight = new DirectionalLight(0xfff0d6, 4.2);
keyLight.position.set(5, 9, 7);
scene.add(keyLight);
const rimLight = new DirectionalLight(0x55c8ff, 2.8);
rimLight.position.set(-6, 3, -7);
scene.add(rimLight);

const floor = new Mesh(
  new PlaneGeometry(200, 200),
  new MeshStandardMaterial({ color: 0x101c28, roughness: 0.92, metalness: 0.02 })
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.02;
scene.add(floor);
const grid = new GridHelper(200, 40, 0x42627b, 0x20384b);
grid.position.y = 0;
scene.add(grid);

const camera = new PerspectiveCamera(38, 1, 0.01, 10_000);
const displayRoot = new Group();
scene.add(displayRoot);

const loadedModels = new Map<VehicleId, Group>();
const loadedEvidence = new Map<VehicleId, ArchivedVehicle3dsResult>();
let selectedId: VehicleId = "gt4";
let loadStatus: "loading" | "ready" | "error" = "loading";
let loadError: string | null = null;
let yaw = initialYaw("gt4");
let pitch = -0.16;
let zoom = 1;
let fitDistance = 10;
let floorOffset = 0;
let pointerId: number | null = null;
let pointerX = 0;
let pointerY = 0;

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing #${id}`);
  return element as T;
}

async function loadModel(vehicle: VehicleEvidence): Promise<Group> {
  const result = await loadArchivedVehicle3ds({
    label: vehicle.label,
    modelUrl: vehicle.modelUrl,
    textureUrls,
    revealBlackTexturedMaterials: true
  });
  loadedEvidence.set(vehicle.id, result);
  result.group.traverse((node) => {
    if (!(node instanceof Mesh)) return;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materials) {
      if ("map" in material && material.map) {
        material.map.colorSpace = SRGBColorSpace;
        material.map.anisotropy = renderer.capabilities.getMaxAnisotropy();
        material.map.needsUpdate = true;
      }
    }
  });
  return result.group;
}

async function ensureSelectedLoaded(): Promise<void> {
  const vehicle = vehicles[selectedId];
  loadStatus = "loading";
  loadError = null;
  updatePanel();
  try {
    let model = loadedModels.get(selectedId);
    if (!model) {
      model = await loadModel(vehicle);
      loadedModels.set(selectedId, model);
    }
    if (selectedId !== vehicle.id) return;
    displayRoot.clear();
    displayRoot.add(model);
    fitSelectedModel();
    loadStatus = "ready";
  } catch (error) {
    loadStatus = "error";
    loadError = error instanceof Error ? error.message : String(error);
  }
  updatePanel();
  render();
}

function fitSelectedModel(): void {
  const model = loadedModels.get(selectedId);
  if (!model) return;
  displayRoot.position.set(0, 0, 0);
  displayRoot.rotation.set(pitch, yaw, 0);
  model.updateMatrixWorld(true);
  const box = new Box3().setFromObject(model);
  const center = box.getCenter(new Vector3());
  const size = box.getSize(new Vector3());
  model.position.sub(center);
  model.updateMatrixWorld(true);
  const centeredBox = new Box3().setFromObject(model);
  floorOffset = -centeredBox.min.y;
  model.position.y += floorOffset;
  const radius = Math.max(size.length() * 0.5, 0.1);
  fitDistance = radius / Math.tan(MathUtils.degToRad(camera.fov * 0.44));
  zoom = 1;
  updateCamera();
}

function updateCamera(): void {
  const model = loadedModels.get(selectedId);
  const modelHeight = model ? new Box3().setFromObject(model).getSize(new Vector3()).y : 1;
  const targetY = modelHeight * 0.34;
  camera.position.set(0, targetY + fitDistance * 0.12, fitDistance * zoom);
  camera.lookAt(0, targetY, 0);
  camera.near = Math.max(0.01, fitDistance / 1000);
  camera.far = fitDistance * 20;
  camera.updateProjectionMatrix();
}

function updatePanel(): void {
  const vehicle = vehicles[selectedId];
  gt4Button.setAttribute("aria-pressed", String(selectedId === "gt4"));
  cobraButton.setAttribute("aria-pressed", String(selectedId === "low-cobra"));
  facts.innerHTML = [
    ["3DS source", vehicle.source],
    ["Objects", String(vehicle.objects)],
    ["Vertices", vehicle.vertices.toLocaleString()],
    ["Triangles", vehicle.triangles.toLocaleString()],
    ["Materials", String(vehicle.materials)],
    ["Texture refs", String(vehicle.textureReferences.length)],
    ["TVM evidence", `${vehicle.tvm.vertices.toLocaleString()}v / ${vehicle.tvm.triangles.toLocaleString()}t`],
    ["Selector binding", "NONE"],
    ["Physics binding", "NONE"]
  ].map(([label, value]) => `<dt>${label}</dt><dd>${value}</dd>`).join("");
  status.textContent = loadStatus === "ready"
    ? "EXACT SOURCE READY"
    : loadStatus === "error"
      ? "SOURCE LOAD ERROR"
      : "LOADING EXACT SOURCE…";
  status.dataset.ready = String(loadStatus === "ready");
  status.title = loadError ?? "";
}

function selectVehicle(id: VehicleId): void {
  if (selectedId === id && loadStatus === "ready") return;
  selectedId = id;
  yaw = initialYaw(id);
  pitch = -0.16;
  void ensureSelectedLoaded();
}

function resetView(): void {
  yaw = initialYaw(selectedId);
  pitch = -0.16;
  zoom = 1;
  displayRoot.rotation.set(pitch, yaw, 0);
  updateCamera();
  render();
}

function resize(): void {
  const width = Math.max(1, stage.clientWidth);
  const height = Math.max(1, stage.clientHeight);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  render();
}

function render(): void {
  displayRoot.rotation.set(pitch, yaw, 0);
  renderer.render(scene, camera);
}

function step(milliseconds: number): void {
  const seconds = Math.max(0, milliseconds) / 1000;
  yaw += seconds * 0.15;
  render();
}

gt4Button.addEventListener("click", () => selectVehicle("gt4"));
cobraButton.addEventListener("click", () => selectVehicle("low-cobra"));
canvas.addEventListener("pointerdown", (event) => {
  pointerId = event.pointerId;
  pointerX = event.clientX;
  pointerY = event.clientY;
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener("pointermove", (event) => {
  if (pointerId !== event.pointerId) return;
  yaw += (event.clientX - pointerX) * 0.008;
  pitch = MathUtils.clamp(pitch + (event.clientY - pointerY) * 0.006, -0.75, 0.5);
  pointerX = event.clientX;
  pointerY = event.clientY;
  render();
});
canvas.addEventListener("pointerup", (event) => {
  if (pointerId === event.pointerId) pointerId = null;
});
canvas.addEventListener("wheel", (event) => {
  event.preventDefault();
  zoom = MathUtils.clamp(zoom * Math.exp(event.deltaY * 0.001), 0.55, 2.2);
  updateCamera();
  render();
}, { passive: false });
window.addEventListener("keydown", (event) => {
  if (event.key === "1") selectVehicle("gt4");
  if (event.key === "2") selectVehicle("low-cobra");
  if (event.key.toLocaleLowerCase() === "r") resetView();
  if (event.key.toLocaleLowerCase() === "f") {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen();
  }
});
window.addEventListener("resize", resize);
document.addEventListener("fullscreenchange", resize);

Object.assign(window, {
  advanceTime: (milliseconds: number) => step(milliseconds),
  render_game_to_text: () => JSON.stringify({
    mode: "vehicle-pack-evidence-inspector",
    selected: selectedId,
    loadStatus,
    loadError,
    evidence: {
      ...vehicles[selectedId],
      modelUrl: undefined,
      selectorBinding: false,
      physicsBinding: false
    },
    presentation: {
      sourceCoordinateSystem: "3DS Z-up",
      viewTransform: "deterministic (x,y,z) to (x,z,-y); no size normalization",
      yaw: round(yaw),
      pitch: round(pitch),
      zoom: round(zoom),
      fittedCameraDistance: round(fitDistance),
      floorOffset: round(floorOffset)
    },
    loaderEvidence: loadedEvidence.has(selectedId) ? {
      objectCount: loadedEvidence.get(selectedId)?.objectCount,
      vertexCount: loadedEvidence.get(selectedId)?.vertexCount,
      triangleCount: loadedEvidence.get(selectedId)?.triangleCount,
      materialNames: loadedEvidence.get(selectedId)?.materialNames,
      textureReferences: loadedEvidence.get(selectedId)?.textureReferences,
      compatibilityOverrides: loadedEvidence.get(selectedId)?.compatibilityOverrides,
      fidelityBoundary: loadedEvidence.get(selectedId)?.fidelityBoundary
    } : null,
    controls: "1/2 select source; drag rotates; wheel zooms; R resets; F toggles fullscreen"
  })
});

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function initialYaw(id: VehicleId): number {
  return id === "gt4" ? 0.78 : -0.55;
}

updatePanel();
resize();
void ensureSelectedLoaded();
