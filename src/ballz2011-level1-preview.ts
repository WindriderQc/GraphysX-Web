import {
  Color,
  GridHelper,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Ballz2011Level1Environment } from "./ballz2011-level1-environment";

function requireCanvas(): HTMLCanvasElement {
  const canvas = document.querySelector<HTMLCanvasElement>("#ballz2011-level1-canvas");
  if (!canvas) throw new Error("BallZ 2011 Level 1 preview canvas is missing.");
  return canvas;
}

const canvas = requireCanvas();
const scene = new Scene();
scene.background = new Color(0x07101a);

const environment = new Ballz2011Level1Environment({ showEdges: true, showBounds: false });
scene.add(environment.group);

const grid = new GridHelper(150, 30, 0x33506c, 0x17293b);
grid.name = "Presentation-only origin grid";
scene.add(grid);

const cameraState = environment.getState().recommendedCamera;
const camera = new PerspectiveCamera(
  cameraState.fovDegrees,
  1,
  cameraState.near,
  cameraState.far
);
camera.position.set(...cameraState.position);

const renderer = new WebGLRenderer({ canvas, antialias: true });
renderer.outputColorSpace = "srgb";
renderer.shadowMap.enabled = true;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const controls = new OrbitControls(camera, canvas);
controls.target.set(...cameraState.target);
controls.enableDamping = false;
controls.minDistance = 12;
controls.maxDistance = 280;
controls.update();

let manualTime = false;
let autoOrbit = true;

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
    offset.applyAxisAngle(new Vector3(0, 1, 0), deltaSeconds * 0.075);
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

function resetCamera(): void {
  camera.position.set(...cameraState.position);
  controls.target.set(...cameraState.target);
  controls.update();
}

canvas.addEventListener("pointerdown", () => {
  autoOrbit = false;
});

window.addEventListener("resize", resize);
window.addEventListener("keydown", (event) => {
  if (event.code === "KeyE") environment.setEdgesVisible(!environment.edgeOverlay.visible);
  if (event.code === "KeyB") environment.setBoundsVisible(!environment.boundsHelper.visible);
  if (event.code === "KeyR") resetCamera();
  if (event.code === "KeyO") autoOrbit = !autoOrbit;
  if (event.code === "KeyF") {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void canvas.requestFullscreen();
  }
  step(0);
});

resize();
requestAnimationFrame(frame);

const previewWindow = window as typeof window & {
  render_game_to_text?: () => string;
  advanceTime?: (milliseconds: number) => void;
  __BALLZ2011_LEVEL1_DEBUG__?: {
    state: () => ReturnType<Ballz2011Level1Environment["getState"]>;
    setEdges: (visible: boolean) => void;
    setBounds: (visible: boolean) => void;
    resetCamera: () => void;
    archiveToDisplay: (position: [number, number, number]) => [number, number, number];
    displayToArchive: (position: [number, number, number]) => [number, number, number];
  };
};

previewWindow.render_game_to_text = () =>
  JSON.stringify({
    mode: "ballz2011-level1-tvm-archive-preview",
    coordinateSystem: "Source and display are +X/+Y/+Z; display uses one reversible uniform 0.1 scale after centering X/Z and grounding minimum Y.",
    controls: "drag orbit, wheel zoom, E edges, B bounds, O auto-orbit, R reset camera, F fullscreen",
    camera: {
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

previewWindow.__BALLZ2011_LEVEL1_DEBUG__ = {
  state: () => environment.getState(),
  setEdges: (visible) => {
    environment.setEdgesVisible(visible);
    step(0);
  },
  setBounds: (visible) => {
    environment.setBoundsVisible(visible);
    step(0);
  },
  resetCamera,
  archiveToDisplay: (position) => environment.archiveToDisplay(position).toArray(),
  displayToArchive: (position) => environment.displayToArchive(position).toArray()
};
