import {
  ACESFilmicToneMapping,
  Color,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  WebGLRenderer
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  ParticlePresetLibraryEnvironment,
  type ParticlePresetLibraryState
} from "./particle-preset-library-environment";

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Particle preset library preview is missing ${selector}.`);
  return element;
}

const canvas = requireElement<HTMLCanvasElement>("#particle-library-canvas");
const selector = requireElement<HTMLSelectElement>("#particle-library-selector");
const status = requireElement<HTMLElement>("#particle-library-status");
const evidence = requireElement<HTMLElement>("#particle-library-evidence");
const config = requireElement<HTMLElement>("#particle-library-config");
const previousButton = requireElement<HTMLButtonElement>("#particle-library-previous");
const nextButton = requireElement<HTMLButtonElement>("#particle-library-next");
const restartButton = requireElement<HTMLButtonElement>("#particle-library-restart");
const pauseButton = requireElement<HTMLButtonElement>("#particle-library-pause");
const replayButton = requireElement<HTMLButtonElement>("#particle-library-replay");

const scene = new Scene();
scene.background = new Color("#071018");
const camera = new PerspectiveCamera(48, 1, 0.01, 200);
const requestedPreset = new URLSearchParams(window.location.search).get("preset") ?? "explosion_01";
const environment = new ParticlePresetLibraryEnvironment({ initialPresetId: requestedPreset, autoReplay: true });
const profile = environment.getCameraProfile();
camera.position.set(...profile.position);
scene.add(environment.group);
environment.activate();

const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.outputColorSpace = SRGBColorSpace;
renderer.toneMapping = ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const controls = new OrbitControls(camera, canvas);
controls.target.set(...profile.target);
controls.enableDamping = false;
controls.minDistance = 3.5;
controls.maxDistance = 35;
controls.update();

const readableGroup = document.createElement("optgroup");
readableGroup.label = "Readable TVPJ presets";
const opaqueGroup = document.createElement("optgroup");
opaqueGroup.label = "Opaque compiled TVP evidence";
for (const entry of environment.listPresets()) {
  const option = document.createElement("option");
  option.value = entry.id;
  option.textContent = `${entry.label} · ${entry.category}${entry.playable ? "" : " · opaque"}`;
  (entry.playable ? readableGroup : opaqueGroup).append(option);
}
selector.append(readableGroup, opaqueGroup);

let manualTime = false;
let previousTime = performance.now();

function updateUi(current: ParticlePresetLibraryState): void {
  selector.value = current.selected.id;
  status.textContent = current.selected.readable
    ? `${current.selected.label} · ${current.counts.activeParticles}/${current.counts.emitterCapacity} active · ${current.counts.activeEmitters} emitter${current.counts.activeEmitters === 1 ? "" : "s"}${current.paused ? " · paused" : ""}`
    : `${current.selected.label} · opaque compiled-only preset · no simulated emitters`;
  const aliases = current.selected.compiled?.aliases.join(" = ") ?? "no compiled TVP beside the readable TVPJ";
  const textureSummary = current.selected.textureBindings.length > 0
    ? current.selected.textureBindings.map((texture) => `${texture.name}:${texture.status}`).join(" · ")
    : "no readable texture binding";
  evidence.textContent = `${current.selected.availability} · ${current.selected.runtimeEvidence} · ${aliases} · ${textureSummary}`;
  config.textContent = current.selected.readable
    ? current.selected.emitterConfigs.map((emitter) => `E${emitter.id} ${emitter.maxParticles}@${emitter.generationSpeedMilliseconds}ms · ${emitter.lifetimeSeconds}s · ${emitter.textureFile} · blend ${emitter.blending}${emitter.looping ? " · loop" : " · one-shot"}`).join(" | ")
    : current.selected.reason ?? "Opaque preset.";
  pauseButton.textContent = current.paused ? "Resume" : "Pause";
  replayButton.textContent = current.autoReplay ? "Auto replay: on" : "Auto replay: off";
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
  updateUi(environment.getState());
}

function frame(time: number): void {
  if (!manualTime) {
    environment.update(Math.min(0.05, Math.max(0, (time - previousTime) / 1000)));
    render();
  }
  previousTime = time;
  requestAnimationFrame(frame);
}

function select(id: string): boolean {
  const selected = environment.selectPreset(id);
  if (selected) render();
  return selected;
}

function next(): string {
  const id = environment.selectNext();
  render();
  return id;
}

function previous(): string {
  const id = environment.selectPrevious();
  render();
  return id;
}

function restart(): void {
  environment.restart();
  render();
}

function togglePause(): void {
  environment.setPaused(!environment.getState().paused);
  render();
}

function toggleReplay(): void {
  environment.setAutoReplay(!environment.getState().autoReplay);
  render();
}

selector.addEventListener("change", () => select(selector.value));
previousButton.addEventListener("click", previous);
nextButton.addEventListener("click", next);
restartButton.addEventListener("click", restart);
pauseButton.addEventListener("click", togglePause);
replayButton.addEventListener("click", toggleReplay);
window.addEventListener("resize", resize);
window.addEventListener("keydown", (event) => {
  if (event.code === "ArrowLeft") {
    event.preventDefault();
    previous();
  }
  if (event.code === "ArrowRight") {
    event.preventDefault();
    next();
  }
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
    __PARTICLE_PRESET_LIBRARY__: {
      state: () => ParticlePresetLibraryState;
      list: () => ReturnType<ParticlePresetLibraryEnvironment["listPresets"]>;
      select: (id: string) => boolean;
      next: () => string;
      previous: () => string;
      restart: () => void;
      setPaused: (paused: boolean) => void;
      setAutoReplay: (autoReplay: boolean) => void;
    };
    advanceTime: (milliseconds: number) => void;
    render_game_to_text: () => string;
  }
}

window.__PARTICLE_PRESET_LIBRARY__ = {
  state: () => environment.getState(),
  list: () => environment.listPresets(),
  select,
  next,
  previous,
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
  particlePresetLibrary: environment.getState(),
  coordinateSystem: "Each selected TVPJ retains source +x/+y/+z values inside a uniformly normalized inspection group; +y is up in the browser adapter.",
  camera: {
    position: camera.position.toArray(),
    target: controls.target.toArray(),
    distance: camera.position.distanceTo(controls.target)
  },
  controls: "Select a preset or use Left/Right; R restarts; Space pauses; A toggles preview-only replay; drag orbits; wheel zooms; F toggles fullscreen."
});

resize();
void environment.ready.then(() => {
  environment.restart();
  render();
});
requestAnimationFrame(frame);
