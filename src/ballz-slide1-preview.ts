import { Color, GridHelper, PerspectiveCamera, Scene, Vector3, WebGLRenderer } from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { BallzSlide1Environment } from "./ballz-slide1-environment";

type CameraProfile = "overview" | "source-chase";

function requireCanvas(): HTMLCanvasElement {
  const target = document.querySelector<HTMLCanvasElement>("#ballz-slide1-canvas");
  if (!target) throw new Error("BallZ Slide 1 preview canvas is missing.");
  return target;
}

const canvas = requireCanvas();

const scene = new Scene();
scene.background = new Color(0x07101a);
const environment = new BallzSlide1Environment({ showBall: true, showEdges: true });
scene.add(environment.group);

const grid = new GridHelper(100, 25, 0x355370, 0x182b3d);
grid.name = "Presentation-only display-origin grid";
scene.add(grid);

const camera = new PerspectiveCamera(48, 1, 0.05, 500);
const renderer = new WebGLRenderer({ canvas, antialias: true });
renderer.outputColorSpace = "srgb";
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = false;
controls.minDistance = 4;
controls.maxDistance = 250;

let cameraProfile: CameraProfile = "overview";
let autoOrbit = true;
let manualTime = false;

function applyCameraProfile(profile: CameraProfile): void {
  cameraProfile = profile;
  const next = environment.getCameraProfile(profile);
  camera.position.set(...next.position);
  controls.target.set(...next.target);
  camera.fov = next.fovDegrees;
  camera.updateProjectionMatrix();
  controls.update();
  autoOrbit = profile === "overview";
}

function resize(): void {
  const width = Math.max(1, canvas.clientWidth);
  const height = Math.max(1, canvas.clientHeight);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function step(deltaSeconds: number): void {
  if (autoOrbit) {
    const offset = camera.position.clone().sub(controls.target);
    offset.applyAxisAngle(new Vector3(0, 1, 0), deltaSeconds * 0.07);
    camera.position.copy(controls.target).add(offset);
  }
  controls.update();
  renderer.render(scene, camera);
}

function frame(now: number): void {
  if (!manualTime) {
    const previous = Number(canvas.dataset.lastFrame ?? now);
    canvas.dataset.lastFrame = String(now);
    step(Math.min(0.05, Math.max(0, (now - previous) / 1000)));
  }
  requestAnimationFrame(frame);
}

canvas.addEventListener("pointerdown", () => {
  autoOrbit = false;
  cameraProfile = "overview";
});

window.addEventListener("resize", resize);
window.addEventListener("keydown", (event) => {
  if (event.code === "KeyA") environment.setBallVisible(!environment.ball.visible);
  if (event.code === "KeyB") environment.setBoundsVisible(!environment.boundsHelper.visible);
  if (event.code === "KeyE") environment.setEdgesVisible(!environment.edgeOverlay.visible);
  if (event.code === "KeyC") applyCameraProfile(cameraProfile === "overview" ? "source-chase" : "overview");
  if (event.code === "KeyO") autoOrbit = !autoOrbit;
  if (event.code === "KeyR") applyCameraProfile(cameraProfile);
  if (event.code === "KeyF") {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void canvas.requestFullscreen();
  }
  step(0);
});

const requestedCamera = new URLSearchParams(window.location.search).get("camera");
applyCameraProfile(requestedCamera === "source-chase" ? "source-chase" : "overview");
resize();
requestAnimationFrame(frame);

const previewWindow = window as typeof window & {
  render_game_to_text?: () => string;
  advanceTime?: (milliseconds: number) => void;
  __BALLZ_SLIDE1_DEBUG__?: {
    state: () => ReturnType<BallzSlide1Environment["getState"]>;
    setBall: (visible: boolean) => void;
    setEdges: (visible: boolean) => void;
    setBounds: (visible: boolean) => void;
    setCameraProfile: (profile: CameraProfile) => void;
    sourceWorldToDisplay: (position: [number, number, number]) => [number, number, number];
    displayToSourceWorld: (position: [number, number, number]) => [number, number, number];
  };
};

previewWindow.render_game_to_text = () =>
  JSON.stringify({
    mode: "ballz-slide1-source-backed-non-race-visit",
    coordinateSystem: "Exact TV3D source +X/+Y/+Z assembly, then reversible uniform display normalization; +Y remains up.",
    controls: "drag orbit, wheel zoom, A ball, B bounds, E edges, C source-chase/overview, O auto-orbit, R camera reset, F fullscreen",
    camera: {
      profile: cameraProfile,
      position: camera.position.toArray().map((value) => Number(value.toFixed(3))),
      target: controls.target.toArray().map((value) => Number(value.toFixed(3))),
      autoOrbit
    },
    environment: environment.getState()
  });

previewWindow.advanceTime = (milliseconds: number) => {
  manualTime = true;
  const steps = Math.max(1, Math.round(milliseconds / (1000 / 60)));
  for (let index = 0; index < steps; index += 1) step(1 / 60);
};

previewWindow.__BALLZ_SLIDE1_DEBUG__ = {
  state: () => environment.getState(),
  setBall: (visible) => {
    environment.setBallVisible(visible);
    step(0);
  },
  setEdges: (visible) => {
    environment.setEdgesVisible(visible);
    step(0);
  },
  setBounds: (visible) => {
    environment.setBoundsVisible(visible);
    step(0);
  },
  setCameraProfile: applyCameraProfile,
  sourceWorldToDisplay: (position) => environment.sourceWorldToDisplay(position).toArray(),
  displayToSourceWorld: (position) => environment.displayToSourceWorld(position).toArray()
};
