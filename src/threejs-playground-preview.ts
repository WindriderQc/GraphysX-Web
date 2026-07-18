import {
  Color,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector2,
  WebGLRenderer
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  ThreejsPlaygroundEnvironment,
  type ThreejsPlaygroundParameter,
  type ThreejsPlaygroundState
} from "./threejs-playground-environment";

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Three.js Playground preview requires ${selector}.`);
  return element;
}

const canvas = requiredElement<HTMLCanvasElement>("#viewport");
const loadLine = requiredElement<HTMLElement>("#load-line");
const airplaneValue = requiredElement<HTMLElement>("#airplane-value");
const terrainValue = requiredElement<HTMLElement>("#terrain-value");
const raycastValue = requiredElement<HTMLElement>("#raycast-value");
const lightValue = requiredElement<HTMLElement>("#light-value");
const cameraValue = requiredElement<HTMLElement>("#camera-value");
const fpsValue = requiredElement<HTMLElement>("#fps-value");
const fpsProgress = requiredElement<HTMLProgressElement>("#fps-progress");
const resetButton = requiredElement<HTMLButtonElement>("#reset-view");
const parameterInputs = [...document.querySelectorAll<HTMLInputElement>("[data-playground-param]")];

const renderer = new WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false,
  powerPreference: "high-performance"
});
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.outputColorSpace = SRGBColorSpace;

const scene = new Scene();
scene.background = new Color(0x000000);
const camera = new PerspectiveCamera(55, 1, 10, 30000);
const environment = new ThreejsPlaygroundEnvironment();
scene.add(environment.group);
environment.applyToCamera(camera);

const controls = new OrbitControls(camera, canvas);
const initialState = environment.getState();
controls.target.fromArray(initialState.camera.lookAt);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.enablePan = false;
controls.screenSpacePanning = false;
controls.maxPolarAngle = Math.PI / 2;
controls.minDistance = 34.6;
controls.maxDistance = 169;
controls.listenToKeyEvents(window);
controls.update();
controls.saveState();

const pressed = new Set<string>();
const pointer = new Vector2();
let deterministicClock = false;
let lastTime = performance.now();
let lastUiSignature = "";

function formatTuple(values: [number, number, number] | null): string {
  return values ? values.map((value) => value.toFixed(2)).join(", ") : "loading";
}

function syncUi(state: ThreejsPlaygroundState, force = false): void {
  const signature = [
    state.loadStatus,
    state.airplane.position?.join(","),
    state.terrain.raycastTestCount,
    state.terrain.raycastHit,
    state.animatedLight.intensity.toFixed(2),
    state.camera.orbitAngleRadians.toFixed(3),
    state.camera.zoom.toFixed(3)
  ].join("|");
  if (!force && signature === lastUiSignature) return;
  lastUiSignature = signature;
  loadLine.textContent = state.loadStatus === "ready"
    ? `${state.source.assetCount} exact assets · ${(state.source.totalBytes / 1_000_000).toFixed(2)} MB · restored`
    : state.loadStatus === "error"
      ? `Load error · ${state.error}`
      : state.loadStatus === "disposed" ? "Environment disposed" : "Loading nine exact archive assets…";
  loadLine.classList.toggle("error", state.loadStatus === "error");
  airplaneValue.textContent = state.airplane.loaded ? formatTuple(state.airplane.position) : "loading GLB";
  terrainValue.textContent = `${state.terrain.vertexCount} vertices · ${state.terrain.heightRange[0].toFixed(3)}–${state.terrain.heightRange[1].toFixed(3)}`;
  raycastValue.textContent = state.terrain.raycastHit ? formatTuple(state.terrain.lastRaycastPoint) : "move over terrain";
  raycastValue.classList.toggle("hit", state.terrain.raycastHit);
  lightValue.textContent = state.animatedLight.intensity.toFixed(2);
  cameraValue.textContent = `${state.camera.orbitAngleRadians.toFixed(2)} rad · ${state.camera.zoom.toFixed(2)}×`;
  fpsValue.textContent = state.fps.label;
  fpsValue.style.color = state.fps.band;
  fpsProgress.value = state.fps.value;
  const parameterValues: Record<ThreejsPlaygroundParameter, number> = {
    "camera.x": state.gui.camera.x,
    "camera.y": state.gui.camera.y,
    "camera.z": state.gui.camera.z,
    "cube.speedX": state.gui.cube.speedX,
    "cube.speedY": state.gui.cube.speedY,
    "plane.width": state.gui.plane.width,
    "plane.height": state.gui.plane.height,
    "plane.x": state.gui.plane.x,
    "plane.y": state.gui.plane.y,
    "plane.z": state.gui.plane.z,
    "earth.speedX": state.gui.planets[0].speedX,
    "earth.speedY": state.gui.planets[0].speedY,
    "mars.speedX": state.gui.planets[1].speedX,
    "mars.speedY": state.gui.planets[1].speedY,
    "moon.speedX": state.gui.planets[2].speedX,
    "moon.speedY": state.gui.planets[2].speedY
  };
  for (const input of parameterInputs) {
    const parameter = input.dataset.playgroundParam as ThreejsPlaygroundParameter;
    const value = parameterValues[parameter];
    input.value = String(value);
    const output = input.parentElement?.querySelector("output");
    if (output) output.textContent = value.toFixed(0);
  }
}

function resize(): void {
  const width = Math.max(1, innerWidth);
  const height = Math.max(1, innerHeight);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function orbitInput(): number {
  return Number(pressed.has("d") || pressed.has("arrowright")) - Number(pressed.has("a") || pressed.has("arrowleft"));
}

function updatePointer(event: PointerEvent): void {
  const bounds = canvas.getBoundingClientRect();
  pointer.set(
    ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
    -((event.clientY - bounds.top) / bounds.height) * 2 + 1
  );
  environment.setPointerNdc(pointer.x, pointer.y);
  environment.raycastTerrain(pointer, camera);
  syncUi(environment.getState());
}

function reset(): void {
  const dampingWasEnabled = controls.enableDamping;
  controls.enableDamping = false;
  controls.reset();
  environment.reset(camera);
  controls.target.fromArray(environment.getState().camera.lookAt);
  controls.update();
  controls.saveState();
  controls.enableDamping = dampingWasEnabled;
  syncUi(environment.getState(), true);
}

resetButton.addEventListener("click", reset);
for (const input of parameterInputs) {
  input.addEventListener("input", () => {
    const parameter = input.dataset.playgroundParam as ThreejsPlaygroundParameter;
    environment.setParameter(parameter, Number(input.value), camera);
    controls.target.fromArray(environment.getState().camera.lookAt);
    controls.update();
    syncUi(environment.getState(), true);
  });
}
canvas.addEventListener("pointermove", updatePointer);
controls.addEventListener("change", () => {
  environment.syncFromCamera(camera);
  syncUi(environment.getState());
});
canvas.addEventListener("wheel", () => syncUi(environment.getState()), { passive: true });
window.addEventListener("resize", resize);
window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  pressed.add(key);
  if (key === "r") reset();
  if (key === "f") void (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen());
});
window.addEventListener("keyup", (event) => pressed.delete(event.key.toLowerCase()));
window.addEventListener("blur", () => pressed.clear());

function renderFrame(now: number): void {
  const delta = Math.min(Math.max((now - lastTime) / 1000, 0), 0.05);
  lastTime = now;
  if (!deterministicClock) environment.update(delta, orbitInput(), camera);
  controls.update();
  renderer.render(scene, camera);
  syncUi(environment.getState());
  requestAnimationFrame(renderFrame);
}

declare global {
  interface Window {
    render_game_to_text: () => string;
    advanceTime: (milliseconds: number) => void;
    __THREEJS_PLAYGROUND_DEBUG__: {
      getState: () => ThreejsPlaygroundState;
      orbit: (radians: number) => void;
      zoom: (factor: number) => void;
      reset: () => void;
      raycast: (x: number, y: number) => [number, number, number] | null;
      setPointer: (x: number, y: number) => void;
      setParameter: (parameter: ThreejsPlaygroundParameter, value: number) => boolean;
      useRealtime: () => void;
      dispose: () => void;
    };
  }
}

window.render_game_to_text = () => JSON.stringify(environment.getState());
window.advanceTime = (milliseconds: number) => {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) throw new RangeError("advanceTime requires non-negative milliseconds.");
  if (!deterministicClock) {
    reset();
  }
  deterministicClock = true;
  environment.update(milliseconds / 1000, orbitInput(), camera);
  controls.update();
  renderer.render(scene, camera);
  lastTime = performance.now();
  syncUi(environment.getState(), true);
};
window.__THREEJS_PLAYGROUND_DEBUG__ = {
  getState: () => environment.getState(),
  orbit: (radians) => {
    environment.orbitByRadians(radians, camera);
    controls.target.fromArray(environment.getState().camera.lookAt);
    controls.update();
  },
  zoom: (factor) => {
    environment.zoomBy(factor, camera);
    controls.target.fromArray(environment.getState().camera.lookAt);
    controls.update();
  },
  reset,
  raycast: (x, y) => environment.raycastTerrain(new Vector2(x, y), camera),
  setPointer: (x, y) => environment.setPointerNdc(x, y),
  setParameter: (parameter, value) => environment.setParameter(parameter, value, camera),
  useRealtime: () => {
    deterministicClock = false;
    lastTime = performance.now();
  },
  dispose: () => environment.dispose()
};

resize();
syncUi(environment.getState(), true);
void environment.ready.then(() => {
  reset();
  syncUi(environment.getState(), true);
});
requestAnimationFrame(renderFrame);
