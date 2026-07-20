import {
  ACESFilmicToneMapping,
  Clock,
  Color,
  CubeTexture,
  CubeTextureLoader,
  Fog,
  Texture,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PMREMGenerator,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import {
  AgentWorldRuntime,
  GRAPHYSX_AGENT_DEMO_WORLD,
  type AgentWorldDefinition,
  type GraphysXAgentWorldApi,
} from "./agent-world-runtime";
import { createAgentWorldApi } from "./agent-world-api";
import { mountBallzPlay } from "./ballz-play";
import { createOverlaySketch, type AgentWorldOverlayId, type OverlaySketch } from "./agent-world-overlay";
import { createGraphysXAgentToolBridge, type GraphysXAgentToolBridge } from "./agent-world-bridge";
import { archiveSkyboxUrls, orientArchiveCubeTexture } from "./archive-skybox";
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
}

/**
 * Standalone renderer/host for the `graphysx.agent-world/v2` scene model.
 *
 * The {@link AgentWorldRuntime} already owns its Three.js scene-graph (`group`),
 * its cannon-es physics world, behaviors, and deterministic `update(dt)` step.
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
  private readonly skyCache = new Map<string, CubeTexture>();
  private skyToken = 0;
  private roomEnvironment: Texture | null = null;
  private readonly interactive: boolean;
  private readonly autoOrbit: boolean;
  private readonly onExitEditor?: () => void;
  private readonly onExitPlay?: () => void;
  private readonly controls: OrbitControls;
  private readonly clock = new Clock();
  private readonly onResize = () => this.resize();
  private frame = 0;
  private disposed = false;
  private readonly unsubscribeEvents: () => void;
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
    this.controls.addEventListener("start", () => {
      this.controls.autoRotate = false;
      // A grab is the visitor taking the camera back; abandon any move in flight rather than
      // fighting them for it.
      this.focusMove = null;
    });

    // Neutral image-based lighting so PBR materials read well without any archive
    // skybox assets. The world still brings its own scene lights.
    const pmrem = new PMREMGenerator(this.renderer);
    this.roomEnvironment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = this.roomEnvironment;
    pmrem.dispose();

    this.world = new AgentWorldRuntime(options.world ?? GRAPHYSX_AGENT_DEMO_WORLD);
    this.scene.add(this.world.group);
    this.applyEnvironment();

    // Parity gap, closed at the source. `applyEnvironment()` was reachable from exactly three
    // places: construction, the editor's own `onEnvironmentChanged` callback, and two manual
    // calls in `main.ts`. So a HUMAN picking a sky in the inspector saw it applied, while an
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
  focusOn(point: Vector3, subjectRadius = 2, duration = 1.5): void {
    const target = point.clone();
    const distance = Math.min(46, Math.max(5.5, subjectRadius * 3.4 + 3));
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
    this.applyOverlay(environment.overlay);
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
   * Loading is async and cached per set; a scene that switches back to no sky (or swaps
   * mid-load) is protected by the token check, so a slow load can never overwrite a newer
   * selection.
   */
  private applySky(skyId: string | null): void {
    this.skyToken += 1;
    const token = this.skyToken;
    if (!skyId) {
      this.scene.environment = this.roomEnvironment;
      return;
    }
    const descriptor = this.world.listSkies().find((sky) => sky.id === skyId);
    if (!descriptor) return;

    const cached = this.skyCache.get(descriptor.id);
    if (cached) {
      this.setSkyTexture(cached, descriptor.horizonColor, token);
      return;
    }
    new CubeTextureLoader().load(
      archiveSkyboxUrls(descriptor.basePath, descriptor.extension),
      (texture) => {
        texture.colorSpace = SRGBColorSpace;
        const oriented = orientArchiveCubeTexture(texture);
        this.skyCache.set(descriptor.id, oriented);
        this.setSkyTexture(oriented, descriptor.horizonColor, token);
      },
      undefined,
      () => console.warn(`Could not load sky "${descriptor.id}" from ${descriptor.basePath}`),
    );
  }

  private setSkyTexture(texture: CubeTexture, horizonColor: string, token: number): void {
    if (this.disposed || token !== this.skyToken) return;
    this.scene.background = texture;
    // Light the scene from the sky it actually sits under.
    const pmrem = new PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromCubemap(texture).texture;
    pmrem.dispose();
    // Keep distance fog, tinted to the sky's horizon, so ground fades into the skyline
    // instead of ending at a hard plane edge. Dropping the fog here was a mistake: fog
    // does not fight a skybox, fog of the wrong colour does. The sky-path defaults sit
    // slightly deeper than the flat-background pair; a scene envelope overrides both.
    const envelope = this.world.getEnvironment().envelope;
    this.scene.fog = new Fog(horizonColor, envelope?.fogNear ?? 38, envelope?.fogFar ?? 138);
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
   * Frame the camera on the whole level when play begins.
   *
   * Until now play inherited whatever framing the previous surface left — the showroom's
   * off-axis overview, tuned for the showroom composition — so a level was seen at a
   * coincidental angle: a big one overflowed, a small one sat lost in the frame, and the ball
   * was never the subject. A game wants a deliberate, repeatable view of the board.
   *
   * Framed on `ballz-floor` rather than the world's bounding box on purpose. The floor slab is
   * exactly the play footprint; the world also contains the terrain pad and the hills beyond
   * it, and fitting those would pull the camera back until the maze was a detail. The host
   * already reads the `player` tag to know it is in a game, so reading the floor is the same
   * tier of knowledge, not a new dependency.
   */
  private frameOnPlay(): void {
    const floor = this.api.query({ ids: ["ballz-floor"] })[0];
    if (!floor) return;
    const center = new Vector3(...floor.position);
    const span = Math.max(floor.geometry.width, floor.geometry.depth);

    // Distance that fits `span` across the narrower (vertical) field of view, with margin so
    // the walls at the rim are not flush against the frame edge. The board foreshortens along
    // the view direction, so fitting the vertical extent covers the horizontal one too.
    const vfov = (this.camera.fov * Math.PI) / 180;
    const distance = (span * 0.5) / Math.tan(vfov / 2) * 1.25;

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
    this.advanceFocus(delta);
    this.controls.update();
    // Arm one shadow rebuild per frame (see `autoUpdate = false` in the constructor). The
    // first `render()` below consumes it; any nested pass a scene entity triggers reuses it.
    this.renderer.shadowMap.needsUpdate = true;
    this.renderer.render(this.scene, this.camera);
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
    this.playLayer?.();
    this.overlayCanvas.remove();
    window.removeEventListener("resize", this.onResize);
    this.editor?.dispose();
    this.bridge.dispose();
    this.controls.dispose();
    this.scene.remove(this.world.group);
    this.world.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
