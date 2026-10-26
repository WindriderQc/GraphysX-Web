/**
 * The three.js layer of the Janitor show: one ghostable shell and a stacked duplicate column
 * per district, eased toward the look of the current scene on the host's frame clock.
 *
 * Presentation only. It lives in its own group beside the world; the scene document is never
 * edited. While the show owns the picture the host hides the world group's rendering (a view
 * property, not a document change) and shows this layer in its place.
 *
 * Gestures (lift, push aside, pulse, select) are per-block view state too, and a reset drops
 * them all. Nothing here is saved.
 */
import { BoxGeometry, EdgesGeometry, Group, LineBasicMaterial, LineSegments, Mesh, MeshBasicMaterial, SphereGeometry, TubeGeometry, Vector3, type Object3D } from "three";
import type { ShowLook } from "./diskx-show-looks";
import { relationArc } from "./presentation-links";

const COLOURS = { keep: "#4ff2ff", extra: "#ffb13b", unresolved: "#c9d6e2", shell: "#0d1d30", edge: "#5fb8d6", selected: "#ffffff" };
const NUMBERS = ["x", "z", "width", "depth", "height", "shellOpacity", "column", "keepHeight", "unresolvedHeight", "extraHeight"] as const;
type Gesture = { lift: number; push: number; pulse: boolean; selected: boolean; dim: number };
type Entry = {
  id: string;
  group: Group;
  shell: Mesh; shellMaterial: MeshBasicMaterial;
  edges: LineSegments; edgeMaterial: LineBasicMaterial;
  keep: Mesh; unresolved: Mesh; extra: Mesh;
  current: ShowLook; target: ShowLook;
  gesture: Gesture; eased: { lift: number; push: number; dim: number };
};

