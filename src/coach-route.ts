// Turning a grid course into a list of places to drive through, in order.
//
// This exists because the first recorder aimed straight at the next ring and drove into walls.
// On the open starter grid that is invisible — there is nothing between the ball and the ring.
// On `archive-ballz-level1` it reached 3 of 22 waypoints in 45 seconds, which is not a driving
// problem: no sequence of headings gets through a wall.
//
// So the route is planned on the tile grid, where walls are known, and only then handed to a
// pilot that steers between the points. Everything here is pure — a grid in, waypoints out —
// so the part that is decidable is decided without a renderer, a physics engine or a browser.
//
// It is deliberately NOT a driving model. It says where to go, never how fast to arrive; the
// recorded inputs remain a recording of a pilot that actually drove it.

/** The tile vocabulary, matching `MapEditorTile` in `map-editor-tiles.ts`. */
export type CoachTile = "floor" | "wall" | "start" | "ring" | "half" | "finish" | "hazard" | "fire" | "ice";

export type CoachGrid = {
  width: number;
  height: number;
  cellSize: number;
  tiles: readonly CoachTile[];
};

export type CoachCell = { x: number; y: number };

/**
 * Tiles a ball can cross.
 *
 * `hazard` is excluded because it is solid — the scene builds it as a static box that deflects,
 * on the grounds that a hazard you pass through reads as decoration. `fire` and `ice` are both
 * crossable: one launches you upward and the other is slippery, and neither blocks the way.
 */
export const WALKABLE_TILES: ReadonlySet<CoachTile> = new Set<CoachTile>([
  "floor", "start", "ring", "half", "finish", "fire", "ice",
]);

export const tileAt = (grid: CoachGrid, cell: CoachCell): CoachTile | null =>
  cell.x < 0 || cell.y < 0 || cell.x >= grid.width || cell.y >= grid.height
    ? null
    : grid.tiles[cell.y * grid.width + cell.x] ?? null;

export const isWalkable = (grid: CoachGrid, cell: CoachCell): boolean => {
  const tile = tileAt(grid, cell);
  return tile !== null && WALKABLE_TILES.has(tile);
};

/** Every cell carrying a tile, in row order. */
export function cellsOf(grid: CoachGrid, tile: CoachTile): CoachCell[] {
  const found: CoachCell[] = [];
  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      if (grid.tiles[y * grid.width + x] === tile) found.push({ x, y });
    }
  }
  return found;
}

/** The world position of a cell centre, using the scene builder's own origin. */
export function cellCentre(grid: CoachGrid, cell: CoachCell): [number, number] {
  const originX = -((grid.width - 1) * grid.cellSize) / 2;
  const originZ = -((grid.height - 1) * grid.cellSize) / 2;
  return [originX + cell.x * grid.cellSize, originZ + cell.y * grid.cellSize];
}

const key = (cell: CoachCell): number => (cell.y << 16) | cell.x;
const STEPS: readonly CoachCell[] = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];

/**
 * The shortest walkable path from one cell to another, inclusive of both, or null.
 *
 * Four-neighbour rather than eight: a diagonal step between two cells that share only a corner
 * would cut the corner of a wall, and the ball is wider than a point. Straight steps are the
 * ones a corridor actually admits.
 */
export function findPath(grid: CoachGrid, from: CoachCell, to: CoachCell): CoachCell[] | null {
  if (!isWalkable(grid, from) || !isWalkable(grid, to)) return null;
  if (from.x === to.x && from.y === to.y) return [from];
  const cameFrom = new Map<number, CoachCell | null>([[key(from), null]]);
  let frontier: CoachCell[] = [from];

  while (frontier.length > 0) {
    const next: CoachCell[] = [];
    for (const cell of frontier) {
      for (const step of STEPS) {
        const neighbour = { x: cell.x + step.x, y: cell.y + step.y };
        const id = key(neighbour);
        if (cameFrom.has(id) || !isWalkable(grid, neighbour)) continue;
        cameFrom.set(id, cell);
        if (neighbour.x === to.x && neighbour.y === to.y) {
          const path: CoachCell[] = [];
          let cursor: CoachCell | null = neighbour;
          while (cursor) {
            path.push(cursor);
            cursor = cameFrom.get(key(cursor)) ?? null;
          }
          return path.reverse();
        }
        next.push(neighbour);
      }
    }
    frontier = next;
  }
  return null;
}

