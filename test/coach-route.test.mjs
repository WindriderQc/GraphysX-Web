// The route planner is the part of the coach that is decidable without physics, so it is the
// part that gets tested exhaustively. The bug it exists to prevent is not subtle — the first
// recorder aimed straight at the next ring and drove into walls — but the ways a grid router
// goes quietly wrong are: cutting a corner a ball cannot cut, ordering objectives by straight
// line in a maze, and reporting success for a course it never routed.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  WALKABLE_TILES,
  cellCentre,
  cellsOf,
  findPath,
  hasLineOfSight,
  improveRingOrder,
  isWalkable,
  orderRings,
  pathCorners,
  pathLength,
  planCoachRoute,
  routeDistanceMatrix,
  routeLength,
  smoothPath,
} from "../src/coach-route.ts";

/**
 * Builds a grid from rows of characters, so a test reads as the map it is about.
 * `#` wall · `.` floor · `S` start · `o` ring · `H` half gate · `F` finish · `x` hazard
 */
const grid = (rows, cellSize = 2.6) => {
  const legend = { "#": "wall", ".": "floor", S: "start", o: "ring", H: "half", F: "finish", x: "hazard", "~": "ice", "^": "fire" };
  const tiles = [];
  for (const row of rows) for (const char of row) tiles.push(legend[char]);
  return { width: rows[0].length, height: rows.length, cellSize, tiles };
};

describe("what a ball can cross", () => {
  it("treats a hazard as solid, because the scene builds it that way", () => {
    // A hazard the ball passes through would read as decoration; the scene makes it a static
    // box that deflects. Routing through one would plan a line the ball cannot drive.
    assert.equal(WALKABLE_TILES.has("hazard"), false);
    assert.equal(WALKABLE_TILES.has("wall"), false);
  });

  it("crosses fire and ice, which change how you move but not whether you can", () => {
    assert.equal(WALKABLE_TILES.has("fire"), true);
    assert.equal(WALKABLE_TILES.has("ice"), true);
  });

  it("treats everything off the grid as unwalkable rather than undefined", () => {
    const map = grid(["S."]);
    assert.equal(isWalkable(map, { x: -1, y: 0 }), false);
    assert.equal(isWalkable(map, { x: 0, y: 5 }), false);
    assert.equal(isWalkable(map, { x: 0, y: 0 }), true);
  });
});

describe("cell geometry", () => {
  it("puts the middle cell of an odd grid at the origin", () => {
    // The same origin `ballz-level-scene.ts` uses, which is what makes a waypoint the centre of
    // the cell the author drew rather than an approximation.
    const map = grid(["...", "...", "..."]);
    assert.deepEqual(cellCentre(map, { x: 1, y: 1 }), [0, 0]);
    assert.deepEqual(cellCentre(map, { x: 0, y: 0 }), [-2.6, -2.6]);
  });

  it("finds every cell of a kind in row order", () => {
    const map = grid([".o.", "..o"]);
    assert.deepEqual(cellsOf(map, "ring"), [{ x: 1, y: 0 }, { x: 2, y: 1 }]);
  });
});

describe("finding a way through", () => {
  it("goes around a wall rather than through it", () => {
    const map = grid([
      "S#F",
      ".#.",
      "...",
    ]);
    const path = findPath(map, { x: 0, y: 0 }, { x: 2, y: 0 });
    assert.ok(path, "there is a way round the bottom");
    // Straight line is 2 steps; the way round is 6.
    assert.equal(path.length - 1, 6);
    assert.ok(path.every((cell) => isWalkable(map, cell)));
  });

  it("returns null when there is genuinely no way, rather than a best effort", () => {
    // A route that silently returned the closest reachable cell would strand the drive at a
    // wall and report it as a driving failure.
    const map = grid([
      "S#F",
      ".#.",
      ".#.",
    ]);
    assert.equal(findPath(map, { x: 0, y: 0 }, { x: 2, y: 0 }), null);
  });

  it("never cuts a diagonal a ball could not fit through", () => {
    // The two floors touch only at a corner. An eight-neighbour router would happily step
    // between them; the ball has width and would hit both walls.
    const map = grid([
      "S#",
      "#F",
    ]);
    assert.equal(findPath(map, { x: 0, y: 0 }, { x: 1, y: 1 }), null);
  });

  it("refuses to start or end outside the walkable set", () => {
    const map = grid(["S#", ".."]);
    assert.equal(findPath(map, { x: 0, y: 0 }, { x: 1, y: 0 }), null);
  });

  it("is a single cell when you are already there", () => {
    const map = grid(["S."]);
    assert.deepEqual(findPath(map, { x: 0, y: 0 }, { x: 0, y: 0 }), [{ x: 0, y: 0 }]);
  });

  it("takes a shortest route, not merely a route", () => {
    const map = grid([
      "S....",
      ".....",
      "....F",
    ]);
    assert.equal(pathLength(map, { x: 0, y: 0 }, { x: 4, y: 2 }), 6);
  });
});

