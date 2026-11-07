import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
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
  mathSurfaceLayout,
  type MathLayout,
  type MathMolecule,
  type MathPlotScene,
  type MathPolyline,
  type MathSurfaceLayout,
  type MathSurfacesScene,
} from "./llmx-math-functions";

/**
 * The Math Game look for `agentx.math-scene.v2`/`v3`/`v4` inside `<llmx-stage>`: the recovered
 * screen's backdrop board, green grid and three axes (x #f95f4c, y #ffe86b, z #78f0d0, from
 * the archive Math Game screen, retired 2026-11-07 for the Math Lab page), a molecule field riding every function, and one bright curve per
 * function on the front plane for precise reading. v3 adds, on the same plane, each derivative as a
 * dashed curve in its function's colour, light blue areas down to the x axis, and white tangents with
 * their point of contact. v4 adds parametric curves on the same plane, and surfaces z = f(x, y): a
 * lit surface in a box with its grid, axes and a molecule field riding it. Driven by the element's
 * frame loop.
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
  tangent: "#f4f7fb",
  /** Areas: the board edge's light blue, so a shaded area stands out from its own function's molecules. */
  area: "#9fd7ff",
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
  private scene: MathPlotScene | null = null;
  private values: Record<string, number> = {};
  private layout: MathLayout | null = null;
  private surfaceLayout: MathSurfaceLayout | null = null;
  /** The molecules shown and the height they rise from. */
  private field: readonly MathMolecule[] = [];
  private floor = -MATH_BOARD.height / 2;
  private clock = 0;
  private finished = false;
  private readonly matrix = new Matrix4();
  private readonly position = new Vector3();
  private readonly scale = new Vector3();
  private readonly rotation = new Quaternion();
  private readonly color = new Color();
  private readonly far = new Color(K.far);
  /** Materials that fade in with the build, each with its final opacity. */
  private fades: [Material, number][] = [];

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
  get current(): MathPlotScene | null { return this.scene; }
  get currentValues(): Readonly<Record<string, number>> { return this.values; }
  /** The functions board's layout, or null while surfaces are shown. */
  get currentLayout(): MathLayout | null { return this.layout; }
  /** The surfaces' layout, or null while the functions board is shown. */
  get currentSurfaceLayout(): MathSurfaceLayout | null { return this.surfaceLayout; }
  static get background(): string { return K.background; }

  show(scene: MathPlotScene, animate: boolean): void {
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
    this.surfaceLayout = null;
    this.field = [];
    this.group.visible = false;
    disposeChildren(this.dynamic);
  }

  /** Advance the build. Returns true on the frame the picture is complete. */
  update(delta: number): boolean {
    if (!this.scene) return false;
    this.clock += delta;
    if (this.clock <= BUILD_SECONDS + RISE_SECONDS + delta) this.writeMolecules();
    const fade = Math.max(0, Math.min(1, (this.clock - BUILD_SECONDS * 0.5) / 0.4));
    for (const [material, opacity] of this.fades) material.opacity = opacity * fade;
    const completed = !this.finished && this.clock >= BUILD_SECONDS + RISE_SECONDS;
    if (completed) this.finished = true;
    return completed;
  }

  private rebuild(): void {
    const scene = this.scene;
    if (!scene) return;
    disposeChildren(this.dynamic);
    this.fades = [];
    if (scene.kind === "surfaces") { this.rebuildSurfaces(scene); return; }
    const layout = mathLayout(scene, this.values);
    this.layout = layout;
    this.surfaceLayout = null;
    this.fixed.visible = true;
    this.field = layout.molecules;
    this.floor = -MATH_BOARD.height / 2;
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

    // Areas first, behind the curves: from each curve down (or up) to the x axis between the bounds.
    // The molecules behind carry the function's colour, so the fill has its own; the ends keep the function's.
    layout.areas.forEach(area => {
      const color = scene.functions[area.fn].color, material = this.fading(K.area, 0.42), edge = this.fading(color, 0.96);
      for (const band of area.bands) {
        this.dynamic.add(new Mesh(strip(band, front - 0.004), material));
        for (const [x, top, bottom] of [band[0], band[band.length - 1]]) {
          if (Math.abs(top - bottom) > 1e-6) this.dynamic.add(new Mesh(ribbon([[x, bottom], [x, top]], CURVE_WIDTH * 0.5, front - 0.002), edge));
        }
      }
    });

    scene.functions.forEach((fn, index) => {
      const material = this.fading(fn.color, 0.96);
      for (const line of layout.curves[index]) this.dynamic.add(new Mesh(ribbon(line, CURVE_WIDTH, front + 0.002 * index), material));
      const at = layout.labelAt[index];
      if (at) {
        const label = textSprite(fn.label, fn.color, LABEL_HEIGHT * 1.1);
        label.position.set(Math.min(W / 2 + 0.05, at[0] + 0.06) + label.scale.x / 2, at[1] + 0.07, front + 0.02);
        this.dynamic.add(label);
      }
    });

    scene.derivatives.forEach((row, index) => {
      const color = scene.functions[row.fn].color, material = this.fading(color, 0.96);
      for (const line of layout.derivativeCurves[index]) {
        for (const dash of dashes(line)) this.dynamic.add(new Mesh(ribbon(dash, CURVE_WIDTH * 0.8, front + 0.01 + 0.002 * index), material));
      }
      const at = layout.derivativeLabelAt[index];
      if (at) {
        const label = textSprite(row.label, color, LABEL_HEIGHT * 1.1);
        label.position.set(Math.min(W / 2 + 0.05, at[0] + 0.06) + label.scale.x / 2, at[1] + 0.07, front + 0.02);
        this.dynamic.add(label);
      }
    });

    // v4 parametric curves, on the same plane as the functions, in the colours that follow theirs.
    scene.curves.forEach((curve, index) => {
      const material = this.fading(curve.color, 0.96);
      for (const line of layout.curveLines[index]) this.dynamic.add(new Mesh(ribbon(line, CURVE_WIDTH, front + 0.006 + 0.002 * index), material));
      const at = layout.curveLabelAt[index];
      if (at) {
        const label = textSprite(curve.label, curve.color, LABEL_HEIGHT * 1.1);
        label.position.set(Math.min(W / 2 + 0.05, at[0] + 0.06) + label.scale.x / 2, at[1] + 0.07, front + 0.02);
        this.dynamic.add(label);
      }
    });

    // Tangents over everything: the line, then a ringed dot where it touches the curve.
    for (const tangent of layout.tangents) {
      if (tangent.segment) {
        this.dynamic.add(new Mesh(ribbon([tangent.segment[0], tangent.segment[1]], CURVE_WIDTH * 0.7, front + 0.018), this.fading(K.tangent, 0.95)));
      }
      if (tangent.point) {
        const ring = new Mesh(new CircleGeometry(0.052, 24), this.fading(K.tangent, 1));
        const dot = new Mesh(new CircleGeometry(0.034, 24), this.fading(scene.functions[tangent.fn].color, 1));
        ring.position.set(tangent.point[0], tangent.point[1], front + 0.022);
        dot.position.set(tangent.point[0], tangent.point[1], front + 0.024);
        this.dynamic.add(ring, dot);
      }
    }

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

    const lanes = MATH_FIELD.lanes, colors = [...scene.functions, ...scene.curves].map(row => row.color);
    this.paintField(molecule => this.color.set(colors[molecule.fn]).lerp(this.far, 0.55 * (1 - molecule.lane / Math.max(1, lanes - 1))));
  }

  /** Surfaces in their box: grid on the floor and the two far walls, axes, the lit surfaces with a wire mesh, ticks and names. */
  private rebuildSurfaces(scene: MathSurfacesScene): void {
    const layout = mathSurfaceLayout(scene, this.values);
    this.surfaceLayout = layout;
    this.layout = null;
    this.fixed.visible = false;
    this.field = layout.molecules;
    const { width: W, height: H, depth: D } = layout.box, floor = -H / 2;
    this.floor = floor;

    const grid: number[] = [];
    for (const tick of layout.xTicks) grid.push(tick.at, floor, -D / 2, tick.at, floor, D / 2, tick.at, floor, -D / 2, tick.at, H / 2, -D / 2);
    for (const tick of layout.yTicks) grid.push(-W / 2, floor, tick.at, W / 2, floor, tick.at, -W / 2, floor, tick.at, -W / 2, H / 2, tick.at);
    for (const tick of layout.zTicks) grid.push(-W / 2, tick.at, -D / 2, W / 2, tick.at, -D / 2, -W / 2, tick.at, -D / 2, -W / 2, tick.at, D / 2);
    this.dynamic.add(segments(grid, K.grid, 0.26));
    const edges = [
      -W / 2, floor, -D / 2, W / 2, floor, -D / 2, W / 2, floor, -D / 2, W / 2, floor, D / 2, W / 2, floor, D / 2, -W / 2, floor, D / 2,
      -W / 2, floor, D / 2, -W / 2, floor, -D / 2, -W / 2, floor, -D / 2, -W / 2, H / 2, -D / 2, W / 2, floor, -D / 2, W / 2, H / 2, -D / 2,
      -W / 2, floor, D / 2, -W / 2, H / 2, D / 2,
    ];
    this.dynamic.add(segments(edges, K.boardEdge, 0.4));

    // The axes through zero when it is in view: x across, y going away, z up.
    const [ox, oy, oz] = layout.origin;
    this.dynamic.add(bar([W, AXIS, AXIS], [0, oy, oz], K.axisX));
    this.dynamic.add(bar([AXIS, AXIS, D], [ox, oy, 0], K.axisY));
    this.dynamic.add(bar([AXIS, H, AXIS], [ox, 0, oz], K.axisZ));

    const n = layout.grid, row = n + 1, low = new Color(K.far), high = new Color(), shade = new Color();
    scene.surfaces.forEach((surface, fn) => {
      const points = layout.grids[fn];
      const positions = new Float32Array(row * row * 3), colors = new Float32Array(row * row * 3), indices: number[] = [];
      high.set(surface.color);
      points.forEach((point, k) => {
        if (!point) return;
        positions.set(point, k * 3);
        // Lower is darker, so the shape reads even before the surface is turned.
        shade.copy(low).lerp(high, 0.35 + 0.65 * ((point[1] - floor) / H));
        colors.set([shade.r, shade.g, shade.b], k * 3);
      });
      for (let j = 0; j < n; j += 1) for (let i = 0; i < n; i += 1) {
        const a = j * row + i, b = a + 1, c = a + row, d = c + 1;
        if (points[a] && points[b] && points[c]) indices.push(a, b, c);
        if (points[b] && points[d] && points[c]) indices.push(b, d, c);
      }
      const geometry = new BufferGeometry();
      geometry.setAttribute("position", new BufferAttribute(positions, 3));
      geometry.setAttribute("color", new BufferAttribute(colors, 3));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      const material = new MeshStandardMaterial({ vertexColors: true, side: DoubleSide, transparent: true, opacity: 0, roughness: 0.55,
        metalness: 0.08, emissive: surface.color, emissiveIntensity: 0.12, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
      this.fades.push([material, 0.88]);
      this.dynamic.add(new Mesh(geometry, material));

      // A wire mesh every few grid lines, in the surface's colour, for reading the shape.
      const wire: number[] = [];
      for (let j = 0; j <= n; j += 4) for (let i = 0; i < n; i += 1) {
        const a = points[j * row + i], b = points[j * row + i + 1];
        if (a && b) wire.push(...a, ...b);
      }
      for (let i = 0; i <= n; i += 4) for (let j = 0; j < n; j += 1) {
        const a = points[j * row + i], b = points[(j + 1) * row + i];
        if (a && b) wire.push(...a, ...b);
      }
      const lines = segments(wire, surface.color, 0);
      this.fades.push([lines.material as Material, 0.7]);
      this.dynamic.add(lines);

      // The name beside the highest point of the far edge, where it is not hidden by the surface.
      let best: readonly [number, number, number] | null = null;
      for (let i = 0; i <= n; i += 1) {
        const point = points[n * row + i];
        if (point && (!best || point[1] > best[1])) best = point;
      }
      best ??= points.find(point => point) ?? null;
      if (best) {
        const label = textSprite(surface.label, surface.color, LABEL_HEIGHT * 1.15);
        label.position.set(best[0], Math.min(H / 2 + 0.12, best[1] + 0.16 + 0.18 * fn), best[2]);
        this.dynamic.add(label);
      }
    });

    for (const tick of layout.xTicks) {
      const label = textSprite(tick.text, K.text, LABEL_HEIGHT);
      label.position.set(tick.at, floor - 0.06, D / 2 + 0.16);
      this.dynamic.add(label);
    }
    for (const tick of layout.yTicks) {
      const label = textSprite(tick.text, K.text, LABEL_HEIGHT);
      label.position.set(W / 2 + 0.1 + label.scale.x / 2, floor - 0.06, tick.at);
      this.dynamic.add(label);
    }
    for (const tick of layout.zTicks) {
      const label = textSprite(tick.text, K.text, LABEL_HEIGHT);
      label.position.set(-W / 2 - 0.08 - label.scale.x / 2, tick.at, -D / 2);
      this.dynamic.add(label);
    }
    const letters: [string, string, [number, number, number]][] = [
      ["x", K.axisX, [W / 2 + 0.22, oy, oz]], ["y", K.axisY, [ox, oy, -D / 2 - 0.22]], ["z", K.axisZ, [ox, H / 2 + 0.16, oz]],
    ];
    for (const [text, color, at] of letters) {
      const letter = textSprite(text, color, LABEL_HEIGHT * 1.2);
      letter.position.set(...at);
      this.dynamic.add(letter);
    }

    const colors = scene.surfaces.map(row => row.color);
    this.paintField(molecule => this.color.set(colors[molecule.fn]).lerp(this.far, 0.2));
  }

  private paintField(paint: (molecule: MathMolecule) => Color): void {
    this.molecules.count = this.field.length;
    this.field.forEach((molecule, index) => this.molecules.setColorAt(index, paint(molecule)));
    if (this.molecules.instanceColor) this.molecules.instanceColor.needsUpdate = true;
  }

  /** Molecules rise from the floor column by column while building, then sit on their curve. */
  private writeMolecules(): void {
    if (!this.scene) return;
    const floor = this.floor, columns = MATH_FIELD.columns + 1;
    this.field.forEach((molecule, index) => {
      const column = index % columns;
      const start = (molecule.start ?? column / columns) * BUILD_SECONDS;
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

  private fading(color: string, opacity: number): MeshBasicMaterial {
    const material = new MeshBasicMaterial({ color, transparent: true, opacity: 0, side: DoubleSide, depthWrite: false });
    this.fades.push([material, opacity]);
    return material;
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

/** The polyline cut into dashes of `dash` units with `gap` units between them. */
function dashes(line: MathPolyline, dash = 0.075, gap = 0.05): [number, number][][] {
  const result: [number, number][][] = [];
  let current: [number, number][] | null = [[line[0][0], line[0][1]]], on = true, left = dash;
  for (let i = 1; i < line.length; i += 1) {
    let [ax, ay] = line[i - 1];
    const [bx, by] = line[i];
    let length = Math.hypot(bx - ax, by - ay);
    while (length > left) {
      const k = left / length, cx = ax + (bx - ax) * k, cy = ay + (by - ay) * k;
      if (on) { current!.push([cx, cy]); result.push(current!); current = null; } else current = [[cx, cy]];
      on = !on;
      ax = cx; ay = cy; length -= left; left = on ? dash : gap;
    }
    left -= length;
    if (on) current!.push([bx, by]);
  }
  if (on && current && current.length > 1) result.push(current);
  return result;
}

/** A filled band between two heights per column: [x, top, bottom] → triangles. */
function strip(columns: readonly (readonly [number, number, number])[], z: number): BufferGeometry {
  const positions: number[] = [], indices: number[] = [];
  columns.forEach(([x, top, bottom], i) => {
    positions.push(x, top, z, x, bottom, z);
    if (i > 0) {
      const a = (i - 1) * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  });
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
