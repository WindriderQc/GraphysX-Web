import {
  ACESFilmicToneMapping,
  Color,
  MathUtils,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer
} from "three";
import { Suzanne2AsciiEnvironment } from "./suzanne2-ascii-environment";

type CameraMode = "overview" | "source2017";

function requireCanvas(): HTMLCanvasElement {
  const canvas = document.querySelector<HTMLCanvasElement>("#suzanne2-preview-canvas");
  if (!canvas) throw new Error("Suzanne 2 archive preview canvas is missing.");
  return canvas;
}

function setStatus(text: string): void {
  const status = document.querySelector<HTMLElement>("#suzanne2-preview-status");
  if (status) status.textContent = text;
}

const canvas = requireCanvas();
const scene = new Scene();
scene.background = new Color(0x07111b);

const camera = new PerspectiveCamera(58, 1, 0.02, 500);
const renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.outputColorSpace = SRGBColorSpace;
renderer.toneMapping = ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const params = new URLSearchParams(window.location.search);
let cameraMode: CameraMode = params.get("camera") === "source2017" ? "source2017" : "overview";
const environment = new Suzanne2AsciiEnvironment({
  showCubxAnchors: params.get("anchors") === "1",
  showPlayer: params.get("player") !== "0",
  showXmlAttachments: params.get("xml") !== "0"
});
scene.add(environment.group);

const target = new Vector3(20, 0.8, 20);
let orbitYaw = 0;
let orbitPitch = 0.92;
let orbitDistance = 57;
let dragging = false;
let previousPointerX = 0;
let previousPointerY = 0;
let lastFrame = performance.now();
let manualTime = false;

function updateCamera(): void {
  if (cameraMode === "source2017") {
    camera.position.set(20, 10, 20);
    camera.lookAt(10, 0.5, 6);
    return;
  }
  const horizontal = Math.cos(orbitPitch) * orbitDistance;
  camera.position.set(
    target.x + Math.sin(orbitYaw) * horizontal,
    target.y + Math.sin(orbitPitch) * orbitDistance,
    target.z + Math.cos(orbitYaw) * horizontal
  );
  camera.lookAt(target);
}

function setCameraMode(next: CameraMode): void {
  cameraMode = next;
  updateCamera();
  renderer.render(scene, camera);
}

function resize(): void {
  const width = Math.max(1, canvas.clientWidth);
  const height = Math.max(1, canvas.clientHeight);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  updateCamera();
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
  } else {
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);
}

canvas.addEventListener("pointerdown", (event) => {
  if (cameraMode !== "overview") return;
  dragging = true;
  previousPointerX = event.clientX;
  previousPointerY = event.clientY;
  canvas.setPointerCapture(event.pointerId);
});

canvas.addEventListener("pointermove", (event) => {
  if (!dragging || cameraMode !== "overview") return;
  orbitYaw -= (event.clientX - previousPointerX) * 0.006;
  orbitPitch = MathUtils.clamp(orbitPitch + (event.clientY - previousPointerY) * 0.004, 0.28, 1.35);
  previousPointerX = event.clientX;
  previousPointerY = event.clientY;
  updateCamera();
});

canvas.addEventListener("pointerup", (event) => {
  dragging = false;
  canvas.releasePointerCapture(event.pointerId);
});

canvas.addEventListener("wheel", (event) => {
  if (cameraMode !== "overview") return;
  event.preventDefault();
  orbitDistance = MathUtils.clamp(orbitDistance + event.deltaY * 0.035, 22, 95);
  updateCamera();
}, { passive: false });

window.addEventListener("resize", resize);
resize();
void environment.ready
  .then(() => {
    setStatus("READY · 315 COLLISION CUBES · 15 RINGS · SOURCE WIN THRESHOLD 2");
    step(0);
  })
  .catch((error: unknown) => {
    setStatus(`LOAD ERROR · ${error instanceof Error ? error.message : String(error)}`);
    console.error(error);
  });
requestAnimationFrame(frame);

const testWindow = window as typeof window & {
  render_game_to_text?: () => string;
  advanceTime?: (milliseconds: number) => void;
  __SUZANNE2_ASCII_DEBUG__?: {
    state: () => ReturnType<Suzanne2AsciiEnvironment["getState"]>;
    setRingVisible: (index: number, visible: boolean) => void;
    setPistonActivation: (index: number, activation: number) => void;
    setXmlVisible: (visible: boolean) => void;
    setCubxVisible: (visible: boolean) => void;
    setPlayerVisible: (visible: boolean) => void;
    setCameraMode: (mode: CameraMode) => void;
    ringRotation: (index: number) => number | null;
    pistonOffset: (index: number) => number | null;
    reset: () => void;
  };
};

testWindow.render_game_to_text = () => JSON.stringify({
  mode: "suzanne2-ascii-isolated-preview",
  evidenceBoundary: "No Suzanne2 screenshot survives; active March 2017 source semantics are authoritative.",
  coordinateSystem: "+X ASCII columns, +Y up, +Z ASCII rows; player @ is not half-cell centered",
  camera: {
    mode: cameraMode,
    position: camera.position.toArray().map((value) => Number(value.toFixed(3))),
    target: cameraMode === "source2017" ? [10, 0.5, 6] : target.toArray()
  },
  environment: environment.getState()
});

testWindow.advanceTime = (milliseconds: number) => {
  manualTime = true;
  const steps = Math.max(1, Math.round(milliseconds / (1000 / 60)));
  for (let index = 0; index < steps; index += 1) step(1 / 60);
};

testWindow.__SUZANNE2_ASCII_DEBUG__ = {
  state: () => environment.getState(),
  setRingVisible: (index, visible) => environment.setRingVisible(index, visible),
  setPistonActivation: (index, activation) => environment.setPistonActivation(index, activation),
  setXmlVisible: (visible) => environment.setXmlAttachmentsVisible(visible),
  setCubxVisible: (visible) => environment.setCubxAnchorsVisible(visible),
  setPlayerVisible: (visible) => environment.setPlayerVisible(visible),
  setCameraMode,
  ringRotation: (index) => environment.ringMeshes[index]?.rotation.y ?? null,
  pistonOffset: (index) => environment.pistonAssemblies[index]?.plate.position.x ?? null,
  reset: () => {
    environment.resetRings();
    environment.pistonAssemblies.forEach((_assembly, index) => environment.setPistonActivation(index, 0));
    environment.setXmlAttachmentsVisible(true);
    environment.setCubxAnchorsVisible(false);
    environment.setPlayerVisible(true);
    setCameraMode("overview");
  }
};
