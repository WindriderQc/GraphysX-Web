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
    this.camera.position.set(0, 24, 34);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.target.set(0, 3, 0);
    this.controls.autoRotate = options.autoOrbit === true;
    this.controls.autoRotateSpeed = 0.6;
    this.controls.addEventListener("start", () => {
      this.controls.autoRotate = false;
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
      this.setSkyTexture(cached, token);
      return;
    }
    new CubeTextureLoader().load(
      archiveSkyboxUrls(descriptor.basePath, descriptor.extension),
      (texture) => {
        texture.colorSpace = SRGBColorSpace;
        const oriented = orientArchiveCubeTexture(texture);
        this.skyCache.set(descriptor.id, oriented);
        this.setSkyTexture(oriented, token);
      },
      undefined,
      () => console.warn(`Could not load sky "${descriptor.id}" from ${descriptor.basePath}`),
    );
  }

  private setSkyTexture(texture: CubeTexture, token: number): void {
    if (this.disposed || token !== this.skyToken) return;
    this.scene.background = texture;
    // Light the scene from the sky it actually sits under.
    const pmrem = new PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromCubemap(texture).texture;
    pmrem.dispose();
    // A sky reads as open space; distance fog would fight it.
    this.scene.fog = null;
  }

  private tick(): void {
    if (this.disposed) return;
    const delta = this.clock.getDelta();
    // Freeze simulation while the gizmo is dragging (matches the reference behavior).
    if (!this.editor?.isTransforming()) this.world.update(delta);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.frame += 1;
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
