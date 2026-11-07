import {
  ACESFilmicToneMapping,
  AmbientLight,
  Color,
  DirectionalLight,
  PerspectiveCamera,
  PointLight,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
} from "three";
import { mathTimeline, type MathScene } from "./llmx-math-scene";
import { MathStage } from "./llmx-math-stage";
import {
  MATH_ORBIT_DEFAULT,
  MATH_SCENE_V1,
  MATH_SCENE_V2,
  MATH_SCENE_V3,
  clampOrbit,
  describeMathScene,
  mathFitDistance,
  orbitPosition,
  readParameterValues,
  readStageScene,
  type MathFunctionsScene,
  type MathOrbit,
  type MathPoint,
} from "./llmx-math-functions";
import { MathFunctionStage } from "./llmx-math-function-stage";
import { stageView, type StageView } from "./llmx-stage-frame";

/**
 * `<llmx-stage>`: the math picture on its own, for a host that shows it in its own pictures zone
 * rather than beside the docked mask. No mask, no presence.
 *
 * `scene` takes `agentx.math-scene.v1` (cubes: counting, additions), `agentx.math-scene.v2`
 * (the same cube kinds, or `functions`: one to four functions y = f(x) drawn in the Math Game
 * style and overlaid for comparison), `agentx.math-scene.v3` (v2 plus derivatives, tangents, areas and
 * functions that use one another), or null to clear. `parameters` takes new values for the
 * shown functions' parameters, so the host's sliders drive the picture without rebuilding it.
 * Both are refused whole, never clamped. A functions picture can be turned by dragging (touch:
 * sideways only, so the page still scrolls); a double click returns to the opening view.
 * Events: `llmx-stage-ready` (first frame drawn), `llmx-stage-error` (WebGL unavailable: the host
 * shows its own fallback), `llmx-scene-applied` / `llmx-scene-rejected` (the receipt for each
 * `scene`), `llmx-parameters-applied` / `llmx-parameters-rejected` (each `parameters`),
 * `llmx-scene-complete` once the picture has finished building.
 */
const FOV = 35;
/** Seconds for the camera to settle when a new picture has a different size. */
const VIEW_EASE = 0.35;
/** Radians of orbit per pixel dragged. */
const DRAG_RATE = 0.008;

const reducedMotion = (): boolean => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

export type PublicFunctionsScene = {
  schema: typeof MATH_SCENE_V2 | typeof MATH_SCENE_V3;
  kind: "functions";
  functions: { name: string; label: string; expression: string; color: string }[];
  parameters: { name: string; value: number; min: number; max: number }[];
  x: [number, number];
  y: [number, number] | null;
  /** v3 only. */
  derivatives?: string[];
  tangents?: { of: string; at: MathPoint }[];
  areas?: { of: string; from: MathPoint; to: MathPoint }[];
};

export class LlmXStageElement extends HTMLElement {
  /** The contracts this element understands, so a host can pick v2 or keep its own fallback. */
  static readonly schemas: readonly string[] = Object.freeze([MATH_SCENE_V1, MATH_SCENE_V2, MATH_SCENE_V3]);

  private renderer: WebGLRenderer | null = null;
  private world: Scene | null = null;
  private camera: PerspectiveCamera | null = null;
  private stage: MathStage | null = null;
  private functions: MathFunctionStage | null = null;
  private pending: unknown = undefined;
  private frame = 0;
  private last = 0;
  private readyEmitted = false;
  private visibleOnScreen = true;
  private view: StageView | null = null;
  private viewGoal: StageView = stageView(null, 1, FOV);
  private orbit: MathOrbit = MATH_ORBIT_DEFAULT;
  private distance = 0;
  private distanceGoal = 0;
  private drag: { id: number; x: number; y: number; touch: boolean } | null = null;
  private resize: ResizeObserver | null = null;
  private intersection: IntersectionObserver | null = null;

  /** The picture being shown (cubes, or the functions with their current values), or null. */
  get scene(): MathScene | PublicFunctionsScene | null {
    const shown = this.functions?.current;
    if (shown) return publicScene(shown, this.functions!.currentValues);
    return this.stage?.current?.scene ?? null;
  }

