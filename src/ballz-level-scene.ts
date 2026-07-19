import {
  GRAPHYSX_AGENT_WORLD_SCHEMA,
  type AgentWorldEntityDefinition,
  type AgentWorldVector3,
  type GraphysXAgentWorldApi,
} from "./agent-world-runtime";
import type { AgentLevelState } from "./agent-level-library";

/**
 * Turns an authored ASCII level into a playable `graphysx.agent-world/v2` scene.
 *
 * This is the piece the platform was missing. `agent-level-library.ts` is pure data — it
 * stores grids and has never produced a single entity — and `levels.play()` was a hardcoded
 * failure saying playable surfaces were "not available in the standalone host yet". So the
 * level workbench could author a layout that nothing could ever run. This module closes that
 * loop, and it is deliberately the *only* new concept: everything below is an ordinary
 * `api.create` payload, so a materialised level is an editable scene like any other. Select a
 * wall and drag it; an agent can `api.update` the finish gate. Nothing here is a game engine
 * hiding behind the runtime.
 *
 * It is a rebuild, not a port. `race-scene.ts:7153` has a grid materialiser, but it mutates
 * the three.js scene graph directly and produces inspection geometry with no physics, no
 * collision and no ball. Its *tile vocabulary* is worth keeping (see the palette below), so
 * the look is carried across while the mechanism is rewritten on v2 vocabulary.
 *
 * The gameplay verbs are `trigger` volumes, which is why this could not have been built
 * before them: a ring that notices the ball crossing it, a finish gate that fires once, a
 * fire tile that launches. Those are the first genuine in-world cause-and-effect the
 * vocabulary has had — the rules layer that decides what a crossing *means* (a lap, a win)
 * sits above this and is not the shape's business.
 */

/** Grid coordinates map (x, row) → world (x, z); the level is centred on the origin. */
type Cell = { x: number; y: number; worldX: number; worldZ: number };

export type BallzLevelComposition = {
  /** The level this was built from, so a caller can report what it ran. */
  levelId: string;
  /** The dynamic sphere the player pushes around. Absent when the level has no `start`. */
  ballId: string | null;
  /** Where the ball was placed, for camera framing and for re-spawning it. */
  spawnPosition: [number, number, number] | null;
  /** Trigger ids by role, so a rules layer can subscribe without re-deriving them. */
  ringIds: string[];
  halfId: string | null;
  finishId: string | null;
  /** Entities created in total, including the floor. */
  entityCount: number;
  /** Departures from the authored grid, named rather than silently applied. */
  deviations: string[];
};

/**
 * Palette carried over from the legacy materialiser (`race-scene.ts:7188-7323`) so an
 * authored level reads the same colours it always has. Sizes are re-derived from `cellSize`
 * rather than copied, because the legacy code assumed a fixed tile size.
 */
const PALETTE = {
  floor: { color: "#d6b66b", roughness: 0.58, metalness: 0.08 },
  wall: { color: "#bd8b3d", roughness: 0.48, metalness: 0.1 },
  hazard: { color: "#f95f4c", emissive: "#461008", emissiveIntensity: 0.8 },
  ring: { color: "#fff2c2", emissive: "#6b5a1f", emissiveIntensity: 0.6 },
  half: { color: "#ffbf69", emissive: "#5c3b12", emissiveIntensity: 0.7 },
  finish: { color: "#78f0d0", emissive: "#0f5244", emissiveIntensity: 0.8 },
  fire: { color: "#ff5a24", emissive: "#8c1800", emissiveIntensity: 1.1 },
  ice: { color: "#75eaff", emissive: "#064963", emissiveIntensity: 0.5 },
  ball: { color: "#eaf6ff", roughness: 0.24, metalness: 0.12 },
} as const;

/**
 * Ball radius as a fraction of a cell. Sized so it clears a one-cell gap comfortably but
 * cannot squeeze between two diagonal walls, which is what makes a grid level readable.
 */
const BALL_RADIUS_RATIO = 0.18;

