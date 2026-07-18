import {
  AmbientLight,
  AxesHelper,
  Color,
  DirectionalLight,
  Fog,
  GridHelper,
  HemisphereLight,
  PerspectiveCamera,
  Raycaster,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer
} from "three";
import {
  type CubxActorClickIndex,
  type CubxActorClipFamily,
  CubxActorLineageEnvironment,
  type CubxActorLineageState,
  type CubxActorPairIndex,
  type CubxActorPlaybackDirection
} from "./cubx-actor-lineage-environment";

type InspectorSnapshot = {
  diagnostic: "cubx-actor-lineage";
  coordinateSystem: string;
  camera: { radius: number; azimuth: number; polar: number; target: number[]; autoOrbit: boolean };
  state: CubxActorLineageState;
  controls: string;
};

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`CubXActor lineage preview is missing ${selector}.`);
  return element;
}

const canvas = requireElement<HTMLCanvasElement>("#cubx-actor-lineage-canvas");
const assetValue = requireElement<HTMLElement>("#asset-value");
const frameValue = requireElement<HTMLElement>("#frame-value");
const sampleValue = requireElement<HTMLElement>("#sample-value");
const geometryValue = requireElement<HTMLElement>("#geometry-value");
const playbackValue = requireElement<HTMLElement>("#playback-value");
const timelineFill = requireElement<HTMLElement>("#timeline-fill");
const clickCard = requireElement<HTMLElement>("#click-card");

const renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = "srgb";
renderer.shadowMap.enabled = true;

const scene = new Scene();
scene.background = new Color(0x071019);
scene.fog = new Fog(0x071019, 210, 430);

const camera = new PerspectiveCamera(42, 1, 0.1, 1000);
const cameraTarget = new Vector3(0, 0, 0);
let cameraRadius = 205;
let cameraAzimuth = 0.73;
let cameraPolar = 1.02;
let autoOrbit = false;

scene.add(new HemisphereLight(0xbde7ff, 0x10151d, 2.1));
scene.add(new AmbientLight(0x8bb5ce, 0.45));
const keyLight = new DirectionalLight(0xffffff, 2.7);
keyLight.position.set(90, 150, 80);
keyLight.castShadow = true;
scene.add(keyLight);
const rimLight = new DirectionalLight(0x5acbff, 1.15);
rimLight.position.set(-120, 50, -80);
scene.add(rimLight);

const grid = new GridHelper(260, 26, 0x2d617d, 0x173348);
grid.position.y = -46;
scene.add(grid);
const axes = new AxesHelper(55);
axes.position.set(-50, -45.8, 50);
scene.add(axes);

const environment = new CubxActorLineageEnvironment();
scene.add(environment.group);
environment.setDiagnosticColors(true);
environment.setClip("get", 1);

let selectedPair: CubxActorPairIndex = 1;
let manualTime = false;
let lastFrameTime: number | null = null;

function updateCamera(): void {
  const sinPolar = Math.sin(cameraPolar);
  camera.position.set(
    cameraTarget.x + cameraRadius * Math.cos(cameraAzimuth) * sinPolar,
    cameraTarget.y + cameraRadius * Math.cos(cameraPolar),
    cameraTarget.z + cameraRadius * Math.sin(cameraAzimuth) * sinPolar
  );
  camera.lookAt(cameraTarget);
}

function setClass(element: HTMLElement, className: "good" | "warn" | "bad" | ""): void {
  element.classList.remove("good", "warn", "bad");
  if (className) element.classList.add(className);
}

function updateHud(): void {
  const state = environment.getState();
  const { clip, geometry, clickInspection } = state;
  const duration = clip.endFrame - clip.startFrame;
  const progress = duration > 0 ? (clip.sourceFrame - clip.startFrame) / duration : 0;
  timelineFill.style.width = `${Math.max(0, Math.min(1, progress)) * 100}%`;

  assetValue.textContent = clip.filename;
  frameValue.textContent = `${clip.sourceFrame.toFixed(Number.isInteger(clip.sourceFrame) ? 0 : 3)} / ${clip.startFrame}..${clip.endFrame}`;
  sampleValue.textContent = clip.exactStoredRotationKey ? "exact stored key" : "inferred between-key SLERP";
  setClass(sampleValue, clip.exactStoredRotationKey ? "good" : "warn");
  geometryValue.textContent = `${geometry.vertices}v · ${geometry.triangles}t · ${geometry.meshChunks} mesh${geometry.meshChunks === 1 ? "" : "es"}`;
  playbackValue.textContent = clip.terminalHoldActive
    ? `${clip.playing ? "playing" : "paused"} · terminal hold`
    : `${clip.playing ? "playing" : "paused"} · ${clip.direction === 1 ? "forward" : "reverse"}`;
  setClass(playbackValue, clip.terminalHoldActive ? "warn" : clip.playing ? "good" : "");

  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-family]")) {
    button.setAttribute("aria-pressed", String(button.dataset.family === clip.family));
  }
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-click]")) {
    button.setAttribute("aria-pressed", String(Number(button.dataset.click) === clickInspection?.clickIndex));
  }
  const playButton = document.querySelector<HTMLButtonElement>("[data-action='play']");
  if (playButton) {
    playButton.textContent = clip.playing ? "Pause" : "Play";
    playButton.setAttribute("aria-pressed", String(clip.playing));
  }
  const directionButton = document.querySelector<HTMLButtonElement>("[data-action='direction']");
  if (directionButton) directionButton.textContent = clip.direction === 1 ? "Fwd" : "Rev";

  if (!clickInspection) {
    clickCard.classList.remove("bad");
    clickCard.textContent = clip.family === "rot"
      ? `Rotation pair ${clip.pairIndex}; no literal CubX host call to this Rot actor was found.`
      : "Choose click 1–8 to inspect the exact host flow.";
  } else {
    clickCard.classList.toggle("bad", !clickInspection.actorSlotInitialized);
    clickCard.innerHTML = clickInspection.actorSlotInitialized
      ? `<strong>Click ${clickInspection.clickIndex}</strong> hits ${clickInspection.exactSpatialBoxLabel} and host slot ${clickInspection.actorArrayIndex} plays ${clickInspection.actorFilename}.`
      : `<strong>Click 8 defect</strong> hits ${clickInspection.exactSpatialBoxLabel}, but host slot 7 is uninitialized and outside the 0..6 render loop. No actor is played.`;
  }
}

