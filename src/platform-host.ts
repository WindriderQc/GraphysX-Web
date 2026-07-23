import {
  ACESFilmicToneMapping,
  Clock,
  Color,
  CubeTexture,
  CubeTextureLoader,
  Fog,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PMREMGenerator,
  Scene,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderTarget,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { SMAAPass } from "three/examples/jsm/postprocessing/SMAAPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import {
  AgentWorldRuntime,
  GRAPHYSX_AGENT_DEMO_WORLD,
  type AgentWorldDefinition,
  type AgentWorldPost,
  type GraphysXAgentWorldApi,
} from "./agent-world-runtime";
import { createAgentWorldApi } from "./agent-world-api";
import { AgentWorldAudioLayer } from "./agent-world-audio";
import { mountBallzPlay } from "./ballz-play";
import { createOverlaySketch, type AgentWorldOverlayId, type OverlaySketch } from "./agent-world-overlay";
import { createGraphysXAgentToolBridge, type GraphysXAgentToolBridge } from "./agent-world-bridge";
import { orientArchiveCubeTexture } from "./archive-skybox";
import { agentWorldSkyFaceUrls } from "./agent-world-skies";
import { installPlatformTheme } from "./platform-theme";
// Type-only: the editor module (and the ~348 KB TransformControls gizmo stack it pulls in)
// is loaded on demand, so the showroom front door never pays for chrome it keeps hidden.
import type { PlatformEditor } from "./platform-editor";

/**
 * The three surfaces a scene can be shown on. They are deliberately exclusive: the same world
 * is being rendered, but what surrounds it says what the visitor is here to do.
 *
 * - `scene`  — the world on its own. No editor chrome, no HUD. The showroom and Browse Scenes.
 * - `editor` — authoring. Toolbar, scene tree, inspector, library.
 * - `play`   — a game or playground. Controls and a HUD, no authoring chrome, and a way back.
 *
 * Before this existed, playing happened *inside* the editor: a game HUD sat between a scene
 * tree and a library palette, so editing and playing looked identical. A mode is the smallest
 * thing that keeps them apart, and it stays in the host because the host owns the chrome.
 */
export type PlatformMode = "scene" | "editor" | "play";

export interface PlatformHostOptions {
  /** Initial world to render. Defaults to the built-in demonstration world. */
  world?: AgentWorldDefinition;
  /** Mount the human editing layer (toolbar, outliner, gizmo, click-select). Default true. */
  interactive?: boolean;
  /** Start with the editor chrome visible. Default true; the showroom passes false. */
  editorVisible?: boolean;
  /** Idle screensaver orbit (stops on first user interaction). Default false. */
  autoOrbit?: boolean;
  /** Called when the visitor leaves the editor, so the host page can restore the welcome. */
  onExitEditor?: () => void;
  /**
   * Called when the visitor leaves play. A level replaces the world, so "back" cannot simply
   * mean un-hiding chrome — the page has to decide what to show instead, usually the showroom.
   */
  onExitPlay?: () => void;
  /**
   * Initial camera framing. The default is a wide overview suited to the demo world; a
   * composed scene like the showroom wants its own, tighter framing.
   */
  framing?: { position: [number, number, number]; target: [number, number, number] };
  /**
   * Play an entry move on load: the camera eases from a wider, higher pose onto `framing`
   * while the exposure comes up from dark. Default false — only the front door asks for it,
   * and anything that loads straight into work (the editor, a level, a screenshot harness)
   * would be fighting it.
   *
   * Deliberately built on the same `focusMove` click-to-focus uses, so it inherits the two
   * behaviours that matter: a cubic in-out easing rather than a mechanical constant velocity,
   * and abandonment the instant the visitor grabs the camera. An intro you cannot interrupt
   * is a splash screen.
   */
  intro?: boolean;
  /**
   * Force the post stack on regardless of what the loaded scene's `environment.post` says.
   * Default false — post remains a per-scene opt-in (§4: a pass must earn its frame budget),
   * and this switch exists so a route (`?post=bloom`) or a harness can demo the pipeline on
   * scenes that never asked. A scene's own `environment.post` tuning always wins over the
   * host default when both are present.
   */
  post?: boolean;
}

/**
 * The host's demo tuning for {@link PlatformHostOptions.post} / {@link PlatformHost.setPostEnabled}.
 * Deliberately subtle: threshold 0.85 keeps ordinary lit surfaces below the bloom knee so only
 * emissives (rings, gates, beacons) glow, and strength 0.35 is a halo rather than a fog.
 */
const HOST_DEMO_POST: AgentWorldPost = { bloom: { strength: 0.35, radius: 0.4, threshold: 0.85 } };

