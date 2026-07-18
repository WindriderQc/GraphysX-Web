import {
  AmbientLight,
  Color,
  DirectionalLight,
  Fog,
  GridHelper,
  HemisphereLight,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  BALLZ_TRACK_GALLERY_ASSET_IDS,
  type BallzTrackGalleryAssetId,
  type BallzTrackGalleryCameraProfile,
  BallzTrackGalleryEnvironment,
  type BallzTrackGalleryEnvironmentState,
  type BallzTrackGalleryMaterialMode
} from "./ballz-track-gallery-environment";

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`BallZ track gallery preview is missing ${selector}.`);
  return element;
}

const canvas = requireElement<HTMLCanvasElement>("#ballz-track-gallery-canvas");
const assetValue = requireElement<HTMLElement>("#asset-value");
const geometryValue = requireElement<HTMLElement>("#geometry-value");
const materialValue = requireElement<HTMLElement>("#material-value");
const hostValue = requireElement<HTMLElement>("#host-value");
const statusValue = requireElement<HTMLElement>("#status-value");
const factsValue = requireElement<HTMLElement>("#facts-value");

const renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.outputColorSpace = SRGBColorSpace;
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;

const scene = new Scene();
scene.background = new Color(0x08131a);
scene.fog = new Fog(0x08131a, 145, 300);
scene.add(new HemisphereLight(0xd8f2ff, 0x172027, 2.1));
scene.add(new AmbientLight(0xa8c8d8, 0.35));
const key = new DirectionalLight(0xffffff, 2.8);
key.position.set(70, 110, 85);
key.castShadow = true;
scene.add(key);
const rim = new DirectionalLight(0x62d8ff, 1.1);
rim.position.set(-75, 45, -65);
scene.add(rim);

const grid = new GridHelper(180, 36, 0x32718c, 0x183747);
grid.position.y = -0.5;
scene.add(grid);

const environment = new BallzTrackGalleryEnvironment();
scene.add(environment.group);

const camera = new PerspectiveCamera(46, 1, 0.05, 600);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = false;
controls.minDistance = 12;
controls.maxDistance = 320;

let cameraProfile: BallzTrackGalleryCameraProfile = "overview";
let autoOrbit = true;
let manualTime = false;
let lastFrameTime: number | null = null;

function applyCamera(profile: BallzTrackGalleryCameraProfile): void {
  cameraProfile = profile;
  const next = environment.getCameraProfile(profile);
  camera.position.set(...next.position);
  controls.target.set(...next.target);
  camera.fov = next.fovDegrees;
  camera.updateProjectionMatrix();
  controls.update();
}

function materialDescription(state: BallzTrackGalleryEnvironmentState): string {
  if (state.material.mode === "diagnostic-groups") return "diagnostic group palette";
  if (state.hostEvidence.materialMode.includes("override")) return "exact host StdMat override";
  if (state.material.resolvedTextures.length > 0) return `${state.material.resolvedTextures.length} exact texture binding${state.material.resolvedTextures.length === 1 ? "" : "s"}`;
  if (state.material.neutralFallback) return "zero record → neutral fallback";
  return `${state.material.embeddedRecords.length} embedded color group${state.material.embeddedRecords.length === 1 ? "" : "s"}`;
}

function updateHud(): void {
  const state = environment.getState();
  assetValue.textContent = state.asset.label;
  geometryValue.textContent = `${state.asset.vertexCount}v · ${state.asset.triangleCount}t · ${state.asset.topology.connectedComponents.length} component${state.asset.topology.connectedComponents.length === 1 ? "" : "s"}`;
  materialValue.textContent = materialDescription(state);
  materialValue.className = state.material.neutralFallback && state.material.mode === "source-evidence" ? "warn" : state.assetsReady ? "good" : "warn";
  hostValue.textContent = state.hostEvidence.status.replaceAll("-", " ");
  statusValue.textContent = `${state.statusRecommendation.status} · non-playable visit`;
  statusValue.className = "warn";

  const textures = state.material.resolvedTextures.map((binding) => binding.textureName).join(", ");
  const normalBoundary = state.asset.displayNormalAdapter === "computed-for-inspection"
    ? "<br>Source normals are all zero; display normals are computed and disclosed."
    : "";
  factsValue.innerHTML = `<strong>${state.assetsReady ? "Exact geometry ready" : "Loading exact texture evidence"}</strong><br>${state.hostEvidence.gameplayBoundary}${textures ? `<br>Embedded binding: ${textures}.` : ""}${normalBoundary}`;

  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-asset]")) {
    button.setAttribute("aria-pressed", String(button.dataset.asset === state.selectedAssetId));
  }
  const materialButton = document.querySelector<HTMLButtonElement>("[data-action='materials']");
  if (materialButton) {
    materialButton.textContent = state.material.mode === "source-evidence" ? "Source" : "Groups";
    materialButton.setAttribute("aria-pressed", String(state.material.mode === "diagnostic-groups"));
  }
  const edgesButton = document.querySelector<HTMLButtonElement>("[data-action='edges']");
  if (edgesButton) edgesButton.setAttribute("aria-pressed", String(state.diagnostics.edgesVisible));
  const boundsButton = document.querySelector<HTMLButtonElement>("[data-action='bounds']");
  if (boundsButton) boundsButton.setAttribute("aria-pressed", String(state.diagnostics.boundsVisible));
  const cameraButton = document.querySelector<HTMLButtonElement>("[data-action='camera']");
  if (cameraButton) cameraButton.textContent = cameraProfile === "overview" ? "Overview" : "Top";
  const orbitButton = document.querySelector<HTMLButtonElement>("[data-action='orbit']");
  if (orbitButton) orbitButton.setAttribute("aria-pressed", String(autoOrbit));
}