  /** Show a v1 or v2 picture, or clear it with null. Set before connection, it applies on connection. */
  set scene(value: unknown) {
    if (!this.stage || !this.functions) {
      this.pending = value;
      return;
    }
    if (value === null || value === undefined) {
      this.stage.clear();
      this.functions.clear();
      this.fit();
      return;
    }
    const read = readStageScene(value);
    if (!read.ok) {
      this.dispatchEvent(new CustomEvent("llmx-scene-rejected", { detail: { reason: read.reason, message: read.message } }));
      return;
    }
    if (read.type === "cubes") {
      this.functions.clear();
      this.stage.show(mathTimeline(read.scene));
      this.renderer?.setClearColor(0x000000, 0);
      this.fit();
      this.dispatchEvent(new CustomEvent("llmx-scene-applied", { detail: { scene: read.scene, cubes: this.stage.current?.cubes.length ?? 0 } }));
      return;
    }
    this.stage.clear();
    this.functions.show(read.scene, !reducedMotion());
    this.renderer?.setClearColor(new Color(MathFunctionStage.background), 1);
    this.orbit = MATH_ORBIT_DEFAULT;
    this.fit();
    this.dispatchEvent(new CustomEvent("llmx-scene-applied", { detail: this.functionsReceipt() }));
  }

  /** Current parameter values of the functions picture ({} when none is shown). */
  get parameters(): Record<string, number> { return { ...(this.functions?.currentValues ?? {}) }; }

  /** New values for some or all declared parameters, each inside its range, or nothing changes. */
  set parameters(value: unknown) {
    const shown = this.functions?.current;
    const values = shown ? readParameterValues(shown, value) : null;
    if (!shown || !values) {
      this.dispatchEvent(new CustomEvent("llmx-parameters-rejected", { detail: { reason: shown ? "out-of-range" : "no-functions" } }));
      return;
    }
    this.functions!.setValues(values);
    this.dispatchEvent(new CustomEvent("llmx-parameters-applied", { detail: this.functionsReceipt() }));
  }

  private functionsReceipt() {
    const shown = this.functions!.current!, values = this.functions!.currentValues, layout = this.functions!.currentLayout!;
    return {
      scene: publicScene(shown, values),
      kind: "functions" as const,
      functions: shown.functions.length,
      molecules: layout.molecules.filter(molecule => molecule.position).length,
      y: [...layout.y],
      // v3: what Core also computes, from the same formulas, for the host to compare.
      tangents: layout.tangents.map(row => ({ of: shown.functions[row.fn].name, x: row.x, y: row.y, slope: row.slope })),
      areas: layout.areas.map(row => ({ of: shown.functions[row.fn].name, from: row.from, to: row.to, value: row.value })),
      text: describeMathScene(shown, values),
    };
  }

  connectedCallback(): void {
    if (this.renderer) return;
    const root = this.shadowRoot ?? this.attachShadow({ mode: "open" });
    root.innerHTML = "<style>:host{display:block;position:relative;contain:strict;min-width:48px;min-height:48px;touch-action:pan-y}canvas{position:absolute;inset:0;width:100%;height:100%;display:block}</style><canvas></canvas>";
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
    this.camera = new PerspectiveCamera(FOV, 1, 0.1, 40);
    // The docked mask's light plan (llmx-face-element.ts), without its tinted rim and aura.
    this.world.add(new AmbientLight("#243040", 0.45));
    const key = new DirectionalLight("#c6d6f2", 2.8);
    key.position.set(-9, 11.5, 10);
    this.world.add(key);
    const fill = new PointLight("#d9d3c8", 7, 14);
    fill.position.set(3.5, 3.7, 8.5);
    this.world.add(fill);
    this.stage = new MathStage();
    this.functions = new MathFunctionStage();
    this.world.add(this.stage.group, this.functions.group);
    this.resize = new ResizeObserver(() => this.fit());
    this.resize.observe(this);
    this.intersection = new IntersectionObserver(entries => { this.visibleOnScreen = entries.some(entry => entry.isIntersecting); });
    this.intersection.observe(this);
    this.addEventListener("pointerdown", this.onPointerDown);
    this.addEventListener("pointermove", this.onPointerMove);
    this.addEventListener("pointerup", this.onPointerUp);
    this.addEventListener("pointercancel", this.onPointerUp);
    this.addEventListener("dblclick", this.onDoubleClick);
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
    this.removeEventListener("pointerdown", this.onPointerDown);
    this.removeEventListener("pointermove", this.onPointerMove);
    this.removeEventListener("pointerup", this.onPointerUp);
    this.removeEventListener("pointercancel", this.onPointerUp);
    this.removeEventListener("dblclick", this.onDoubleClick);
    this.stage?.dispose();
    this.functions?.dispose();
    this.renderer?.dispose();
    this.renderer = this.world = this.camera = this.stage = this.functions = this.view = null;
    this.readyEmitted = false;
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (!this.functions?.active || event.button > 0) return;
    this.drag = { id: event.pointerId, x: event.clientX, y: event.clientY, touch: event.pointerType === "touch" };
    this.setPointerCapture?.(event.pointerId);
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    const drag = this.drag;
    if (!drag || drag.id !== event.pointerId) return;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    drag.x = event.clientX;
    drag.y = event.clientY;
    // Touch turns sideways only: an upward swipe belongs to the page scroll.
    this.orbit = clampOrbit({ yaw: this.orbit.yaw - dx * DRAG_RATE, pitch: this.orbit.pitch + (drag.touch ? 0 : dy * DRAG_RATE) });
    this.fit();
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (this.drag?.id === event.pointerId) this.drag = null;
  };

