import {
  AmbientLight,
  Color,
  DirectionalLight,
  PerspectiveCamera,
  Scene,
  WebGLRenderer
} from "three";
import { MilkyWayEnvironment, type MilkyWayProfile } from "./milky-way-environment";

function requireCanvas(): HTMLCanvasElement {
  const canvas = document.querySelector<HTMLCanvasElement>("#milky-way-preview-canvas");
  if (!canvas) throw new Error("Voie Lactée preview canvas is missing.");
  return canvas;
}

const canvas = requireCanvas();
const scene = new Scene();
scene.background = new Color(0x000000);
scene.add(new AmbientLight(0x8aa4cc, 0.55));
const keyLight = new DirectionalLight(0xffffff, 2.5);
keyLight.position.set(24, 45, 42);
scene.add(keyLight);

const camera = new PerspectiveCamera(48, 1, 0.1, 1000);
camera.position.set(25, 43, 92);
camera.lookAt(-36, 15, 8);

const renderer = new WebGLRenderer({ canvas, antialias: true });
renderer.outputColorSpace = "srgb";
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const profileQuery = new URLSearchParams(window.location.search).get("profile");
const profile: MilkyWayProfile = profileQuery === "ballz2015" ? "ballz2015" : "graphysx2017";
const environment = new MilkyWayEnvironment({ profile });
scene.add(environment.group);

let manualTime = false;
let lastFrame = performance.now();

function resize(): void {
  const width = Math.max(1, canvas.clientWidth);
  const height = Math.max(1, canvas.clientHeight);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
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
  }
  requestAnimationFrame(frame);
}

window.addEventListener("keydown", (event) => {
  if (event.key.toLowerCase() === "r") {
    environment.reset();
    step(0);
  }
  if (event.key.toLowerCase() === "f") void document.documentElement.requestFullscreen();
});
window.addEventListener("resize", resize);
resize();
void environment.ready.finally(() => step(0));
requestAnimationFrame(frame);

const testWindow = window as typeof window & {
  render_game_to_text?: () => string;
  advanceTime?: (milliseconds: number) => void;
  __MILKY_WAY_DEBUG__?: {
    state: () => ReturnType<MilkyWayEnvironment["getState"]>;
    reset: () => void;
  };
};
testWindow.render_game_to_text = () =>
  JSON.stringify({
    mode: "voie-lactee-archive-preview",
    coordinateSystem: "+X right, +Y up, +Z toward the recovered planet row",
    camera: {
      evidence: "inspection-only; no Voie Lactée-specific archive camera was recovered",
      position: camera.position.toArray(),
      lookAt: [-36, 15, 8]
    },
    environment: environment.getState()
  });

testWindow.advanceTime = (milliseconds: number) => {
  manualTime = true;
  const steps = Math.max(1, Math.round(milliseconds / (1000 / 60)));
  for (let index = 0; index < steps; index += 1) step(1 / 60);
};

testWindow.__MILKY_WAY_DEBUG__ = {
  state: () => environment.getState(),
  reset: () => {
    environment.reset();
    step(0);
  }
};

