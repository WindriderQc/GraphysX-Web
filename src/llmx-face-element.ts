import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  AmbientLight,
  Box3,
  CanvasTexture,
  Color,
  DirectionalLight,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from "three";
import { AgentWorldVoxelFace } from "./agent-world-face";
import { POSE_LIMITS, resolveAgentWorldFace, type AgentWorldFaceLevel } from "./llmx-face-pose";
import { forgeIntroAt, FORGE_INTRO } from "./llmx-forge";
import { gazeDriversToward } from "./llmx-gaze";
import { embedFaceDrivers, IDLE_PRESENCE, newToolPulses, readEmbedPresence, type LlmXEmbedPresence } from "./llmx-face-embed-presence";
import { mathTimeline, readMathScene, type MathScene } from "./llmx-math-scene";
import { MathStage } from "./llmx-math-stage";

/**
 * `<llmx-face>`: the LLMx voxel mask alone, for another page to dock beside its own conversation.
 *
 * No world, physics, editor or transport: one renderer, one scene, the rig, four lights and an
 * aura halo. The host page owns the conversation and pushes `agentx.presence.v1` through the
 * `presence` property; the mask assembles on connect (the Forge intro, without the room) and
 * follows the pointer anywhere on the page.
 *
 * Attributes: `level` (high | balanced | mobile), `tint` (#rrggbb, the aura and rim),
 * `intro` ("off" to arrive already built).
 * `scene` (`agentx.math-scene.v1`, or null) shows a counting or addition picture beside the mask,
 * which looks at each cube as it appears. Look-only: nothing in the picture is interactive.
 * Events: `llmx-face-ready`, `llmx-face-error` (WebGL unavailable: the host shows its fallback),
 * `llmx-scene-applied` / `llmx-scene-rejected` (the receipt for each `scene` the host pushes).
 */
/** Frame used until the assembled mask can be measured: the high level's Box3 plus a margin. */
const DEFAULT_FRAME = Object.freeze({ halfWidth: 0.95, halfHeight: 1.38, front: 0.66 });
/** Room kept around the measured mask, so a nod or a sway never touches the dock's edge. */
const FRAME_MARGIN = 1.14;
const EYE_HEIGHT = 0.1;
/** Space between the mask and the math picture, and room for the label above the cubes. */
const STAGE_GAP = 0.35;
const STAGE_LABEL_ROOM = 0.6;
/** Seconds for the camera to settle on a new framing when a picture appears or clears. */
const VIEW_EASE = 0.35;
const DEFAULT_TINT = "#60d6e8";

const reducedMotion = (): boolean => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

function deviceCeiling(): AgentWorldFaceLevel {
  const cores = navigator.hardwareConcurrency || 4;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  if (cores <= 4 || memory <= 4) return "mobile";
  return cores <= 8 ? "balanced" : "high";
}

export class LlmXFaceElement extends HTMLElement {
  static readonly observedAttributes = ["tint", "level"];

  private renderer: WebGLRenderer | null = null;
  private world: Scene | null = null;
  private camera: PerspectiveCamera | null = null;
  private face: AgentWorldVoxelFace | null = null;
  private aura: Mesh<PlaneGeometry, MeshBasicMaterial> | null = null;
  private rim: PointLight | null = null;
  private frame = 0;
  private last = 0;
  private elapsed = 0;
  private sparks = 0;
  private speakingBefore = false;
  private readyEmitted = false;
  private visibleOnScreen = true;
  private pointer: { x: number; y: number; at: number } | null = null;
  private current: LlmXEmbedPresence = IDLE_PRESENCE;
  private frameExtent: { halfWidth: number; halfHeight: number; front: number } = DEFAULT_FRAME;
  private measured = false;
  private readonly gaze = new Vector3();
  private stage: MathStage | null = null;
  private stageFocusAt = 0;
  private viewGoal = { x: 0, y: 0, distance: 4.1 };
  private view: { x: number; y: number; distance: number } | null = null;
  private readonly tint = new Color(DEFAULT_TINT);
  private resize: ResizeObserver | null = null;
  private intersection: IntersectionObserver | null = null;

  /** The last presence the host pushed. */
  get presence(): LlmXEmbedPresence { return this.current; }

  /** Push `agentx.presence.v1`; partial updates keep the previous fields. */
  set presence(value: unknown) {
    const next = readEmbedPresence(value, this.current);
    this.sparks = Math.min(3, this.sparks + newToolPulses(this.current, next));
    this.current = next;
  }

