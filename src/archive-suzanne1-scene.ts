import { Vector3 } from "three";
import {
  GRAPHYSX_AGENT_RULES_SCHEMA,
  GRAPHYSX_AGENT_WORLD_SCHEMA,
  type AgentWorldEntityDefinition,
  type AgentWorldVector3,
  type GraphysXAgentWorldApi,
} from "./agent-world-runtime";
import type { PlatformHost } from "./platform-host";
import suzanne1 from "./legacy/suzanne1-ascii-scene.json";

/**
 * Suzanne 1 — the authored 40×40 arena, composed as a v2 scene.
 *
 * This is the skipped record `ARCHIVE_BALLZ_NOT_REVIVED` called "the one that is not a
 * 'cannot'": the bytes are in-repo with a source SHA (`Suzanne1.ASCII 64ec6746…`), and its
 * verdict asked for exactly this — "a composed v2 scene where the chains and pistons can
 * exist" — because a grid conversion had no tile for the things that make it this arena.
 *
 * Everything positional is the archive's own number under one declared mapping: TV3D cell
 * space `[col + 0.5, 0.5, row + 0.5]` → world `(p - 20) × 2.4` per axis (centred, and scaled
 * by the same 2.4 the classic grid levels use, because the archive's 1-unit cell has no
 * meaning against this platform's fixed gravity). Textures are the recovered Suzanne1 set
 * under the source2017 bindings the decode carries per wall (`objet39`, `Podium`, grass —
 * the recorded `Grass.jpg` binding lands on the folder's surviving `GrassSample.jpg`).
 *
 * Honest fidelity split:
 * - faithful: all 208 wall cubes (dynamic, as archived — this arena is pushable), 15 ring
 *   pickups at archived cells wearing `ZRing.png` and spinning at the archived 0.1°/ms, the
 *   3 pistons at archived cells/orientations with the archived ±0.5 travel, 45 chain
 *   assemblies at archived cells with archived per-link scales, line gates between the
 *   archived post pairs, `laps: 3`, the two-body recovered ball (the archived player IS the
 *   FireArrow ball — `internalTexture: FireArrow800.jpg` is in the record).
 * - adapted: piston plates run a constant-speed kinematic oscillation (the archive drove
 *   them with an asymmetric 50/-1 slider-joint force pair; no joint vocabulary exists here);
 *   chains stand as static stacks (archived ball-joint link dynamics need that same missing
 *   joint vocabulary); wall mass is not in the record (1 assumed); the sky is `lostvalley`
 *   (the record says "SkyX/LostValley branch-dependent" — one branch had to be picked).
 * - absent: the two CubX anchors (their runtime menu state is recorded as unresolved), the
 *   XML airplane (its .x mesh is not converted in this repo), the screenshot branch's random
 *   humans (count and seed unrecoverable, as recorded).
 */

const S = 2.4;
const CENTER = 20;

type Tuple3 = readonly [number, number, number];

const world = (p: Tuple3): AgentWorldVector3 => [(p[0] - CENTER) * S, p[1] * S, (p[2] - CENTER) * S];

/** Yaw → the local +X the archive's piston math slides along, in world axes. */
const yawDirection = (yawDegrees: number): [number, number] => {
  const radians = (yawDegrees * Math.PI) / 180;
  return [Math.cos(radians), -Math.sin(radians)];
};

const WALL_TEXTURE: Record<string, "objet39" | "podium" | "grass-sample"> = {
  "#": "objet39",
  z: "podium",
  Z: "grass-sample",
};