/**
 * Standalone renderer/host for the `graphysx.agent-world/v2` scene model.
 *
 * The {@link AgentWorldRuntime} already owns its Three.js scene-graph (`group`),
 * its Rapier physics world, behaviors, and deterministic `update(dt)` step.
 * This host lends it only the four things `race-scene.ts` used to: a renderer, a
 * camera, orbit controls, and ONE animation loop. It has no dependency on the
 * 388 KB race monolith — this is the clean spine the platform runs on.
 */
export class PlatformHost {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;
  readonly world: AgentWorldRuntime;
  /** The full `window.__GRAPHYSX__` public API, wired straight to the runtime. */
  readonly api: GraphysXAgentWorldApi;
  /** The discoverable agent tool bridge over the same API. */
  readonly bridge: GraphysXAgentToolBridge;
  /**
   * The human editing layer. Null until it has been loaded — it is created eagerly when
   * the host starts with the editor visible, and lazily on {@link enterEditor} otherwise.
   * Await {@link editorReady} if you need it deterministically.
   */
  editor: PlatformEditor | null = null;

  private editorLoad: Promise<PlatformEditor | null> | null = null;
  private readonly skyCache = new Map<string, { background: CubeTexture; environmentTarget: WebGLRenderTarget }>();
  private readonly pendingSkyKeys = new Set<string>();
  private requestedSkyKey: string | null = null;
  private requestedSkyHorizon: string | null = null;
  private readonly pmremGenerator: PMREMGenerator;
  private readonly roomEnvironmentTarget: WebGLRenderTarget;
  private readonly interactive: boolean;
  private readonly autoOrbit: boolean;
  private readonly onExitEditor?: () => void;
  private readonly onExitPlay?: () => void;
  private readonly controls: OrbitControls;
  private readonly clock = new Clock();
  private readonly onResize = () => this.resize();
  /** Post stack — exists only while the scene's `environment.post` (or the host override) asks for one. */
  private composer: EffectComposer | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  private smaaPass: SMAAPass | null = null;
  private outputPass: OutputPass | null = null;
  /** Host-side post request (option / `?post=bloom` / setPostEnabled). The scene's own wins. */
  private postOverride: AgentWorldPost | null = null;
  private frame = 0;
  private disposed = false;
  private readonly unsubscribeEvents: () => void;
  /**
   * The audio half of `sound` entities: the runtime keeps a placed marker + config, this
   * layer plays it (the camera's listener and the gesture-gated AudioContext live here).
   * Synced in the one shared tick; event-driven, so it is a boolean check per frame.
   */
  readonly audio: AgentWorldAudioLayer;
  /** Teardown for the active play layer (arrow keys + HUD), when a playable world is loaded. */
  private playLayer: (() => void) | null = null;
  // The generative 2D overlay: a canvas over the WebGL canvas, drawn in the SAME tick() as the
  // 3D scene. There is deliberately no second animation loop (§5).
  private readonly overlayCanvas: HTMLCanvasElement;
  private readonly overlayCtx: CanvasRenderingContext2D | null;
  private overlaySketch: OverlaySketch | null = null;
  private overlayId: AgentWorldOverlayId | null = null;
  private overlayElapsed = 0;
  private overlayWidth = 0;
  private overlayHeight = 0;
  /** Frames the overlay has drawn — smoke proves this tracks frameCount, i.e. one shared loop. */
  private overlayFrame = 0;
  private currentMode: PlatformMode = "scene";
  /** Where to return when play ends — you came from somewhere, and should go back to it. */
  private modeBeforePlay: PlatformMode = "scene";
  /**
   * Entry move state. Only the exposure ramp lives here — the camera half is an ordinary
   * `focusMove`, so there is exactly one camera-move code path rather than two that can
   * disagree. `null` once the intro is done or was never asked for.
   */
  private intro: { elapsed: number; duration: number; fromExposure: number; toExposure: number } | null = null;
  private focusMove: {
    fromPosition: Vector3;
    toPosition: Vector3;
    fromTarget: Vector3;
    toTarget: Vector3;
    elapsed: number;
    duration: number;
  } | null = null;