/**
 * The corners of a path: the cells where it changes direction, plus both ends.
 *
 * A pilot given every cell of a corridor re-aims sixty times along a straight line and records
 * an input for each. Given the corners it drives the corridor as one leg, which is both fewer
 * inputs and a straighter line — and a straight line between two cells of the same corridor is
 * inside the corridor, which is the property that makes this safe to steer blind.
 */
export function pathCorners(path: readonly CoachCell[]): CoachCell[] {
  if (path.length <= 2) return [...path];
  const corners: CoachCell[] = [path[0]];
  for (let index = 1; index < path.length - 1; index += 1) {
    const inbound = { x: path[index].x - path[index - 1].x, y: path[index].y - path[index - 1].y };
    const outbound = { x: path[index + 1].x - path[index].x, y: path[index + 1].y - path[index].y };
    if (inbound.x !== outbound.x || inbound.y !== outbound.y) corners.push(path[index]);
  }
  corners.push(path[path.length - 1]);
  return corners;
}

/**
 * How much of a cell the ball takes up, for line-of-sight purposes.
 *
 * A grid path is a path for a *point*. The ball is not a point, so a segment that grazes the
 * corner of a wall is drivable on paper and a collision in practice. Segments are therefore
 * tested as a ribbon this many cells wide either side of the line — deliberately wider than the
 * ball, because being wrong here costs a wall the recorder then reports as a driving failure.
 */
export const CLEARANCE_CELLS = 0.34;

/**
 * Whether a straight line from one cell centre to another stays on walkable ground.
 *
 * Sampled rather than solved: a supercover line would be exact for a point, and the thing that
 * matters is not the point but the ribbon around it. Sampling the ribbon is both simpler to
 * read and the property actually being claimed.
 */
export function hasLineOfSight(grid: CoachGrid, from: CoachCell, to: CoachCell): boolean {
  if (!isWalkable(grid, from) || !isWalkable(grid, to)) return false;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const span = Math.hypot(dx, dy);
  if (span === 0) return true;
  // Perpendicular unit vector, for the two edges of the ribbon.
  const px = -dy / span;
  const py = dx / span;
  const steps = Math.max(2, Math.ceil(span * 6));
  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps;
    const x = from.x + dx * t;
    const y = from.y + dy * t;
    for (const offset of [0, CLEARANCE_CELLS, -CLEARANCE_CELLS]) {
      const cell = { x: Math.round(x + px * offset), y: Math.round(y + py * offset) };
      if (!isWalkable(grid, cell)) return false;
    }
  }
  return true;
}

/**
 * Drops the corners a driver does not need.
 *
 * A four-neighbour path through an open room is a staircase, and its corners are artefacts of
 * the grid rather than features of the course. Measured on the starter grid: routing without
 * this turned an 11.4s drive into 24.5s, because the pilot chased three right-angles across a
 * room it could have crossed diagonally, and overshot two of them.
 *
 * Greedy from each kept point: take the furthest later point still in clear line of sight. That
 * keeps every corner a corridor genuinely imposes and removes every one it does not.
 */
export function smoothPath(grid: CoachGrid, path: readonly CoachCell[]): CoachCell[] {
  if (path.length <= 2) return [...path];
  const kept: CoachCell[] = [path[0]];
  let index = 0;
  while (index < path.length - 1) {
    let furthest = index + 1;
    for (let candidate = path.length - 1; candidate > index + 1; candidate -= 1) {
      if (hasLineOfSight(grid, path[index], path[candidate])) {
        furthest = candidate;
        break;
      }
    }
    kept.push(path[furthest]);
    index = furthest;
  }
  return kept;
}

/** Walking distance in cells, or null when there is no way through. */
export function pathLength(grid: CoachGrid, from: CoachCell, to: CoachCell): number | null {
  const path = findPath(grid, from, to);
  return path ? path.length - 1 : null;
}

/**
 * Rings in the order a driver would collect them: nearest-first by *walking* distance.
 *
 * Straight-line distance is the wrong measure in a maze — the ring on the other side of a wall
 * is metres away and minutes away. Rings with no route at all are dropped rather than left to
 * strand the run, and reported by `planCoachRoute` so the omission is visible.
 */