/**
 * The ball's steering set. Exported so the input binding maps a key to an interaction id
 * rather than re-deriving a direction vector — one definition of "north", not two.
 * Magnitudes scale with `cellSize`, so a coarser grid pushes proportionally harder.
 */
export const PUSH_DIRECTIONS = [
  { id: "push-north", label: "Push north", vector: [0, 0, -1] as const, key: "ArrowUp" },
  { id: "push-south", label: "Push south", vector: [0, 0, 1] as const, key: "ArrowDown" },
  { id: "push-west", label: "Push west", vector: [-1, 0, 0] as const, key: "ArrowLeft" },
  { id: "push-east", label: "Push east", vector: [1, 0, 0] as const, key: "ArrowRight" },
] as const;

export function composeBallzLevel(api: GraphysXAgentWorldApi, level: AgentLevelState): BallzLevelComposition {
  const { width, height, cellSize, tiles } = level;
  const deviations: string[] = [];

  // Centre the grid on the origin so the default camera framing works for any level size,
  // and so a level stays centred when it is resized from the workbench.
  const originX = -((width - 1) * cellSize) / 2;
  const originZ = -((height - 1) * cellSize) / 2;
  const cellAt = (x: number, y: number): Cell => ({
    x,
    y,
    worldX: originX + x * cellSize,
    worldZ: originZ + y * cellSize,
  });

  const entities: AgentWorldEntityDefinition[] = [];
  const ringIds: string[] = [];
  let halfId: string | null = null;
  let finishId: string | null = null;
  let spawnPosition: [number, number, number] | null = null;

  // One floor slab rather than a box per walkable tile. A 64×64 level is 4096 cells, and
  // spawning 4096 static bodies to represent a flat plane would cost the physics broadphase
  // dearly for a surface the ball experiences as continuous. Walls stay per-tile because
  // their arrangement is the level.
  entities.push({
    id: "ballz-floor",
    type: "box",
    label: "Level Floor",
    transform: { position: [0, -cellSize * 0.12, 0] },
    geometry: { width: width * cellSize, height: cellSize * 0.24, depth: height * cellSize },
    material: PALETTE.floor,
    physics: { mode: "static", material: "ground" },
    castShadow: false,
    tags: ["ballz", "floor"],
  });

  const wallHeight = cellSize * 0.62;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const tile = tiles[y * width + x];
      if (!tile || tile === "floor") continue;
      const cell = cellAt(x, y);
      const suffix = `${x}-${y}`;

      if (tile === "wall") {
        entities.push({
          id: `ballz-wall-${suffix}`,
          type: "box",
          label: "Wall",
          transform: { position: [cell.worldX, wallHeight / 2, cell.worldZ] },
          geometry: { width: cellSize * 0.98, height: wallHeight, depth: cellSize * 0.98 },
          material: PALETTE.wall,
          physics: { mode: "static", material: "wall" },
          tags: ["ballz", "wall"],
        });
        continue;
      }

      if (tile === "hazard") {
        // Solid, not a trigger: a hazard the ball passes through would read as decoration.
        // It deflects, and a rules layer above can treat the collision as a penalty.
        entities.push({
          id: `ballz-hazard-${suffix}`,
          type: "box",
          label: "Hazard",
          transform: { position: [cell.worldX, cellSize * 0.16, cell.worldZ], rotationDegrees: [0, 45, 0] },
          geometry: { width: cellSize * 0.5, height: cellSize * 0.32, depth: cellSize * 0.5 },
          material: PALETTE.hazard,
          physics: { mode: "static", material: "wall" },
          tags: ["ballz", "hazard"],
        });
        continue;
      }

      if (tile === "start") {
        // The start tile is a spawn point, not an object. It contributes the ball's position
        // and a floor decal so the player can see where they began.
        spawnPosition = [cell.worldX, cellSize * BALL_RADIUS_RATIO + cellSize * 0.08, cell.worldZ];
        entities.push({
          id: "ballz-start-pad",
          type: "cylinder",
          label: "Start Pad",
          transform: { position: [cell.worldX, cellSize * 0.02, cell.worldZ] },
          geometry: { radius: cellSize * 0.42, height: cellSize * 0.04 },
          material: { color: "#dff8ff", emissive: "#1d4d5c", emissiveIntensity: 0.5, opacity: 0.55 },
          castShadow: false,
          tags: ["ballz", "start"],
        });
        continue;
      }

      if (tile === "ring") {
        // Collecting a ring is the ring hiding itself. `toggle-visibility` on its own id is
        // the whole mechanic — no bespoke collection state, and it survives export→load
        // because visibility is an ordinary serialised entity field.
        const id = `ballz-ring-${suffix}`;
        ringIds.push(id);
        entities.push({
          id,
          type: "torus",
          label: "Ring",
          transform: { position: [cell.worldX, cellSize * 0.3, cell.worldZ], rotationDegrees: [90, 0, 0] },
          geometry: { radius: cellSize * 0.3, tube: cellSize * 0.05 },
          material: PALETTE.ring,
          physics: { mode: "trigger" },
          behaviors: [{ type: "spin", axis: "z", speedDegrees: 63 }],
          interactions: [{ id: `${id}-collect`, label: "Collect ring", type: "toggle-visibility", targetIds: [id] }],
          tags: ["ballz", "ring", "collectible"],
        });
        continue;
      }

      if (tile === "half" || tile === "finish") {
        const id = tile === "half" ? "ballz-half-gate" : "ballz-finish-gate";
        if (tile === "half") halfId = id;
        else finishId = id;
        entities.push({
          id,
          type: "box",
          label: tile === "half" ? "Halfway Gate" : "Finish Gate",
          transform: { position: [cell.worldX, wallHeight * 0.5, cell.worldZ] },
          geometry: { width: cellSize * 0.94, height: wallHeight, depth: cellSize * 0.5 },
          material: { ...(tile === "half" ? PALETTE.half : PALETTE.finish), opacity: 0.42 },
          physics: { mode: "trigger" },
          castShadow: false,
          tags: ["ballz", tile === "half" ? "half" : "finish", "gate"],
        });
        continue;
      }

      if (tile === "fire") {
        // A launcher. The impulse targets the ball rather than "whatever crossed", because
        // `interactions` fire the trigger's own set and carry no reference to the crosser —
        // a documented limit of the trigger primitive, not something worked around here.
        entities.push({
          id: `ballz-fire-${suffix}`,
          type: "cylinder",
          label: "Fire Jet",
          transform: { position: [cell.worldX, cellSize * 0.14, cell.worldZ] },
          geometry: { radius: cellSize * 0.38, height: cellSize * 0.28 },
          material: { ...PALETTE.fire, opacity: 0.6 },
          physics: { mode: "trigger" },
          interactions: [
            {
              id: `ballz-fire-${suffix}-launch`,
              label: "Launch",
              type: "apply-impulse",
              targetIds: ["ballz-ball"],
              impulse: [0, cellSize * 2.6, 0],
            },
          ],
          castShadow: false,
          tags: ["ballz", "fire"],
        });
        continue;
      }

      if (tile === "ice") {
        // v2 physics materials are a fixed preset enum with no `ice` member. `finish` is the
        // slipperiest available (friction 0.16 against ground's 0.45), so it stands in. This
        // is a real departure from the tile's "attractive force, preserves momentum"
        // semantics — the low friction is honest, the attraction is simply not modelled.
        entities.push({
          id: `ballz-ice-${suffix}`,
          type: "box",
          label: "Ice Patch",
          transform: { position: [cell.worldX, cellSize * 0.02, cell.worldZ] },
          geometry: { width: cellSize * 0.96, height: cellSize * 0.06, depth: cellSize * 0.96 },
          material: { ...PALETTE.ice, opacity: 0.82 },
          physics: { mode: "static", material: "finish" },
          castShadow: false,
          tags: ["ballz", "ice"],
        });
        continue;
      }
    }
  }

  if (!spawnPosition) {
    // A level with no `start` is still worth materialising — it is a layout being authored.
    // Say so rather than inventing a spawn in a corner that may be inside a wall.
    deviations.push("Level has no start tile, so no ball was spawned.");
  } else {
    entities.push({
      id: "ballz-ball",
      type: "sphere",
      label: "Ball",
      transform: { position: spawnPosition },
      geometry: { radius: cellSize * BALL_RADIUS_RATIO },
      material: PALETTE.ball,
      physics: { mode: "dynamic", material: "ball", mass: 1.6 },
      // Steering lives ON the ball, as four ordinary `apply-impulse` interactions. There is no
      // impulse call in the public API — impulses exist only as an entity's interaction — so
      // this is not a workaround, it is the only way to push anything, and it means the control
      // scheme is scene data: it serialises, an agent can fire it with `api.interact`, and a
      // human's arrow key and an agent's call are literally the same operation.
      interactions: PUSH_DIRECTIONS.map(({ id, label, vector }) => ({
        id,
        label,
        type: "apply-impulse" as const,
        targetIds: ["ballz-ball"],
        impulse: vector.map((axis) => axis * cellSize) as AgentWorldVector3,
      })),
      tags: ["ballz", "ball", "player"],
    });
  }

  if (tiles.some((tile) => tile === "ice")) {
    deviations.push("Ice tiles use the `finish` physics preset (friction 0.16); the tile's attraction is not modelled.");
  }
  if (tiles.some((tile) => tile === "fire")) {
    deviations.push("Fire tiles launch the ball by id, because a trigger's interactions do not name the entity that crossed it.");
  }

  api.create({
    schema: GRAPHYSX_AGENT_WORLD_SCHEMA,
    id: `ballz-level-${level.id}`,
    label: level.label,
    environment: {
      background: "#0d1a24",
      // The sky is not decoration here, it is the lighting fix. Without one, `PlatformHost`
      // falls back to a neutral RoomEnvironment IBL that lights every surface from every
      // direction, and an enclosed arena under it renders almost perfectly flat — wall
      // shadows disappear into the ambient. A sky replaces that probe with a directional
      // one, which is what lets the raking shadows read. Measured against all six sets:
      // `clearblue` is a 512 px set that reads as muddy brown at play angles; `lostvalley`
      // gives the strongest ground-to-sky contrast. It is an ordinary per-scene field, so a
      // level can be re-skied from the inspector or by `api.update` without touching this.
      sky: "lostvalley",
      // The level brings its own floor slab, so the runtime's flat grid would z-fight it.
      ground: { visible: false, size: 60, color: "#123039", grid: false, gridColor: "#2a7d8f" },
      // Warm key + cool fill, angled so walls cast readable shadows down the grid rather
      // than straight down, which is what makes the layout legible from a play camera.
      physics: { gravity: [0, -9.81, 0] },
    },
    entities: [
      {
        id: "ballz-key",
        type: "directional-light",
        label: "Key Light",
        transform: { position: [-width * cellSize * 0.4, Math.max(18, width * cellSize * 0.7), -height * cellSize * 0.35] },
        intensity: 3.1,
        material: { color: "#ffeccd" },
        castShadow: true,
        tags: ["ballz", "lighting"],
      },
      {
        id: "ballz-fill",
        type: "ambient-light",
        label: "Fill",
        // Deliberately low. The sky probe above already supplies most of the ambient, and a
        // heavier fill here was what washed the cast shadows out to nothing.
        intensity: 0.14,
        material: { color: "#9fc4d8" },
        tags: ["ballz", "lighting"],
      },
      ...entities,
    ],
  });

  return {
    levelId: level.id,
    ballId: spawnPosition ? "ballz-ball" : null,
    spawnPosition,
    ringIds,
    halfId,
    finishId,
    entityCount: entities.length + 2,
    deviations,
  };
}