  constructor(private readonly container: HTMLElement, options: PlatformHostOptions = {}) {
    // Tokens + brand font for every DOM module this host mounts. Idempotent, so the host
    // is the one place that guarantees it rather than each overlay hoping another did.
    installPlatformTheme();
    this.renderer = new WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    // Drive shadow updates from the frame loop rather than from every `render()` call.
    // A reflective water entity renders the scene a second time each frame for its mirror
    // pass, and with autoUpdate on, three rebuilds the whole shadow map for that pass too —
    // twice the shadow cost for a byte-identical result, since a shadow map is computed in
    // light space and does not depend on the camera it will be sampled from. `tick()` arms
    // it once per frame instead, so the mirror pass reuses what the main pass just rendered.
    this.renderer.shadowMap.autoUpdate = false;
    this.container.append(this.renderer.domElement);

    // The 2D overlay canvas sits directly over the 3D canvas. pointer-events:none so it never
    // intercepts a click meant for the scene; z-index below the DOM chrome (HUD is z 6+).
    this.overlayCanvas = document.createElement("canvas");
    this.overlayCanvas.className = "gx-overlay-canvas";
    Object.assign(this.overlayCanvas.style, {
      position: "absolute", left: "0", top: "0", width: "100%", height: "100%",
      pointerEvents: "none", zIndex: "1",
    });
    this.overlayCtx = this.overlayCanvas.getContext("2d");
    this.container.append(this.overlayCanvas);

    this.camera = new PerspectiveCamera(55, 1, 0.1, 260);
    this.camera.position.set(...(options.framing?.position ?? [0, 24, 34]));

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.target.set(...(options.framing?.target ?? [0, 3, 0]));
    this.controls.autoRotate = options.autoOrbit === true;
    this.controls.autoRotateSpeed = 0.6;
    if (options.intro === true) this.beginIntro();
    this.controls.addEventListener("start", () => {
      this.controls.autoRotate = false;
      // A grab is the visitor taking the camera back; abandon any move in flight rather than
      // fighting them for it.
      this.focusMove = null;
      // Explicitly, rather than inferring it from `focusMove` having gone null: the camera
      // move and the exposure ramp share a duration, and `advanceFocus` runs first, so on the
      // final frame an inferring intro would see null and call its own completion an
      // interruption. It did — the ramp finished but never recorded that it had.
      this.cancelIntro();
    });

    // Neutral image-based lighting so PBR materials read well without any archive
    // skybox assets. The world still brings its own scene lights.
    this.pmremGenerator = new PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    this.roomEnvironmentTarget = this.pmremGenerator.fromScene(room, 0.04);
    room.dispose();
    this.scene.environment = this.roomEnvironmentTarget.texture;

    this.world = new AgentWorldRuntime(options.world ?? GRAPHYSX_AGENT_DEMO_WORLD);
    this.scene.add(this.world.group);
    this.audio = new AgentWorldAudioLayer(this.camera, this.world);
    // Before the first applyEnvironment, so an opted-in host renders its very first frame
    // through the composer rather than flickering the bare path for one frame.
    if (options.post === true) this.postOverride = HOST_DEMO_POST;
    this.applyEnvironment();

    // Parity gap, closed at the source. Before this subscription, `applyEnvironment()` was
    // reached through construction and caller-owned callbacks/manual calls. So a HUMAN picking
    // a sky in the inspector saw it applied, while an
    // AGENT doing the identical thing through `api.create` / `api.load` / `levels.play()` had
    // its environment stored in the runtime and silently never rendered — the sky was in the
    // document, the inspector agreed it was selected, and the viewport showed the old one.
    // That is exactly the invariant this product is built on, failing quietly.
    //
    // Subscribing to `world.loaded` fixes it for every caller at once rather than asking each
    // one to remember. Push-based, so it costs nothing per frame.
    this.unsubscribeEvents = this.world.subscribeEvents((event) => {
      // `environment.changed` is the same fix for a second entry point: an agent editing the
      // environment through `api.transaction([{ op: "set-environment" }])` never emits
      // `world.loaded`, so without this its new sky/background would be stored and never
      // rendered — exactly the parity gap the comment above describes.
      if (event.type === "environment.changed") {
        this.applyEnvironment();
        return;
      }
      if (event.type !== "world.loaded") return;
      this.applyEnvironment();
      // A world that contains something to play IS a game, however it arrived — the human Play
      // button, an agent's levels.play(), or a stored scene. Keying on content rather than on
      // the caller is what keeps those three identical.
      if (this.api.query({ tag: "player" }).length > 0) {
        const alreadyPlaying = this.currentMode === "play";
        this.setMode("play");
        // A newly loaded world needs a FRESH play layer. setMode early-returns when the mode
        // has not changed, so replaying a level kept the previous HUD alive and its ring count
        // carried across — a brand new level opening on "1 / 1 rings · FINISH".
        if (alreadyPlaying) this.remountPlayLayer();
      } else if (this.currentMode === "play") {
        // The world was replaced by something with nothing to play. Leaving the play surface up
        // over a scene with no ball would be a mode lying about what it contains.
        this.setMode(this.modeBeforePlay);
      }
    });

    // Full human/agent parity: the same validated API + discoverable bridge the
    // legacy race-scene path exposed, now sourced straight from the runtime.
    this.api = createAgentWorldApi(this.world);
    this.bridge = createGraphysXAgentToolBridge(this.api);

    // Interactive hosts that start with the editor showing need it immediately; the
    // showroom starts hidden and defers the load until the visitor enters the editor.
    this.interactive = options.interactive !== false;
    this.autoOrbit = options.autoOrbit === true;
    this.onExitEditor = options.onExitEditor;
    this.onExitPlay = options.onExitPlay;
    // The route decides the opening surface: the showroom opens on `scene`, the editor routes
    // open on `editor`. Set directly rather than through setMode, which would early-return on
    // the initial value and skip the editor load.
    if (this.interactive && options.editorVisible !== false) {
      this.currentMode = "editor";
      this.modeBeforePlay = "editor";
      void this.editorReady();
    }

    window.addEventListener("resize", this.onResize);
    this.resize();
    this.renderer.setAnimationLoop(() => this.tick());
  }

