import type { AgentWorldInlineMesh } from "./agent-world-runtime";
/** Small authoritative height field. Volumes are world cubic units, heights world units. */
export const EARTH_BOUNDS = { minX: 4, maxX: 14, minZ: -7, maxZ: 7 } as const;
export const EARTH_STEP = 0.5;
export const EARTH_COLS = 21;
export const EARTH_ROWS = 29;
export const EARTH_COUNT = EARTH_COLS * EARTH_ROWS;
const AREA = EARTH_STEP ** 2;
/** Thinner films remain simulated but are neither rendered nor a racing hazard. */
export const EARTH_LAVA_VISIBLE_DEPTH = 0.018;
export type EarthState = {
  height: number[]; lava: number[]; revision: number; excavated: number;
  inputVolume: number; drainedVolume: number; basinVolume: number; crossingVolume: number;
  stroke: { tip: [number, number, number]; time: number } | null;
};
export function earthPoint(index: number): [number, number] {
  return [EARTH_BOUNDS.minX + index % EARTH_COLS * EARTH_STEP, EARTH_BOUNDS.minZ + Math.floor(index / EARTH_COLS) * EARTH_STEP];
}
export function createEarth(): EarthState {
  const height = Array.from({ length: EARTH_COUNT }, (_, i) => {
    const [x, z] = earthPoint(i);
    // A broad hillside, not a selectable path. Every vertex can be cut.
    const hillside = 0.08 + Math.max(0, 10 - x) * 0.19 + Math.abs(z) * 0.035 * Math.max(0, Math.min(1, (10 - x) / 2));
    const basin = Math.hypot(x - 5.5, z - 6) < 1.1;
    return basin ? 0.12 : hillside;
  });
  return { height, lava: Array(EARTH_COUNT).fill(0), revision: 0, excavated: 0,
    inputVolume: 0, drainedVolume: 0, basinVolume: 0, crossingVolume: 0, stroke: null };
}
export function earthContains(x: number, z: number): boolean {
  return x >= 4 && x <= 14 && z >= -7 && z <= 7;
}
export function surfaceHeightAt(earth: EarthState, x: number, z: number): number {
  const fx = Math.max(0, Math.min(EARTH_COLS - 1, (x - 4) / EARTH_STEP));
  const fz = Math.max(0, Math.min(EARTH_ROWS - 1, (z + 7) / EARTH_STEP));
  const ix = Math.min(EARTH_COLS - 2, Math.floor(fx)), iz = Math.min(EARTH_ROWS - 2, Math.floor(fz));
  const u = fx - ix, v = fz - iz, a = iz * EARTH_COLS + ix;
  return u + v <= 1
    ? earth.height[a] * (1-u-v) + earth.height[a+1]*u + earth.height[a+EARTH_COLS]*v
    : earth.height[a+1]*(1-v) + earth.height[a+EARTH_COLS]*(1-u) + earth.height[a+EARTH_COLS+1]*(u+v-1);
}
export function cancelEarthStroke(earth: EarthState): void { earth.stroke = null; }
/** Time is supplied by the host simulation, never the remote device. */
export function sampleEarthShovel(earth: EarthState, tip: [number, number, number], held: boolean, time: number): boolean {
  if (!tip.every(Number.isFinite) || !earthContains(tip[0], tip[2]) || tip[1] < -0.8 || tip[1] > 8) { cancelEarthStroke(earth); return false; }
  if (!held) { cancelEarthStroke(earth); return true; }
  const previous = earth.stroke;
  if (previous && time - previous.time < 1 / 60 - 1e-8) return false;
  const elapsed = previous ? time - previous.time : 0;
  const distance = previous ? Math.hypot(...tip.map((n, i) => n - previous.tip[i])) : 0;
  if (previous && (elapsed > 0.3 || elapsed <= 0 || distance > 18 * elapsed || distance > 1.4)) { cancelEarthStroke(earth); return false; }
  earth.stroke = { tip: [...tip], time };
  if (!previous || distance < 0.015) return true;
  const height = surfaceHeightAt(earth, tip[0], tip[2]);
  const oldHeight = surfaceHeightAt(earth, previous.tip[0], previous.tip[2]);
  if (tip[1] > height + 0.12 || tip[1] < height - 0.7 || previous.tip[1] > oldHeight + 0.35) return true;
  let removed = 0;
  // Sweep the blade, so packet rate cannot leave disconnected holes in a trench.
  const steps = Math.max(1, Math.ceil(distance / 0.15));
  for (let s = 1; s <= steps; s++) {
    const x = previous.tip[0] + (tip[0] - previous.tip[0]) * s / steps;
    const z = previous.tip[2] + (tip[2] - previous.tip[2]) * s / steps;
    const depth = Math.min(distance, 18 * elapsed) * 0.45 / steps;
    for (let i = 0; i < EARTH_COUNT; i++) {
      const [px, pz] = earthPoint(i), r = Math.hypot(px - x, pz - z);
      if (r >= 0.65) continue;
      const cut = Math.min(earth.height[i] - 0.08, depth * (1 - r / 0.65));
      if (cut > 0) { earth.height[i] -= cut; removed += cut * AREA; }
    }
  }
  if (removed > 0) { earth.excavated += removed; earth.revision++; }
  return true;
}
/** Conservative downhill finite-volume transport; no path selectors or lava duplication. */
export function advanceEarth(earth: EarthState, seconds: number, source: number): void {
  if (!Number.isFinite(seconds) || seconds < 0 || seconds > 60 || !Number.isFinite(source) || source < 0 || source > 2) throw new RangeError("Invalid earth step");
  const steps = Math.ceil(seconds / 0.025);
  for (let s = 0; s < steps; s++) {
    const dt = seconds / steps;
    const added = source * dt;
    earth.lava[14 * EARTH_COLS + 1] += added;
    earth.inputVolume += added;
    const delta = Array(EARTH_COUNT).fill(0) as number[];
    const transfer = (a: number, b: number): void => {
      const head = earth.height[a] + earth.lava[a] / AREA - earth.height[b] - earth.lava[b] / AREA;
      const from = head > 0 ? a : b, to = head > 0 ? b : a;
      const amount = Math.min(earth.lava[from] / 4, Math.abs(head) * dt * 1.6);
      delta[from] -= amount; delta[to] += amount;
    };
    for (let i = 0; i < EARTH_COUNT; i++) {
      if (i % EARTH_COLS < EARTH_COLS - 1) transfer(i, i + 1);
      if (i + EARTH_COLS < EARTH_COUNT) transfer(i, i + EARTH_COLS);
    }
    for (let i = 0; i < EARTH_COUNT; i++) {
      earth.lava[i] = Math.max(0, earth.lava[i] + delta[i]);
      const [x, z] = earthPoint(i), basin = Math.hypot(x - 5.5, z - 6) < 0.8;
      if (x === 14 || basin) {
        const amount = Math.min(earth.lava[i], earth.lava[i] * dt * 3);
        earth.lava[i] -= amount; earth.drainedVolume += amount;
        if (basin) earth.basinVolume += amount; else earth.crossingVolume += amount;
      }
    }
  }
}
export function earthMassError(earth: EarthState): number {
  return earth.inputVolume - earth.drainedVolume - earth.lava.reduce((a, b) => a + b, 0);
}
export function earthLavaDepthAt(earth: EarthState, x: number, z: number): number {
  if (!earthContains(x, z)) return 0;
  const fx = (x - 4) / EARTH_STEP, fz = (z + 7) / EARTH_STEP;
  const ix = Math.min(EARTH_COLS - 2, Math.floor(fx)), iz = Math.min(EARTH_ROWS - 2, Math.floor(fz));
  const u = fx - ix, v = fz - iz, a = iz * EARTH_COLS + ix;
  return (u + v <= 1
    ? earth.lava[a] * (1-u-v) + earth.lava[a+1]*u + earth.lava[a+EARTH_COLS]*v
    : earth.lava[a+1]*(1-v) + earth.lava[a+EARTH_COLS]*(1-u) + earth.lava[a+EARTH_COLS+1]*(u+v-1)) / AREA;
}