function render(): void {
  controls.update();
  updateHud();
  renderer.render(scene, camera);
}

function resize(): void {
  const width = Math.max(1, canvas.clientWidth);
  const height = Math.max(1, canvas.clientHeight);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  render();
}

function selectAsset(id: BallzTrackGalleryAssetId): BallzTrackGalleryEnvironmentState {
  const state = environment.selectAsset(id);
  applyCamera(cameraProfile);
  render();
  return state;
}

function setMaterialMode(mode: BallzTrackGalleryMaterialMode): BallzTrackGalleryEnvironmentState {
  const state = environment.setMaterialMode(mode);
  render();
  return state;
}

function setEdges(visible: boolean): BallzTrackGalleryEnvironmentState {
  const state = environment.setEdgesVisible(visible);
  render();
  return state;
}

function setBounds(visible: boolean): BallzTrackGalleryEnvironmentState {
  const state = environment.setBoundsVisible(visible);
  render();
  return state;
}

function setCamera(profile: BallzTrackGalleryCameraProfile): BallzTrackGalleryEnvironmentState {
  applyCamera(profile);
  render();
  return environment.getState();
}

function step(deltaSeconds: number): void {
  if (autoOrbit) {
    const offset = camera.position.clone().sub(controls.target);
    offset.applyAxisAngle(new Vector3(0, 1, 0), deltaSeconds * 0.13);
    camera.position.copy(controls.target).add(offset);
  }
  render();
}

function snapshot(): object {
  const state = environment.getState();
  return {
    diagnostic: "ballz-track-gallery",
    coordinateSystem: "Exact TV3D +X/+Y/+Z source or local coordinates, then per-asset reversible uniform display normalization; +Y remains up.",
    camera: {
      profile: cameraProfile,
      position: camera.position.toArray().map((value) => Number(value.toFixed(3))),
      target: controls.target.toArray().map((value) => Number(value.toFixed(3))),
      autoOrbit
    },
    state: {
      schema: state.schema,
      mode: state.mode,
      selectedAssetId: state.selectedAssetId,
      assetsReady: state.assetsReady,
      textureLoadErrors: state.textureLoadErrors,
      playable: state.playable,
      asset: {
        label: state.asset.label,
        source: state.asset.source,
        sha256: state.asset.sha256,
        vertexCount: state.asset.vertexCount,
        triangleCount: state.asset.triangleCount,
        materialIndices: state.asset.exactMaterialIndices,
        connectedComponents: state.asset.topology.connectedComponents.length,
        boundaryEdges: state.asset.topology.boundaryEdgeCount,
        nonManifoldEdges: state.asset.topology.nonManifoldEdgeCount,
        sourceNormals: state.asset.sourceNormals,
        displayNormalAdapter: state.asset.displayNormalAdapter
      },
      host: { status: state.hostEvidence.status, gameplayBoundary: state.hostEvidence.gameplayBoundary },
      normalization: {
        status: state.normalization.status,
        basis: state.normalization.basis,
        displayScale: state.normalization.displayScale,
        displayBounds: state.normalization.displayBounds
      },
      material: {
        mode: state.material.mode,
        resolvedTextures: state.material.resolvedTextures,
        neutralFallback: state.material.neutralFallback
      },
      diagnostics: state.diagnostics,
      statusRecommendation: state.statusRecommendation,
      exclusions: state.exclusions
    },
    controls: "1-6 select, M material evidence/groups, E edges, B bounds, C camera, A orbit, drag/wheel inspect, F fullscreen"
  };
}