describe("reducing a path to its corners", () => {
  it("keeps only the turns and the two ends", () => {
    const map = grid([
      "S...",
      "###.",
      "F...",
    ]);
    const corners = pathCorners(findPath(map, { x: 0, y: 0 }, { x: 0, y: 2 }));
    assert.deepEqual(corners, [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 2 }, { x: 0, y: 2 }]);
  });

  it("reduces a straight corridor to its ends", () => {
    // The property that matters for the recording: a corridor is one leg and one input, not
    // one input per cell.
    const map = grid(["S....F"]);
    assert.deepEqual(pathCorners(findPath(map, { x: 0, y: 0 }, { x: 5, y: 0 })), [{ x: 0, y: 0 }, { x: 5, y: 0 }]);
  });

  it("leaves short paths alone", () => {
    assert.deepEqual(pathCorners([{ x: 0, y: 0 }]), [{ x: 0, y: 0 }]);
    assert.deepEqual(pathCorners([{ x: 0, y: 0 }, { x: 1, y: 0 }]), [{ x: 0, y: 0 }, { x: 1, y: 0 }]);
  });
});

describe("the order to collect rings in", () => {
  it("orders by walking distance, not by straight line", () => {
    // `near` is two cells away as the crow flies and behind a wall; `far` is further away and
    // straight down the corridor. A driver collects `far` first, and a straight-line ordering
    // would send them at the wall.
    const map = grid([
      "S.....",
      "#####.",
      "o....o",
    ]);
    const { ordered } = orderRings(map, { x: 0, y: 0 }, cellsOf(map, "ring"));
    assert.deepEqual(ordered, [{ x: 5, y: 2 }, { x: 0, y: 2 }]);
  });

  it("chains from each ring, not from the start", () => {
    const map = grid([
      "S.....",
      "......",
      "o..o.o",
    ]);
    const { ordered } = orderRings(map, { x: 0, y: 0 }, cellsOf(map, "ring"));
    assert.deepEqual(ordered, [{ x: 0, y: 2 }, { x: 3, y: 2 }, { x: 5, y: 2 }]);
  });

  it("reports a walled-off ring instead of stranding the route", () => {
    const map = grid([
      "S..#o",
      "...#.",
    ]);
    const { ordered, unreachable } = orderRings(map, { x: 0, y: 0 }, cellsOf(map, "ring"));
    assert.deepEqual(ordered, []);
    assert.deepEqual(unreachable, [{ x: 4, y: 0 }]);
  });
});