  /** Frames rendered since construction (used by smoke tests to prove the loop runs). */
  get frameCount(): number {
    return this.frame;
  }

  /** Frames the 2D overlay has drawn. Tracks frameCount when an overlay is active — the proof
   *  that the 2D layer runs in the single shared loop rather than a second one. */
  get overlayFrameCount(): number {
    return this.overlayFrame;
  }

  /** The active overlay id, or null. */
  get activeOverlay(): AgentWorldOverlayId | null {
    return this.overlayId;
  }

  /**
   * Load the human editing layer if it isn't loaded yet. Resolves to null on a host
   * constructed with `interactive: false`. Safe to call repeatedly — one load is shared.
   */
  editorReady(): Promise<PlatformEditor | null> {
    if (!this.interactive) return Promise.resolve(null);
    this.editorLoad ??= import("./platform-editor").then(({ PlatformEditor }) => {
      if (this.disposed) return null;
      this.editor = new PlatformEditor({
        renderer: this.renderer,
        scene: this.scene,
        camera: this.camera,
        orbit: this.controls,
        world: this.world,
        api: this.api,
        container: this.container,
        onEnvironmentChanged: () => this.applyEnvironment(),
        // Only offer a way out when there is a showroom to go back to.
        onExit: this.autoOrbit ? () => this.exitEditor() : undefined,
      });
      // The editor arrives via a dynamic import, so the mode can move on while it is in flight.
      // A level played before the chunk resolved would otherwise have the authoring chrome pop
      // in on top of the running game — the editor constructs visible and knew nothing about
      // modes. Apply whatever the mode is *now*, not what it was when the load started.
      this.editor.setVisible(this.currentMode === "editor");
      return this.editor;
    });
    return this.editorLoad;
  }

  /** Reveal the editor and stop the showroom's idle orbit. */
  async enterEditor(): Promise<void> {
    this.setMode("editor");
    await this.editorReady();
  }

  /** Hide the editor and hand control back to the showroom. */
  exitEditor(): void {
    this.setMode("scene");
    this.onExitEditor?.();
  }

  /** The camera's current orbit pivot. Exposed so callers can tell that a focus landed. */
  get orbitTarget(): Vector3 {
    return this.controls.target.clone();
  }

  /** True while a {@link focusOn} move is still easing. */
  get focusing(): boolean {
    return this.focusMove !== null;
  }

  /** True while the idle screensaver orbit is running. */
  get autoRotating(): boolean {
    return this.controls.autoRotate;
  }

  /**
   * Ease the camera onto a point in the world — PRODUCT_SPEC §5's "clicking focuses the
   * camera (the recovered CubX behavior)".
   *
   * Both the orbit pivot *and* the camera position are interpolated, because moving only the
   * pivot swings the world past the viewer in a way that reads as a glitch rather than as a
   * camera move. The new position keeps the visitor's current viewing direction — the camera
   * dollies along the line it is already on rather than teleporting to a canonical angle, so
   * a focus never disorients them about which way they are facing. Distance is derived from
   * the subject's own size so a tree and a terrain ridge both end up filling a similar amount
   * of frame.
   *
   * Easing is a cubic in-out over {@link duration}: slow out, quick through the middle, slow
   * in. Constant-velocity interpolation is what makes a camera move read as mechanical.
   *
   * The idle orbit is suspended for the move and re-armed at the end, so the screensaver
   * resumes circling the *new* subject. That is the whole point of the feature — click a
   * thing and the showroom starts showing you that thing.
   */
  focusOn(point: Vector3, subjectRadius = 2, duration = 1.5, maxDistance = 46): void {
    const target = point.clone();
    // Interactive showroom focus stays capped at 46 by default. Large authored courses can
    // raise the cap explicitly so the camera does not land inside a mesh whose span is wider
    // than the showroom itself.
    const distance = Math.min(Math.max(46, maxDistance), Math.max(5.5, subjectRadius * 3.4 + 3));
    const direction = this.camera.position.clone().sub(this.controls.target);
    if (direction.lengthSq() < 1e-6) direction.set(0, 0.45, 1);
    direction.normalize();
    // Never dive below a shallow rake: the showroom's ground is a heightfield, and a focus
    // that ends underneath it shows the visitor the inside of a hill.
    if (direction.y < 0.18) direction.y = 0.18;
    direction.normalize();
    const toPosition = target.clone().addScaledVector(direction, distance);
    toPosition.y = Math.max(toPosition.y, target.y + 1.2);
    this.controls.autoRotate = false;
    this.focusMove = {
      fromPosition: this.camera.position.clone(),
      toPosition,
      fromTarget: this.controls.target.clone(),
      toTarget: target,
      elapsed: 0,
      duration: Math.max(0.15, duration),
    };
  }

