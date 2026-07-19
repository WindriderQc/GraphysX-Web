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
 *
 * ## The look (PRODUCT_SPEC §14 phase 5, "to the BallZ18 aesthetic bar")
 *
 * The first cut of this file was functionally complete and read as a grey-box: an untextured
 * tan slab with plain orange blocks, floating against a skybox mountain. Everything that
 * fixes it is vocabulary that had already graduated, so none of it is new rendering:
 *
 * - **Textures.** The floor takes `checker` and the walls `wood-floor`, both of which are
 *   literally the BallZ18 archive's own surfaces (`Damier.jpg`, `WoodFloor05_col.jpg`). The
 *   checker is not decoration: its repeat is pinned to the grid at one tile per two cells, so
 *   it is a *scale and speed cue*, which is the thing a rolling-ball game reads motion from.
 *   The ball carries the same checker for the same reason — an untextured sphere rolling and
 *   an untextured sphere sliding look identical.
 * - **Terrain.** The arena now sits ON something. A `terrain` entity puts a levelled pad
 *   under the plinth at exactly the plinth's underside, and lets the landform fall away and
 *   rise into hills beyond it. This depends on `flattenRadius` being a guarantee rather than
 *   an approximation, which it only recently became.
 * - **A low sun.** The key light was near-overhead, so walls cast a two-pixel shadow onto
 *   their own base and the floor read as flat paint. Dropped to a raking angle, the same
 *   light lays the grid out in long shadows and the ball gets the contact shadow that sells
 *   this genre.
 * - **Emitters**, on landmarks only — see `EMITTER_BUDGET` below.
 *
 * ## On the shader pass §14 also asks for
 *
 * Not done, as a decision rather than an omission. There is no post-processing stage in
 * `PlatformHost` and no v2 field that could describe one, so a bloom/vignette pass would mean
 * either bespoke host rendering (which the invariant forbids — the beauty has to be scene
 * data, or we have decorated a port) or threading a whole new `environment.postProcessing`
 * concept through the runtime, both API implementations and the editor. That is a feature,
 * not a finish pass, and it would land on a scene already running at single-digit fps under
 * the harness's software GL, where a full-screen composite is the most expensive thing
 * available. The one real shader this scene does run is the emitters': the particle system is
 * a `ShaderMaterial` with per-particle colour/size ramps, so the glow at the gates is GPU
 * shader work reached through ordinary scene vocabulary. That is the honest extent of it.
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
  // Tints, not colours: both of these multiply a texture, so they are lighter than the
  // surface they are meant to produce.
  floor: { color: "#f0dcaa", roughness: 0.62, metalness: 0.04 },
  // Near-neutral, because `marble09.jpg` is already a warm tan scan. Tinting it warm as well
  // (the first two attempts) compounded into terracotta and the arena read as rusty rather
  // than quarried.
  wall: { color: "#ddd8cc", roughness: 0.42, metalness: 0.08 },
  // Emissive intensities are deliberately high on everything that is *information* — a ring
  // you must collect, a gate you must reach. Under a raking sun the arena has real shadow in
  // it now, and a landmark that only reflects light disappears into the dark half of the
  // grid. Glow is how a target stays legible from any angle.
  hazard: { color: "#f95f4c", emissive: "#c22a10", emissiveIntensity: 1.15, roughness: 0.35, metalness: 0.25 },
  ring: { color: "#fff2c2", emissive: "#ffc63a", emissiveIntensity: 1.9, roughness: 0.16, metalness: 0.85 },
  half: { color: "#ffbf69", emissive: "#e07d16", emissiveIntensity: 1.5 },
  finish: { color: "#78f0d0", emissive: "#12b394", emissiveIntensity: 1.7 },
  fire: { color: "#ff5a24", emissive: "#c62a00", emissiveIntensity: 1.6 },
  ice: { color: "#9df2ff", emissive: "#1d9fc4", emissiveIntensity: 0.85, roughness: 0.06, metalness: 0.2 },
  ball: { color: "#f4fbff", roughness: 0.3, metalness: 0.06 },
  // Tuned across four screenshots, and the lesson was about intensity rather than hue. A
  // saturated body with a matching emissive read as cyan plastic; a near-white body at
  // intensity 2.6 overcorrected into blank white posts, because with no bloom pass an
  // emissive that strong simply clips under ACES and takes the hue with it. Lightening the
  // body while pulling the intensity *down* to sub-1 is what actually works: the emissive
  // lifts the material out of shadow without saturating it, so the colour survives.
  pylon: { color: "#7fdcee", emissive: "#1fbcd8", emissiveIntensity: 0.85, roughness: 0.22, metalness: 0.35 },
} as const;

