import { Matrix4, Quaternion, Vector3, type Bone, type Mesh, type Object3D, type SkinnedMesh } from "three";

type ThumbTarget = "raised" | "stick" | "primary" | "secondary" | "rest";
export type ControllerThumbTargets = Record<Exclude<ThumbTarget, "raised">, Vector3>;
export type ControllerHandInput = { trigger: number; grip: number; indexTouch: boolean; thumb: ThumbTarget; x: number; y: number; thumbPress: number };
const finiteUnit = (value: number | undefined): number => Number.isFinite(value) ? Math.max(0, Math.min(1, value!)) : 0;
const axis = (value: number | undefined): number => Number.isFinite(value) ? Math.max(-1, Math.min(1, value!)) : 0;

/** Quest 2's registered xr-standard layout. No joint tracking is inferred from these inputs. */
export function readControllerHandInput(pad: Gamepad): ControllerHandInput {
  const button = (index: number) => pad.buttons[index];
  const touch = (index: number) => !!button(index)?.touched || !!button(index)?.pressed || finiteUnit(button(index)?.value) > 0;
  const x = axis(pad.axes[2]), y = axis(pad.axes[3]);
  const thumb: ThumbTarget = touch(4) ? "primary" : touch(5) ? "secondary"
    : touch(3) || Math.abs(x) + Math.abs(y) > .08 ? "stick" : touch(6) ? "rest" : "raised";
  const thumbIndex = thumb === "primary" ? 4 : thumb === "secondary" ? 5 : thumb === "stick" ? 3 : 6;
  return { trigger: finiteUnit(button(0)?.value), grip: finiteUnit(button(1)?.value), indexTouch: touch(0),
    thumb, x, y, thumbPress: finiteUnit(button(thumbIndex)?.value) };
}

/** Contact positions come from the real controller meshes, in its native grip space. */
export function controllerThumbTargets(controller: Object3D, grip: Object3D, side: "left" | "right"): ControllerThumbTargets {
  controller.updateWorldMatrix(true, true);
  const inverse = grip.matrixWorld.clone().invert();
  const contact = (name: string): Vector3 => {
    const mesh = controller.getObjectByName(name) as Mesh | undefined;
    if (!mesh?.geometry) throw new Error(`Missing Touch control mesh: ${name}`);
    mesh.geometry.computeBoundingBox();
    return mesh.geometry.boundingBox!.getCenter(new Vector3()).applyMatrix4(mesh.matrixWorld)
      .applyMatrix4(inverse).add(new Vector3(0, .006, -.004));
  };
  return { stick: contact("thumbstick"), primary: contact(side === "left" ? "x_button" : "a_button"),
    secondary: contact(side === "left" ? "y_button" : "b_button"), rest: new Vector3(side === "right" ? -.022 : .022, .012, -.003) };
}

type Joint = { bone: Bone; bind: Matrix4; local: Matrix4; current: Matrix4; scale: Vector3 };
const fingerNames = (finger: string) => ["metacarpal", "phalanx-proximal", "phalanx-intermediate", "phalanx-distal", "tip"].map(part => `${finger}-finger-${part}`);

/** Cosmetic avatar only: follows the grip and animates from buttons, never emits XR actions. */
export class ControllerHandModel {
  readonly joints = new Map<string, Joint>();
  private readonly fingers: Joint[][];
  private readonly thumb: Joint[];
  private readonly thumbLengths: number[];
  private readonly thumbPoints: Vector3[];
  private readonly thumbOpen: Vector3[];
  private readonly thumbRotations: Quaternion[];
  private readonly wrist = new Matrix4();
  private readonly bend = new Matrix4();
  private readonly rotation = new Quaternion();
  private readonly direction = new Vector3();
  private readonly originalDirection = new Vector3();
  private readonly target = new Vector3();
  private readonly thumbGoal = new Vector3();
  private readonly root = new Vector3();
  private readonly thumbDelta = new Quaternion();
  private index = 0;
  private grip = .82;
  private initialized = false;

  constructor(readonly object: Object3D, side: "left" | "right", private readonly targets: ControllerThumbTargets) {
    const skin = object.getObjectByProperty("type", "SkinnedMesh") as SkinnedMesh | undefined;
    if (!skin) throw new Error("Controller avatar requires a skinned hand");
    const wristIndex = skin.skeleton.bones.findIndex(bone => bone.name === "wrist");
    if (wristIndex < 0) throw new Error("Controller avatar has no wrist");
    const wristInverse = skin.skeleton.boneInverses[wristIndex];
    skin.skeleton.bones.forEach((bone, index) => {
      const bind = skin.skeleton.boneInverses[index].clone().invert().premultiply(wristInverse);
      this.joints.set(bone.name, { bone, bind, local: bind.clone(), current: new Matrix4(),
        scale: new Vector3() });
    });
    const chain = (names: string[]) => names.map((name, index) => {
      const joint = this.joints.get(name);
      if (!joint) throw new Error(`Controller avatar has no ${name}`);
      const parent = index ? this.joints.get(names[index - 1])!.bind : new Matrix4();
      joint.local.copy(parent).invert().multiply(joint.bind);
      return joint;
    });
    this.fingers = ["index", "middle", "ring", "pinky"].map(finger => chain(fingerNames(finger)));
    this.thumb = chain(["thumb-metacarpal", "thumb-phalanx-proximal", "thumb-phalanx-distal", "thumb-tip"]);
    this.thumbOpen = this.thumb.map(() => new Vector3());
    this.thumbPoints = this.thumb.map(() => new Vector3());
    this.thumbRotations = this.thumb.map(() => new Quaternion());
    this.thumbLengths = this.thumb.slice(1).map((joint, index) => {
      const a = new Vector3().setFromMatrixPosition(joint.bind);
      return a.distanceTo(new Vector3().setFromMatrixPosition(this.thumb[index].bind));
    });
    const sign = side === "right" ? 1 : -1;
    this.wrist.makeRotationZ(-sign * Math.PI / 2).setPosition(sign * .047, -.045, .105);
    // Align the palm with the sloped Touch handle, keeping the trigger contact as pivot.
    this.wrist.premultiply(new Matrix4().makeTranslation(0, -.026, -.026)
      .multiply(new Matrix4().makeRotationX(-.95)).multiply(new Matrix4().makeTranslation(0, .026, .026)));
    this.object.name = "Controller-driven hand";
    this.object.userData.poseSource = "controller-gamepad";
    this.object.userData.handedness = side;
    this.update({ buttons: [], axes: [] } as unknown as Gamepad, 0);
  }

