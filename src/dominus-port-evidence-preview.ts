import { Color, Fog, PerspectiveCamera, Raycaster, Scene, SRGBColorSpace, Vector2, WebGLRenderer } from "three";
import {
  DominusPortEvidenceEnvironment,
  type DominusPortEvidenceState
} from "./dominus-port-evidence-environment";

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Dominus port evidence preview requires ${selector}.`);
  return element;
}

const canvas = requiredElement<HTMLCanvasElement>("#viewport");
const list = requiredElement<HTMLDivElement>("#placement-list");
const counts = requiredElement<HTMLDivElement>("#counts");
const loadLine = requiredElement<HTMLDivElement>("#load-line");
const previousButton = requiredElement<HTMLButtonElement>("#previous");
const nextButton = requiredElement<HTMLButtonElement>("#next");
const overviewButton = requiredElement<HTMLButtonElement>("#overview");
const detail = {
  index: requiredElement<HTMLElement>("#selected-index"),
  name: requiredElement<HTMLElement>("#selected-name"),
  status: requiredElement<HTMLElement>("#selected-status"),
  position: requiredElement<HTMLElement>("#selected-position"),
  rotation: requiredElement<HTMLElement>("#selected-rotation"),
  scale: requiredElement<HTMLElement>("#selected-scale"),
  vertices: requiredElement<HTMLElement>("#selected-vertices"),
  triangles: requiredElement<HTMLElement>("#selected-triangles"),
  materials: requiredElement<HTMLElement>("#selected-materials"),
  viewMode: requiredElement<HTMLElement>("#view-mode"),
  boundary: requiredElement<HTMLElement>("#boundary-copy")
};

const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.outputColorSpace = SRGBColorSpace;
const scene = new Scene();
scene.background = new Color(0x08121a);
scene.fog = new Fog(0x08121a, 74, 150);
const camera = new PerspectiveCamera(42, 1, 0.05, 240);
const environment = new DominusPortEvidenceEnvironment();
scene.add(environment.group);
const raycaster = new Raycaster();
const pointer = new Vector2();
const pressed = new Set<string>();
let dragging = false;
let draggedPixels = 0;
let pointerX = 0;
let lastTime = performance.now();
let lastUiSignature = "";

function resize(): void {
  renderer.setSize(Math.max(1, innerWidth), Math.max(1, innerHeight), false);
  camera.aspect = innerWidth / Math.max(1, innerHeight);
  camera.updateProjectionMatrix();
}

function number(value: number): string {
  return new Intl.NumberFormat("en-CA").format(value);
}

function tuple(values: [number, number, number]): string {
  return values.map((value) => Number(value.toFixed(4))).join(", ");
}

function syncUi(state: DominusPortEvidenceState, force = false): void {
  const signature = `${state.loadStatus}|${state.selectedId}|${state.viewMode}`;
  if (!force && signature === lastUiSignature) return;
  lastUiSignature = signature;
  counts.replaceChildren();
  for (const [label, value, className] of [
    ["port rows", state.portPlacementCount, ""],
    ["decoded", state.decodedPlacementCount, "ok"],
    ["binary boundary", state.unsupportedPlacementCount, "warn"]
  ] as const) {
    const badge = document.createElement("span");
    badge.className = `count ${className}`;
    badge.textContent = `${value} ${label}`;
    counts.append(badge);
  }

  list.replaceChildren();
  for (const placement of state.placements) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `placement${placement.selected ? " selected" : ""}`;
    button.dataset.placementId = placement.id;
    button.innerHTML = `<span class="index">${String(placement.index).padStart(2, "0")}</span><span class="name"></span><span class="dot ${placement.status === "unsupported-binary-x" ? "warn" : ""}"></span>`;
    button.querySelector<HTMLElement>(".name")!.textContent = placement.sourceName;
    button.addEventListener("click", () => {
      environment.selectById(placement.id, true, camera);
      syncUi(environment.getState(), true);
    });
    list.append(button);
  }
  list.querySelector(".selected")?.scrollIntoView({ block: "nearest" });

  const selected = state.placements[state.selectedIndex];
  const unsupported = selected.status === "unsupported-binary-x";
  detail.index.textContent = `Record ${String(selected.index).padStart(2, "0")} / ${state.portPlacementCount - 1}`;
  detail.name.textContent = selected.sourceName;
  detail.status.textContent = unsupported ? "binary X · marker only" : "decoded exact local mesh";
  detail.status.className = unsupported ? "status warn" : "status";
  detail.position.textContent = tuple(selected.sourcePosition);
  detail.rotation.textContent = tuple(selected.sourceRotation);
  detail.scale.textContent = tuple(selected.sourceScale);
  detail.vertices.textContent = number(selected.vertices);
  detail.triangles.textContent = number(selected.triangles);
  detail.materials.textContent = number(selected.materialGroups);
  detail.viewMode.textContent = state.viewMode;
  detail.boundary.textContent = unsupported
    ? "port_crateshed.X survives only as unsupported binary X. Its exact serialized transform is shown, but the amber wire box is a diagnostic marker—not reconstructed geometry."
    : "Exact local mesh and exact catalog transform. This preserves a source thumbnail row, not an authored village placement.";
  loadLine.textContent = state.loadStatus === "ready"
    ? `${state.portPlacementCount} source rows · ${number(state.sourceVertexCount)} vertices · editor catalog evidence`
    : state.loadStatus === "error" ? `Load error · ${state.loadError}` : "Loading all 28 exact source records…";
  loadLine.classList.toggle("error", state.loadStatus === "error");
}

function selectRelative(direction: number): void {
  environment.selectNext(direction, camera);
  syncUi(environment.getState(), true);
}

previousButton.addEventListener("click", () => selectRelative(-1));
nextButton.addEventListener("click", () => selectRelative(1));
overviewButton.addEventListener("click", () => {
  environment.showSourceGrid(camera);
  syncUi(environment.getState(), true);
});
window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  pressed.add(key);
  if (key === "n") selectRelative(1);
  if (key === "p") selectRelative(-1);
  if (key === "o") {
    environment.showSourceGrid(camera);
    syncUi(environment.getState(), true);
  }
  if (key === "r") {
    environment.reset(camera);
    syncUi(environment.getState(), true);
  }
  if (key === "f") void (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen());
});
window.addEventListener("keyup", (event) => pressed.delete(event.key.toLowerCase()));
window.addEventListener("blur", () => pressed.clear());
canvas.addEventListener("pointerdown", (event) => {
  dragging = true;
  draggedPixels = 0;
  pointerX = event.clientX;
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener("pointermove", (event) => {
  if (!dragging) return;
  const delta = event.clientX - pointerX;
  draggedPixels += Math.abs(delta);
  environment.orbitByRadians(delta * -0.006, camera);
  pointerX = event.clientX;
});
canvas.addEventListener("pointerup", (event) => {
  dragging = false;
  canvas.releasePointerCapture(event.pointerId);
  if (draggedPixels > 5) return;
  const bounds = canvas.getBoundingClientRect();
  pointer.set(((event.clientX - bounds.left) / bounds.width) * 2 - 1, -((event.clientY - bounds.top) / bounds.height) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObject(environment.group, true).find((intersection) => environment.selectFromObject(intersection.object, camera));
  if (hit) syncUi(environment.getState(), true);
});
canvas.addEventListener("wheel", (event) => {
  event.preventDefault();
  environment.zoomBy(Math.exp(event.deltaY * 0.001), camera);
}, { passive: false });
window.addEventListener("resize", resize);

function frame(now: number): void {
  const delta = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;
  const orbitInput = Number(pressed.has("d") || pressed.has("arrowright")) - Number(pressed.has("a") || pressed.has("arrowleft"));
  const state = environment.update(delta, orbitInput, camera);
  renderer.render(scene, camera);
  syncUi(state);
  requestAnimationFrame(frame);
}

declare global {
  interface Window {
    render_game_to_text: () => string;
    advanceTime: (milliseconds: number) => void;
    __DOMINUS_PORT_EVIDENCE_DEBUG__: {
      getState: () => DominusPortEvidenceState;
      select: (id: string, focus?: boolean) => boolean;
      next: (direction?: number) => boolean;
      overview: () => void;
      orbit: (radians: number) => void;
      zoom: (factor: number) => void;
      reset: () => void;
    };
  }
}

window.render_game_to_text = () => JSON.stringify(environment.getState());
window.advanceTime = (milliseconds) => {
  const orbitInput = Number(pressed.has("d") || pressed.has("arrowright")) - Number(pressed.has("a") || pressed.has("arrowleft"));
  environment.update(Math.max(0, milliseconds) / 1000, orbitInput, camera);
  renderer.render(scene, camera);
  lastTime = performance.now();
};
window.__DOMINUS_PORT_EVIDENCE_DEBUG__ = {
  getState: () => environment.getState(),
  select: (id, focus = true) => {
    const result = environment.selectById(id, focus, camera);
    syncUi(environment.getState(), true);
    return result;
  },
  next: (direction = 1) => {
    const result = environment.selectNext(direction, camera);
    syncUi(environment.getState(), true);
    return result;
  },
  overview: () => {
    environment.showSourceGrid(camera);
    syncUi(environment.getState(), true);
  },
  orbit: (radians) => environment.orbitByRadians(radians, camera),
  zoom: (factor) => environment.zoomBy(factor, camera),
  reset: () => {
    environment.reset(camera);
    syncUi(environment.getState(), true);
  }
};

resize();
environment.applyToCamera(camera);
syncUi(environment.getState(), true);
void environment.ready.then(() => syncUi(environment.getState(), true));
requestAnimationFrame(frame);