function render(): void {
  updateCamera();
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

function setFamily(family: CubxActorClipFamily): CubxActorLineageState {
  environment.setClip(family, selectedPair);
  render();
  return environment.getState();
}

function selectIndex(value: number): CubxActorLineageState {
  if (!Number.isInteger(value) || value < 1 || value > 8) throw new RangeError("CubXActor preview index must be 1 through 8.");
  if (value === 8) {
    environment.selectClick(8);
  } else {
    selectedPair = value as CubxActorPairIndex;
    if (environment.getState().clip.family === "rot") environment.setClip("rot", selectedPair);
    else environment.selectClick(selectedPair);
  }
  render();
  return environment.getState();
}

function setFrame(sourceFrame: number): CubxActorLineageState {
  manualTime = true;
  environment.setSourceFrame(sourceFrame);
  render();
  return environment.getState();
}

function setPlaying(playing: boolean): CubxActorLineageState {
  manualTime = true;
  environment.setPlaying(playing);
  render();
  return environment.getState();
}

function setDirection(direction: CubxActorPlaybackDirection): CubxActorLineageState {
  environment.setDirection(direction);
  render();
  return environment.getState();
}

function setButtonsVisible(visible: boolean): CubxActorLineageState {
  environment.setButtonsVisible(visible);
  render();
  return environment.getState();
}

function setDiagnostics(enabled: boolean): CubxActorLineageState {
  environment.setDiagnosticColors(enabled);
  render();
  return environment.getState();
}

function reset(): CubxActorLineageState {
  const state = environment.getState();
  environment.setPlaying(false);
  environment.setSourceFrame(state.clip.startFrame);
  render();
  return environment.getState();
}

function snapshot(): InspectorSnapshot {
  return {
    diagnostic: "cubx-actor-lineage",
    coordinateSystem: "Raw TV3D source-order matrices/quaternions are shown directly; no claimed web-handedness conversion.",
    camera: { radius: cameraRadius, azimuth: cameraAzimuth, polar: cameraPolar, target: cameraTarget.toArray(), autoOrbit },
    state: environment.getState(),
    controls: "C/G/R/O/S family, 1-8 pair/click, Space play, arrows step, Home reset, B proxies, D colors, A orbit, drag/wheel camera, F fullscreen"
  };
}

for (const button of document.querySelectorAll<HTMLButtonElement>("[data-family]")) {
  button.addEventListener("click", () => setFamily(button.dataset.family as CubxActorClipFamily));
}
for (const button of document.querySelectorAll<HTMLButtonElement>("[data-click]")) {
  button.addEventListener("click", () => selectIndex(Number(button.dataset.click)));
}
for (const button of document.querySelectorAll<HTMLButtonElement>("[data-action]")) {
  button.addEventListener("click", () => {
    const state = environment.getState();
    if (button.dataset.action === "reset") reset();
    if (button.dataset.action === "previous") environment.stepFrames(-1);
    if (button.dataset.action === "next") environment.stepFrames(1);
    if (button.dataset.action === "play") environment.togglePlaying();
    if (button.dataset.action === "direction") environment.setDirection(state.clip.direction === 1 ? -1 : 1);
    render();
  });
}

window.addEventListener("keydown", (event) => {
  if (event.repeat) return;
  if (/^Digit[1-8]$/.test(event.code)) selectIndex(Number(event.code.at(-1)));
  if (event.code === "KeyC") setFamily("closed");
  if (event.code === "KeyG") setFamily("get");
  if (event.code === "KeyR") setFamily("rot");
  if (event.code === "KeyO") setFamily("open-full");
  if (event.code === "KeyS") setFamily("open-solo");
  if (event.code === "Space") environment.togglePlaying();
  if (event.code === "ArrowLeft") environment.stepFrames(-1);
  if (event.code === "ArrowRight") environment.stepFrames(1);
  if (event.code === "Home") reset();
  if (event.code === "KeyB") setButtonsVisible(!environment.getState().geometry.buttonsVisible);
  if (event.code === "KeyD") setDiagnostics(!environment.getState().geometry.diagnosticColors);
  if (event.code === "KeyA") autoOrbit = !autoOrbit;
  if (event.code === "KeyF") {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void canvas.requestFullscreen();
  }
  if (["Space", "ArrowLeft", "ArrowRight", "Home"].includes(event.code)) event.preventDefault();
  render();
});

let pointerDown: { id: number; x: number; y: number; azimuth: number; polar: number } | null = null;
canvas.addEventListener("pointerdown", (event) => {
  pointerDown = { id: event.pointerId, x: event.clientX, y: event.clientY, azimuth: cameraAzimuth, polar: cameraPolar };
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener("pointermove", (event) => {
  if (!pointerDown || event.pointerId !== pointerDown.id) return;
  cameraAzimuth = pointerDown.azimuth - (event.clientX - pointerDown.x) * 0.008;
  cameraPolar = Math.max(0.25, Math.min(1.48, pointerDown.polar + (event.clientY - pointerDown.y) * 0.006));
  autoOrbit = false;
  render();
});
canvas.addEventListener("pointerup", (event) => {
  if (!pointerDown || event.pointerId !== pointerDown.id) return;
  const moved = Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y);
  pointerDown = null;
  if (moved <= 4 && environment.getState().geometry.buttonsVisible) {
    const bounds = canvas.getBoundingClientRect();
    const pointer = new Vector2(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      -((event.clientY - bounds.top) / bounds.height) * 2 + 1
    );
    const raycaster = new Raycaster();
    raycaster.setFromCamera(pointer, camera);
    const intersection = raycaster.intersectObjects(environment.buttonRoot.children, false)[0];
    const clickIndex = intersection?.object.userData.clickIndex;
    if (Number.isInteger(clickIndex)) environment.selectClick(clickIndex as CubxActorClickIndex);
  }
  render();
});
canvas.addEventListener("wheel", (event) => {
  cameraRadius = Math.max(90, Math.min(360, cameraRadius * Math.exp(event.deltaY * 0.001)));
  autoOrbit = false;
  event.preventDefault();
  render();
}, { passive: false });

function animationFrame(now: number): void {
  const deltaSeconds = lastFrameTime === null ? 0 : Math.min(0.05, Math.max(0, (now - lastFrameTime) / 1000));
  lastFrameTime = now;
  if (!manualTime) environment.advance(deltaSeconds);
  if (autoOrbit && !manualTime) cameraAzimuth += deltaSeconds * 0.22;
  render();
  requestAnimationFrame(animationFrame);
}

const previewWindow = window as typeof window & {
  render_game_to_text?: () => string;
  advanceTime?: (milliseconds: number) => void;
  __CUBX_ACTOR_LINEAGE_HARNESS__?: {
    state: () => CubxActorLineageState;
    setClip: (family: CubxActorClipFamily, pairIndex?: CubxActorPairIndex) => CubxActorLineageState;
    selectClick: (clickIndex: number) => CubxActorLineageState;
    setFrame: (frame: number) => CubxActorLineageState;
    stepFrames: (frames: number) => CubxActorLineageState;
    playing: (playing: boolean) => CubxActorLineageState;
    direction: (direction: CubxActorPlaybackDirection) => CubxActorLineageState;
    buttons: (visible: boolean) => CubxActorLineageState;
    diagnostics: (enabled: boolean) => CubxActorLineageState;
    autoOrbit: (enabled: boolean) => InspectorSnapshot;
    reset: () => CubxActorLineageState;
    advance: (deltaSeconds: number) => CubxActorLineageState;
  };
};

previewWindow.render_game_to_text = () => JSON.stringify(snapshot());
previewWindow.advanceTime = (milliseconds: number) => {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) throw new RangeError("advanceTime requires non-negative milliseconds.");
  manualTime = true;
  environment.advance(milliseconds / 1000);
  if (autoOrbit) cameraAzimuth += (milliseconds / 1000) * 0.22;
  render();
};
previewWindow.__CUBX_ACTOR_LINEAGE_HARNESS__ = {
  state: () => environment.getState(),
  setClip: (family, pairIndex = selectedPair) => {
    selectedPair = pairIndex;
    return setFamily(family);
  },
  selectClick: selectIndex,
  setFrame,
  stepFrames: (frames) => {
    manualTime = true;
    environment.stepFrames(frames);
    render();
    return environment.getState();
  },
  playing: setPlaying,
  direction: setDirection,
  buttons: setButtonsVisible,
  diagnostics: setDiagnostics,
  autoOrbit: (enabled) => {
    autoOrbit = enabled;
    render();
    return snapshot();
  },
  reset,
  advance: (deltaSeconds) => {
    manualTime = true;
    environment.advance(deltaSeconds);
    if (autoOrbit) cameraAzimuth += deltaSeconds * 0.22;
    render();
    return environment.getState();
  }
};

window.addEventListener("resize", resize);
resize();
requestAnimationFrame(animationFrame);
