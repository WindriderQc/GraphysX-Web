import {
  BoxGeometry, BufferGeometry, Group, Line, LineBasicMaterial, Mesh, MeshStandardMaterial,
  Matrix4, Vector3, type InstancedMesh, type Material, type Object3D, type SkinnedMesh, type Texture, type WebGLRenderer,
} from "three";
import { XRControllerModelFactory } from "three/examples/jsm/webxr/XRControllerModelFactory.js";
import { XRHandModelFactory } from "three/examples/jsm/webxr/XRHandModelFactory.js";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { XRHandSpace, WebXRSpaceEventMap } from "three";
import { ControllerHandModel, controllerThumbTargets } from "./controller-hand";
import { styleHandSurface } from "./hand-surface";

/** Same-origin assets. See scripts/vendor-xr-models.mjs and the bundled MIT notice. */
export const XR_ASSETS = [
  "/assets/xr/profiles/profilesList.json",
  "/assets/xr/profiles/generic-trigger/profile.json",
  "/assets/xr/profiles/generic-trigger/controller.gltf",
  "/assets/xr/profiles/generic-hand/left.glb",
  "/assets/xr/profiles/generic-hand/right.glb",
  "/assets/xr/profiles/oculus-touch-v3/profile.json",
  "/assets/xr/profiles/oculus-touch-v3/left.glb",
  "/assets/xr/profiles/oculus-touch-v3/right.glb",
  "/assets/xr/profiles/LICENSE.md",
];
export interface VrInputAction {
  action: "select" | "grab";
  phase: "start" | "end";
  source: XRInputSource;
  handedness: XRHandedness;
  /** World-space transform via getWorldPosition/getWorldQuaternion. Never index = handedness. */
  anchor: Object3D;
  ray: Object3D;
  /** Lost tracking/source/visibility/session is a cancel, never a throw. */
  cancelled: boolean;
}
export interface VrInputSlot {
  source: XRInputSource | null;
  ray: ReturnType<WebGLRenderer["xr"]["getController"]>;
  grip: ReturnType<WebGLRenderer["xr"]["getControllerGrip"]>;
  hand: XRHandSpace;
  anchor: Group;
  beam: Line;
  modelRoot: Group | null;
  fallback: Mesh;
  selecting: boolean;
  grabbing: boolean;
  modelReady: boolean;
  controllerHand: ControllerHandModel | null;
}

export function disposeVrObject(root: Object3D): void {
  const resources = new Set<{ dispose(): void }>();
  root.traverse((object) => {
    const mesh = object as Mesh;
    if (mesh.geometry) resources.add(mesh.geometry);
    const instances = object as InstancedMesh;
    if (instances.isInstancedMesh) resources.add(instances); // Releases instance buffers as well.
    const skinned = object as SkinnedMesh;
    if (skinned.isSkinnedMesh) resources.add(skinned.skeleton);
    const materials: Material[] = mesh.material ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) : [];
    for (const material of materials) {
      resources.add(material);
      for (const value of Object.values(material)) {
        if ((value as Texture | null)?.isTexture) resources.add(value);
      }
    }
  });
  for (const resource of resources) resource.dispose();
  root.removeFromParent();
}

/** The upstream factory throws from its loader error callback. Retain our visible fallback instead. */
class FallbackModelLoader extends GLTFLoader {
  override load(url: string, onLoad: (gltf: GLTF) => void, onProgress?: (event: ProgressEvent) => void): void {
    try { super.load(url, onLoad, onProgress, () => { /* Tracked primitives remain usable. */ }); }
    catch { /* A missing local origin (e.g. Node input tests) also retains the fallback. */ }
  }
}

/** One pair of native spaces for this renderer's lifetime, updated by its existing XR frame loop. */
export class VrInputRig {
  readonly group = new Group();
  readonly slots: VrInputSlot[] = [];
  private active = false;
  private disposed = false;
  private readonly cleanups: (() => void)[] = [];
  private readonly point = new Vector3();
  private readonly onAction: (event: VrInputAction) => void;
  private readonly profilesPath: string;