describe("the whole route", () => {
  it("visits rings, then the gate, then the finish", () => {
    const map = grid([
      "S.o..",
      ".....",
      "H...F",
    ]);
    const route = planCoachRoute(map);
    const objectives = route.waypoints.filter((point) => point.kind !== "turn").map((point) => point.kind);
    assert.deepEqual(objectives, ["ring", "half", "finish"]);
    assert.deepEqual(route.unreachable, []);
  });

  it("puts turns between the objectives, in world coordinates", () => {
    const map = grid([
      "S...",
      "###.",
      "F...",
    ]);
    const route = planCoachRoute(map);
    const turns = route.waypoints.filter((point) => point.kind === "turn");
    assert.ok(turns.length >= 1, "going round the wall needs at least one turn");
    for (const turn of turns) assert.deepEqual(turn.at, cellCentre(map, turn.cell));
  });

  it("holds a trigger to a tighter radius than a corner", () => {
    // A ring is something you must actually pass through; a corner is a hint about which way
    // the corridor goes, and demanding centimetre accuracy on one would stall the drive.
    const map = grid([
      "S...",
      "###.",
      "o..F",
    ]);
    const route = planCoachRoute(map);
    const ring = route.waypoints.find((point) => point.kind === "ring");
    const turn = route.waypoints.find((point) => point.kind === "turn");
    assert.ok(ring.radius < turn.radius);
  });

  it("names what it could not route to rather than reporting a clean run", () => {
    const map = grid([
      "S.#o",
      "..#.",
      "F.#.",
    ]);
    const route = planCoachRoute(map);
    assert.deepEqual(route.unreachable, ["ring-3-0"]);
  });

  it("says so when there is no start tile at all", () => {
    assert.deepEqual(planCoachRoute(grid(["...", "..F"])), { waypoints: [], unreachable: ["start"] });
  });

  it("routes a serpentine, where every objective needs the long way round", () => {
    // Each row is a dead end except at one edge, so nothing here is reachable in a straight
    // line and a straight-line router scores zero.
    const map = grid([
      "S........",
      "########.",
      "o........",
      ".########",
      "....H....",
      "########.",
      "F........",
    ]);
    const route = planCoachRoute(map);
    assert.deepEqual(route.unreachable, []);
    const objectives = route.waypoints.filter((point) => point.kind !== "turn").map((point) => point.name);
    assert.deepEqual(objectives, ["ring-0-2", "half-4-4", "finish-0-6"]);
    // Every consecutive pair must be a straight line along one axis — that is what makes the
    // legs drivable blind.
    const cells = route.waypoints.map((point) => point.cell);
    for (let index = 1; index < cells.length; index += 1) {
      const straight = cells[index].x === cells[index - 1].x || cells[index].y === cells[index - 1].y;
      assert.ok(straight, `leg ${index} is diagonal: ${JSON.stringify(cells[index - 1])} → ${JSON.stringify(cells[index])}`);
    }
  });
});

describe("dropping corners the grid invented", () => {
  it("crosses an open room in one leg", () => {
    // A four-neighbour path across open floor is a staircase, and its corners belong to the
    // grid rather than the course. Measured cost of keeping them on the starter level: an
    // 11.4s drive became 24.5s, chasing three right-angles across a room.
    const map = grid([
      "S....",
      ".....",
      ".....",
      "....F",
    ]);
    const smoothed = smoothPath(map, pathCorners(findPath(map, { x: 0, y: 0 }, { x: 4, y: 3 })));
    assert.deepEqual(smoothed, [{ x: 0, y: 0 }, { x: 4, y: 3 }]);
  });

  it("keeps the corner a corridor genuinely imposes", () => {
    const map = grid([
      "S...",
      "###.",
      "F...",
    ]);
    const smoothed = smoothPath(map, pathCorners(findPath(map, { x: 0, y: 0 }, { x: 0, y: 2 })));
    assert.ok(smoothed.length >= 3, "there is no straight line through the wall");
    assert.deepEqual(smoothed[0], { x: 0, y: 0 });
    assert.deepEqual(smoothed.at(-1), { x: 0, y: 2 });
  });

  it("refuses a line that only a point could take", () => {
    // The diagonal between these two floors passes exactly between two wall corners. A ball
    // has width, so this is a collision, and the ribbon test is what knows that.
    const map = grid([
      "S#",
      "#F",
    ]);
    assert.equal(hasLineOfSight(map, { x: 0, y: 0 }, { x: 1, y: 1 }), false);
  });

  it("refuses a line that grazes a wall corner", () => {
    const map = grid([
      "S..",
      ".#.",
      "..F",
    ]);
    assert.equal(hasLineOfSight(map, { x: 0, y: 0 }, { x: 2, y: 2 }), false);
  });

  it("allows a clear diagonal", () => {
    const map = grid([
      "S..",
      "...",
      "..F",
    ]);
    assert.equal(hasLineOfSight(map, { x: 0, y: 0 }, { x: 2, y: 2 }), true);
  });

  it("never smooths a path into something unwalkable", () => {
    // The property that makes smoothing safe to steer blind: every kept leg is drivable.
    const map = grid([
      "S......",
      "####.#.",
      "...#...",
      ".#...#.",
      "F.....#",
    ]);
    const smoothed = smoothPath(map, pathCorners(findPath(map, { x: 0, y: 0 }, { x: 0, y: 4 })));
    for (let index = 1; index < smoothed.length; index += 1) {
      assert.ok(
        hasLineOfSight(map, smoothed[index - 1], smoothed[index]),
        `leg ${index} is not drivable: ${JSON.stringify(smoothed[index - 1])} → ${JSON.stringify(smoothed[index])}`,
      );
    }
  });
});

