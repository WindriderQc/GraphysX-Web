import {
  Color,
  Fog,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  WebGLRenderer
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  StockroomXmlArtifactEnvironment,
  type StockroomXmlArtifactEnvironmentState,
  type StockroomXmlArtifactId
} from "./stockroom-xml-artifact-environment";

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`StockRoom XML preview is missing ${selector}.`);
  return element;
}

const canvas = requireElement<HTMLCanvasElement>("#stockroom-xml-canvas");
const sourceValue = requireElement<HTMLElement>("#source-value");
const schemaValue = requireElement<HTMLElement>("#schema-value");
const recordValue = requireElement<HTMLElement>("#record-value");
const transformValue = requireElement<HTMLElement>("#transform-value");
const copyValue = requireElement<HTMLElement>("#copy-value");
const statusValue = requireElement<HTMLElement>("#status-value");
const factsValue = requireElement<HTMLElement>("#facts-value");

const renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.outputColorSpace = SRGBColorSpace;
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

const scene = new Scene();
scene.background = new Color(0x071219);
scene.fog = new Fog(0x071219, 48, 100);
const environment = new StockroomXmlArtifactEnvironment();
scene.add(environment.group);

const camera = new PerspectiveCamera(42, 1, 0.05, 100);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = false;
controls.minDistance = 2;
controls.maxDistance = 65;
controls.target.set(0, 0, 0);

let autoOrbit = true;
let manualTime = false;
let lastFrameTime: number | null = null;

function applyCamera(): void {
  environment.applyToCamera(camera);
  controls.target.set(0, 0, 0);
  controls.update();
}

function updateHud(state = environment.getState()): void {
  sourceValue.textContent = state.selectedArtifactId === "base-scene" ? "BaseScene.xml" : "test1.xml";
  schemaValue.textContent = `${state.root} · ${state.version}`;
  recordValue.textContent = `${state.renderedObjectCount}/${state.objectCount} PHYSICCUBE`;
  transformValue.textContent = state.exactOverlapGroupSizes.length > 0
    ? `${state.distinctSerializedTransformCount} · overlap ${state.exactOverlapGroupSizes.join(",")}`
    : `${state.distinctSerializedTransformCount} distinct`;
  copyValue.textContent = state.copyEquivalence.byteIdentical
    ? `${state.sourceCopies.length} byte-identical`
    : `${state.sourceCopies.length} raw variants · semantic match`;
  statusValue.textContent = "serializer artifact · not a world";

  const identityAdapter = state.inspectionAdapters.identityRotationForAbsentSourceFieldCount > 0
    ? `<br>${state.inspectionAdapters.identityRotationForAbsentSourceFieldCount} absent Rot fields use disclosed identity for inspection.`
    : "";
  const material = state.selectedArtifactId === "base-scene"
    ? state.material.candidateTextureEnabled
      ? "Exact twoway.jpg candidate is visible, but its extensionless runtime binding remains unproven."
      : "Neutral inspection material is visible; the extensionless TwoWay binding stays unresolved."
    : "TextureName is empty; the neutral material is only an inspection aid.";
  factsValue.innerHTML = `<strong>${state.objectCount} exact serialized record${state.objectCount === 1 ? "" : "s"}</strong><br>${state.assessment}<br>${material}${identityAdapter}`;

  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-artifact]")) {
    button.setAttribute("aria-pressed", String(button.dataset.artifact === state.selectedArtifactId));
  }
  const textureButton = document.querySelector<HTMLButtonElement>("[data-action='texture']");
  if (textureButton) {
    textureButton.disabled = state.selectedArtifactId !== "base-scene" || !state.material.candidateTextureReady;
    textureButton.setAttribute("aria-pressed", String(state.material.candidateTextureEnabled));
  }
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

function selectArtifact(id: StockroomXmlArtifactId): StockroomXmlArtifactEnvironmentState {
  const state = environment.selectArtifact(id, camera);
  controls.target.set(0, 0, 0);
  controls.minDistance = id === "base-scene" ? 10 : 2;
  controls.maxDistance = id === "base-scene" ? 65 : 15;
  applyCamera();
  render();
  return state;
}

function setCandidateTexture(enabled: boolean): StockroomXmlArtifactEnvironmentState {
  const state = environment.setCandidateTextureEnabled(enabled);
  render();
  return state;
}

function setAutoOrbit(enabled: boolean): StockroomXmlArtifactEnvironmentState {
  autoOrbit = Boolean(enabled);
  render();
  return environment.getState();
}