  constructor(renderer: WebGLRenderer, onAction: (event: VrInputAction) => void,
    profilesPath = `${import.meta.env?.BASE_URL ?? "/"}assets/xr/profiles`) {
    this.onAction = onAction;
    this.profilesPath = profilesPath;
    this.group.name = "GraphysX XR input";
    for (let index = 0; index < 2; index++) {
      const ray = renderer.xr.getController(index);
      const grip = renderer.xr.getControllerGrip(index);
      const hand = renderer.xr.getHand(index);
      const anchor = new Group();
      const beam = new Line(new BufferGeometry().setFromPoints([new Vector3(), new Vector3(0,0,-1)]),
        new LineBasicMaterial({ color: index ? "#bfa9ff" : "#6df3ce" }));
      beam.scale.z = 4; beam.visible = false; ray.add(beam);
      const fallback = new Mesh(new BoxGeometry(.045,.10,.05),new MeshStandardMaterial({color:"#6df3ce",roughness:.5}));
      fallback.position.y = -.025; grip.add(fallback);
      this.group.add(ray,grip,hand,anchor);
      const slot: VrInputSlot = { source:null,ray,grip,hand,anchor,beam,modelRoot:null,fallback,selecting:false,grabbing:false,modelReady:false,controllerHand:null };
      this.slots.push(slot);
      const connect = (event: {data:XRInputSource}) => this.connect(slot,event.data);
      const disconnect = () => this.disconnect(slot);
      const selectStart = () => { if (slot.source?.hand) this.action(slot,"grab",true); else this.action(slot,"select",true); };
      const selectEnd = () => { if (slot.source?.hand) this.action(slot,"grab",false); else this.action(slot,"select",false); };
      const grabStart = () => { if (!slot.source?.hand) this.action(slot,"grab",true); };
      const grabEnd = () => { if (!slot.source?.hand) this.action(slot,"grab",false); };
      ray.addEventListener("connected",connect); ray.addEventListener("disconnected",disconnect);
      ray.addEventListener("selectstart",selectStart); ray.addEventListener("selectend",selectEnd);
      ray.addEventListener("squeezestart",grabStart); ray.addEventListener("squeezeend",grabEnd);
      this.cleanups.push(() => {
        ray.removeEventListener("connected",connect); ray.removeEventListener("disconnected",disconnect);
        ray.removeEventListener("selectstart",selectStart); ray.removeEventListener("selectend",selectEnd);
        ray.removeEventListener("squeezestart",grabStart); ray.removeEventListener("squeezeend",grabEnd);
      });
    }
    this.group.visible = false;
  }

  setActive(active: boolean): void {
    if (!active) this.cancel();
    this.active = active;
    this.group.visible = active;
  }

  cancel(): void {
    for (const slot of this.slots) {
      this.action(slot,"select",false,true);
      this.action(slot,"grab",false,true);
    }
  }

  private action(slot: VrInputSlot, action: VrInputAction["action"], start: boolean, cancelled = false): void {
    const key = action === "select" ? "selecting" : "grabbing";
    if (!slot.source || slot[key] === start || (start && (!this.active || !this.tracked(slot)))) return;
    slot[key] = start;
    this.updateAnchor(slot);
    // A native release may arrive before our next shared-frame update detects pose loss.
    // Never let that event turn the last known grip pose into an intentional throw.
    const interrupted = !start && (cancelled || !this.active || !this.tracked(slot));
    this.onAction({action,phase:start ? "start" : "end",source:slot.source,handedness:slot.source.handedness,
      anchor:slot.anchor,ray:slot.ray,cancelled:interrupted});
  }

  private connect(slot: VrInputSlot, source: XRInputSource): void {
    this.disconnect(slot);
    if (this.disposed) return;
    slot.source = source;
    slot.fallback.visible = !source.hand;
    // Each connection has an isolated factory surrogate. Late loads cannot attach to a
    // replacement source, and upstream disconnect/load races never mutate a reused model.
    const proxy = new Group<WebXRSpaceEventMap>();
    slot.modelRoot = proxy;
    if (source.hand) {
      Object.assign(proxy,{joints:slot.hand.joints});
      const model = new XRHandModelFactory().createHandModel(proxy,"spheres");
      proxy.add(model); slot.hand.add(proxy);
      proxy.dispatchEvent({type:"connected",data:source});
      // Three r179 writes at original indices and assumes all joint spaces exist.
      // Compact native poses directly so missing spaces cannot throw or draw stale joints.
      const primitive = model.motionController as unknown as { handMesh: InstancedMesh; joints: (keyof XRHandSpace["joints"])[]; updateMesh(): void };
      const matrix = new Matrix4();
      const scale = new Vector3();
      primitive.updateMesh = () => {
        let count = 0;
        primitive.joints.forEach(name => {
          const joint = slot.hand.joints[name];
          if (!joint?.visible) return;
          matrix.compose(joint.position,joint.quaternion,scale.setScalar(joint.jointRadius || .008));
          primitive.handMesh.setMatrixAt(count++,matrix);
        });
        primitive.handMesh.count = count;
        primitive.handMesh.instanceMatrix.needsUpdate = true;
      };
      model.name = "Tracked joint fallback";
      if (source.handedness === "left" || source.handedness === "right") {
        this.addHandSurface(slot, source, proxy, model, primitive.joints);
      }
      slot.modelReady = true;
    } else if (source.gamepad?.mapping === "xr-standard" && source.targetRayMode === "tracked-pointer") {
      const factory = new XRControllerModelFactory(new FallbackModelLoader(),controller => {
        if (this.disposed || slot.modelRoot !== proxy) { disposeVrObject(proxy); return; }
        slot.modelReady = true; slot.fallback.visible = false;
        if ((model.motionController as { id?: string } | null)?.id === "oculus-touch-v3" && (source.handedness === "left" || source.handedness === "right")) {
          this.addControllerHand(slot, source.handedness, proxy, controller);
        }
      }).setPath(this.profilesPath);
      const model = factory.createControllerModel(proxy);
      proxy.add(model); slot.grip.add(proxy);
      proxy.dispatchEvent({type:"connected",data:source});
    }
  }

