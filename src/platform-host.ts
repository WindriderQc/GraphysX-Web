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
import { createGraphysXAgentToolBridge, type GraphysXAgentToolBridge } from "./agent-world-bridge";
import { archiveSkyboxUrls, orientArchiveCubeTexture } from "./archive-skybox";
// Type-only: the editor module (and the ~348 KB TransformControls gizmo stack it pulls in)
// is loaded on demand, so the showroom front door never pays for chrome it keeps hidden.
import type { PlatformEditor } from "./platform-editor";

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
  private readonly controls: OrbitControls;
  private readonly clock = new Clock();
  private readonly onResize = () => this.resize();
  private frame = 0;
  private disposed = false;
  private focusMove: {
    fromPosition: Vector3;
    toPosition: Vector3;
    fromTarget: Vector3;
    toTarget: Vector3;
    elapsed: number;
    duration: number;
  } | null = null;

  constructor(private readonly container: HTMLElement, options: PlatformHostOptions = {}) {
    this.renderer = new WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    this.container.append(this.renderer.domElement);

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

    // Full human/agent parity: the same validated API + discoverable bridge the
    // legacy race-scene path exposed, now sourced straight from the runtime.
    this.api = createAgentWorldApi(this.world);
    this.bridge = createGraphysXAgentToolBridge(this.api);

    // Interactive hosts that start with the editor showing need it immediately; the
    // showroom starts hidden and defers the load until the visitor enters the editor.
    this.interactive = options.interactive !== false;
    this.autoOrbit = options.autoOrbit === true;
    this.onExitEditor = options.onExitEditor;
    if (this.interactive && options.editorVisible !== false) void this.editorReady();

    window.addEventListener("resize", this.onResize);
    this.resize();
    this.renderer.setAnimationLoop(() => this.tick());
  }

  /** Frames rendered since construction (used by smoke tests to prove the loop runs). */
  get frameCount(): number {
    return this.frame;
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
      return this.editor;
    });
    return this.editorLoad;
  }

  /** Reveal the editor and stop the showroom's idle orbit. */
  async enterEditor(): Promise<void> {
    this.controls.autoRotate = false;
    const editor = await this.editorReady();
    editor?.setVisible(true);
  }

  /** Hide the editor and hand control back to the showroom. */
  exitEditor(): void {
    this.editor?.setVisible(false);
    this.controls.autoRotate = this.autoOrbit;
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

  /** Re-read background/sky/fog from the runtime's environment (call after env edits). */
  applyEnvironment(): void {
    const environment = this.world.getEnvironment();
    this.scene.background = new Color(environment.background);
    this.scene.fog = new Fog(environment.background, 34, 130);
    this.applySky(environment.sky);
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
    // does not fight a skybox, fog of the wrong colour does.
    this.scene.fog = new Fog(horizonColor, 38, 138);
  }

  private tick(): void {
    if (this.disposed) return;
    const delta = this.clock.getDelta();
    // Freeze simulation while the gizmo is dragging (matches the reference behavior).
    if (!this.editor?.isTransforming()) this.world.update(delta);
    this.advanceFocus(delta);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
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
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.renderer.setAnimationLoop(null);
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