describe("shortening the ring order", () => {
  it("measures the length of an order from the start", () => {
    const matrix = [[0, 3, 9], [3, 0, 4], [9, 4, 0]];
    assert.equal(routeLength(matrix, [1, 2]), 7);
    assert.equal(routeLength(matrix, [2, 1]), 13);
  });

  it("reverses a segment when that is shorter", () => {
    // A route that crosses itself is always improved by reversing between the crossings; this
    // is the class greedy nearest-first gets wrong.
    const matrix = [[0, 3, 9], [3, 0, 4], [9, 4, 0]];
    assert.deepEqual(improveRingOrder(matrix, [2, 1]), [1, 2]);
  });

  it("leaves an order that is already shortest alone", () => {
    const matrix = [[0, 3, 9], [3, 0, 4], [9, 4, 0]];
    assert.deepEqual(improveRingOrder(matrix, [1, 2]), [1, 2]);
  });

  it("does nothing to a single stop, where there is nothing to rearrange", () => {
    assert.deepEqual(improveRingOrder([[0, 1], [1, 0]], [1]), [1]);
    assert.deepEqual(improveRingOrder([], []), []);
  });

  it("reverses even a pair, because the start is fixed", () => {
    // [b, a] and [a, b] are different routes when you must begin at the start; a guard that
    // required three stops left the commonest improvement on the table.
    assert.deepEqual(improveRingOrder([[0, 9, 3], [9, 0, 4], [3, 4, 0]], [1, 2]), [2, 1]);
  });

  it("builds a symmetric matrix with the start at index zero", () => {
    const map = grid(["S..o", "....", "o..."]);
    const rings = cellsOf(map, "ring");
    const matrix = routeDistanceMatrix(map, { x: 0, y: 0 }, rings);
    assert.equal(matrix.length, 3);
    assert.equal(matrix[0][0], 0);
    for (let a = 0; a < 3; a += 1) for (let b = 0; b < 3; b += 1) assert.equal(matrix[a][b], matrix[b][a]);
    assert.equal(matrix[0][1], 3, "start to the ring at (3,0)");
  });

  it("records an unreachable pair as Infinity rather than omitting it", () => {
    const map = grid(["S#o"]);
    const matrix = routeDistanceMatrix(map, { x: 0, y: 0 }, cellsOf(map, "ring"));
    assert.equal(matrix[0][1], Infinity);
  });

  it("beats greedy on a course where greedy strands itself", () => {
    // Greedy takes the ring one step away first and then has to cross the whole corridor twice.
    // Going to the far end first and sweeping back is shorter.
    const map = grid([
      "S.o.....o",
      "#########",
      "o........",
    ]);
    const rings = cellsOf(map, "ring");
    const start = { x: 0, y: 0 };
    const matrix = routeDistanceMatrix(map, start, rings);
    const greedy = [];
    {
      const remaining = rings.map((_, index) => index + 1);
      let at = 0;
      while (remaining.length > 0) {
        let best = 0;
        for (let index = 1; index < remaining.length; index += 1) {
          if (matrix[at][remaining[index]] < matrix[at][remaining[best]]) best = index;
        }
        at = remaining.splice(best, 1)[0];
        greedy.push(at);
      }
    }
    const improved = improveRingOrder(matrix, greedy);
    assert.ok(
      routeLength(matrix, improved) <= routeLength(matrix, greedy),
      `2-opt must never lengthen a route: ${routeLength(matrix, improved)} vs ${routeLength(matrix, greedy)}`,
    );
  });

  it("never returns an order that drops or repeats a ring", () => {
    // The property a resequencer breaks silently: a course missing one ring can never finish.
    const map = grid([
      "S..o..o",
      ".#####.",
      "o..o..o",
    ]);
    const rings = cellsOf(map, "ring");
    const { ordered, unreachable } = orderRings(map, { x: 0, y: 0 }, rings);
    assert.deepEqual(unreachable, []);
    assert.equal(ordered.length, rings.length);
    const seen = new Set(ordered.map((cell) => `${cell.x},${cell.y}`));
    assert.equal(seen.size, rings.length);
    for (const ring of rings) assert.ok(seen.has(`${ring.x},${ring.y}`), `ring ${ring.x},${ring.y} was dropped`);
  });
});
