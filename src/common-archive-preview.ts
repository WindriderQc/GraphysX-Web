import { Color, PerspectiveCamera, Scene, WebGLRenderer } from "three";
import {
  CommonArchiveEnvironment,
  type CommonArchiveSpaceId
} from "./common-archive-environment";

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Common archive preview is missing ${selector}.`);
  return element;
}

const canvas = requireElement<HTMLCanvasElement>("#common-archive-canvas");
const spaceName = requireElement<HTMLElement>("#space-name");
const spaceNote = requireElement<HTMLElement>("#space-note");
const scene = new Scene();
scene.background = new Color(0x02040a);
const camera = new PerspectiveCamera(60, 1, 0.1, 600);
const renderer = new WebGLRenderer({ canvas, antialias: true });
renderer.outputColorSpace = "srgb";
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const requestedSpace = new URLSearchParams(window.location.search).get("space");
const initialSpace: CommonArchiveSpaceId = requestedSpace === "sky-component" ? "sky-component" : "room1";
const environment = new CommonArchiveEnvironment({ initialSpace });
scene.add(environment.group);
environment.applyToCamera(camera);

const held = new Set<string>();
let manualTime = false;
let lastFrame = performance.now();
let pointerDown = false;
let previousPointerX = 0;

function updateCaption(): void {
  const sky = environment.getActiveSpace() === "sky-component";
  spaceName.textContent = sky ? "common/sky.tvm — environment component" : "Common Room 1 — common/room.tvm";
  spaceNote.textContent = sky
    ? "Exact inward skydome asset; no standalone scene assembly was found · 1 Room · A/D or drag"
    : "Exact room shell; camera and lights are restoration choices · 2 sky component · A/D or drag";
}

function setSpace(space: CommonArchiveSpaceId): void {
  environment.setActiveSpace(space, camera);
  scene.background = new Color(space === "sky-component" ? 0x000000 : 0x02040a);
  updateCaption();
  render();
}

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
  if (event.code === "Digit1") setSpace("room1");
  if (event.code === "Digit2") setSpace("sky-component");
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

updateCaption();
resize();
void environment.ready.finally(render);
requestAnimationFrame(frame);

const testWindow = window as typeof window & {
  render_game_to_text?: () => string;
  advanceTime?: (milliseconds: number) => void;
  __COMMON_ARCHIVE_DEBUG__?: {
    state: () => ReturnType<CommonArchiveEnvironment["getState"]>;
    setSpace: (space: CommonArchiveSpaceId) => void;
    orbit: (radians: number) => void;
    reset: () => void;
  };
};

testWindow.render_game_to_text = () =>
  JSON.stringify({
    mode: "common-archive-evidence-preview",
    coordinateSystem: "+X right, +Y up, +Z toward source front; Room camera remains inside the 25-unit shell",
    environment: environment.getState()
  });

testWindow.advanceTime = (milliseconds: number) => {
  manualTime = true;
  const steps = Math.max(1, Math.round(milliseconds / (1000 / 60)));
  for (let index = 0; index < steps; index += 1) step(1 / 60);
};

testWindow.__COMMON_ARCHIVE_DEBUG__ = {
  state: () => environment.getState(),
  setSpace,
  orbit: (radians) => {
    environment.orbitByRadians(radians, camera);
    render();
  },
  reset: () => {
    environment.resetOrbit(camera);
    render();
  }
};