  /** True while the entry move is still playing. Goes false when it lands or is interrupted. */
  get introPlaying(): boolean {
    return this.intro !== null;
  }

  /**
   * True once an entry move has run to completion. Distinct from `!introPlaying`, which is
   * also true when no intro was ever requested — a smoke needs to tell "the intro finished"
   * from "there was never an intro", and measuring camera movement from page load cannot:
   * by the time a harness has finished its setup the 2.6s move is already over.
   */
  get introCompleted(): boolean {
    return this.introDone;
  }
  private introDone = false;

  /**
   * The front-door entry move: pull back and up from the authored framing, then ease onto it
   * while the exposure comes up from near-dark.
   *
   * The start pose is derived from the framing rather than hard-coded, so a scene that chooses
   * its own framing gets an intro composed for *it* — the alternative is a fixed start pose
   * that flies through the ground in a scene framed tighter than the showroom's.
   */
  private beginIntro(): void {
    const target = this.controls.target.clone();
    const offset = this.camera.position.clone().sub(target);
    // Start wider and higher, looking at the same point. 1.7x out and 1.35x up reads as
    // "arriving at" the scene; much more and the opening frame is an empty horizon.
    const start = target.clone().add(offset.clone().multiplyScalar(1.7));
    start.y = target.y + offset.y * 1.35 + 6;
    this.camera.position.copy(start);

    const toExposure = this.renderer.toneMappingExposure;
    this.renderer.toneMappingExposure = toExposure * 0.22;
    this.intro = { elapsed: 0, duration: 2.6, fromExposure: toExposure * 0.22, toExposure };

    // The camera half is a plain focusMove, which also means a visitor grabbing the camera
    // cancels it through the existing "start" handler with no extra wiring.
    this.controls.autoRotate = false;
    this.focusMove = {
      fromPosition: start,
      toPosition: target.clone().add(offset),
      fromTarget: target.clone(),
      toTarget: target,
      elapsed: 0,
      duration: 2.6,
    };
  }

  /**
   * Abandon the entry move and restore full exposure immediately. A visitor who grabbed the
   * camera has skipped the intro; leaving the scene dimmed after that would be a bug rather
   * than a flourish. `introDone` stays false — the intro was skipped, not completed.
   */
  private cancelIntro(): void {
    if (!this.intro) return;
    this.renderer.toneMappingExposure = this.intro.toExposure;
    this.intro = null;
  }

  /** Advance the exposure ramp on its own timer. Interruption is signalled by `cancelIntro`. */
  private updateIntro(delta: number): void {
    const intro = this.intro;
    if (!intro) return;
    intro.elapsed += delta;
    const t = Math.min(1, intro.elapsed / intro.duration);
    // Quadratic ease-out: the lights come up quickly and settle, rather than staying dark for
    // half the move and then snapping.
    const eased = 1 - Math.pow(1 - t, 2);
    this.renderer.toneMappingExposure = intro.fromExposure + (intro.toExposure - intro.fromExposure) * eased;
    if (t >= 1) {
      this.renderer.toneMappingExposure = intro.toExposure;
      this.intro = null;
      this.introDone = true;
    }
  }

  /** Re-read background/sky/fog/envelope from the runtime's environment (call after env edits). */
  applyEnvironment(): void {
    const environment = this.world.getEnvironment();
    this.scene.background = new Color(environment.background);
    // The scene's envelope wins over the host defaults, which are tuned to the ~36-unit
    // showroom. The recovered archive worlds span 56–1135 units; without this a ported
    // world is fogged out or clipped by a far plane it never chose.
    const envelope = environment.envelope;
    this.scene.fog = new Fog(environment.background, envelope?.fogNear ?? 34, envelope?.fogFar ?? 130);
    const cameraFar = envelope?.cameraFar ?? 260;
    if (this.camera.far !== cameraFar) {
      this.camera.far = cameraFar;
      this.camera.updateProjectionMatrix();
    }
    this.applySky(environment.sky);
    // The scene document's request wins — it is tuned for that scene. The host override only
    // fills in when the scene is silent, so `?post=bloom` demos the stack without ever
    // overriding an author's numbers.
    this.applyPost(environment.post ?? this.postOverride);
    this.applyOverlay(environment.overlay);
  }

  /**
   * Turn the host-side post stack on or off at runtime (`window.__GRAPHYSX_HOST__.setPostEnabled(true)`
   * from a console, or any embedding page). Same precedence as the `post` option: a scene whose
   * own `environment.post` is set keeps its tuning; this only covers scenes that asked for nothing.
   */
  setPostEnabled(enabled: boolean): void {
    this.postOverride = enabled ? HOST_DEMO_POST : null;
    this.applyEnvironment();
  }