/** Indexed terrain and a continuous clipped free surface share the simulation elevations. */
export function earthMesh(earth: EarthState, lava = false, colorContours = true): AgentWorldInlineMesh {
  const positions: number[] = [], indices: number[] = [];
  if (!lava) {
    earth.height.forEach((h, i) => { const [x, z] = earthPoint(i); positions.push(x, h, z); });
    for (let z = 0; z < EARTH_ROWS - 1; z++) for (let x = 0; x < EARTH_COLS - 1; x++) {
      const a = z * EARTH_COLS + x; indices.push(a, a + EARTH_COLS, a + 1, a + 1, a + EARTH_COLS, a + EARTH_COLS + 1);
    }
  } else {
    type Vertex = { x: number; y: number; z: number; depth: number };
    const points: Vertex[] = earth.lava.map((volume, i) => {
      const [x, z] = earthPoint(i), depth = volume / AREA;
      return { x, y: earth.height[i] + depth + 0.006, z, depth };
    });
    const clip = (polygon: Vertex[], threshold: number, above: boolean): Vertex[] => {
      const result: Vertex[] = [];
      for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i], b = polygon[(i + 1) % polygon.length];
        const aIn = above ? a.depth >= threshold : a.depth <= threshold;
        const bIn = above ? b.depth >= threshold : b.depth <= threshold;
        if (aIn) result.push(a);
        if (aIn !== bIn) {
          const t = (threshold - a.depth) / (b.depth - a.depth);
          result.push({ x: a.x + (b.x-a.x)*t, y: a.y + (b.y-a.y)*t, z: a.z + (b.z-a.z)*t, depth: threshold });
        }
      }
      return result;
    };
    const welded = new Map<string, number>();
    const vertex = (p: Vertex): number => {
      const coordinates = [p.x, p.y, p.z].map(n => Math.round(n * 1e6) / 1e6);
      const key = coordinates.join(",");
      const old = welded.get(key);
      if (old !== undefined) return old;
      const index = positions.length / 3;
      positions.push(...coordinates); welded.set(key, index); return index;
    };
    const bands = colorContours ? [EARTH_LAVA_VISIBLE_DEPTH, 0.055, 0.12, Infinity] : [EARTH_LAVA_VISIBLE_DEPTH, Infinity];
    const triangles: number[][] = Array.from({ length: bands.length - 1 }, () => []);
    const emit = (a: number, b: number, c: number): void => {
      for (let band = 0; band < triangles.length; band++) {
        let polygon = clip([points[a], points[b], points[c]], bands[band], true);
        if (Number.isFinite(bands[band+1])) polygon = clip(polygon, bands[band+1], false);
        for (let i = 1; i + 1 < polygon.length; i++) {
          const p = polygon[0], q = polygon[i], r = polygon[i+1];
          // Rounded Float32 coordinates must still form a real triangle.
          if (Math.abs((q.x-p.x)*(r.z-p.z) - (q.z-p.z)*(r.x-p.x)) < 0.000002) continue;
          triangles[band].push(vertex(p), vertex(q), vertex(r));
        }
      }
    };
    for (let z = 0; z < EARTH_ROWS - 1; z++) for (let x = 0; x < EARTH_COLS - 1; x++) {
      const a = z * EARTH_COLS + x;
      emit(a, a + EARTH_COLS, a + 1);
      emit(a + 1, a + EARTH_COLS, a + EARTH_COLS + 1);
    }
    if (positions.length) {
      const groups: NonNullable<AgentWorldInlineMesh["groups"]> = [];
      triangles.forEach((list, materialIndex) => {
        if (!list.length) return;
        groups.push({ start: indices.length, count: list.length, materialIndex: colorContours ? materialIndex : 1 }); indices.push(...list);
      });
      const mesh: AgentWorldInlineMesh = { positions, indices, groups, materials: [
        { color: "#63382c", emissive: "#6b210a", emissiveIntensity: 0.12, roughness: 0.94 },
        { color: "#ce541d", emissive: "#bc3b07", emissiveIntensity: 0.28, roughness: 0.65 },
        { color: "#ffab35", emissive: "#ff650b", emissiveIntensity: 0.45, roughness: 0.42 },
      ] };
      // Adversarial checkerboard cuts must also fit the platform mesh byte budget.
      // Keep the exact wet shoreline; drop only secondary colour contours if necessary.
      if (colorContours && (positions.length / 3 > 4000 || JSON.stringify(mesh).length > 125000)) return earthMesh(earth, true, false);
      return mesh;
    }
    // Mesh validators require nonempty geometry even before the first source tick.
    if (!positions.length) { positions.push(4,-1,0,4.01,-1,0,4,-1,0.01); indices.push(0,2,1); }
  }
  return { positions, indices };
}
