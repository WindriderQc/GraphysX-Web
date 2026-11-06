import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  Group,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
  Vector3,
  type Material,
  type Object3D,
} from "three";
import {
  MATH_BOARD,
  MATH_FIELD,
  mathLayout,
  mathScope,
  type MathFunctionsScene,
  type MathLayout,
  type MathPolyline,
} from "./llmx-math-functions";

/**
 * The Math Game look for `agentx.math-scene.v2` functions inside `<llmx-stage>`: the recovered
 * screen's backdrop board, green grid and three axes (x #f95f4c, y #ffe86b, z #78f0d0, from
 * `archive-math-lab.ts`), a molecule field riding every function, and one bright curve per
 * function on the front plane for precise reading. Driven by the element's frame loop.
 */
const K = Object.freeze({
  background: "#060817",
  board: "#0b2233",
  boardEdge: "#9fd7ff",
  grid: "#2bd67b",
  axisX: "#f95f4c",
  axisY: "#ffe86b",
  axisZ: "#78f0d0",
  text: "#dceaf5",
  /** Back lanes fade toward this, so the field reads as depth. */
  far: "#101a33",
});
const BUILD_SECONDS = 1.1;
const RISE_SECONDS = 0.35;
const CURVE_WIDTH = 0.03;
const LABEL_HEIGHT = 0.13;
const AXIS = 0.014;

export class MathFunctionStage {
  readonly group = new Group();
  private readonly fixed = new Group();
  private readonly dynamic = new Group();
  private readonly molecules: InstancedMesh;
  private scene: MathFunctionsScene | null = null;
  private values: Record<string, number> = {};
  private layout: MathLayout | null = null;
  private clock = 0;
  private finished = false;
  private readonly matrix = new Matrix4();
  private readonly position = new Vector3();
  private readonly scale = new Vector3();
  private readonly rotation = new Quaternion();
  private readonly color = new Color();
  private readonly far = new Color(K.far);
  private curveMaterials: MeshBasicMaterial[] = [];

  constructor() {
    this.group.name = "LlmXMathFunctions";
    this.group.visible = false;
    const { width: W, height: H, depth: D } = MATH_BOARD;
    // The instrument board behind the field, as on the recovered screen.
    const board = new Mesh(new PlaneGeometry(W + 0.5, H + 0.4), new MeshStandardMaterial({
      color: K.board, emissive: "#0d2a3d", emissiveIntensity: 0.7, roughness: 0.6, metalness: 0.2,
    }));
    board.position.set(0, 0, -D / 2 - 0.18);
    this.fixed.add(board);
    const edge = new LineSegments(rectangle(W + 0.5, H + 0.4, -D / 2 - 0.17),
      new LineBasicMaterial({ color: K.boardEdge, transparent: true, opacity: 0.55 }));
    this.fixed.add(edge);
    const size = (W / MATH_FIELD.columns) * 0.72;
    const count = (MATH_FIELD.columns + 1) * MATH_FIELD.lanes;
    this.molecules = new InstancedMesh(new BoxGeometry(size, size, size),
      new MeshStandardMaterial({ roughness: 0.4, metalness: 0.18, emissive: new Color("#0a1424") }), count);
    this.molecules.name = "MathMolecules";
    this.molecules.frustumCulled = false;
    this.group.add(this.fixed, this.molecules, this.dynamic);
  }

  get active(): boolean { return this.scene !== null; }
  get current(): MathFunctionsScene | null { return this.scene; }
  get currentValues(): Readonly<Record<string, number>> { return this.values; }
  get currentLayout(): MathLayout | null { return this.layout; }
  static get background(): string { return K.background; }

  show(scene: MathFunctionsScene, animate: boolean): void {
    this.scene = scene;
    this.values = mathScope(scene);
    this.clock = animate ? 0 : BUILD_SECONDS + RISE_SECONDS;
    this.finished = false;
    this.group.visible = true;
    this.rebuild();
    this.update(0);
  }

  /** New, already validated parameter values: the field and curves follow at once. */
  setValues(values: Readonly<Record<string, number>>): void {
    if (!this.scene) return;
    this.values = mathScope(this.scene, values);
    this.rebuild();
    this.writeMolecules();
  }