  private readonly onDoubleClick = (): void => {
    if (!this.functions?.active) return;
    this.orbit = MATH_ORBIT_DEFAULT;
    this.fit();
  };

  private fit(): void {
    if (!this.renderer || !this.camera) return;
    const width = Math.max(1, this.clientWidth), height = Math.max(1, this.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, width * height > 400_000 ? 1.5 : 2));
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    if (this.functions?.active) {
      // The board's framing is fixed in stage units; only the orbit and aspect move the camera.
      this.distanceGoal = mathFitDistance(this.orbit, this.camera.aspect, FOV);
      if (!this.distance) this.distance = this.distanceGoal;
    } else {
      this.distance = 0;
      this.viewGoal = stageView(this.stage?.current?.bounds ?? null, this.camera.aspect, FOV);
      if (!this.view) this.view = this.viewGoal;
    }
    this.applyView();
  }

  private applyView(): void {
    const camera = this.camera;
    if (!camera) return;
    if (this.functions?.active) {
      camera.position.set(...orbitPosition(this.orbit, this.distance || this.distanceGoal));
      camera.lookAt(0, 0, 0);
    } else if (this.view) {
      camera.position.set(this.view.x, this.view.y + 0.03, this.view.distance);
      camera.lookAt(this.view.x, this.view.y, 0);
    }
    camera.updateProjectionMatrix();
  }

  private readonly tick = (now: number): void => {
    this.frame = requestAnimationFrame(this.tick);
    const delta = Math.min(0.1, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    if (document.hidden || !this.visibleOnScreen || !this.renderer || !this.world || !this.camera || !this.stage || !this.functions) return;
    const reduced = reducedMotion();
    const k = reduced ? 1 : 1 - Math.exp(-delta / VIEW_EASE);
    let completed: boolean;
    if (this.functions.active) {
      completed = this.functions.update(reduced ? 3600 : delta);
      this.distance += (this.distanceGoal - this.distance) * k;
      this.applyView();
    } else {
      // Reduced motion shows the finished picture at once instead of building it cube by cube.
      completed = this.stage.update(reduced ? 3600 : delta).completed;
      if (this.view) {
        const goal = this.viewGoal, view = this.view;
        this.view = { x: view.x + (goal.x - view.x) * k, y: view.y + (goal.y - view.y) * k, distance: view.distance + (goal.distance - view.distance) * k };
        this.applyView();
      }
    }
    this.renderer.render(this.world, this.camera);
    if (completed) this.dispatchEvent(new CustomEvent("llmx-scene-complete", { detail: { scene: this.scene } }));
    if (!this.readyEmitted) {
      this.readyEmitted = true;
      this.dispatchEvent(new CustomEvent("llmx-stage-ready"));
    }
  };
}

function publicScene(scene: MathFunctionsScene, values: Readonly<Record<string, number>>): PublicFunctionsScene {
  const extras = scene.schema === MATH_SCENE_V3 ? {
    derivatives: scene.derivatives.map(row => row.of),
    tangents: scene.tangents.map(({ of, at }) => ({ of, at })),
    areas: scene.areas.map(({ of, from, to }) => ({ of, from, to })),
  } : {};
  return {
    ...extras,
    schema: scene.schema,
    kind: "functions",
    functions: scene.functions.map(({ name, label, expression, color }) => ({ name, label, expression, color })),
    parameters: scene.parameters.map(row => ({ ...row, value: values[row.name] ?? row.value })),
    x: [scene.x[0], scene.x[1]],
    y: scene.y ? [scene.y[0], scene.y[1]] : null,
  };
}

if (!customElements.get("llmx-stage")) customElements.define("llmx-stage", LlmXStageElement);
