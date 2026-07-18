import {
  ACESFilmicToneMapping,
  Color,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { ParticleEffectEnvironment } from "./particle-effect-environment";

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Particle effect preview is missing ${selector}.`);
  return element;
}

const canvas = requireElement<HTMLCanvasElement>("#particle-effect-canvas");
const status = requireElement<HTMLElement>("#particle-effect-status");

const scene = new Scene();
scene.background = new Color("#071018");

const camera = new PerspectiveCamera(48, 1, 0.01, 200);
const environment = new ParticleEffectEnvironment({ autoReplay: true });
const cameraProfile = environment.getCameraProfile();
camera.position.set(...cameraProfile.position);

const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.outputColorSpace = SRGBColorSpace;
renderer.toneMapping = ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
scene.add(environment.group);
environment.activate();

const controls = new OrbitControls(camera, canvas);
controls.target.set(...cameraProfile.target);
controls.enableDamping = false;
controls.minDistance = 4;
controls.maxDistance = 40;
controls.update();

let manualTime = false;
let previousTime = performance.now();

function updateStatus(): void {
  const current = environment.getState();
  status.textContent = current.loadStatus === "error"
    ? `Texture load failed: ${current.loadError ?? "unknown error"}`
    : `Explosion1.tvp · ${current.counts.activeParticles}/${current.counts.maximumParticles} active · cycle ${current.cycle}${current.paused ? " · paused" : ""}${current.autoReplay ? " · replay" : ""}`;
}

function resize(): void {
  const width = Math.max(1, window.innerWidth);
  const height = Math.max(1, window.innerHeight);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function render(): void {
  controls.update();
  renderer.render(scene, camera);
  updateStatus();
}

function frame(time: number): void {
  if (!manualTime) environment.update(Math.min(0.05, Math.max(0, (time - previousTime) / 1000)));
  previousTime = time;
  render();
  requestAnimationFrame(frame);
}

function restart(): void {
  environment.restart();
  render();
}

function togglePause(): void {
  const paused = !environment.getState().paused;
  environment.setPaused(paused);
  render();
}

function toggleReplay(): void {
  const autoReplay = !environment.getState().autoReplay;
  environment.setAutoReplay(autoReplay);
  render();
}

window.addEventListener("resize", resize);
window.addEventListener("keydown", (event) => {
  if (event.code === "KeyR") restart();
  if (event.code === "Space") {
    event.preventDefault();
    togglePause();
  }
  if (event.code === "KeyA") toggleReplay();
  if (event.code === "KeyF") {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void canvas.requestFullscreen();
  }
});

declare global {
  interface Window {
    __PARTICLE_EFFECT_ARCHIVE__: {
      state: () => ReturnType<ParticleEffectEnvironment["getState"]>;
      restart: () => void;
      setPaused: (paused: boolean) => void;
      setAutoReplay: (autoReplay: boolean) => void;
    };
    advanceTime: (milliseconds: number) => void;
    render_game_to_text: () => string;
  }
}

window.__PARTICLE_EFFECT_ARCHIVE__ = {
  state: () => environment.getState(),
  restart,
  setPaused: (paused) => {
    environment.setPaused(paused);
    render();
  },
  setAutoReplay: (autoReplay) => {
    environment.setAutoReplay(autoReplay);
    render();
  }
};

window.advanceTime = (milliseconds: number) => {
  manualTime = true;
  const stepMilliseconds = 1000 / 60;
  const steps = Math.max(1, Math.round(Math.max(0, milliseconds) / stepMilliseconds));
  for (let index = 0; index < steps; index += 1) environment.update(stepMilliseconds / 1000);
  render();
};

window.render_game_to_text = () => JSON.stringify({
  particleEffectArchive: environment.getState(),
  coordinateSystem: "Source TV3D coordinates are retained inside a uniformly scaled group: +x right, +y up, +z archive-forward; camera orbit is an inspection adapter.",
  camera: {
    position: [camera.position.x, camera.position.y, camera.position.z],
    target: [controls.target.x, controls.target.y, controls.target.z],
    distance: camera.position.distanceTo(new Vector3().copy(controls.target))
  },
  controls: "Drag to orbit; wheel zooms; R restarts the one-shot preset; Space pauses; A toggles preview-only automatic replay; F toggles fullscreen."
});

resize();
void environment.ready.then(() => {
  environment.restart();
  render();
});
requestAnimationFrame(frame);