  /** The math picture being shown, or null. */
  get scene(): MathScene | null { return this.stage?.current?.scene ?? null; }

  /** Show `agentx.math-scene.v1` beside the mask, or clear it with null. Out-of-bounds pictures
   * are refused whole (never clamped) and answered with `llmx-scene-rejected`. */
  set scene(value: unknown) {
    if (value === null || value === undefined) {
      this.stage?.clear();
      this.fit();
      return;
    }
    const scene = readMathScene(value);
    if (!scene || !this.stage) {
      this.dispatchEvent(new CustomEvent("llmx-scene-rejected", { detail: { reason: scene ? "unavailable" : "out-of-bounds" } }));
      return;
    }
    this.stage.show(mathTimeline(scene));
    this.fit();
    this.dispatchEvent(new CustomEvent("llmx-scene-applied", { detail: { scene, cubes: this.stage.current?.cubes.length ?? 0 } }));
  }

  /** Replay the assembly, as when the conversation is opened again. */
  rebuild(): void {
    this.elapsed = 0;
    this.face?.snapDrivers({ build: 0, blink: 1, speak: 0, think: 0 });
  }

  connectedCallback(): void {
    if (this.renderer) return;
    const root = this.shadowRoot ?? this.attachShadow({ mode: "open" });
    root.innerHTML = "<style>:host{display:block;position:relative;contain:strict;min-width:48px;min-height:48px}canvas{position:absolute;inset:0;width:100%;height:100%;display:block}</style><canvas part=\"canvas\"></canvas>";
    const canvas = root.querySelector("canvas")!;
    try {
      this.renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "low-power" });
    } catch (error) {
      this.dispatchEvent(new CustomEvent("llmx-face-error", { detail: { reason: "webgl", message: String(error) } }));
      return;
    }
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.setClearColor(0x000000, 0);
    this.world = new Scene();
    this.camera = new PerspectiveCamera(35, 1, 0.1, 30);
    this.buildLights();
    const level = (this.getAttribute("level") as AgentWorldFaceLevel | null) ?? "high";
    this.face = new AgentWorldVoxelFace(resolveAgentWorldFace({ level: ["high", "balanced", "mobile"].includes(level) ? level : "high" }));
    this.face.setQualityCeiling(deviceCeiling());
    this.world.add(this.face.object);
    this.stage = new MathStage();
    this.world.add(this.stage.group);
    this.applyTint();
    if (this.getAttribute("intro") === "off") {
      this.elapsed = FORGE_INTRO.seconds;
      this.face.snapDrivers({ build: 1, blink: 0 });
    } else {
      this.rebuild();
    }
    this.resize = new ResizeObserver(() => this.fit());
    this.resize.observe(this);
    this.intersection = new IntersectionObserver(entries => { this.visibleOnScreen = entries.some(entry => entry.isIntersecting); });
    this.intersection.observe(this);
    window.addEventListener("pointermove", this.onPointer, { passive: true });
    this.fit();
    this.last = performance.now();
    this.frame = requestAnimationFrame(this.tick);
  }

  disconnectedCallback(): void {
    cancelAnimationFrame(this.frame);
    window.removeEventListener("pointermove", this.onPointer);
    this.resize?.disconnect();
    this.intersection?.disconnect();
    this.face?.dispose();
    this.stage?.dispose();
    this.stage = null;
    this.view = null;
    this.aura?.geometry.dispose();
    this.aura?.material.map?.dispose();
    this.aura?.material.dispose();
    this.renderer?.dispose();
    this.renderer = this.world = this.camera = this.face = this.aura = this.rim = null;
    this.readyEmitted = false;
  }

  attributeChangedCallback(name: string): void {
    if (name === "tint") this.applyTint();
    if (name === "level" && this.face) {
      const level = this.getAttribute("level");
      if (level === "high" || level === "balanced" || level === "mobile") {
        this.face.configure(resolveAgentWorldFace({ level }));
        this.measured = false;
      }
    }
  }

  private buildLights(): void {
    const scene = this.world!;
    // The Forge's light plan (llmx-forge.ts), relative to a mask at the origin.
    scene.add(new AmbientLight("#243040", 0.28));
    const key = new DirectionalLight("#c6d6f2", 2.8);
    key.position.set(-9, 11.5, 10);
    scene.add(key);
    const fill = new PointLight("#d9d3c8", 7, 14);
    fill.position.set(3.5, 3.7, 8.5);
    scene.add(fill);
    this.rim = new PointLight(DEFAULT_TINT, 14, 14);
    this.rim.position.set(0, 1.4, -3.4);
    scene.add(this.rim);
    // The aura: a soft halo behind the head, additive, so it glows on any dock background.
    this.aura = new Mesh(new PlaneGeometry(3.6, 3.6), new MeshBasicMaterial({ color: DEFAULT_TINT, map: haloTexture(), transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false }));
    this.aura.position.set(0, 0.1, -0.9);
    scene.add(this.aura);
  }

  private applyTint(): void {
    const value = this.getAttribute("tint");
    this.tint.set(value && /^#[0-9a-f]{6}$/i.test(value) ? value : DEFAULT_TINT);
    this.aura?.material.color.copy(this.tint);
    this.rim?.color.copy(this.tint).lerp(new Color("#ffb45a"), 0.55);
  }

  /**
   * Frame the mask, and the math picture when there is one, whatever the dock's aspect: both
   * always fit with a margin. The picture sits beside the mask in a wide dock and below it in a
   * tall one. The camera eases to the new framing rather than cutting.
   */
  private fit(): void {
    if (!this.renderer || !this.camera) return;
    const width = Math.max(1, this.clientWidth), height = Math.max(1, this.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, width * height > 400_000 ? 1.5 : 2));
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    const vertical = (this.camera.fov * Math.PI) / 360;
    const horizontal = Math.atan(Math.tan(vertical) * this.camera.aspect);
    const { halfWidth, halfHeight, front } = this.frameExtent;
    let minX = -halfWidth, maxX = halfWidth, minY = -halfHeight, maxY = halfHeight;
    const timeline = this.stage?.current;
    if (timeline && this.stage) {
      const { min, max } = timeline.bounds;
      const top = max[1] + STAGE_LABEL_ROOM;
      const position = this.stage.group.position;
      if (this.camera.aspect >= 1.05) position.set(halfWidth + STAGE_GAP - min[0], -(min[1] + top) / 2, 0);
      else position.set(-(min[0] + max[0]) / 2, -halfHeight - STAGE_GAP - top, 0);
      minX = Math.min(minX, position.x + min[0]); maxX = Math.max(maxX, position.x + max[0]);
      minY = Math.min(minY, position.y + min[1]); maxY = Math.max(maxY, position.y + top);
    }
    const halfX = (maxX - minX) / 2, halfY = (maxY - minY) / 2;
    const distance = front + Math.max(halfY / Math.tan(vertical), halfX / Math.tan(horizontal));
    this.viewGoal = { x: (minX + maxX) / 2, y: (minY + maxY) / 2, distance };
    if (!this.view) this.view = { ...this.viewGoal };
    this.applyView();
  }

  private applyView(): void {
    const camera = this.camera, view = this.view;
    if (!camera || !view) return;
    camera.position.set(view.x + 0.18 * view.distance / 4.1, view.y + 0.03, view.distance);
    camera.lookAt(view.x, view.y, 0);
    camera.updateProjectionMatrix();
  }

  private easeView(delta: number, reduced: boolean): void {
    const view = this.view, goal = this.viewGoal;
    if (!view) return;
    const k = reduced ? 1 : 1 - Math.exp(-delta / VIEW_EASE);
    view.x += (goal.x - view.x) * k;
    view.y += (goal.y - view.y) * k;
    view.distance += (goal.distance - view.distance) * k;
    this.applyView();
  }

  private readonly onPointer = (event: PointerEvent): void => {
    this.pointer = { x: event.clientX, y: event.clientY, at: performance.now() };
  };

  private readonly tick = (now: number): void => {
    this.frame = requestAnimationFrame(this.tick);
    const delta = Math.min(0.1, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    if (document.hidden || !this.visibleOnScreen || !this.face || !this.renderer || !this.world || !this.camera) return;
    const reduced = reducedMotion();
    this.elapsed += delta;
    const intro = forgeIntroAt(this.elapsed, reduced);
    const drivers = embedFaceDrivers(this.current, intro.assembly);
    const speaking = (drivers.speak ?? 0) > 0;
    if (speaking && !this.speakingBefore && intro.done && !reduced) this.face.nod(0.8);
    // Reduced motion shows the finished picture at once instead of building it cube by cube.
    const math = this.stage?.update(reduced ? 3600 : delta) ?? { focus: null, completed: false };
    // The mask looks at what it is counting, and nods once the picture is complete.
    if (math.focus) {
      this.stageFocusAt = now;
      this.gaze.set(math.focus[0], math.focus[1], math.focus[2]).add(this.stage!.group.position);
    }
    if (math.completed && !reduced) this.face.nod(0.6);
    this.easeView(delta, reduced);
    this.speakingBefore = speaking;
    this.face.setDrivers({
      ...drivers,
      blink: Math.max(drivers.blink ?? 0, 1 - intro.wake),
      attention: (drivers.attention ?? 0) * intro.wake,
      ...this.gazeDrivers(now),
    });
    this.face.update(reduced ? 0.1 : delta);
    this.animateAura(delta, intro.assembly, drivers.think ?? 0, drivers.speak ?? 0, reduced);
    this.renderer.render(this.world, this.camera);
    // Each level has its own cube size, so the whole mask is measured once it stands assembled.
    if (!this.measured && intro.done && this.face.describe().build >= 0.999) this.measureFrame();
    if (!this.readyEmitted && intro.done) {
      this.readyEmitted = true;
      this.dispatchEvent(new CustomEvent("llmx-face-ready"));
    }
  };

  private measureFrame(): void {
    this.measured = true;
    const box = new Box3().setFromObject(this.face!.object);
    if (box.isEmpty()) return;
    this.frameExtent = {
      halfWidth: Math.max(Math.abs(box.min.x), Math.abs(box.max.x)) * FRAME_MARGIN,
      halfHeight: Math.max(Math.abs(box.min.y), Math.abs(box.max.y)) * FRAME_MARGIN,
      front: Math.max(0, box.max.z),
    };
    this.fit();
  }

  /** Look at the newest cube, else the pointer while it moves anywhere on the page, else the viewer. */
  private gazeDrivers(now: number): { gazeX: number; gazeY: number } {
    const camera = this.camera!;
    if (now - this.stageFocusAt < 150) {
      // A point beside the mask at its own depth is a ninety-degree glance; halfway to the viewer
      // reads as looking at something held up in front of it (the same rule as llmx-gaze).
      this.gaze.z = Math.max(this.gaze.z, camera.position.z * 0.3);
    } else if (this.pointer && now - this.pointer.at < 4000) {
      const rect = this.getBoundingClientRect();
      const ndcX = ((this.pointer.x - rect.left) / Math.max(1, rect.width)) * 2 - 1;
      const ndcY = -(((this.pointer.y - rect.top) / Math.max(1, rect.height)) * 2 - 1);
      this.gaze.set(ndcX, ndcY, 0.5).unproject(camera).sub(camera.position).normalize()
        .multiplyScalar(camera.position.length() * 0.5).add(camera.position);
    } else {
      this.gaze.copy(camera.position);
    }
    return gazeDriversToward(this.gaze, EYE_HEIGHT, POSE_LIMITS.gazeRadians);
  }

  /** The emanation: the ring breathes with thought, swells with the voice, flares on each tool. */
  private animateAura(delta: number, assembly: number, think: number, speak: number, reduced: boolean): void {
    const aura = this.aura!, rim = this.rim!;
    const sleeping = this.current.phase === "sleeping";
    const listening = this.current.phase === "listening" ? Math.min(1, this.current.level * 10) : 0;
    if (this.sparks > 0 && !reduced) {
      aura.userData.flare = 1;
      this.sparks -= 1;
    }
    const flare = aura.userData.flare = Math.max(0, (aura.userData.flare ?? 0) - delta * 1.6);
    const pulse = reduced ? 0 : 0.5 + 0.5 * Math.sin(this.elapsed * (1.4 + think * 3));
    const glow = sleeping ? 0.05 : 0.12 + think * (0.18 + 0.12 * pulse) + speak * 0.45 + listening * 0.3 + flare * 0.6;
    aura.material.opacity = Math.min(1, glow * 1.4 * assembly);
    aura.scale.setScalar(1 + speak * 0.08 + listening * 0.05 + flare * 0.35);
    rim.intensity = (sleeping ? 4 : 10 + speak * 10 + think * 6 * pulse + flare * 14) * Math.max(0.2, assembly);
  }
}

/** A radial falloff with a brighter band near the head's outline: light spilling past it. */
function haloTexture(): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const context = canvas.getContext("2d")!;
  const gradient = context.createRadialGradient(128, 128, 0, 128, 128, 128);
  gradient.addColorStop(0, "rgba(255,255,255,0.35)");
  gradient.addColorStop(0.42, "rgba(255,255,255,0.8)");
  gradient.addColorStop(0.55, "rgba(255,255,255,0.35)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 256, 256);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

if (!customElements.get("llmx-face")) customElements.define("llmx-face", LlmXFaceElement);