export function createShowLayer() {
  const group = new Group();
  group.name = "diskx-show";
  group.visible = false;
  const unitBox = new BoxGeometry(1, 1, 1);
  unitBox.translate(0, 0.5, 0); // grows up from the ground
  const unitEdges = new EdgesGeometry(unitBox);
  const materials = {
    keep: new MeshBasicMaterial({ color: COLOURS.keep, transparent: true, opacity: 0.95 }),
    extra: new MeshBasicMaterial({ color: COLOURS.extra, transparent: true, opacity: 0.95 }),
    unresolved: new MeshBasicMaterial({ color: COLOURS.unresolved, transparent: true, opacity: 0.85 }),
  };
  let entries: Entry[] = [];
  let time = 0;
  /** Pair arcs: a tube as thick as its share of the bytes, and a bead running extra → kept. */
  const arcs = new Group();
  arcs.name = "diskx-show-arcs";
  group.add(arcs);
  const arcMaterial = new MeshBasicMaterial({ color: COLOURS.extra, transparent: true, opacity: 0.8, depthWrite: false });
  const beadMaterial = new MeshBasicMaterial({ color: "#fff1c9" });
  const beadGeometry = new SphereGeometry(1, 12, 8);
  let arcItems: { tube: TubeGeometry; bead: Mesh; curve: ReturnType<typeof relationArc>; phase: number }[] = [];
  const clearArcs = (): void => { for (const item of arcItems) item.tube.dispose(); arcs.clear(); arcItems = []; };

  const clear = (): void => {
    for (const entry of entries) { entry.shellMaterial.dispose(); entry.edgeMaterial.dispose(); entry.group.removeFromParent(); }
    clearArcs();
    entries = [];
  };
  const column = (material: MeshBasicMaterial, id: string): Mesh => {
    const mesh = new Mesh(unitBox, material);
    mesh.userData.showId = id;
    return mesh;
  };
  const apply = (entry: Entry): void => {
    const look = entry.current;
    const { lift, push, dim } = entry.eased;
    const radius = Math.hypot(look.x, look.z) || 1;
    const pulse = entry.gesture.pulse ? 0.5 + 0.5 * Math.sin(time * 5) : 0;
    entry.group.position.set(look.x + (look.x / radius) * push * 6, lift * 3, look.z + (look.z / radius) * push * 6);
    entry.shell.scale.set(Math.max(0.01, look.width), Math.max(0.01, look.height), Math.max(0.01, look.depth));
    entry.shellMaterial.opacity = Math.max(0, Math.min(1, look.shellOpacity * (1 - 0.7 * dim) + pulse * 0.25));
    entry.edges.scale.copy(entry.shell.scale);
    entry.edgeMaterial.opacity = Math.max(0.05, Math.min(1, (0.15 + look.shellOpacity * 0.8) * (1 - 0.7 * dim) + pulse * 0.6));
    entry.edgeMaterial.color.set(entry.gesture.selected ? COLOURS.selected : COLOURS.edge);
    const width = Math.max(0.01, look.width * look.column), depth = Math.max(0.01, look.depth * look.column);
    let y = 0;
    for (const [mesh, height] of [[entry.keep, look.keepHeight], [entry.unresolved, look.unresolvedHeight], [entry.extra, look.extraHeight]] as const) {
      mesh.visible = height > 0.01;
      mesh.position.set(0, y, 0);
      mesh.scale.set(width, Math.max(0.01, height), depth);
      y += Math.max(0, height);
    }
  };

  return {
    group,
    /** Replace the blocks. Each starts at `start` and eases toward it until `look` says otherwise. */
    setBlocks(blocks: readonly { id: string; start: ShowLook }[]): void {
      clear();
      for (const { id, start } of blocks) {
        const node = new Group();
        const shellMaterial = new MeshBasicMaterial({ color: COLOURS.shell, transparent: true, opacity: start.shellOpacity, depthWrite: false });
        const shell = new Mesh(unitBox, shellMaterial);
        shell.userData.showId = id;
        const edgeMaterial = new LineBasicMaterial({ color: COLOURS.edge, transparent: true, opacity: 0.6 });
        const edges = new LineSegments(unitEdges, edgeMaterial);
        const entry: Entry = {
          id, group: node, shell, shellMaterial, edges, edgeMaterial,
          keep: column(materials.keep, id), unresolved: column(materials.unresolved, id), extra: column(materials.extra, id),
          current: { ...start }, target: { ...start },
          gesture: { lift: 0, push: 0, pulse: false, selected: false, dim: 0 }, eased: { lift: 0, push: 0, dim: 0 },
        };
        node.add(entry.keep, entry.unresolved, entry.extra, shell, edges);
        group.add(node);
        entries.push(entry);
        apply(entry);
      }
    },
    /** Ease every block toward its look in this scene. `snap` jumps (reduced motion, captures). */
    setLooks(looks: ReadonlyMap<string, ShowLook>, snap = false): void {
      for (const entry of entries) {
        const look = looks.get(entry.id);
        if (!look) continue;
        entry.target = { ...look };
        if (snap) { entry.current = { ...look }; apply(entry); }
      }
    },
    /** Replace the pair arcs; `weight` is each arc's share (0..1) of the largest one. */
    setArcs(next: readonly { from: readonly [number, number, number]; to: readonly [number, number, number]; weight: number }[]): void {
      clearArcs();
      next.forEach((arc, index) => {
        const curve = relationArc(new Vector3(...arc.from), new Vector3(...arc.to));
        const radius = 0.06 + 0.34 * Math.sqrt(Math.max(0, Math.min(1, arc.weight)));
        const tube = new TubeGeometry(curve, 48, radius, 8, false);
        const mesh = new Mesh(tube, arcMaterial);
        mesh.renderOrder = 5;
        const bead = new Mesh(beadGeometry, beadMaterial);
        bead.scale.setScalar(radius * 1.8);
        arcs.add(mesh, bead);
        arcItems.push({ tube, bead, curve, phase: index * 0.17 });
      });
    },
    arcCount: (): number => arcItems.length,
    gesture(id: string, change: Partial<Gesture>): Gesture | null {
      const entry = entries.find((candidate) => candidate.id === id);
      if (!entry) return null;
      Object.assign(entry.gesture, change);
      return { ...entry.gesture };
    },
    gestureOf: (id: string): Gesture | null => { const entry = entries.find((candidate) => candidate.id === id); return entry ? { ...entry.gesture } : null; },
    /** Dim every block not in `keep` (a filter or a selection), or clear with null. */
    focusOn(keep: ReadonlySet<string> | null): void { for (const entry of entries) entry.gesture.dim = keep && !keep.has(entry.id) ? 1 : 0; },
    resetGestures(): void { for (const entry of entries) entry.gesture = { lift: 0, push: 0, pulse: false, selected: false, dim: 0 }; },
    /** True while some block is still on its way: the host may wait before swapping layers. */
    settling(): boolean {
      return entries.some((entry) => NUMBERS.some((key) => Math.abs(entry.current[key] - entry.target[key]) > 0.02));
    },
    tick(delta: number, reduced: boolean): void {
      time += delta;
      for (const item of arcItems) item.bead.position.copy(item.curve.getPoint(reduced ? 0.5 : (time * 0.35 + item.phase) % 1));
      const k = reduced ? 1 : 1 - Math.exp(-Math.max(0, delta) * 3.2);
      for (const entry of entries) {
        for (const key of NUMBERS) entry.current[key] += (entry.target[key] - entry.current[key]) * k;
        entry.eased.lift += (entry.gesture.lift - entry.eased.lift) * k;
        entry.eased.push += (entry.gesture.push - entry.eased.push) * k;
        entry.eased.dim += (entry.gesture.dim - entry.eased.dim) * k;
        apply(entry);
      }
    },
    /** Ground bounds of the blocks' current looks, for framing the camera. */
    bounds(): { minX: number; maxX: number; minZ: number; maxZ: number; maxY: number } | null {
      if (!entries.length) return null;
      const box = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity, maxY: 0 };
      for (const { target: look } of entries) {
        box.minX = Math.min(box.minX, look.x - look.width / 2); box.maxX = Math.max(box.maxX, look.x + look.width / 2);
        box.minZ = Math.min(box.minZ, look.z - look.depth / 2); box.maxZ = Math.max(box.maxZ, look.z + look.depth / 2);
        box.maxY = Math.max(box.maxY, look.height, look.keepHeight + look.unresolvedHeight + look.extraHeight);
      }
      return box;
    },
    /** World point at the top of a block's column (or roof), for HTML tags. */
    topOf(id: string): [number, number, number] | null {
      const entry = entries.find((candidate) => candidate.id === id);
      if (!entry) return null;
      const look = entry.current;
      const top = Math.max(look.keepHeight + look.unresolvedHeight + look.extraHeight, look.height * (look.shellOpacity > 0.3 ? 1 : 0.2));
      return [entry.group.position.x, entry.group.position.y + top, entry.group.position.z];
    },
    pickables: (): Object3D[] => entries.flatMap((entry) => [entry.shell, entry.keep, entry.unresolved, entry.extra]),
    idOf: (object: Object3D): string | null => (typeof object.userData.showId === "string" ? object.userData.showId : null),
    dispose(): void {
      clear();
      group.removeFromParent();
      unitBox.dispose(); unitEdges.dispose(); beadGeometry.dispose(); arcMaterial.dispose(); beadMaterial.dispose();
      for (const material of Object.values(materials)) material.dispose();
    },
  };
}
export type DiskxShowLayer = ReturnType<typeof createShowLayer>;