  private addControllerHand(slot: VrInputSlot, side: "left" | "right", proxy: Group, controller: Object3D): void {
    const targets = controllerThumbTargets(controller, slot.grip, side);
    new FallbackModelLoader().setPath(`${this.profilesPath}/generic-hand/`).load(`${side}.glb`, gltf => {
      if (this.disposed || slot.modelRoot !== proxy) { disposeVrObject(gltf.scene); return; }
      const object = gltf.scene.children[0];
      styleHandSurface(object);
      slot.controllerHand = new ControllerHandModel(object, side, targets);
      proxy.add(object);
    });
  }

  private addHandSurface(slot: VrInputSlot, source: XRInputSource, proxy: Group<WebXRSpaceEventMap>,
    fallback: Object3D, joints: (keyof XRHandSpace["joints"])[]): void {
    let surface: Object3D | null = null;
    // Supplying a loader bypasses Three's CDN default; its path must be set explicitly.
    const loader = new FallbackModelLoader().setPath(`${this.profilesPath}/generic-hand/`);
    const model = new XRHandModelFactory(loader, object => {
      if (this.disposed || slot.modelRoot !== proxy) { disposeVrObject(object); return; }
      surface = object;
      surface.visible = false;
      surface.name = "Translucent tracked hand";
      styleHandSurface(surface);
    }).createHandModel(proxy,"mesh");
    model.name = "Tracked hand surface";
    proxy.add(model);
    // The primitive already received this event before the surface factory was added.
    // Its factory ignores repeated connections once its motion controller exists.
    proxy.dispatchEvent({type:"connected",data:source});
    const controller = model.motionController;
    const updateMesh = controller.updateMesh.bind(controller);
    controller.updateMesh = () => {
      // Upstream retains invisible bones' last pose. Never draw that stale finger as tracked.
      const complete = !!surface && slot.hand.visible && joints.every(name => slot.hand.joints[name]?.visible);
      if (surface) surface.visible = complete;
      fallback.visible = !complete;
      if (complete) updateMesh();
    };
  }

  private disconnect(slot: VrInputSlot): void {
    this.action(slot,"select",false,true); this.action(slot,"grab",false,true);
    if (slot.modelRoot) disposeVrObject(slot.modelRoot);
    slot.modelRoot = null; slot.source = null; slot.modelReady = false; slot.controllerHand = null;
    slot.beam.visible = false; slot.fallback.visible = false;
  }

  private tracked(slot: VrInputSlot): boolean {
    if (slot.source?.hand) return slot.hand.visible && !!slot.hand.joints["index-finger-tip"]?.visible && !!slot.hand.joints["thumb-tip"]?.visible;
    return slot.ray.visible && slot.grip.visible;
  }

  private updateAnchor(slot: VrInputSlot): void {
    if (slot.source?.hand) {
      const index = slot.hand.joints["index-finger-tip"];
      const thumb = slot.hand.joints["thumb-tip"];
      if (!index || !thumb) return;
      index.getWorldPosition(slot.anchor.position);
      slot.anchor.position.lerp(thumb.getWorldPosition(this.point),.5);
      this.group.worldToLocal(slot.anchor.position);
      slot.anchor.quaternion.copy(index.quaternion);
    } else {
      slot.anchor.position.copy(slot.grip.position);
      slot.anchor.quaternion.copy(slot.grip.quaternion);
    }
    slot.anchor.updateMatrixWorld(true);
  }

  update(seconds = 1 / 60): void {
    for (const slot of this.slots) {
      const tracked = !!slot.source && this.active && this.tracked(slot);
      slot.beam.visible = tracked && slot.ray.visible;
      if (!tracked) {
        this.action(slot,"select",false,true); this.action(slot,"grab",false,true);
      } else this.updateAnchor(slot);
      if (this.active && slot.source?.gamepad) slot.controllerHand?.update(slot.source.gamepad, seconds);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true; this.setActive(false);
    for (const cleanup of this.cleanups) cleanup();
    for (const slot of this.slots) {
      this.disconnect(slot); disposeVrObject(slot.beam); disposeVrObject(slot.fallback);
      slot.ray.removeFromParent(); slot.grip.removeFromParent(); slot.hand.removeFromParent();
    }
    this.group.removeFromParent();
  }
}