  clear(): void {
    this.scene = null;
    this.layout = null;
    this.group.visible = false;
    disposeChildren(this.dynamic);
  }

  /** Advance the build. Returns true on the frame the picture is complete. */
  update(delta: number): boolean {
    if (!this.scene) return false;
    this.clock += delta;
    if (this.clock <= BUILD_SECONDS + RISE_SECONDS + delta) this.writeMolecules();
    const fade = Math.max(0, Math.min(1, (this.clock - BUILD_SECONDS * 0.5) / 0.4));
    for (const material of this.curveMaterials) material.opacity = 0.96 * fade;
    const completed = !this.finished && this.clock >= BUILD_SECONDS + RISE_SECONDS;
    if (completed) this.finished = true;
    return completed;
  }

  private rebuild(): void {
    const scene = this.scene;
    if (!scene) return;
    const layout = mathLayout(scene, this.values);
    this.layout = layout;
    disposeChildren(this.dynamic);
    this.curveMaterials = [];
    const { width: W, height: H, depth: D } = MATH_BOARD;
    const front = D / 2 + 0.005, back = -D / 2 - 0.17;

    // Grid: on the board at every tick, and on the floor under the field.
    const grid: number[] = [];
    for (const tick of layout.xTicks) grid.push(tick.at, -H / 2, back, tick.at, H / 2, back, tick.at, -H / 2, back, tick.at, -H / 2, front);
    for (const tick of layout.yTicks) grid.push(-W / 2, tick.at, back, W / 2, tick.at, back);
    for (let k = 0; k <= 4; k += 1) {
      const z = back + (front - back) * k / 4;
      grid.push(-W / 2, -H / 2, z, W / 2, -H / 2, z);
    }
    this.dynamic.add(segments(grid, K.grid, 0.34));

    // The three axes, through zero when zero is in view, along the edge otherwise.
    this.dynamic.add(bar([W, AXIS, AXIS], [0, layout.axisY, front], K.axisX));
    this.dynamic.add(bar([AXIS, H, AXIS], [layout.axisX, 0, front], K.axisY));
    this.dynamic.add(bar([AXIS, AXIS, D + 0.35], [layout.axisX, layout.axisY, 0], K.axisZ));

    scene.functions.forEach((fn, index) => {
      const material = new MeshBasicMaterial({ color: fn.color, transparent: true, opacity: 0, side: DoubleSide, depthWrite: false });
      this.curveMaterials.push(material);
      for (const line of layout.curves[index]) this.dynamic.add(new Mesh(ribbon(line, CURVE_WIDTH, front + 0.002 * index), material));
      const at = layout.labelAt[index];
      if (at) {
        const label = textSprite(fn.label, fn.color, LABEL_HEIGHT * 1.1);
        label.position.set(Math.min(W / 2 + 0.05, at[0] + 0.06) + label.scale.x / 2, at[1] + 0.07, front + 0.02);
        this.dynamic.add(label);
      }
    });

    // Tick numbers along the front edges, and the axis letters.
    for (const tick of layout.xTicks) {
      const label = textSprite(tick.text, K.text, LABEL_HEIGHT);
      label.position.set(tick.at, -H / 2 - 0.13, front);
      this.dynamic.add(label);
    }
    for (const tick of layout.yTicks) {
      const label = textSprite(tick.text, K.text, LABEL_HEIGHT);
      label.position.set(-W / 2 - 0.06 - label.scale.x / 2, tick.at, front);
      this.dynamic.add(label);
    }
    const xLetter = textSprite("x", K.axisX, LABEL_HEIGHT * 1.2);
    xLetter.position.set(W / 2 + 0.12, layout.axisY - 0.1, front);
    const yLetter = textSprite("y", K.axisY, LABEL_HEIGHT * 1.2);
    yLetter.position.set(layout.axisX + 0.1, H / 2 + 0.08, front);
    this.dynamic.add(xLetter, yLetter);

    const lanes = MATH_FIELD.lanes;
    layout.molecules.forEach((molecule, index) => {
      this.color.set(scene.functions[molecule.fn].color).lerp(this.far, 0.55 * (1 - molecule.lane / Math.max(1, lanes - 1)));
      this.molecules.setColorAt(index, this.color);
    });
    if (this.molecules.instanceColor) this.molecules.instanceColor.needsUpdate = true;
  }

