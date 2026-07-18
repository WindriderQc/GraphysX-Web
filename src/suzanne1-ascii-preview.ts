import { Color, PerspectiveCamera, Scene, WebGLRenderer } from "three";
import { SuzanneAsciiEnvironment } from "./suzanne1-ascii-environment";

function requireCanvas(): HTMLCanvasElement {
  const target = document.querySelector<HTMLCanvasElement>("#suzanne-preview-canvas");
  if (!target) throw new Error("Suzanne archive preview canvas is missing.");
  return target;
}

const canvas = requireCanvas();

const scene = new Scene();
scene.background = new Color(0x000000);

const camera = new PerspectiveCamera(60, 1, 0.01, 1000);
camera.position.set(3, 7.5, 43);
camera.lookAt(18, 1, 18);

const renderer = new WebGLRenderer({ canvas, antialias: true });
renderer.outputColorSpace = "srgb";
renderer.shadowMap.enabled = true;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const requestedProfile = new URLSearchParams(window.location.search).get("profile");
const profile = requestedProfile === "source2017" ? "source2017" : "reference2016";
const environment = new SuzanneAsciiEnvironment({ profile });
scene.add(environment.group);

let lastFrame = performance.now();
let manualTime = false;

function resize(): void {
  const width = Math.max(1, canvas.clientWidth);
  const height = Math.max(1, canvas.clientHeight);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function step(deltaSeconds: number): void {
  environment.update(deltaSeconds);
  renderer.render(scene, camera);
}

function frame(now: number): void {
  if (!manualTime) {
    const deltaSeconds = Math.min(0.05, Math.max(0, (now - lastFrame) / 1000));
    lastFrame = now;
    step(deltaSeconds);
  }
  requestAnimationFrame(frame);
}

window.addEventListener("resize", resize);
resize();
void environment.ready.finally(() => step(0));
requestAnimationFrame(frame);

const testWindow = window as typeof window & {
  render_game_to_text?: () => string;
  advanceTime?: (milliseconds: number) => void;
  __SUZANNE_ASCII_DEBUG__?: {
    state: () => ReturnType<SuzanneAsciiEnvironment["getState"]>;
    setRingVisible: (index: number, visible: boolean) => void;
    setPistonActivation: (index: number, activation: number) => void;
    reset: () => void;
  };
};

testWindow.render_game_to_text = () =>
  JSON.stringify({
    mode: "suzanne-ascii-archive-preview",
    coordinateSystem: "+X ASCII columns, +Y up, +Z ASCII rows; 40x40 world-unit arena",
    camera: {
      position: camera.position.toArray().map((value) => Number(value.toFixed(3))),
      lookAt: [18, 1, 18]
    },
    environment: environment.getState()
  });

testWindow.advanceTime = (milliseconds: number) => {
  manualTime = true;
  const steps = Math.max(1, Math.round(milliseconds / (1000 / 60)));
  for (let index = 0; index < steps; index += 1) step(1 / 60);
};

testWindow.__SUZANNE_ASCII_DEBUG__ = {
  state: () => environment.getState(),
  setRingVisible: (index, visible) => environment.setRingVisible(index, visible),
  setPistonActivation: (index, activation) => environment.setPistonActivation(index, activation),
  reset: () => {
    environment.resetRings();
    environment.pistonAssemblies.forEach((_assembly, index) => environment.setPistonActivation(index, 0));
  }
};