function buildEntities(): AgentWorldEntityDefinition[] {
  const data = suzanne1 as Record<string, any>;
  const entities: AgentWorldEntityDefinition[] = [];
  const defaults = data.sceneDefaults;

  // Floor — the archived 40×40 slab, concrete per the source2017 binding, tiled at the
  // archived 16×16 subdivision.
  entities.push({
    id: "suzanne1-floor",
    type: "box",
    label: "Arena Floor",
    transform: { position: world(defaults.floor.center as Tuple3) },
    geometry: { width: defaults.floor.size[0] * S, height: defaults.floor.size[1] * S, depth: defaults.floor.size[2] * S },
    material: { color: "#cfcfcf", roughness: 0.8, metalness: 0.02, texture: { id: "concrete", repeat: [defaults.floor.archivedSubdivision[0], defaults.floor.archivedSubdivision[1]] } },
    physics: { mode: "static", material: "ground" },
    castShadow: false,
    tags: ["suzanne1", "floor"],
  });

  // Walls — every one DYNAMIC, as archived: this arena's signature is that the maze itself
  // can be shoved. Mass is not in the record; 1 per cube is the disclosed assumption.
  for (const wall of data.walls as any[]) {
    entities.push({
      id: `suzanne1-wall-${wall.x}-${wall.z}`,
      type: "box",
      label: `Wall ${wall.symbol}`,
      transform: { position: world(wall.position as Tuple3) },
      geometry: { width: wall.scale[0] * S, height: wall.scale[1] * S, depth: wall.scale[2] * S },
      material: { color: "#ffffff", roughness: 0.82, metalness: 0.04, texture: { id: WALL_TEXTURE[wall.symbol] ?? "objet39", repeat: [1, 1] } },
      physics: { mode: "dynamic", mass: 1, material: "wall" },
      tags: ["suzanne1", "wall"],
    });
  }

  // Rings — sphere pickups wearing the recovered ZRing skin, spinning at the archived
  // 0.1°/ms (= 100°/s). Triggers with the arenas' hide-on-collect mechanic verbatim.
  for (const [index, ring] of (data.rings as any[]).entries()) {
    const id = `suzanne1-ring-${index + 1}`;
    entities.push({
      id,
      type: "sphere",
      label: `Ring ${index + 1}`,
      transform: { position: world(ring.position as Tuple3) },
      geometry: { radius: ring.radius * S, radialSegments: 20 },
      material: { color: "#ffffff", emissive: "#3a3a12", emissiveIntensity: 0.35, roughness: 0.4, texture: { id: "z-ring", repeat: [1, 1] } },
      physics: { mode: "trigger" },
      behaviors: [{ type: "spin", axis: "y", speedDegrees: ring.rotatesDegreesPerElapsedMillisecond * 1000 }],
      interactions: [{ id: `${id}-collect`, label: "Collect ring", type: "toggle-visibility", targetIds: [id] }],
      tags: ["suzanne1", "ring", "collectible"],
    });
  }

  // Pistons — the recovered moving parts. Bar static, plate kinematic on a spline between
  // the archived ±0.5 linear limits along the archived orientation. Constant speed is the
  // disclosed adaptation of the archive's asymmetric 50/-1 slider forces.
  for (const piston of data.pistons as any[]) {
    const id = `suzanne1-piston-${piston.symbol}`;
    const centre = world(piston.position as Tuple3);
    const [dirX, dirZ] = yawDirection(piston.rotationDegrees[1]);
    const a: AgentWorldVector3 = [centre[0] + dirX * piston.linearLimits[0] * S, centre[1], centre[2] + dirZ * piston.linearLimits[0] * S];
    const b: AgentWorldVector3 = [centre[0] + dirX * piston.linearLimits[1] * S, centre[1], centre[2] + dirZ * piston.linearLimits[1] * S];
    entities.push(
      {
        id: `${id}-bar`,
        type: "box",
        label: `Piston ${piston.symbol} bar`,
        transform: { position: centre, rotationDegrees: [0, piston.rotationDegrees[1], 0] },
        geometry: { width: piston.barScale[0] * S, height: piston.barScale[2] * S, depth: piston.barScale[1] * S },
        material: { color: "#6f7377", roughness: 0.45, metalness: 0.55 },
        physics: { mode: "static", material: "wall" },
        tags: ["suzanne1", "piston"],
      },
      {
        id: `${id}-path`,
        type: "spline",
        label: `Piston ${piston.symbol} travel`,
        path: { points: [a, b], closed: true, tension: 0 },
        visible: false,
        tags: ["suzanne1", "piston-path"],
      },
      {
        id: `${id}-plate`,
        type: "box",
        label: `Piston ${piston.symbol} plate`,
        transform: { position: centre, rotationDegrees: [0, piston.rotationDegrees[1], 0] },
        geometry: { width: piston.plateScale[0] * S, height: piston.plateScale[1] * S, depth: piston.plateScale[2] * S },
        material: { color: "#9aa1a8", roughness: 0.35, metalness: 0.6, emissive: "#20262b", emissiveIntensity: 0.25 },
        physics: { mode: "kinematic" },
        behaviors: [{ type: "follow-spline", splineId: `${id}-path`, speed: 1.1 * S, loop: true }],
        tags: ["suzanne1", "piston", "mover"],
      },
    );
  }

  // Chains — 45 archived assemblies, base + links at the archived per-link positions and
  // scales, wearing the recovered 3D_Spheres skin. Static in this pass (disclosed: the
  // archived ball-joint dynamics need a joint vocabulary v2 does not have yet); they still
  // do their course work of narrowing the lanes they always narrowed.
  for (const [index, chain] of (data.chains as any[]).entries()) {
    const id = `suzanne1-chain-${index + 1}`;
    entities.push({
      id: `${id}-base`,
      type: "box",
      label: `Chain ${index + 1} base`,
      transform: { position: world(chain.basePosition as Tuple3) },
      geometry: { width: chain.baseScale[0] * S, height: chain.baseScale[1] * S, depth: chain.baseScale[2] * S },
      material: { color: "#ffffff", roughness: 0.5, metalness: 0.2, texture: { id: "spheres", repeat: [1, 1] } },
      physics: { mode: "static", material: "wall" },
      tags: ["suzanne1", "chain"],
    });
    (chain.linkPositions as Tuple3[]).forEach((link, linkIndex) => {
      const scale = chain.linkScales[linkIndex] ?? chain.linkScales[0];
      entities.push({
        id: `${id}-link-${linkIndex + 1}`,
        type: "box",
        label: `Chain ${index + 1} link ${linkIndex + 1}`,
        transform: { position: world(link) },
        geometry: { width: scale[0] * S, height: scale[1] * S, depth: scale[2] * S },
        material: { color: "#ffffff", roughness: 0.5, metalness: 0.2, texture: { id: "spheres", repeat: [1, 1] } },
        physics: { mode: "static", material: "wall" },
        tags: ["suzanne1", "chain"],
      });
    });
  }

  // The magician cells — two archived effect cells, each with its recorded magenta + blue
  // emitter pair at 64 particles. The `energy-orb` archive-derived preset carries them; the
  // recorded colours ride as tints.
  for (const [index, effect] of (data.effects as any[]).entries()) {
    const centre = world(effect.position as Tuple3);
    (effect.emitters as any[]).forEach((emitterRecord, emitterIndex) => {
      const [r, g, b] = emitterRecord.color;
      const tint = `#${[r, g, b].map((channel: number) => Math.round(channel * 255).toString(16).padStart(2, "0")).join("")}`;
      entities.push({
        id: `suzanne1-magic-${index + 1}-${emitterIndex + 1}`,
        type: "emitter",
        label: `Magician cell ${index + 1}`,
        transform: { position: [centre[0], centre[1] + emitterIndex * 0.4, centre[2]] },
        emitter: { preset: "energy-orb", maxParticles: emitterRecord.particles, color: tint },
        tags: ["suzanne1", "effect"],
      });
    });
  }

  // Gates — the archive's LINE semantics, at last expressible: the finish spans its two
  // archived posts along z=34.5, and the halfway line runs the full archived diagonal. Both
  // pairs of posts stand as solid pillars at the line ends (radius per the classic posts).
  const gates = defaults.gates;
  const lineGate = (
    id: string,
    label: string,
    start: Tuple3,
    end: Tuple3,
    color: string,
  ): AgentWorldEntityDefinition[] => {
    const a = world(start);
    const b = world(end);
    const dx = b[0] - a[0];
    const dz = b[2] - a[2];
    const length = Math.hypot(dx, dz);
    const yawDegrees = (Math.atan2(-dz, dx) * 180) / Math.PI;
    const posts: AgentWorldEntityDefinition[] = [a, b].map((post, postIndex) => ({
      id: `${id}-post-${postIndex + 1}`,
      type: "cylinder",
      label: `${label} post`,
      transform: { position: [post[0], (1.15 * S) / 2, post[2]] },
      geometry: { radius: 0.2 * S, height: 1.15 * S, radialSegments: 14 },
      material: { color: "#e8ddc6", roughness: 0.55, metalness: 0.08, emissive: "#5c4a22", emissiveIntensity: 0.12 },
      physics: { mode: "static", material: "wall" },
      tags: ["suzanne1", "post"],
    }));
    return [
      {
        id,
        type: "box",
        label,
        transform: { position: [(a[0] + b[0]) / 2, S, (a[2] + b[2]) / 2], rotationDegrees: [0, yawDegrees, 0] },
        geometry: { width: length, height: 2 * S, depth: 0.3 * S },
        material: { color, opacity: 0.16, emissive: color, emissiveIntensity: 0.5 },
        physics: { mode: "trigger" },
        castShadow: false,
        tags: ["suzanne1", "gate"],
      },
      ...posts,
    ];
  };
  entities.push(
    ...lineGate("suzanne1-half-gate", "Halfway Line", gates.halfStart as Tuple3, gates.halfEnd as Tuple3, "#4fd0e6"),
    ...lineGate("suzanne1-finish-gate", "Finish Line", gates.finishStart as Tuple3, gates.finishEnd as Tuple3, "#5fe0b4"),
  );

  // The two-body player — the archived Suzanne player IS the recovered ball (its record
  // carries `internalTexture: FireArrow800.jpg`), so this is the same faithful pair the
  // classic levels roll: invisible collider + BallShell cage + steering-anchored FireArrow.
  const spawn = world(defaults.player.position as Tuple3);
  const ballRadius = defaults.player.visualRadius * S;
  entities.push(
    {
      id: "suzanne1-ball",
      type: "sphere",
      label: "Player Ball",
      transform: { position: spawn },
      geometry: { radius: ballRadius, radialSegments: 12 },
      material: { color: "#dff4ff", opacity: 0.03, roughness: 0.4, metalness: 0 },
      castShadow: false,
      physics: { mode: "dynamic", material: "ball", mass: 1.7, friction: 0.55, restitution: 0.5 },
      steering: {
        headingDegrees: 0,
        force: 30 * (S / 2.6),
        speedCap: S * 2.7,
        turnRateDegrees: 240,
        kickImpulse: S * 3.6,
        jumpImpulse: S * 5,
        arrowId: "suzanne1-aim-arrow",
      },
      tags: ["suzanne1", "ball", "player"],
    },
    {
      id: "suzanne1-ball-shell",
      type: "model",
      label: "Ball Shell",
      parentId: "suzanne1-ball",
      transform: { position: [0, 0, 0] },
      asset: { id: "archive-ballshell", fitSize: ballRadius * 2 },
      tags: ["suzanne1", "ball"],
    },
    {
      id: "suzanne1-aim-arrow",
      type: "model",
      label: "Fire Arrow Ball",
      transform: { position: spawn },
      asset: { id: "archive-ballfire", fitSize: ballRadius * 2 * (6.601 / 8.5) },
      castShadow: false,
      tags: ["suzanne1", "aim"],
    },
  );

  // Light rig sized to the ~96-unit arena, after the classic levels' late-afternoon recipe.
  entities.push(
    {
      id: "suzanne1-key",
      type: "directional-light",
      label: "Key Light",
      transform: { position: [-78, 42, 56] },
      intensity: 3.2,
      material: { color: "#ffe2b0" },
      castShadow: true,
      tags: ["suzanne1", "lighting"],
    },
    {
      id: "suzanne1-fill",
      type: "ambient-light",
      label: "Fill",
      intensity: 0.16,
      material: { color: "#9fc4d8" },
      tags: ["suzanne1", "lighting"],
    },
  );

  return entities;
}