  /** Molecules rise from the floor column by column while building, then sit on their curve. */
  private writeMolecules(): void {
    const layout = this.layout;
    if (!layout) return;
    const floor = -MATH_BOARD.height / 2, columns = MATH_FIELD.columns + 1;
    layout.molecules.forEach((molecule, index) => {
      const column = index % columns;
      const start = (column / columns) * BUILD_SECONDS;
      const k = Math.max(0, Math.min(1, (this.clock - start) / RISE_SECONDS));
      const e = 1 - Math.pow(1 - k, 3);
      if (!molecule.position || k <= 0) {
        this.scale.setScalar(0.0001);
        this.position.set(0, floor, 0);
      } else {
        const [x, y, z] = molecule.position;
        this.position.set(x, floor + (y - floor) * e, z);
        this.scale.setScalar(Math.max(0.0001, e));
      }
      this.matrix.compose(this.position, this.rotation, this.scale);
      this.molecules.setMatrixAt(index, this.matrix);
    });
    this.molecules.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    disposeChildren(this.dynamic);
    disposeChildren(this.fixed);
    this.molecules.geometry.dispose();
    (this.molecules.material as Material).dispose();
  }
}

function rectangle(width: number, height: number, z: number): BufferGeometry {
  const w = width / 2, h = height / 2;
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array([
    -w, -h, z, w, -h, z, w, -h, z, w, h, z, w, h, z, -w, h, z, -w, h, z, -w, -h, z,
  ]), 3));
  return geometry;
}

function segments(points: number[], color: string, opacity: number): LineSegments {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(points), 3));
  return new LineSegments(geometry, new LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
}

function bar(size: [number, number, number], at: [number, number, number], color: string): Mesh {
  const mesh = new Mesh(new BoxGeometry(...size), new MeshBasicMaterial({ color }));
  mesh.position.set(...at);
  return mesh;
}

/** A flat strip of constant width along a front-plane polyline (WebGL lines are one pixel wide). */
function ribbon(line: MathPolyline, width: number, z: number): BufferGeometry {
  const positions: number[] = [], indices: number[] = [];
  const half = width / 2;
  for (let i = 0; i < line.length; i += 1) {
    const previous = line[Math.max(0, i - 1)], next = line[Math.min(line.length - 1, i + 1)];
    let dx = next[0] - previous[0], dy = next[1] - previous[1];
    const length = Math.hypot(dx, dy) || 1;
    dx /= length; dy /= length;
    positions.push(line[i][0] - dy * half, line[i][1] + dx * half, z, line[i][0] + dy * half, line[i][1] - dx * half, z);
    if (i > 0) {
      const a = (i - 1) * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  geometry.setIndex(indices);
  return geometry;
}

function textSprite(text: string, color: string, height: number): Sprite {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  const font = "600 56px system-ui, sans-serif";
  let width = 64;
  if (context) {
    context.font = font;
    width = Math.max(64, Math.ceil(context.measureText(text).width) + 24);
  }
  canvas.width = width;
  canvas.height = 80;
  if (context) {
    context.font = font;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillStyle = color;
    context.shadowColor = "rgba(0, 0, 0, 0.7)";
    context.shadowBlur = 6;
    context.fillText(text, width / 2, 42);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const sprite = new Sprite(new SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  sprite.scale.set(height * (width / 80), height, 1);
  return sprite;
}

function disposeChildren(group: Group): void {
  for (const child of [...group.children] as Object3D[]) {
    group.remove(child);
    const mesh = child as Mesh;
    mesh.geometry?.dispose();
    const material = (mesh.material ?? null) as (Material & { map?: { dispose(): void } | null }) | null;
    material?.map?.dispose();
    material?.dispose();
  }
}