  /** True when frames are currently drawn through the composer rather than the bare renderer. */
  get postActive(): boolean {
    return this.composer !== null;
  }

  /**
   * Build, retune, or drop the post stack to match `environment.post`. Null tears the
   * composer down entirely — the bare-renderer path stays byte-identical to what it always
   * was, so a scene that never asks pays nothing (§4's frame-budget rule, applied to
   * shader passes).
   */
  private applyPost(post: AgentWorldPost | null): void {
    if (!post) {
      this.teardownComposer();
      return;
    }
    if (!this.composer) {
      const size = this.renderer.getSize(new Vector2());
      this.composer = new EffectComposer(this.renderer);
      this.composer.setPixelRatio(this.renderer.getPixelRatio());
      this.composer.setSize(size.x, size.y);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloomPass = new UnrealBloomPass(size.clone(), post.bloom.strength, post.bloom.radius, post.bloom.threshold);
      this.composer.addPass(this.bloomPass);
      // The composer renders into plain (non-multisampled) targets, so the context's own MSAA
      // is lost the moment post turns on; SMAA buys the edges back for one screen-space pass.
      // It works in linear space, so it must sit BEFORE the OutputPass (its own contract).
      this.smaaPass = new SMAAPass();
      this.composer.addPass(this.smaaPass);
      // Tone mapping + sRGB conversion move here once a composer owns the frame; without
      // this pass the composed output is linear and reads washed out.
      this.outputPass = new OutputPass();
      this.composer.addPass(this.outputPass);
    }
    if (this.bloomPass) {
      this.bloomPass.strength = post.bloom.strength;
      this.bloomPass.radius = post.bloom.radius;
      this.bloomPass.threshold = post.bloom.threshold;
    }
  }

  /** Drop the post stack and its GPU targets — `composer.dispose()` does not dispose passes. */
  private teardownComposer(): void {
    if (!this.composer) return;
    this.bloomPass?.dispose();
    this.smaaPass?.dispose();
    this.outputPass?.dispose();
    this.composer.dispose();
    this.composer = null;
    this.bloomPass = null;
    this.smaaPass = null;
    this.outputPass = null;
  }

  /** Mount the scene's 2D overlay sketch, or clear the canvas when the scene asks for none. */
  private applyOverlay(overlay: AgentWorldOverlayId | null): void {
    if (overlay === this.overlayId) return;
    this.overlayId = overlay;
    this.overlaySketch = overlay ? createOverlaySketch(overlay) : null;
    this.overlayElapsed = 0;
    // A removed overlay must leave nothing behind; a new one starts from a clean frame.
    if (this.overlayCtx) this.overlayCtx.clearRect(0, 0, this.overlayWidth, this.overlayHeight);
  }

  /**
   * Resolve `environment.sky` to a cube map. The archive's TV3D sets use a left-handed
   * face order with quarter-turned poles, so the recovered `archive-skybox` conversion
   * does the orienting — re-deriving that would be a genuine waste.
   *
   * Loading and the generated image-based lighting are cached per set. A scene that switches
   * while a load is pending records the desired cache key, so a slow response can never
   * overwrite a newer selection and an A -> B -> A sequence still reuses the one A request.
   */
  private applySky(skyId: string | null): void {
    if (!skyId) {
      this.requestedSkyKey = null;
      this.requestedSkyHorizon = null;
      this.scene.environment = this.roomEnvironmentTarget.texture;
      return;
    }
    const descriptor = this.world.listSkies().find((sky) => sky.id === skyId);
    if (!descriptor) {
      this.requestedSkyKey = null;
      this.requestedSkyHorizon = null;
      this.scene.environment = this.roomEnvironmentTarget.texture;
      return;
    }

    const faceUrls = agentWorldSkyFaceUrls(descriptor);
    // Key on the FACES, not the id. An imported set lives in the asset store, which
    // reuses an id as soon as one is freed (asset-store.mjs `uniqueId`), so a
    // remove-then-reimport legitimately puts different pixels behind the same sky id —
    // and an id-keyed cache would then render the old cubemap for the life of the tab.
    // That is the same stale-serve `media-r1` already paid for once at the HTTP layer;
    // this is the in-memory instance of it.
    const cacheKey = faceUrls.join("|");
    this.requestedSkyKey = cacheKey;
    this.requestedSkyHorizon = descriptor.horizonColor;
    const cached = this.skyCache.get(cacheKey);
    if (cached) {
      this.activateSky(cached, cacheKey);
      return;
    }
    // Do not light a newly requested sky with the previous sky while its faces are loading.
    this.scene.environment = this.roomEnvironmentTarget.texture;
    if (this.pendingSkyKeys.has(cacheKey)) return;
    this.pendingSkyKeys.add(cacheKey);
    const loader = new CubeTextureLoader();
    // Imported faces are served cross-origin from the asset store (a different port),
    // and `orientArchiveCubeTexture` rotates the poles through a 2D canvas — without
    // this the canvas is tainted and orienting throws. The store already sends
    // `access-control-allow-origin: *`, so anonymous is all that is missing. Harmless
    // for the same-origin curated sets.
    loader.setCrossOrigin("anonymous");
    loader.load(
      faceUrls,
      (texture) => {
        this.pendingSkyKeys.delete(cacheKey);
        if (this.disposed) {
          texture.dispose();
          return;
        }
        texture.colorSpace = SRGBColorSpace;
        const oriented = orientArchiveCubeTexture(texture);
        // A defensive guard for loader implementations that complete the same request twice.
        const existing = this.skyCache.get(cacheKey);
        if (existing) {
          oriented.dispose();
          this.activateSky(existing, cacheKey);
          return;
        }
        const resource = {
          background: oriented,
          environmentTarget: this.pmremGenerator.fromCubemap(oriented),
        };
        this.skyCache.set(cacheKey, resource);
        this.activateSky(resource, cacheKey);
      },
      undefined,
      () => {
        this.pendingSkyKeys.delete(cacheKey);
        console.warn(`Could not load sky "${descriptor.id}" from ${faceUrls[0]}`);
      },
    );
  }

