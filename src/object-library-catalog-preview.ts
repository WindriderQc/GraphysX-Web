import {
  Color,
  Fog,
  PerspectiveCamera,
  Scene,
  WebGLRenderer
} from "three";
import {
  ObjectLibraryCatalogEnvironment,
  type ObjectLibraryCatalogState,
  type ObjectLibraryFamily,
  type ObjectLibraryStatusFilter
} from "./object-library-catalog-environment";

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`ObjectLibrary preview requires ${selector}.`);
  return element;
}

const canvas = requiredElement<HTMLCanvasElement>("#viewport");
const familySelect = requiredElement<HTMLSelectElement>("#family-filter");
const statusSelect = requiredElement<HTMLSelectElement>("#status-filter");
const objectList = requiredElement<HTMLDivElement>("#object-list");
const counts = requiredElement<HTMLDivElement>("#counts");
const statusLine = requiredElement<HTMLDivElement>("#status-line");

const detail = {
  index: document.querySelector<HTMLElement>("#selected-index")!,
  name: document.querySelector<HTMLElement>("#selected-name")!,
  status: document.querySelector<HTMLElement>("#selected-status")!,
  family: document.querySelector<HTMLElement>("#selected-family")!,
  action: document.querySelector<HTMLElement>("#selected-action")!,
  position: document.querySelector<HTMLElement>("#selected-position")!,
  rotation: document.querySelector<HTMLElement>("#selected-rotation")!,
  scale: document.querySelector<HTMLElement>("#selected-scale")!,
  archive: document.querySelector<HTMLElement>("#selected-archive")!,
  source: document.querySelector<HTMLElement>("#selected-source")!,
  boundary: document.querySelector<HTMLElement>("#selected-boundary")!
};

const FAMILY_OPTIONS: Array<[ObjectLibraryFamily, string]> = [
  ["all", "All families"], ["primitive", "Primitives"], ["pipe", "Pipe set"], ["building", "Buildings"],
  ["technology", "Technology"], ["aircraft", "Aircraft"], ["nature", "Nature"], ["camp", "Camp"], ["port", "Port assets"]
];
const STATUS_OPTIONS: Array<[ObjectLibraryStatusFilter, string]> = [
  ["all", "All statuses"], ["recovered", "Recovered"], ["missing", "Missing"], ["unsupported", "Unsupported"]
];

for (const [value, label] of FAMILY_OPTIONS) familySelect.add(new Option(label, value));
for (const [value, label] of STATUS_OPTIONS) statusSelect.add(new Option(label, value));

const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.shadowMap.enabled = false;
renderer.outputColorSpace = "srgb";
const scene = new Scene();
scene.background = new Color(0x09111a);
scene.fog = new Fog(0x09111a, 115, 330);
const camera = new PerspectiveCamera(44, 1, 0.08, 520);
const environment = new ObjectLibraryCatalogEnvironment();
scene.add(environment.group);

const pressed = new Set<string>();
let dragging = false;
let pointerX = 0;
let lastTime = performance.now();
let lastUiSignature = "";
let forcedDelta = 0;

function resize(): void {
  const width = Math.max(1, window.innerWidth);
  const height = Math.max(1, window.innerHeight);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function statusKind(status: string): "recovered" | "missing" | "unsupported" {
  if (status.startsWith("recovered-")) return "recovered";
  if (status.startsWith("unsupported-")) return "unsupported";
  return "missing";
}

function vector(values: number[]): string {
  return values.map((value) => Number(value.toFixed(4))).join(", ");
}

function syncUi(state: ObjectLibraryCatalogState, force = false): void {
  const signature = `${state.loadStatus}|${state.familyFilter}|${state.statusFilter}|${state.selectedIndex}|${state.matchingCount}`;
  if (!force && signature === lastUiSignature) return;
  lastUiSignature = signature;
  familySelect.value = state.familyFilter;
  statusSelect.value = state.statusFilter;
  counts.replaceChildren();
  for (const [label, value, className] of [
    ["visible", state.matchingCount, ""], ["recovered", state.recoveredCount, "ok"], ["missing", state.missingCount, "warn"], ["binary", state.unsupportedCount, "unsupported"]
  ] as const) {
    const badge = document.createElement("span");
    badge.className = `count ${className}`;
    badge.textContent = `${value} ${label}`;
    counts.append(badge);
  }

  objectList.replaceChildren();
  for (const object of state.objects.filter((entry) => entry.matchesFilter)) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `object-row${object.selected ? " selected" : ""}`;
    button.dataset.index = String(object.index);
    button.dataset.status = statusKind(object.catalogResolution);
    button.innerHTML = `<span class="object-index">${String(object.index).padStart(2, "0")}</span><span class="object-name"></span><span class="dot ${statusKind(object.catalogResolution)}"></span>`;
    button.querySelector<HTMLElement>(".object-name")!.textContent = object.name;
    button.addEventListener("click", () => {
      environment.selectIndex(object.index);
      syncUi(environment.getState(), true);
    });
    objectList.append(button);
  }
  objectList.querySelector(".selected")?.scrollIntoView({ block: "nearest" });

  const selected = state.objects[state.selectedIndex];
  if (!selected) return;
  const kind = statusKind(selected.catalogResolution);
  detail.index.textContent = `Record ${String(selected.index).padStart(2, "0")}`;
  detail.name.textContent = selected.name;
  detail.status.textContent = selected.catalogResolution;
  detail.status.className = kind === "recovered" ? "" : kind;
  detail.family.textContent = selected.family;
  detail.action.textContent = selected.action;
  detail.position.textContent = vector(selected.sourcePosition);
  detail.rotation.textContent = `${vector(selected.rotationDegrees)} deg`;
  detail.scale.textContent = vector(selected.scale);
  detail.archive.textContent = selected.archiveResolution;
  detail.source.textContent = selected.sourceAsset ?? "No exact source file recovered";
  detail.boundary.textContent = selected.recoveredGeometry
    ? "Recovered geometry uses the exact serialized transform and decoded archive material groups. Camera and lighting are inspection aids."
    : `${kind === "unsupported" ? "The surviving mesh is binary X and is not decoded." : "No exact archive asset was recovered."} The 3D label marks the serialized location; it is not replacement geometry.`;
  statusLine.textContent = state.loadStatus === "ready"
    ? `${state.matchingCount} matching records · ${state.renderedGeometryCount} archive models · ${state.inspectionMarkerCount} evidence labels`
    : state.loadStatus === "error" ? `Load error · ${state.loadError}` : "Decoding recovered archive geometry…";
  statusLine.classList.toggle("fatal", state.loadStatus === "error");
}

