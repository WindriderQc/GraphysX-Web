import { Color, PerspectiveCamera, Scene, WebGLRenderer } from "three";
import { XmlSceneEnvironment } from "./xml-scene-environment";

function requireCanvas(): HTMLCanvasElement {
  const canvas = document.querySelector<HTMLCanvasElement>("#xml-scene-canvas");
  if (!canvas) throw new Error("XML scene preview canvas is missing.");
  return canvas;
}

const canvas = requireCanvas();
const scene = new Scene();
scene.background = new Color(0x07101b);
const camera = new PerspectiveCamera(48, 1, 0.1, 180);
const renderer = new WebGLRenderer({ canvas, antialias: true });
renderer.outputColorSpace = "srgb";
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const environment = new XmlSceneEnvironment();
scene.add(environment.group);
environment.applyToCamera(camera);

const held = new Set<string>();
let pointerDown = false;
let previousPointerX = 0;
let manualTime = false;
let lastFrame = performance.now();

function resize(): void {
  const width = Math.max(1, canvas.clientWidth);
  const height = Math.max(1, canvas.clientHeight);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  render();
}

function render(): void {
  renderer.render(scene, camera);
}

function step(deltaSeconds: number): void {
  const orbitInput = (held.has("KeyA") || held.has("ArrowLeft") ? 1 : 0) -
    (held.has("KeyD") || held.has("ArrowRight") ? 1 : 0);
  environment.update(deltaSeconds, orbitInput, camera);
  render();
}

function frame(now: number): void {
  if (!manualTime) {
    const deltaSeconds = Math.min(0.05, Math.max(0, (now - lastFrame) / 1000));
    lastFrame = now;
    step(deltaSeconds);
  }
  requestAnimationFrame(frame);
}

window.addEventListener("keydown", (event) => {
  held.add(event.code);
  if (event.code === "KeyH" && !event.repeat) {
    const airplane = environment.getState().objects.find((object) => object.name === "Airplane");
    environment.setObjectVisible("Airplane", !(airplane?.visible ?? true));
    render();
  }
  if (event.code === "KeyF" && !event.repeat) {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void canvas.requestFullscreen();
  }
});
window.addEventListener("keyup", (event) => held.delete(event.code));
window.addEventListener("blur", () => held.clear());
window.addEventListener("resize", resize);
document.addEventListener("fullscreenchange", resize);

canvas.addEventListener("pointerdown", (event) => {
  pointerDown = true;
  previousPointerX = event.clientX;
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener("pointermove", (event) => {
  if (!pointerDown) return;
  const delta = event.clientX - previousPointerX;
  previousPointerX = event.clientX;
  environment.orbitByRadians(-delta * 0.008, camera);
  render();
});
canvas.addEventListener("pointerup", (event) => {
  pointerDown = false;
  canvas.releasePointerCapture(event.pointerId);
});

resize();
void environment.ready.finally(render);
requestAnimationFrame(frame);

const testWindow = window as typeof window & {
  render_game_to_text?: () => string;
  advanceTime?: (milliseconds: number) => void;
  __XML_SCENE_DEBUG__?: {
    state: () => ReturnType<XmlSceneEnvironment["getState"]>;
    setObjectVisible: (name: string, visible: boolean) => boolean;
    orbit: (radians: number) => void;
    reset: () => void;
  };
};

testWindow.render_game_to_text = () =>
  JSON.stringify({
    mode: "xml-authored-scene-preview",
    coordinateSystem: "TV3D left-handed source is converted as source +Z -> web -Z; serialized positions remain available in object state",
    environment: environment.getState()
  });

testWindow.advanceTime = (milliseconds: number) => {
  manualTime = true;
  const steps = Math.max(1, Math.round(milliseconds / (1000 / 60)));
  for (let index = 0; index < steps; index += 1) step(1 / 60);
};

testWindow.__XML_SCENE_DEBUG__ = {
  state: () => environment.getState(),
  setObjectVisible: (name, visible) => {
    const changed = environment.setObjectVisible(name, visible);
    render();
    return changed;
  },
  orbit: (radians) => {
    environment.orbitByRadians(radians, camera);
    render();
  },
  reset: () => {
    environment.resetObjectVisibility();
    environment.resetOrbit(camera);
    render();
  }
};
