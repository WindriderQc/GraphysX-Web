import {
  AmbientLight,
  Color,
  DirectionalLight,
  PerspectiveCamera,
  Raycaster,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer
} from "three";
import { NotesManagerEnvironment } from "./notes-manager-environment";

function requireCanvas(): HTMLCanvasElement {
  const canvas = document.querySelector<HTMLCanvasElement>("#notes-manager-preview-canvas");
  if (!canvas) throw new Error("Notes Manager preview canvas is missing.");
  return canvas;
}

const canvas = requireCanvas();
const scene = new Scene();
scene.background = new Color(0x101319);
scene.add(new AmbientLight(0xffffff, 0.42));
const keyLight = new DirectionalLight(0xffffff, 2.2);
keyLight.position.set(-120, 360, 260);
keyLight.castShadow = true;
scene.add(keyLight);

const camera = new PerspectiveCamera(48, 1, 1, 2500);
camera.position.set(520, 250, 650);
camera.lookAt(140, -80, 80);

const renderer = new WebGLRenderer({ canvas, antialias: true });
renderer.outputColorSpace = "srgb";
renderer.shadowMap.enabled = true;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const environment = new NotesManagerEnvironment();
scene.add(environment.group);
const raycaster = new Raycaster();
const pointer = new Vector2();

function resize(): void {
  const width = Math.max(1, canvas.clientWidth);
  const height = Math.max(1, canvas.clientHeight);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function render(): void {
  renderer.render(scene, camera);
}

function addNote(): number | null {
  const result = environment.addNote();
  render();
  return result;
}

canvas.addEventListener("pointerdown", (event) => {
  const bounds = canvas.getBoundingClientRect();
  pointer.set(
    ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
    -((event.clientY - bounds.top) / bounds.height) * 2 + 1
  );
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObject(environment.addNoteButton, false)[0];
  if (hit && environment.isAddButton(hit.object)) addNote();
});

window.addEventListener("keydown", (event) => {
  if (event.key.toLowerCase() === "a") addNote();
  if (event.key.toLowerCase() === "r") {
    environment.reset();
    render();
  }
  if (event.key.toLowerCase() === "f") void document.documentElement.requestFullscreen();
});
window.addEventListener("resize", () => {
  resize();
  render();
});

resize();
void environment.ready.finally(render);
render();

const testWindow = window as typeof window & {
  render_game_to_text?: () => string;
  advanceTime?: (milliseconds: number) => void;
  __NOTES_MANAGER_DEBUG__?: {
    state: () => ReturnType<NotesManagerEnvironment["getState"]>;
    addNote: () => number | null;
    addButtonScreenPoint: () => [number, number];
    setActiveNotes: (count: number) => void;
    reset: () => void;
  };
};

testWindow.render_game_to_text = () =>
  JSON.stringify({
    mode: "notes-manager-archive-preview",
    coordinateSystem: "+X note columns, +Y up, +Z positions within each 10-note column",
    camera: {
      evidence: "inspection-only; no Notes-specific archive camera was recovered",
      position: camera.position.toArray(),
      lookAt: [140, -80, 80]
    },
    controls: { add: "A or click the marble add cube", reset: "R", fullscreen: "F" },
    environment: environment.getState()
  });

testWindow.advanceTime = (_milliseconds: number) => render();
testWindow.__NOTES_MANAGER_DEBUG__ = {
  state: () => environment.getState(),
  addNote,
  addButtonScreenPoint: () => {
    const projected = environment.addNoteButton.getWorldPosition(new Vector3()).project(camera);
    const bounds = canvas.getBoundingClientRect();
    return [
      bounds.left + ((projected.x + 1) / 2) * bounds.width,
      bounds.top + ((1 - projected.y) / 2) * bounds.height
    ];
  },
  setActiveNotes: (count) => {
    environment.setActiveNotes(count);
    render();
  },
  reset: () => {
    environment.reset();
    render();
  }
};