familySelect.addEventListener("change", () => {
  environment.setFamilyFilter(familySelect.value as ObjectLibraryFamily, camera);
  syncUi(environment.getState(), true);
});
statusSelect.addEventListener("change", () => {
  environment.setStatusFilter(statusSelect.value as ObjectLibraryStatusFilter, camera);
  syncUi(environment.getState(), true);
});

window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  pressed.add(key);
  if (key === "n") environment.selectNext(1);
  if (key === "p") environment.selectNext(-1);
  if (key === "r") environment.reset(camera);
  if (key === "f") void (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen());
  if (["n", "p", "r", "f"].includes(key)) syncUi(environment.getState(), true);
});
window.addEventListener("keyup", (event) => pressed.delete(event.key.toLowerCase()));
window.addEventListener("blur", () => pressed.clear());
canvas.addEventListener("pointerdown", (event) => {
  dragging = true;
  pointerX = event.clientX;
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener("pointermove", (event) => {
  if (!dragging) return;
  environment.orbitByRadians((event.clientX - pointerX) * -0.006, camera);
  pointerX = event.clientX;
});
canvas.addEventListener("pointerup", (event) => {
  dragging = false;
  canvas.releasePointerCapture(event.pointerId);
});
canvas.addEventListener("wheel", (event) => {
  event.preventDefault();
  environment.zoomBy(Math.exp(event.deltaY * 0.001), camera);
}, { passive: false });
window.addEventListener("resize", resize);

function frame(now: number): void {
  const delta = forcedDelta > 0 ? forcedDelta : Math.min((now - lastTime) / 1000, 0.05);
  forcedDelta = 0;
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
    __OBJECT_LIBRARY_DEBUG__: {
      getState: () => ObjectLibraryCatalogState;
      setFamily: (filter: ObjectLibraryFamily) => boolean;
      setStatus: (filter: ObjectLibraryStatusFilter) => boolean;
      select: (index: number) => boolean;
      next: (direction?: number) => boolean;
      orbit: (radians: number) => void;
      zoom: (factor: number) => void;
      reset: () => void;
    };
  }
}

window.render_game_to_text = () => JSON.stringify(environment.getState());
window.advanceTime = (milliseconds: number) => {
  const seconds = Math.max(0, milliseconds) / 1000;
  environment.update(seconds, 0, camera);
  forcedDelta = 0;
  lastTime = performance.now();
  renderer.render(scene, camera);
};
window.__OBJECT_LIBRARY_DEBUG__ = {
  getState: () => environment.getState(),
  setFamily: (filter) => {
    const changed = environment.setFamilyFilter(filter, camera);
    syncUi(environment.getState(), true);
    return changed;
  },
  setStatus: (filter) => {
    const changed = environment.setStatusFilter(filter, camera);
    syncUi(environment.getState(), true);
    return changed;
  },
  select: (index) => {
    const changed = environment.selectIndex(index);
    syncUi(environment.getState(), true);
    return changed;
  },
  next: (direction = 1) => {
    const changed = environment.selectNext(direction);
    syncUi(environment.getState(), true);
    return changed;
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
void environment.ready.then(() => syncUi(environment.getState(), true)).catch(() => syncUi(environment.getState(), true));
requestAnimationFrame(frame);
