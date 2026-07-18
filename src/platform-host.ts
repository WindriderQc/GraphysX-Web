import {
  ACESFilmicToneMapping,
  Clock,
  Color,
  Fog,
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
import { PlatformEditor } from "./platform-editor";

export interface PlatformHostOptions {
  /** Initial world to render. Defaults to the built-in demonstration world. */
  world?: AgentWorldDefinition;
  /** Mount the human editing layer (toolbar, outliner, gizmo, click-select). Default true. */
  interactive?: boolean;
  /** Start with the editor chrome visible. Default true; the showroom passes false. */
  editorVisible?: boolean;
  /** Idle screensaver orbit (stops on first user interaction). Default false. */
  autoOrbit?: boolean;
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
  /** The human editing layer (null when constructed with `interactive: false`). */
  readonly editor: PlatformEditor | null;

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
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    this.world = new AgentWorldRuntime(options.world ?? GRAPHYSX_AGENT_DEMO_WORLD);
    this.scene.add(this.world.group);
    this.applyEnvironment();

    // Full human/agent parity: the same validated API + discoverable bridge the
    // legacy race-scene path exposed, now sourced straight from the runtime.
    this.api = createAgentWorldApi(this.world);
    this.bridge = createGraphysXAgentToolBridge(this.api);

    this.editor = options.interactive === false
      ? null
      : new PlatformEditor({
          renderer: this.renderer,
          scene: this.scene,
          camera: this.camera,
          orbit: this.controls,
          world: this.world,
          api: this.api,
          container: this.container,
          onEnvironmentChanged: () => this.applyEnvironment(),
        });
    if (this.editor && options.editorVisible === false) this.editor.setVisible(false);

    window.addEventListener("resize", this.onResize);
    this.resize();
    this.renderer.setAnimationLoop(() => this.tick());
  }

  /** Frames rendered since construction (used by smoke tests to prove the loop runs). */
  get frameCount(): number {
    return this.frame;
  }

  /** Reveal the editor and stop the showroom's idle orbit. */
  enterEditor(): void {
    this.controls.autoRotate = false;
    this.editor?.setVisible(true);
  }

  /** Re-read background/fog from the runtime's environment (call after env edits). */
  applyEnvironment(): void {
    const environment = this.world.getEnvironment();
    this.scene.background = new Color(environment.background);
    this.scene.fog = new Fog(environment.background, 34, 130);
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