  private activateSky(
    resource: { background: CubeTexture; environmentTarget: WebGLRenderTarget },
    cacheKey: string,
  ): void {
    if (this.disposed || cacheKey !== this.requestedSkyKey) return;
    this.scene.background = resource.background;
    this.scene.environment = resource.environmentTarget.texture;
    // Keep distance fog, tinted to the sky's horizon, so ground fades into the skyline
    // instead of ending at a hard plane edge. Dropping the fog here was a mistake: fog
    // does not fight a skybox, fog of the wrong colour does. The sky-path defaults sit
    // slightly deeper than the flat-background pair; a scene envelope overrides both.
    const envelope = this.world.getEnvironment().envelope;
    this.scene.fog = new Fog(this.requestedSkyHorizon ?? "#101820", envelope?.fogNear ?? 38, envelope?.fogFar ?? 138);
  }

  /**
   * Mount the play layer when the loaded world contains something to play, drop it when it does
   * not. Keyed on a `player`-tagged entity rather than on "was levels.play() called", so the
   * human Play button, an agent's api.levels.play(), and a stored scene loaded from the browser
   * all behave identically — a level is playable because of what it contains, not how it arrived.
   */
  /** The surface currently shown. */
  get mode(): PlatformMode {
    return this.currentMode;
  }

  /**
   * Switch surfaces. Each mode owns a definite answer for every piece of chrome, so modes
   * cannot half-apply — the bug this replaces was a HUD mounted on top of the editor because
   * nothing was responsible for saying "playing means the authoring chrome is gone".
   */
  setMode(mode: PlatformMode): void {
    if (this.disposed || mode === this.currentMode) return;
    if (mode === "play") this.modeBeforePlay = this.currentMode;
    this.currentMode = mode;

    // Idle orbit is a screensaver for an unattended scene; it fights both authoring and play.
    this.controls.autoRotate = this.autoOrbit && mode === "scene";

    // Re-check the mode when the load resolves rather than assuming it still wants the editor:
    // the same race, from the other direction.
    if (mode === "editor") void this.editorReady().then((editor) => editor?.setVisible(this.currentMode === "editor"));
    else this.editor?.setVisible(false);

    this.playLayer?.();
    this.playLayer = null;
    if (mode === "play") this.remountPlayLayer();
  }

  /** Tear down and rebuild the play layer against whatever world is loaded right now. */
  private remountPlayLayer(): void {
    this.playLayer?.();
    this.playLayer = this.currentMode === "play"
      ? mountBallzPlay(this.api, this.container, () => this.exitPlay())
      : null;
    if (this.currentMode === "play") this.frameOnPlay();
  }

  /**
   * Frame the camera on the authored play footprint when play begins.
   *
   * Grid levels already expose `ballz-floor`. Composed games do not: World 1, Skybox Spiral,
   * and Great Slide have entirely different geometry, so hard-coding the grid slab left them
   * at the showroom camera. A hidden ordinary box tagged `playfield` is the scene-native answer:
   * its centre and width/depth describe what should fit, without teaching the host any course
   * ids or waiting for async model bounds. Existing grid levels remain the fallback.
   */
  private frameOnPlay(): void {
    const floor = this.api.query({ tag: "playfield" })[0] ?? this.api.query({ ids: ["ballz-floor"] })[0];
    if (!floor) return;
    const center = new Vector3(...floor.position);
    const width = floor.geometry.width * floor.scale[0];
    const depth = floor.geometry.depth * floor.scale[2];

    // Fit each authored axis against the field of view it actually occupies. The previous
    // single-span calculation fit a 58×18 slide's width into the *vertical* FOV, shrinking the
    // course to a strip in the middle of a widescreen view.
    const vfov = (this.camera.fov * Math.PI) / 180;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * this.camera.aspect);
    const distance = Math.max(
      (width * 0.5) / Math.tan(hfov / 2),
      (depth * 0.5) / Math.tan(vfov / 2),
    ) * 1.18;

