import { Color, PerspectiveCamera, Scene, WebGLRenderer } from "three";
import { BallzXmlWorldsEnvironment } from "./ballz-xml-worlds-environment";

type SceneId = "myworld" | "testworld";

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`BallZ XML preview element missing: ${selector}`);
  return element;
}

const canvas = requireElement<HTMLCanvasElement>("#ballz-xml-canvas");
const summary = requireElement<HTMLElement>("#summary");
const objectList = requireElement<HTMLElement>("#objects");
const scene = new Scene();
scene.background = new Color(0x09131f);
const camera = new PerspectiveCamera(48, 1, 0.001, 4000);
const renderer = new WebGLRenderer({ canvas, antialias: true });
renderer.outputColorSpace = "srgb";
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const queryScene = new URLSearchParams(location.search).get("scene");
const initialScene: SceneId = queryScene === "testworld" ? "testworld" : "myworld";
const environment = new BallzXmlWorldsEnvironment({ initialScene });
scene.add(environment.group);
environment.applyToCamera(camera);

const held = new Set<string>();
let pointerDown = false;
let pointerX = 0;
let manualTime = false;
let lastFrame = performance.now();

function updateUi(): void {
  const state = environment.getState();
  summary.textContent = `${state.sceneId === "myworld" ? "MyWorld.xml" : "TestWorld.xml"} · ${state.renderedObjectCount}/${state.objectCount} exact records · ${state.classification}`;
  objectList.replaceChildren(...state.objects.map((object) => {
    const item = document.createElement("li");
    item.className = object.rendered ? "resolved" : "unresolved";
    item.textContent = `${object.index} · ${object.name} · ${object.action} · ${object.resolution}`;
    return item;
  }));
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-scene]")) {
    button.dataset.active = String(button.dataset.scene === state.sceneId);
  }
}

function render(): void {
  renderer.render(scene, camera);
  updateUi();
}

function resize(): void {
  const width = Math.max(1, canvas.clientWidth);
  const height = Math.max(1, canvas.clientHeight);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  render();
}

function step(deltaSeconds: number): void {
  const orbit = (held.has("ArrowLeft") || held.has("KeyA") ? 1 : 0) - (held.has("ArrowRight") || held.has("KeyD") ? 1 : 0);
  environment.update(deltaSeconds, orbit, camera);
  render();
}

function frame(now: number): void {
  if (!manualTime) {
    const delta = Math.min(0.05, Math.max(0, (now - lastFrame) / 1000));
    lastFrame = now;
    step(delta);
  }
  requestAnimationFrame(frame);
}

for (const button of document.querySelectorAll<HTMLButtonElement>("[data-scene]")) {
  button.addEventListener("click", () => {
    environment.setScene(button.dataset.scene as SceneId, camera);
    render();
  });
}
requireElement<HTMLButtonElement>("#focus-next").addEventListener("click", () => {
  environment.focusNext(camera);
  render();
});
requireElement<HTMLButtonElement>("#overview").addEventListener("click", () => {
  environment.focusObject(null, camera);
  render();
});

window.addEventListener("keydown", (event) => {
  held.add(event.code);
  if (event.code === "Tab") {
    event.preventDefault();
    environment.focusNext(camera);
    render();
  }
  if (event.code === "Digit1") environment.setScene("myworld", camera);
  if (event.code === "Digit2") environment.setScene("testworld", camera);
  if (event.code === "KeyR") environment.reset(camera);
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
  pointerX = event.clientX;
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener("pointermove", (event) => {
  if (!pointerDown) return;
  const delta = event.clientX - pointerX;
  pointerX = event.clientX;
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
  __BALLZ_XML_WORLDS_DEBUG__?: {
    state: () => ReturnType<BallzXmlWorldsEnvironment["getState"]>;
    setScene: (id: SceneId) => boolean;
    focus: (index: number | null) => boolean;
    focusNext: () => number | null;
    orbit: (radians: number) => void;
    setObjectVisible: (index: number, visible: boolean) => boolean;
    reset: () => void;
  };
};
testWindow.render_game_to_text = () => JSON.stringify({
  mode: "ballz-xml-worlds-preview",
  coordinateSystem: "Serialized TV3D left-handed +Z is converted to web -Z; source and web positions are both reported.",
  controls: "1/2 scene · Tab focus next exact object · A/D or drag orbit · R reset · F fullscreen",
  environment: environment.getState()
});

testWindow.advanceTime = (milliseconds: number) => {
  manualTime = true;
  const steps = Math.max(1, Math.round(milliseconds / (1000 / 60)));
  for (let index = 0; index < steps; index += 1) step(1 / 60);
};

testWindow.__BALLZ_XML_WORLDS_DEBUG__ = {
  state: () => environment.getState(),
  setScene: (id) => {
    const changed = environment.setScene(id, camera);
    render();
    return changed;
  },
  focus: (index) => {
    const changed = environment.focusObject(index, camera);
    render();
    return changed;
  },
  focusNext: () => {
    const index = environment.focusNext(camera);
    render();
    return index;
  },
  orbit: (radians) => {
    environment.orbitByRadians(radians, camera);
    render();
  },
  setObjectVisible: (index, visible) => {
    const changed = environment.setObjectVisible(index, visible);
    render();
    return changed;
  },
  reset: () => {
    environment.reset(camera);
    render();
  }
};

