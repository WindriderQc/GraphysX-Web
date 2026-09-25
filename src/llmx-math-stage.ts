import {
  BoxGeometry,
  CanvasTexture,
  Color,
  Group,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
  Vector3,
} from "three";
import {
  MATH_CUBE,
  MATH_LIMITS,
  mathCubeAt,
  mathFocusAt,
  mathLabelAt,
  type MathTimeline,
} from "./llmx-math-scene";

/** Operand colours: the mask's own cyan for the first number, forge amber for the second. */
const GROUP_COLORS = Object.freeze({ a: new Color("#60d6e8"), b: new Color("#f0b35a") });
/** Counting alternates the shade of each ten, so a child can count the rods themselves. */
const ALTERNATE_TEN = new Color("#3f9fb3");
const LABEL_HEIGHT = 0.34;

/**
 * The math picture beside the docked mask: up to a hundred cubes in one instanced mesh and a
 * label sprite. Driven by the element's frame loop through {@link update}; no loop of its own.
 */
export class MathStage {
  readonly group = new Group();
  private readonly mesh: InstancedMesh;
  private readonly label: Sprite;
  private readonly labelCanvas = document.createElement("canvas");
  private readonly labelTexture: CanvasTexture;
  private timeline: MathTimeline | null = null;
  private clock = 0;
  private labelText = "";
  private finished = false;
  private readonly matrix = new Matrix4();
  private readonly position = new Vector3();
  private readonly scale = new Vector3();
  private readonly rotation = new Quaternion();

  constructor() {
    this.group.name = "LlmXMathStage";
    this.group.visible = false;
    const material = new MeshStandardMaterial({ roughness: 0.42, metalness: 0.18, emissive: new Color("#0b1c22") });
    this.mesh = new InstancedMesh(new BoxGeometry(MATH_CUBE, MATH_CUBE, MATH_CUBE), material, MATH_LIMITS.countMax);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.group.add(this.mesh);
    this.labelCanvas.width = 512;
    this.labelCanvas.height = 128;
    this.labelTexture = new CanvasTexture(this.labelCanvas);
    this.labelTexture.colorSpace = SRGBColorSpace;
    this.label = new Sprite(new SpriteMaterial({ map: this.labelTexture, transparent: true, depthWrite: false }));
    this.label.scale.set(LABEL_HEIGHT * 4, LABEL_HEIGHT, 1);
    this.group.add(this.label);
  }

  get active(): boolean { return this.timeline !== null; }
  get current(): MathTimeline | null { return this.timeline; }

  show(timeline: MathTimeline): void {
    this.timeline = timeline;
    this.clock = 0;
    this.finished = false;
    this.labelText = "\u0000";
    this.mesh.count = timeline.cubes.length;
    const counting = timeline.scene.kind === "count";
    timeline.cubes.forEach((cube, index) => this.mesh.setColorAt(index,
      counting && Math.floor(index / 10) % 2 === 1 ? ALTERNATE_TEN : GROUP_COLORS[cube.group]));
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    const { min, max } = timeline.bounds;
    this.label.position.set((min[0] + max[0]) / 2, max[1] + LABEL_HEIGHT * 0.9, 0);
    this.group.visible = true;
    this.update(0);
  }

  clear(): void {
    this.timeline = null;
    this.mesh.count = 0;
    this.group.visible = false;
  }

  /**
   * Advance the picture. Returns the stage-local point worth looking at (null when nothing is
   * happening) and whether the picture completed on this frame.
   */
  update(delta: number): { focus: readonly [number, number, number] | null; completed: boolean } {
    const timeline = this.timeline;
    if (!timeline) return { focus: null, completed: false };
    this.clock += delta;
    const t = this.clock;
    timeline.cubes.forEach((cube, index) => {
      const state = mathCubeAt(cube, t);
      this.position.set(...state.position);
      const s = state.visible ? Math.max(0.0001, state.scale) : 0.0001;
      this.scale.set(s, s, s);
      this.matrix.compose(this.position, this.rotation, this.scale);
      this.mesh.setMatrixAt(index, this.matrix);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
    const text = mathLabelAt(timeline, t);
    if (text !== this.labelText) this.drawLabel(text);
    const completed = !this.finished && t >= timeline.duration;
    if (completed) this.finished = true;
    return { focus: mathFocusAt(timeline, t), completed };
  }

  private drawLabel(text: string): void {
    this.labelText = text;
    const context = this.labelCanvas.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, this.labelCanvas.width, this.labelCanvas.height);
    context.font = "600 88px system-ui, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillStyle = "#edf8ff";
    context.shadowColor = "rgba(96, 214, 232, 0.55)";
    context.shadowBlur = 18;
    context.fillText(text, this.labelCanvas.width / 2, this.labelCanvas.height / 2 + 4);
    this.labelTexture.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as MeshStandardMaterial).dispose();
    this.labelTexture.dispose();
    this.label.material.dispose();
  }
}