export function composeSuzanne1(api: GraphysXAgentWorldApi) {
  const data = suzanne1 as Record<string, any>;
  return api.create({
    schema: GRAPHYSX_AGENT_WORLD_SCHEMA,
    id: "archive-suzanne1",
    label: "Suzanne 1 — Moving Parts",
    rules: {
      schema: GRAPHYSX_AGENT_RULES_SCHEMA,
      subjectId: "suzanne1-ball",
      spawn: { entityId: "suzanne1-ball", position: world(data.sceneDefaults.player.position) },
      checkpoints: [{ triggerId: "suzanne1-half-gate", label: "Halfway" }],
      collectibles: { tag: "collectible", requiredToFinish: true },
      finish: { triggerId: "suzanne1-finish-gate" },
      laps: data.sceneDefaults.laps,
    },
    environment: {
      background: "#0d1a24",
      sky: "lostvalley",
      lighting: { source: "hdri", hdri: "lilienstein", intensity: 0.92, yawDegrees: 24, backgroundIntensity: 0.9, backgroundBlur: 0.08 },
      post: { bloom: { strength: 0.38, threshold: 0.72, radius: 0.24 } },
      // ~96 world units across; the classic-level fog recipe scaled to keep the whole arena
      // crisp with atmosphere only past the walls.
      envelope: { fogNear: 120, fogFar: 380, cameraFar: 460 },
      ground: { visible: false, size: 120, color: "#123039", grid: false, gridColor: "#2a7d8f" },
      physics: { gravity: [0, -9.81, 0] },
    },
    entities: buildEntities(),
  });
}

/** High three-quarter framing over the 96-unit arena, spawn-corner forward. */
export function frameSuzanne1(host: PlatformHost): void {
  host.camera.position.set(-70, 62, 92);
  host.focusOn(new Vector3(0, 0.6, 6), 60, 1.05);
}