    // One consistent game angle: from +z and well above, looking down the board. A fixed
    // direction is the point — every level opens the same way, so the control scheme (up = away)
    // always matches what the player sees.
    const direction = new Vector3(0, 0.82, 0.9).normalize();
    const toPosition = center.clone().addScaledVector(direction, distance);

    this.controls.autoRotate = false;
    this.focusMove = {
      fromPosition: this.camera.position.clone(),
      toPosition,
      fromTarget: this.controls.target.clone(),
      toTarget: center,
      elapsed: 0,
      duration: 0.9,
    };
  }

  /** Leave play and go back where you came from. */
  exitPlay(): void {
    if (this.currentMode !== "play") return;
    this.setMode(this.modeBeforePlay);
    this.onExitPlay?.();
  }

  private tick(): void {
    if (this.disposed) return;
    const delta = this.clock.getDelta();
    // Freeze simulation while the gizmo is dragging (matches the reference behavior).
    if (!this.editor?.isTransforming()) this.world.update(delta);
    this.audio.sync();
    this.advanceFocus(delta);
    // After advanceFocus, so an intro whose camera move landed (or was grabbed away) this
    // frame settles the exposure in the same frame rather than a frame late.
    this.updateIntro(delta);
    this.controls.update();
    // Arm one shadow rebuild per frame (see `autoUpdate = false` in the constructor). The
    // first `render()` below consumes it; any nested pass a scene entity triggers reuses it.
    this.renderer.shadowMap.needsUpdate = true;
    // One render call either way — the composer's RenderPass is the same scene/camera
    // draw, followed by the passes the scene opted into.
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
    // The 2D layer draws in THIS frame, right after the 3D render — one shared loop, never a
    // second rAF. It is the last thing composited, so it sits over the scene.
    if (this.overlaySketch && this.overlayCtx && this.overlayWidth > 0) {
      this.overlayElapsed += delta;
      this.overlaySketch.draw(this.overlayCtx, delta, this.overlayElapsed, this.overlayWidth, this.overlayHeight);
      this.overlayFrame += 1;
    }
    this.frame += 1;
  }

  /**
   * Drive one frame of the focus move, ahead of `controls.update()` so orbit damping smooths
   * the hand-off instead of being overwritten by it.
   *
   * Headless software GL runs this loop at a few fps, so the move is advanced by elapsed
   * *time*, not by frame count — at 3 fps it still completes in 1.5 seconds rather than
   * taking half a minute.
   */
  private advanceFocus(delta: number): void {
    const move = this.focusMove;
    if (!move) return;
    move.elapsed += delta;
    const t = Math.min(1, move.elapsed / move.duration);
    const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    this.camera.position.lerpVectors(move.fromPosition, move.toPosition, eased);
    this.controls.target.lerpVectors(move.fromTarget, move.toTarget, eased);
    if (t >= 1) {
      this.focusMove = null;
      this.controls.autoRotate = this.autoOrbit && !this.editor?.isVisible();
    }
  }

  private resize(): void {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(width, height, false);
    this.composer?.setSize(width, height);
    this.camera.aspect = width / height || 1;
    this.camera.updateProjectionMatrix();
    // Match the overlay buffer to the viewport at device resolution, then scale the context so
    // sketches draw in CSS pixels and stay crisp on hi-dpi. A resize reseeds size-derived state.
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.overlayCanvas.width = Math.round(width * dpr);
    this.overlayCanvas.height = Math.round(height * dpr);
    this.overlayWidth = width;
    this.overlayHeight = height;
    if (this.overlayCtx) {
      this.overlayCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.overlayCtx.clearRect(0, 0, width, height);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.renderer.setAnimationLoop(null);
    this.unsubscribeEvents();
    this.audio.dispose();
    this.playLayer?.();
    this.overlayCanvas.remove();
    window.removeEventListener("resize", this.onResize);
    this.editor?.dispose();
    this.bridge.dispose();
    this.controls.dispose();
    this.teardownComposer();
    this.scene.background = null;
    this.scene.environment = null;
    for (const resource of this.skyCache.values()) {
      resource.environmentTarget.dispose();
      resource.background.dispose();
    }
    this.skyCache.clear();
    this.pendingSkyKeys.clear();
    this.roomEnvironmentTarget.dispose();
    this.pmremGenerator.dispose();
    this.scene.remove(this.world.group);
    this.world.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