function step(deltaSeconds: number): void {
  if (autoOrbit) {
    environment.update(deltaSeconds, 1, camera);
    controls.target.set(0, 0, 0);
  }
  render();
}

function snapshot(): object {
  const state = environment.getState();
  return {
    diagnostic: "stockroom-xml-serializer-artifacts",
    coordinateSystem: "Serialized GraphysX +X/+Y/+Z coordinates; Three.js +Y up. No source objects are repositioned. Inspection camera orbits the origin.",
    state: {
      selectedArtifactId: state.selectedArtifactId,
      source: state.source,
      sourceSha256: state.sourceSha256,
      version: state.version,
      classification: state.classification,
      distinctAssembledScene: state.distinctAssembledScene,
      ready: state.ready,
      objectCount: state.objectCount,
      renderedObjectCount: state.renderedObjectCount,
      uniqueObjectSignatureCount: state.uniqueObjectSignatureCount,
      distinctSerializedTransformCount: state.distinctSerializedTransformCount,
      exactOverlapGroupSizes: state.exactOverlapGroupSizes,
      mapSize: state.mapSize,
      ringPositionCount: state.ringPositionCount,
      copyEquivalence: state.copyEquivalence,
      material: state.material,
      physics: state.physics,
      inspectionAdapters: state.inspectionAdapters,
      serializedSubsystems: state.serializedSubsystems,
      unresolvedRecords: state.unresolvedRecords,
      visibleObjects: state.objects.filter((object) => object.rendered)
    },
    camera: {
      position: camera.position.toArray().map((value) => Number(value.toFixed(4))),
      target: controls.target.toArray().map((value) => Number(value.toFixed(4))),
      autoOrbit
    },
    controls: "1/2 select artifact, T exact same-folder texture candidate, A orbit, drag/wheel inspect, F fullscreen"
  };
}

for (const button of document.querySelectorAll<HTMLButtonElement>("[data-artifact]")) {
  button.addEventListener("click", () => selectArtifact(button.dataset.artifact as StockroomXmlArtifactId));
}
for (const button of document.querySelectorAll<HTMLButtonElement>("[data-action]")) {
  button.addEventListener("click", () => {
    const state = environment.getState();
    if (button.dataset.action === "texture") setCandidateTexture(!state.material.candidateTextureEnabled);
    if (button.dataset.action === "orbit") setAutoOrbit(!autoOrbit);
  });
}

canvas.addEventListener("pointerdown", () => setAutoOrbit(false));
window.addEventListener("resize", resize);
window.addEventListener("keydown", (event) => {
  if (event.repeat) return;
  if (event.code === "Digit1") selectArtifact("base-scene");
  if (event.code === "Digit2") selectArtifact("test1");
  if (event.code === "KeyT" && environment.getState().selectedArtifactId === "base-scene") {
    setCandidateTexture(!environment.getState().material.candidateTextureEnabled);
  }
  if (event.code === "KeyA") setAutoOrbit(!autoOrbit);
  if (event.code === "KeyF") {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void canvas.requestFullscreen();
  }
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
  __STOCKROOM_XML_ARTIFACT_HARNESS__?: {
    state: () => StockroomXmlArtifactEnvironmentState;
    select: (id: StockroomXmlArtifactId) => StockroomXmlArtifactEnvironmentState;
    candidateTexture: (enabled: boolean) => StockroomXmlArtifactEnvironmentState;
    orbit: (enabled: boolean) => StockroomXmlArtifactEnvironmentState;
    resetCamera: () => StockroomXmlArtifactEnvironmentState;
  };
};

previewWindow.render_game_to_text = () => JSON.stringify(snapshot());
previewWindow.advanceTime = (milliseconds: number) => {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) throw new RangeError("advanceTime requires non-negative milliseconds.");
  manualTime = true;
  const steps = Math.max(1, Math.round(milliseconds / (1000 / 60)));
  for (let index = 0; index < steps; index += 1) step(1 / 60);
};
previewWindow.__STOCKROOM_XML_ARTIFACT_HARNESS__ = {
  state: () => environment.getState(),
  select: selectArtifact,
  candidateTexture: setCandidateTexture,
  orbit: setAutoOrbit,
  resetCamera: () => {
    const state = environment.resetOrbit(camera);
    controls.target.set(0, 0, 0);
    render();
    return state;
  }
};

environment.ready.then(() => render());
applyCamera();
resize();
requestAnimationFrame(animationFrame);