export function orderRings(grid: CoachGrid, start: CoachCell, rings: readonly CoachCell[]): {
  ordered: CoachCell[];
  unreachable: CoachCell[];
} {
  const remaining = [...rings];
  const ordered: CoachCell[] = [];
  const unreachable: CoachCell[] = [];
  let from = start;

  while (remaining.length > 0) {
    let bestIndex = -1;
    let bestDistance = Infinity;
    for (let index = 0; index < remaining.length; index += 1) {
      const distance = pathLength(grid, from, remaining[index]);
      if (distance !== null && distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    }
    if (bestIndex === -1) {
      unreachable.push(...remaining);
      break;
    }
    const next = remaining.splice(bestIndex, 1)[0];
    ordered.push(next);
    from = next;
  }
  return { ordered, unreachable };
}

export type CoachWaypoint = {
  /** `ring`, `half` and `finish` are the course's own; `turn` is a corner on the way. */
  kind: "ring" | "half" | "finish" | "turn";
  name: string;
  cell: CoachCell;
  at: [number, number];
  /** How close counts as reached. Tight for a trigger, loose for a corner. */
  radius: number;
};

export type CoachRoute = {
  waypoints: CoachWaypoint[];
  /** Objectives with no walkable route from where the driver would be. Empty is the happy case. */
  unreachable: string[];
};

/**
 * The full route: start → every ring → the half gate → the finish, with the corners between,
 * repeated for as many laps as the course declares.
 *
 * Laps are not a detail. `archive-ballz-level1` declares three, and a one-lap route drove all
 * twenty rings and the gate in 54 seconds and then spent 96 more never finishing, because the
 * course was not over. Rings are collected once and do not come back, so later laps are the
 * gate and the finish only.
 *
 * Objective radii are tight because a ring is a trigger you must actually pass through; corner
 * radii are loose because a corner is only a hint about which way the corridor goes, and
 * insisting a fast ball pass within centimetres of one would stall the drive.
 */
export function planCoachRoute(grid: CoachGrid, options: { laps?: number } = {}): CoachRoute {
  const start = cellsOf(grid, "start")[0];
  if (!start) return { waypoints: [], unreachable: ["start"] };
  const laps = Math.max(1, Math.floor(options.laps ?? 1));

  const objectives: { kind: CoachWaypoint["kind"]; cell: CoachCell; lap: number }[] = [];
  const { ordered, unreachable } = orderRings(grid, start, cellsOf(grid, "ring"));
  for (const cell of ordered) objectives.push({ kind: "ring", cell, lap: 1 });
  for (let lap = 1; lap <= laps; lap += 1) {
    // Gate then finish: the rules layer will not open the finish until the lap's gates are in.
    for (const cell of cellsOf(grid, "half")) objectives.push({ kind: "half", cell, lap });
    for (const cell of cellsOf(grid, "finish")) objectives.push({ kind: "finish", cell, lap });
  }

  // The lap suffix only appears when there is more than one, so a single-lap course reads the
  // same as it always has and a multi-lap trace says which time round it is.
  const named = (cell: CoachCell, kind: string, lap = 1): string =>
    `${kind}-${cell.x}-${cell.y}${laps > 1 && kind !== "ring" ? `#${lap}` : ""}`;
  const missing = unreachable.map((cell) => named(cell, "ring"));
  const waypoints: CoachWaypoint[] = [];
  let from = start;

  for (const objective of objectives) {
    const path = findPath(grid, from, objective.cell);
    if (!path) {
      missing.push(named(objective.cell, objective.kind, objective.lap));
      continue;
    }
    // Corners first, then smoothing: reducing to corners is cheap and makes the line-of-sight
    // pass short, and smoothing then removes the ones the grid invented rather than the course.
    // The first cell is where the driver already is, and the last is the objective itself,
    // which is appended below with its own tighter radius.
    for (const corner of smoothPath(grid, pathCorners(path)).slice(1, -1)) {
      waypoints.push({
        kind: "turn",
        name: named(corner, "turn"),
        cell: corner,
        at: cellCentre(grid, corner),
        radius: grid.cellSize * 0.42,
      });
    }
    waypoints.push({
      kind: objective.kind,
      name: named(objective.cell, objective.kind, objective.lap),
      cell: objective.cell,
      at: cellCentre(grid, objective.cell),
      radius: grid.cellSize * (objective.kind === "ring" ? 0.27 : 0.46),
    });
    from = objective.cell;
  }

  return { waypoints, unreachable: missing };
}