/**
 * How many `emitter` entities one materialised level may spend, and — more importantly — what
 * they are spent on.
 *
 * Pillar 5 is the budget, and particles are the easiest thing in this vocabulary to ruin a
 * frame with. The rule is that **emitters mark landmarks, never repeats**: the finish, the
 * halfway gate and the start are one-of-a-kind, so they can each afford one. Rings and
 * hazards can number in the dozens on a real grid, so they are lit by material alone —
 * emissive and metalness cost nothing per instance, and a level where eight of twenty rings
 * shimmered and the rest did not would look broken rather than budgeted. Fire tiles get
 * what is left over, in grid order, and anything past the cap is reported as a deviation
 * rather than silently dropped.
 */
const EMITTER_BUDGET = 8;

/** Floor slab thickness. It is a plinth the terrain pad meets, not a sheet of paper. */
const FLOOR_THICKNESS_RATIO = 0.6;

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

  // Landmark emitters are *requested* here and allocated after the grid walk, because the
  // budget has to be spent in priority order and the finish gate may well be the last tile
  // scanned. Collecting requests keeps that ordering honest instead of first-come.
  type EmitterRequest = { priority: number; entity: AgentWorldEntityDefinition };
  const emitterRequests: EmitterRequest[] = [];

  const extentX = width * cellSize;
  const extentZ = height * cellSize;
  const floorThickness = cellSize * FLOOR_THICKNESS_RATIO;

  // One floor slab rather than a box per walkable tile. A 64×64 level is 4096 cells, and
  // spawning 4096 static bodies to represent a flat plane would cost the physics broadphase
  // dearly for a surface the ball experiences as continuous. Walls stay per-tile because
  // their arrangement is the level.
  // The play surface and the thing it stands on are two entities, which is not a decorative
  // split. A single thick textured slab wraps the same checker down its four sides, and a
  // 20x20 board squeezed into a 1.5-unit-tall face smears into horizontal stripes — clearly
  // visible in the screenshot before this change. Separating them also puts the collider
  // exactly where the eye says the ground is: `ballz-floor` is the only body the ball can
  // ever touch, and the plinth below carries no physics at all.
  const playSurfaceThickness = cellSize * 0.08;
  entities.push({
    id: "ballz-plinth",
    type: "box",
    label: "Arena Plinth",
    transform: { position: [0, -playSurfaceThickness - (floorThickness - playSurfaceThickness) / 2, 0] },
    geometry: { width: extentX, height: floorThickness - playSurfaceThickness, depth: extentZ },
    // Quarried stone, no checker: this is the mass the arena is cut from, and reading it as
    // one dark block is what makes the bright playfield on top look inlaid.
    material: { color: "#7d6a52", roughness: 0.85, metalness: 0.05, texture: { id: "marble" as const, repeat: [Math.max(2, width / 6), 1] as [number, number] } },
    castShadow: false,
    tags: ["ballz", "floor", "plinth"],
  });

  entities.push({
    id: "ballz-floor",
    type: "box",
    label: "Level Floor",
    // Top face stays at y = 0 — walls, the ball's rest height and the smoke's wall test all
    // measure from it. Nothing above the play surface moved when the plinth was added below.
    transform: { position: [0, -playSurfaceThickness / 2, 0] },
    geometry: { width: extentX, height: playSurfaceThickness, depth: extentZ },
    material: {
      ...PALETTE.floor,
      // Exactly one checker square per grid cell. `Damier.jpg` is not a 1x1 checker — it is a
      // 20x20 board in a single image, so the repeat that aligns the pattern to the level is
      // `cells / 20`, not `cells`. Getting that wrong (repeat = width/2, the obvious guess)
      // put ten squares in every cell and the floor came out as grey noise; screenshot-checked
      // both ways. Aligned, the pattern *is* the level's coordinate system, so a player reads
      // distance and speed off the floor instead of guessing at a flat colour — which is the
      // whole reason a rolling-ball game has a checkered floor in the first place.
      texture: { id: "checker" as const, repeat: [width / 20, height / 20] as [number, number] },
    },
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
          // `marble09.jpg`, one tile per block. The first attempt used the BallZ18 wood floor
          // for provenance reasons and it was simply wrong: that scan is near-black and made
          // of hairline planks, so a wall run rendered as an undifferentiated chocolate bar
          // (screenshot-checked). Marble is mid-tone, warm, and veined at a scale you can
          // actually see on a 2.6-unit block — and a marble arena over a checkered floor is
          // the honest ancestry of this whole genre anyway.
          //
          // The image is loaded once and shared by every wall in the level: three keys the GPU
          // upload on the texture `Source`, and the runtime clones from one cached load, so N
          // walls cost N draw calls but only one upload.
          material: { ...PALETTE.wall, texture: { id: "marble" as const, repeat: [1, 1] as [number, number] } },
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
          material: { color: "#dff8ff", emissive: "#3fc8e8", emissiveIntensity: 1.6, opacity: 0.75, roughness: 0.2, metalness: 0.3 },
          castShadow: false,
          tags: ["ballz", "start"],
        });
        emitterRequests.push({
          priority: 2,
          entity: {
            id: "ballz-start-spark",
            type: "emitter",
            label: "Start Shimmer",
            transform: { position: [cell.worldX, cellSize * 0.18, cell.worldZ] },
            // Sparse and low: this marks where you began, so it must not compete with the
            // finish for the eye or sit in front of the ball you are trying to steer.
            emitter: { preset: "energy-orb", sizeScale: 2.6, speed: 1.1, spread: 2.4, maxParticles: 22, color: "#bfefff" },
            tags: ["ballz", "start", "effect"],
          },
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
          // Lifted to the ball's own centre height and stood upright, so it is a hoop you roll
          // *through* rather than a washer lying on the ground. Slightly fatter tube, because
          // the old one was a wire at play distance.
          transform: { position: [cell.worldX, cellSize * 0.34, cell.worldZ], rotationDegrees: [90, 0, 0] },
          geometry: { radius: cellSize * 0.3, tube: cellSize * 0.07 },
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
          material: { ...(tile === "half" ? PALETTE.half : PALETTE.finish), opacity: 0.45, roughness: 0.2, metalness: 0.1 },
          physics: { mode: "trigger" },
          castShadow: false,
          tags: ["ballz", tile === "half" ? "half" : "finish", "gate"],
        });
        // The goal has to read as a goal from across the arena. A translucent slab did not;
        // a standing column of light in the gate's own colour does, and it costs one emitter.
        emitterRequests.push({
          priority: tile === "finish" ? 0 : 1,
          entity: {
            id: `${id}-glow`,
            type: "emitter",
            label: tile === "half" ? "Halfway Beacon" : "Finish Beacon",
            transform: { position: [cell.worldX, wallHeight * 0.25, cell.worldZ] },
            emitter: {
              preset: "firetrail",
              sizeScale: 3.4,
              speed: 2.2,
              spread: 1.4,
              maxParticles: 90,
              color: tile === "half" ? "#ffbf69" : "#78f0d0",
            },
            tags: ["ballz", tile === "half" ? "half" : "finish", "effect"],
          },
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
        emitterRequests.push({
          priority: 3,
          entity: {
            id: `ballz-fire-${suffix}-flame`,
            type: "emitter",
            label: "Fire Jet Flame",
            transform: { position: [cell.worldX, cellSize * 0.2, cell.worldZ] },
            // Aimed straight up and fast, because the tile's mechanic is a vertical launch —
            // the plume is the tell for what will happen to you, not ambience.
            emitter: {
              preset: "campfire",
              sizeScale: 3.2,
              speed: cellSize * 1.4,
              spread: 0.7,
              maxParticles: 120,
              color: "#ff8a2a",
            },
            tags: ["ballz", "fire", "effect"],
          },
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
      // The same archive checker as the floor, tuned to put roughly four squares around the
      // sphere (0.2 of a 20x20 board). A plain sphere rolling and a plain sphere sliding are
      // the same picture; a checkered one tells you which, and that distinction is the entire
      // feel of this genre. The ball also casts — `castShadow` defaults true, and the low sun
      // below is what turns that into the contact shadow that stops it looking like a decal.
      material: { ...PALETTE.ball, texture: { id: "checker" as const, repeat: [0.2, 0.2] as [number, number] } },
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

  // --- Corner pylons -------------------------------------------------------------------
  // Four lit posts just outside the slab. They are not gameplay and they carry no physics —
  // they are the thing that turns a rectangle into a *place*. They also give the low sun
  // something tall to work with: four long shadows laid diagonally across the grid do more
  // for depth than any amount of material tuning on the floor itself.
  for (const [cornerX, cornerZ] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const) {
    const pylonHeight = wallHeight * 2.8;
    entities.push({
      id: `ballz-pylon-${cornerX < 0 ? "w" : "e"}${cornerZ < 0 ? "n" : "s"}`,
      type: "cylinder",
      label: "Corner Pylon",
      transform: {
        position: [
          // Planted ON the plinth corner, not beside it. Set a half-cell clear of the slab
          // they read as four blue lozenges standing on grass with no relationship to the
          // arena; overlapping the corner they read as corner lamps and give the eye the
          // vertical it needs to judge how high the walls are.
          cornerX * (extentX / 2 - cellSize * 0.1),
          -floorThickness + pylonHeight / 2,
          cornerZ * (extentZ / 2 - cellSize * 0.1),
        ],
      },
      geometry: { radius: cellSize * 0.2, height: pylonHeight },
      material: PALETTE.pylon,
      tags: ["ballz", "pylon"],
    });
  }

  // --- The arena sits in a landscape ----------------------------------------------------
  // Previously the slab hung in mid-air in front of a skybox mountain, which is what made the
  // whole thing read as a test fixture: nothing was anywhere. A `terrain` entity fixes that
  // with no bespoke geometry — a levelled pad exactly at the plinth's underside, blending out
  // into real landform. This is only trustworthy because `flattenRadius` is now a guarantee
  // rather than "flat out to the last grid ring inside the radius"; against the old behaviour
  // the pad rim would have ramped and pushed the plinth's corners into the ground.
  const halfDiagonal = Math.hypot(extentX, extentZ) / 2;
  const padRadius = halfDiagonal + cellSize;
  entities.push({
    id: "ballz-terrain",
    type: "terrain",
    label: "Surrounding Land",
    terrain: {
      // `highlands` over `canyon`: the arena is the subject, and canyon walls crowd a play
      // camera that has to look down at a grid. Rolling upland reads as distance instead.
      heightmap: "highlands",
      // Big enough that the horizon is landform rather than the pad's own edge, capped so a
      // 44x30 grid does not ask for a kilometre of ground it will never show.
      size: Math.min(420, Math.max(150, padRadius * 6)),
      segments: 96,
      heightScale: 18,
      // The field's floor sits below the arena and its ridges above it, so the level is *in*
      // the landscape rather than on a plate above it.
      heightOffset: -floorThickness - 5,
      flattenRadius: padRadius,
      flattenFalloff: Math.max(12, padRadius * 0.85),
      // Exactly the plinth's underside. The slab lands on the pad instead of hovering over
      // it, and the cellSize*0.6 of plinth left proud reads as a kerb around the arena.
      flattenHeight: -floorThickness,
    },
    transform: { position: [0, 0, 0] },
    // Cooler and darker than the showroom's field. The arena is warm stone under a warm sun,
    // and a bright pea-green surround was competing with it for attention instead of sitting
    // behind it; dropping the value also lets the arena's own cast shadow read on the ground.
    material: { color: "#57683f", roughness: 0.96, metalness: 0.02, emissive: "#0a1206", emissiveIntensity: 0.1 },
    // Receives the arena's shadows, casts none of its own: a 96x96 landform in the shadow
    // pass buys nothing at this camera distance and is the single most expensive caster here.
    castShadow: false,
    tags: ["ballz", "terrain"],
  });

  // --- Spend the emitter budget ---------------------------------------------------------
  emitterRequests.sort((left, right) => left.priority - right.priority);
  for (const request of emitterRequests.slice(0, EMITTER_BUDGET)) entities.push(request.entity);
  if (emitterRequests.length > EMITTER_BUDGET) {
    deviations.push(
      `${emitterRequests.length - EMITTER_BUDGET} fire tiles were left without a flame emitter; a level may spend ${EMITTER_BUDGET} emitters and gates are served first.`
    );
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
        // Late-afternoon, not noon. The first version put the sun at 0.7x the arena's width
        // straight up, which is within a few degrees of overhead: every wall cast a shadow
        // roughly its own footprint, hidden underneath itself, and the floor came out as flat
        // paint with no contact anywhere. Screenshot-verified — the only shadow visible in the
        // whole frame was a two-pixel strip on one inner wall face.
        //
        // Dropping the elevation to ~0.42x the extent while pushing the light out to 0.85x
        // gives about a 26 degrees sun. Walls now throw shadows several cells long across the grid,
        // the pylons rake diagonally, and the ball gets a real contact shadow — which in a
        // rolling-ball game is most of what sells that it is touching the ground at all.
        // Kept inside the runtime's 260-unit shadow far plane by construction.
        transform: {
          position: [
            -Math.max(14, extentX * 0.85),
            Math.max(11, Math.max(extentX, extentZ) * 0.42),
            Math.max(10, extentZ * 0.6),
          ],
        },
        intensity: 3.4,
        material: { color: "#ffe2b0" },
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
