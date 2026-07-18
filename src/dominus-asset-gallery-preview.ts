import { Color, Fog, PerspectiveCamera, Scene, WebGLRenderer } from "three";
import {
  DominusAssetGalleryEnvironment,
  type DominusAssetFamily,
  type DominusAssetGalleryState,
  type DominusAssetStatusFilter
} from "./dominus-asset-gallery-environment";

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Dominus gallery requires ${selector}.`);
  return element;
}

const canvas = requiredElement<HTMLCanvasElement>("#viewport");
const familySelect = requiredElement<HTMLSelectElement>("#family-filter");
const statusSelect = requiredElement<HTMLSelectElement>("#status-filter");
const assetList = requiredElement<HTMLDivElement>("#asset-list");
const counts = requiredElement<HTMLDivElement>("#counts");
const statusLine = requiredElement<HTMLDivElement>("#status-line");
const previousButton = requiredElement<HTMLButtonElement>("#previous");
const nextButton = requiredElement<HTMLButtonElement>("#next");
const detail = {
  index: requiredElement<HTMLElement>("#selected-index"),
  name: requiredElement<HTMLElement>("#selected-name"),
  status: requiredElement<HTMLElement>("#selected-status"),
  family: requiredElement<HTMLElement>("#selected-family"),
  format: requiredElement<HTMLElement>("#selected-format"),
  meshes: requiredElement<HTMLElement>("#selected-meshes"),
  vertices: requiredElement<HTMLElement>("#selected-vertices"),
  triangles: requiredElement<HTMLElement>("#selected-triangles"),
  materials: requiredElement<HTMLElement>("#selected-materials"),
  bounds: requiredElement<HTMLElement>("#selected-bounds"),
  source: requiredElement<HTMLElement>("#selected-source"),
  textures: requiredElement<HTMLElement>("#selected-textures"),
  truth: requiredElement<HTMLElement>("#selected-truth")
};

const FAMILY_OPTIONS: Array<[DominusAssetFamily, string]> = [
  ["all", "All families"], ["bush", "Bush"], ["camp", "Camp"], ["character", "Characters"],
  ["grass", "Grass & flowers"], ["port", "Port assets"], ["weapon", "Weapons"], ["tree", "Trees"]
];
const STATUS_OPTIONS: Array<[DominusAssetStatusFilter, string]> = [
  ["all", "All statuses"], ["recovered", "Recovered text X"], ["unsupported", "Unsupported binary X"]
];
for (const [value, label] of FAMILY_OPTIONS) familySelect.add(new Option(label, value));
for (const [value, label] of STATUS_OPTIONS) statusSelect.add(new Option(label, value));

const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.outputColorSpace = "srgb";
const scene = new Scene();
scene.background = new Color(0x0a1117);
scene.fog = new Fog(0x0a1117, 19, 44);
const camera = new PerspectiveCamera(42, 1, 0.05, 100);
const environment = new DominusAssetGalleryEnvironment();
scene.add(environment.group);

const pressed = new Set<string>();
let dragging = false;
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

function boundsText(state: DominusAssetGalleryState): string {
  if (!state.sourceBounds) return "not decoded";
  return state.sourceBounds.size.map((value) => Number(value.toFixed(3))).join(" × ");
}

function syncUi(state: DominusAssetGalleryState, force = false): void {
  const signature = `${state.loadStatus}|${state.familyFilter}|${state.statusFilter}|${state.selectedIndex}|${state.matchingCount}`;
  if (!force && signature === lastUiSignature) return;
  lastUiSignature = signature;
  familySelect.value = state.familyFilter;
  statusSelect.value = state.statusFilter;
  counts.replaceChildren();
  for (const [label, value, className] of [
    ["visible", state.matchingCount, ""], ["recovered", state.recoveredCount, "ok"], ["binary", state.unsupportedCount, "warn"]
  ] as const) {
    const badge = document.createElement("span");
    badge.className = `count ${className}`;
    badge.textContent = `${value} ${label}`;
    counts.append(badge);
  }
  assetList.replaceChildren();
  for (const asset of state.assets.filter((entry) => entry.matchesFilter)) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `asset-row${asset.selected ? " selected" : ""}`;
    button.dataset.assetId = asset.id;
    button.dataset.status = asset.status;
    button.innerHTML = `<span class="asset-index">${String(asset.index).padStart(2, "0")}</span><span class="asset-name"></span><span class="dot ${asset.status === "unsupported-binary-x" ? "unsupported" : ""}"></span>`;
    button.querySelector<HTMLElement>(".asset-name")!.textContent = asset.name;
    button.addEventListener("click", async () => {
      void environment.selectIndex(asset.index).then(() => syncUi(environment.getState(), true));
      syncUi(environment.getState(), true);
    });
    assetList.append(button);
  }
  assetList.querySelector(".selected")?.scrollIntoView({ block: "nearest" });

  const unsupported = state.selectedStatus === "unsupported-binary-x";
  detail.index.textContent = `Asset ${String(state.selectedIndex).padStart(2, "0")}`;
  detail.name.textContent = state.selectedName;
  detail.status.textContent = state.selectedStatus;
  detail.status.className = unsupported ? "unsupported" : "";
  detail.family.textContent = state.selectedFamily;
  detail.format.textContent = state.sourceFormat;
  detail.meshes.textContent = number(state.sourceMeshCount);
  detail.vertices.textContent = number(state.sourceVertexCount);
  detail.triangles.textContent = number(state.sourceTriangleCount);
  detail.materials.textContent = number(state.sourceMaterialGroupCount);
  detail.bounds.textContent = boundsText(state);
  detail.source.textContent = state.selectedSource;
  detail.textures.textContent = state.textureReferences.length ? state.textureReferences.join(" · ") : "none decoded";
  detail.truth.textContent = unsupported
    ? "The binary X file survives, but no decoder-backed geometry or proxy is shown. It remains an explicit archive boundary."
    : `Exact local geometry is centered and uniformly scaled ${state.displayNormalization.uniformScale.toExponential(3)}× for inspection only. No authored placement survives.`;
  statusLine.textContent = state.loadStatus === "ready"
    ? `${state.selectedFamily} · ${number(state.sourceVertexCount)} vertices · ${number(state.sourceTriangleCount)} triangles · local asset only`
    : state.loadStatus === "error" ? `Load error · ${state.loadError}` : `Loading ${state.selectedName}…`;
  statusLine.classList.toggle("error", state.loadStatus === "error");
}

async function selectRelative(direction: number): Promise<void> {
  syncUi(environment.getState(), true);
  await environment.selectNext(direction);
  syncUi(environment.getState(), true);
}

familySelect.addEventListener("change", async () => {
  syncUi(environment.getState(), true);
  await environment.setFamilyFilter(familySelect.value as DominusAssetFamily, camera);
  syncUi(environment.getState(), true);
});
statusSelect.addEventListener("change", async () => {
  syncUi(environment.getState(), true);
  await environment.setStatusFilter(statusSelect.value as DominusAssetStatusFilter, camera);
  syncUi(environment.getState(), true);
});
previousButton.addEventListener("click", () => void selectRelative(-1));
nextButton.addEventListener("click", () => void selectRelative(1));
window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  pressed.add(key);
  if (key === "n") void selectRelative(1);
  if (key === "p") void selectRelative(-1);
  if (key === "r") void environment.reset(camera).then(() => syncUi(environment.getState(), true));
  if (key === "f") void (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen());
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
    __DOMINUS_GALLERY_DEBUG__: {
      getState: () => DominusAssetGalleryState;
      setFamily: (filter: DominusAssetFamily) => Promise<boolean>;
      setStatus: (filter: DominusAssetStatusFilter) => Promise<boolean>;
      select: (id: string) => Promise<boolean>;
      next: (direction?: number) => Promise<boolean>;
      orbit: (radians: number) => void;
      zoom: (factor: number) => void;
      reset: () => Promise<void>;
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
window.__DOMINUS_GALLERY_DEBUG__ = {
  getState: () => environment.getState(),
  setFamily: async (filter) => {
    const result = await environment.setFamilyFilter(filter, camera);
    syncUi(environment.getState(), true);
    return result;
  },
  setStatus: async (filter) => {
    const result = await environment.setStatusFilter(filter, camera);
    syncUi(environment.getState(), true);
    return result;
  },
  select: async (id) => {
    const result = await environment.selectById(id);
    syncUi(environment.getState(), true);
    return result;
  },
  next: async (direction = 1) => {
    const result = await environment.selectNext(direction);
    syncUi(environment.getState(), true);
    return result;
  },
  orbit: (radians) => environment.orbitByRadians(radians, camera),
  zoom: (factor) => environment.zoomBy(factor, camera),
  reset: async () => {
    await environment.reset(camera);
    syncUi(environment.getState(), true);
  }
};

resize();
environment.applyToCamera(camera);
syncUi(environment.getState(), true);
void environment.ready.then(() => syncUi(environment.getState(), true));
requestAnimationFrame(frame);