for (const button of document.querySelectorAll<HTMLButtonElement>("[data-asset]")) {
  button.addEventListener("click", () => selectAsset(button.dataset.asset as BallzTrackGalleryAssetId));
}
for (const button of document.querySelectorAll<HTMLButtonElement>("[data-action]")) {
  button.addEventListener("click", () => {
    const state = environment.getState();
    if (button.dataset.action === "materials") setMaterialMode(state.material.mode === "source-evidence" ? "diagnostic-groups" : "source-evidence");
    if (button.dataset.action === "edges") setEdges(!state.diagnostics.edgesVisible);
    if (button.dataset.action === "bounds") setBounds(!state.diagnostics.boundsVisible);
    if (button.dataset.action === "camera") setCamera(cameraProfile === "overview" ? "top" : "overview");
    if (button.dataset.action === "orbit") autoOrbit = !autoOrbit;
    render();
  });
}

canvas.addEventListener("pointerdown", () => {
  autoOrbit = false;
  render();
});
window.addEventListener("keydown", (event) => {
  if (event.repeat) return;
  if (/^Digit[1-6]$/.test(event.code)) selectAsset(BALLZ_TRACK_GALLERY_ASSET_IDS[Number(event.code.at(-1)) - 1]);
  const state = environment.getState();
  if (event.code === "KeyM") setMaterialMode(state.material.mode === "source-evidence" ? "diagnostic-groups" : "source-evidence");
  if (event.code === "KeyE") setEdges(!state.diagnostics.edgesVisible);
  if (event.code === "KeyB") setBounds(!state.diagnostics.boundsVisible);
  if (event.code === "KeyC") setCamera(cameraProfile === "overview" ? "top" : "overview");
  if (event.code === "KeyA") autoOrbit = !autoOrbit;
  if (event.code === "KeyF") {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void canvas.requestFullscreen();
  }
  render();
});

function animationFrame(now: number): void {
  const deltaSeconds = lastFrameTime === null ? 0 : Math.min(0.05, Math.max(0, (now - lastFrameTime) / 1000));
  lastFrameTime = now;
  if (!manualTime) step(deltaSeconds);
  requestAnimationFrame(animationFrame);
}

const previewWindow = window as typeof window & {
  render_game_to_text?: () => string;
  advanceTime?: (milliseconds: number) => void;
  __BALLZ_TRACK_GALLERY_HARNESS__?: {
    state: () => BallzTrackGalleryEnvironmentState;
    select: (id: BallzTrackGalleryAssetId) => BallzTrackGalleryEnvironmentState;
    materials: (mode: BallzTrackGalleryMaterialMode) => BallzTrackGalleryEnvironmentState;
    edges: (visible: boolean) => BallzTrackGalleryEnvironmentState;
    bounds: (visible: boolean) => BallzTrackGalleryEnvironmentState;
    camera: (profile: BallzTrackGalleryCameraProfile) => BallzTrackGalleryEnvironmentState;
    orbit: (enabled: boolean) => BallzTrackGalleryEnvironmentState;
    sourceWorldToDisplay: (id: BallzTrackGalleryAssetId, position: [number, number, number]) => [number, number, number];
    displayToSourceWorld: (id: BallzTrackGalleryAssetId, position: [number, number, number]) => [number, number, number];
  };
};

previewWindow.render_game_to_text = () => JSON.stringify(snapshot());
previewWindow.advanceTime = (milliseconds: number) => {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) throw new RangeError("advanceTime requires non-negative milliseconds.");
  manualTime = true;
  const steps = Math.max(1, Math.round(milliseconds / (1000 / 60)));
  for (let index = 0; index < steps; index += 1) step(1 / 60);
};
previewWindow.__BALLZ_TRACK_GALLERY_HARNESS__ = {
  state: () => environment.getState(),
  select: selectAsset,
  materials: setMaterialMode,
  edges: setEdges,
  bounds: setBounds,
  camera: setCamera,
  orbit: (enabled) => {
    autoOrbit = enabled;
    render();
    return environment.getState();
  },
  sourceWorldToDisplay: (id, position) => environment.sourceWorldToDisplay(id, position).toArray(),
  displayToSourceWorld: (id, position) => environment.displayToSourceWorld(id, position).toArray()
};

environment.ready.then(() => render());
applyCamera("overview");
resize();
requestAnimationFrame(animationFrame);
