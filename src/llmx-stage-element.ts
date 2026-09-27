import {
  ACESFilmicToneMapping,
  AmbientLight,
  DirectionalLight,
  PerspectiveCamera,
  PointLight,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
} from "three";
import { mathTimeline, readMathScene, type MathScene } from "./llmx-math-scene";
import { MathStage } from "./llmx-math-stage";
import { stageView, type StageView } from "./llmx-stage-frame";

/**
 * `<llmx-stage>`: the math picture on its own, for a host that shows it in its own pictures zone
 * rather than beside the docked mask. Same `agentx.math-scene.v1` contract and receipts as
 * `<llmx-face>`; no mask, no presence, no pointer gaze.
 *
 * `scene` (`agentx.math-scene.v1`, or null) builds a counting or addition picture cube by cube.
 * Look-only: nothing in the picture is interactive.
 * Events: `llmx-stage-ready` (first frame drawn), `llmx-stage-error` (WebGL unavailable: the host
 * shows its own fallback), `llmx-scene-applied` / `llmx-scene-rejected` (the receipt for each
 * `scene` the host pushes), `llmx-scene-complete` once the picture has finished building.
 */
const FOV = 35;
/** Seconds for the camera to settle when a new picture has a different size. */
const VIEW_EASE = 0.35;

const reducedMotion = (): boolean => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

export class LlmXStageElement extends HTMLElement {
  private renderer: WebGLRenderer | null = null;
  private world: Scene | null = null;
  private camera: PerspectiveCamera | null = null;
  private stage: MathStage | null = null;
  private pending: unknown = undefined;
  private frame = 0;
  private last = 0;
  private readyEmitted = false;
  private visibleOnScreen = true;
  private view: StageView | null = null;
  private viewGoal: StageView = stageView(null, 1, FOV);
  private resize: ResizeObserver | null = null;
  private intersection: IntersectionObserver | null = null;

  /** The math picture being shown, or null. */
  get scene(): MathScene | null { return this.stage?.current?.scene ?? null; }

  /** Show `agentx.math-scene.v1`, or clear it with null. Out-of-bounds pictures are refused whole
   * (never clamped) and answered with `llmx-scene-rejected`. Set before connection, it applies on
   * connection. */
  set scene(value: unknown) {
    if (!this.stage) {
      this.pending = value;
      return;
    }
    if (value === null || value === undefined) {
      this.stage.clear();
      this.fit();
      return;
    }
    const scene = readMathScene(value);
    if (!scene) {
      this.dispatchEvent(new CustomEvent("llmx-scene-rejected", { detail: { reason: "out-of-bounds" } }));
      return;
    }
    this.stage.show(mathTimeline(scene));
    this.fit();
    this.dispatchEvent(new CustomEvent("llmx-scene-applied", { detail: { scene, cubes: this.stage.current?.cubes.length ?? 0 } }));
  }

  connectedCallback(): void {
    if (this.renderer) return;
    const root = this.shadowRoot ?? this.attachShadow({ mode: "open" });
    root.innerHTML = "<style>:host{display:block;position:relative;contain:strict;min-width:48px;min-height:48px}canvas{position:absolute;inset:0;width:100%;height:100%;display:block}</style><canvas></canvas>";
    const canvas = root.querySelector("canvas")!;
    try {
      this.renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "low-power" });
    } catch (error) {
      this.pending = undefined;
      this.dispatchEvent(new CustomEvent("llmx-stage-error", { detail: { reason: "webgl", message: String(error) } }));
      return;
    }
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.setClearColor(0x000000, 0);
    this.world = new Scene();
    this.camera = new PerspectiveCamera(FOV, 1, 0.1, 30);
    // The docked mask's light plan (llmx-face-element.ts), without its tinted rim and aura.
    this.world.add(new AmbientLight("#243040", 0.45));
    const key = new DirectionalLight("#c6d6f2", 2.8);
    key.position.set(-9, 11.5, 10);
    this.world.add(key);
    const fill = new PointLight("#d9d3c8", 7, 14);
    fill.position.set(3.5, 3.7, 8.5);
    this.world.add(fill);
    this.stage = new MathStage();
    this.world.add(this.stage.group);
    this.resize = new ResizeObserver(() => this.fit());
    this.resize.observe(this);
    this.intersection = new IntersectionObserver(entries => { this.visibleOnScreen = entries.some(entry => entry.isIntersecting); });
    this.intersection.observe(this);
    this.fit();
    if (this.pending !== undefined) {
      const value = this.pending;
      this.pending = undefined;
      this.scene = value;
    }
    this.last = performance.now();
    this.frame = requestAnimationFrame(this.tick);
  }

  disconnectedCallback(): void {
    cancelAnimationFrame(this.frame);
    this.resize?.disconnect();
    this.intersection?.disconnect();
    this.stage?.dispose();
    this.renderer?.dispose();
    this.renderer = this.world = this.camera = this.stage = this.view = null;
    this.readyEmitted = false;
  }

  private fit(): void {
    if (!this.renderer || !this.camera) return;
    const width = Math.max(1, this.clientWidth), height = Math.max(1, this.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, width * height > 400_000 ? 1.5 : 2));
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.viewGoal = stageView(this.stage?.current?.bounds ?? null, this.camera.aspect, FOV);
    if (!this.view) this.view = this.viewGoal;
    this.applyView();
  }

  private applyView(): void {
    const camera = this.camera, view = this.view;
    if (!camera || !view) return;
    camera.position.set(view.x, view.y + 0.03, view.distance);
    camera.lookAt(view.x, view.y, 0);
    camera.updateProjectionMatrix();
  }

  private readonly tick = (now: number): void => {
    this.frame = requestAnimationFrame(this.tick);
    const delta = Math.min(0.1, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    if (document.hidden || !this.visibleOnScreen || !this.renderer || !this.world || !this.camera || !this.stage) return;
    const reduced = reducedMotion();
    // Reduced motion shows the finished picture at once instead of building it cube by cube.
    const { completed } = this.stage.update(reduced ? 3600 : delta);
    if (this.view) {
      const k = reduced ? 1 : 1 - Math.exp(-delta / VIEW_EASE), goal = this.viewGoal, view = this.view;
      this.view = { x: view.x + (goal.x - view.x) * k, y: view.y + (goal.y - view.y) * k, distance: view.distance + (goal.distance - view.distance) * k };
      this.applyView();
    }
    this.renderer.render(this.world, this.camera);
    if (completed) this.dispatchEvent(new CustomEvent("llmx-scene-complete", { detail: { scene: this.scene } }));
    if (!this.readyEmitted) {
      this.readyEmitted = true;
      this.dispatchEvent(new CustomEvent("llmx-stage-ready"));
    }
  };
}

if (!customElements.get("llmx-stage")) customElements.define("llmx-stage", LlmXStageElement);