  update(pad: Gamepad, seconds: number): void {
    const input = readControllerHandInput(pad);
    const dt = Number.isFinite(seconds) ? Math.max(0, Math.min(.1, seconds)) : 0;
    const blend = this.initialized ? 1 - Math.exp(-20 * dt) : 1;
    const index = input.indexTouch ? .82 + .18 * input.trigger : input.trigger;
    this.index += (index - this.index) * blend;
    this.grip += (.82 + .18 * input.grip - this.grip) * blend;
    const wrist = this.joints.get("wrist")!;
    wrist.current.copy(this.wrist); this.apply(wrist);
    const indexProximal = .03 + .40 * this.index, indexIntermediate = .04 + .76 * this.index, indexDistal = .02 + .38 * this.index;
    const graspProximal = .3 + .6 * this.grip, graspIntermediate = .55 + .75 * this.grip, graspDistal = .2 + .6 * this.grip;
    this.fingers.forEach((chain, finger) => {
      chain.forEach((joint, segment) => {
        const parent = segment ? chain[segment - 1].current : this.wrist;
        joint.current.copy(parent).multiply(joint.local);
        if (segment > 0 && segment < 4) {
          const curl = finger === 0 ? (segment === 1 ? indexProximal : segment === 2 ? indexIntermediate : indexDistal)
            : (segment === 1 ? graspProximal : segment === 2 ? graspIntermediate : graspDistal);
          joint.current.multiply(this.bend.makeRotationX(-curl));
        }
        this.apply(joint);
      });
    });
    this.thumb.forEach((joint, index) => {
      joint.current.copy(this.wrist).multiply(joint.bind);
      joint.current.decompose(this.thumbOpen[index], this.thumbRotations[index], joint.scale);
      this.thumbPoints[index].copy(this.thumbOpen[index]);
    });
    if (input.thumb === "raised") this.target.copy(this.thumbOpen[3]);
    else {
      this.target.copy(this.targets[input.thumb]);
      if (input.thumb === "stick") { this.target.x += input.x * .004; this.target.z += input.y * .004; }
      this.target.y -= input.thumbPress * .002;
    }
    if (!this.initialized) this.thumbGoal.copy(this.target);
    else this.thumbGoal.lerp(this.target, blend);
    this.poseThumb(this.thumbGoal);
    this.object.userData.thumbTarget = input.thumb;
    this.initialized = true;
  }

  private apply(joint: Joint): void {
    joint.current.decompose(joint.bone.position, joint.bone.quaternion, joint.bone.scale);
  }

  /** FABRIK preserves thumb segment lengths while reaching the touched control. */
  private poseThumb(goal: Vector3): void {
    const points = this.thumbPoints, lengths = this.thumbLengths;
    this.root.copy(points[0]);
    this.target.copy(goal);
    const reach = lengths.reduce((sum, length) => sum + length, 0);
    this.direction.copy(this.target).sub(this.root);
    if (this.direction.length() > reach) this.target.copy(this.root).add(this.direction.setLength(reach - .0001));
    for (let iteration = 0; iteration < 6; iteration++) {
      points[3].copy(this.target);
      for (let i = 2; i >= 0; i--) {
        this.direction.subVectors(points[i], points[i + 1]).setLength(lengths[i]);
        points[i].copy(points[i + 1]).add(this.direction);
      }
      points[0].copy(this.root);
      for (let i = 1; i < 4; i++) {
        this.direction.subVectors(points[i], points[i - 1]).setLength(lengths[i - 1]);
        points[i].copy(points[i - 1]).add(this.direction);
      }
    }
    this.thumb.forEach((joint, index) => {
      const segment = Math.min(index, 2);
      this.originalDirection.subVectors(this.thumbOpen[segment + 1], this.thumbOpen[segment]).normalize();
      this.direction.subVectors(points[segment + 1], points[segment]).normalize();
      this.thumbDelta.setFromUnitVectors(this.originalDirection, this.direction);
      this.rotation.copy(this.thumbDelta).multiply(this.thumbRotations[index]);
      joint.bone.position.copy(points[index]); joint.bone.quaternion.copy(this.rotation);
      joint.bone.scale.copy(joint.scale);
    });
  }
}
