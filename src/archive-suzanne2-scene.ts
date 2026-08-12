/**
 * Suzanne 2 — the active March 2017 40×40 ASCII/XML level as a v2 game.
 *
 * Faithful:
 * - all 313 #/Z/z dynamic walls plus the two dynamic s walls;
 * - 15 authored ring pickups, three 3-body chains, three triggered pistons, four gate
 *   posts, both LINE segments, the finish board and all three XML objects;
 * - the decoded Airplane, BonedGate and SuperCage meshes are ordinary vendored assets;
 * - the player starts at [10,.5,6], and ANY two of the fifteen rings complete the run.
 *   That last rule is not a design correction: GamePlayScreen.cpp literally tests
 *   `CLAnneaux::getScore() == 2` even though Suzanne2.ASCII authors fifteen rings.
 *
 * Adapted:
 * - TV3D's 1-unit cells use the same disclosed 2.4× platform scale as Suzanne 1;
 * - piston slider forces become constant-speed kinematic oscillation; chain ball joints are
 *   static stacks because v2 still has no joint document vocabulary;
 * - exposure, neutral background and lights are modern because no Suzanne 2 screenshot or
 *   archived sky binding survives; the BonedGate animation is recorded but not played.
 * - the 29,298-vertex airplane exceeds v2's safe dynamic convex-hull ceiling; its authored
 *   mass-1 motion uses the exact recovered mesh with a source-bounds box collider.
 *
 * Explicitly absent:
 * - Rotator/RotatorCube have no Suzanne 2 call site. They are already faithfully vendored
 *   under the Suzanne 1 machinery record and are not invented into this arena.
 */
import { Vector3 } from "three";
import {
  GRAPHYSX_AGENT_RULES_SCHEMA,
  GRAPHYSX_AGENT_WORLD_SCHEMA,
  type AgentWorldEntityDefinition,
  type AgentWorldVector3,
  type GraphysXAgentWorldApi,
} from "./agent-world-runtime";
import type { PlatformHost } from "./platform-host";
import suzanne2 from "./content/suzanne2-ascii-scene.json";

const S = 2.4;
const CENTER = 20;
type Tuple3 = readonly [number, number, number];

const world = (p: Tuple3): AgentWorldVector3 => [(p[0] - CENTER) * S, p[1] * S, (p[2] - CENTER) * S];
const WALL_TEXTURE: Record<string, "objet39" | "podium" | "grass-sample"> = {
  "#": "objet39",
  z: "podium",
  Z: "grass-sample",
};

const yawDirection = (degrees: number): [number, number] => {
  const radians = (degrees * Math.PI) / 180;
  return [Math.cos(radians), -Math.sin(radians)];
};

const gateEntities = (
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
  return [{
    id,
    type: "box",
    label,
    transform: {
      position: [(a[0] + b[0]) / 2, S, (a[2] + b[2]) / 2],
      rotationDegrees: [0, (Math.atan2(-dz, dx) * 180) / Math.PI, 0],
    },
    geometry: { width: Math.hypot(dx, dz), height: 2 * S, depth: 0.18 * S },
    material: { color, opacity: 0.14, emissive: color, emissiveIntensity: 0.45 },
    physics: { mode: "trigger" },
    castShadow: false,
    tags: ["suzanne2", "gate", "lap-evidence"],
  }];
};

function buildEntities(): AgentWorldEntityDefinition[] {
  const data = suzanne2 as Record<string, any>;
  const defaults = data.sceneDefaults;
  const entities: AgentWorldEntityDefinition[] = [{
    id: "suzanne2-floor",
    type: "box",
    label: "Grass Arena Floor",
    transform: { position: world(defaults.floor.center as Tuple3) },
    geometry: { width: defaults.floor.size[0] * S, height: defaults.floor.size[1] * S, depth: defaults.floor.size[2] * S },
    material: { color: "#ffffff", roughness: 0.9, metalness: 0, texture: { id: "grass-sample", repeat: [16, 16] } },
    physics: { mode: "static", material: "ground" },
    castShadow: false,
    tags: ["suzanne2", "floor"],
  }];

  for (const wall of data.walls as any[]) {
    entities.push({
      id: `suzanne2-wall-${wall.x}-${wall.z}`,
      type: "box",
      label: `Wall ${wall.symbol}`,
      transform: { position: world(wall.position as Tuple3) },
      geometry: { width: wall.scale[0] * S, height: wall.scale[1] * S, depth: wall.scale[2] * S },
      material: { color: "#ffffff", roughness: 0.82, metalness: 0.03, texture: { id: WALL_TEXTURE[wall.symbol] ?? "objet39", repeat: [1, 1] } },
      physics: { mode: "dynamic", mass: 1, material: "wall" },
      tags: ["suzanne2", "wall"],
    });
  }

  for (const [index, effect] of (data.effects as any[]).entries()) {
    const position = world(effect.position as Tuple3);
    entities.push({
      id: `suzanne2-effect-wall-${index + 1}`,
      type: "box",
      label: `Magician Wall ${index + 1}`,
      transform: { position },
      geometry: { width: S, height: S, depth: S },
      material: { color: "#ffffff", roughness: 0.72, texture: { id: "zack", repeat: [1, 1] } },
      physics: { mode: "dynamic", mass: 1, material: "wall" },
      tags: ["suzanne2", "wall", "effect-wall"],
    });
    for (const [emitterIndex, emitter] of effect.emitters.entries()) {
      const [r, g, b] = emitter.color;
      const color = `#${[r, g, b].map((value: number) => Math.round(value * 255).toString(16).padStart(2, "0")).join("")}`;
      entities.push({
        id: `suzanne2-magic-${index + 1}-${emitterIndex + 1}`,
        type: "emitter",
        label: `Magician emitter ${index + 1}.${emitterIndex + 1}`,
        transform: { position: [position[0], position[1] + emitterIndex * 0.4, position[2]] },
        emitter: { preset: "energy-orb", maxParticles: emitter.particleCapacity, color },
        tags: ["suzanne2", "effect"],
      });
    }
  }

  for (const [index, ring] of (data.rings as any[]).entries()) {
    const id = `suzanne2-ring-${index + 1}`;
    entities.push({
      id,
      type: "sphere",
      label: `Ring ${index + 1}`,
      transform: { position: world(ring.position as Tuple3) },
      geometry: { radius: ring.radius * S, radialSegments: 20 },
      material: { color: "#ffffff", emissive: "#083d4a", emissiveIntensity: 0.4, roughness: 0.36, texture: { id: "z-ring", repeat: [1, 1] } },
      physics: { mode: "trigger" },
      behaviors: [{ type: "spin", axis: "y", speedDegrees: ring.rotatesDegreesPerElapsedMillisecond * 1000 }],
      tags: ["suzanne2", "ring", "collectible"],
    });
  }

  for (const [index, chain] of (data.chains as any[]).entries()) {
    const id = `suzanne2-chain-${index + 1}`;
    entities.push({
      id: `${id}-base`, type: "box", label: `Chain ${index + 1} base`,
      transform: { position: world(chain.basePosition as Tuple3) },
      geometry: { width: chain.baseScale[0] * S, height: chain.baseScale[1] * S, depth: chain.baseScale[2] * S },
      material: { color: "#ffffff", roughness: 0.5, metalness: 0.18, texture: { id: "spheres", repeat: [1, 1] } },
      physics: { mode: "static", material: "wall" }, tags: ["suzanne2", "chain"],
    });
    (chain.linkPositions as Tuple3[]).forEach((position, linkIndex) => {
      const scale = chain.linkScales[linkIndex];
      entities.push({
        id: `${id}-link-${linkIndex + 1}`, type: "box", label: `Chain ${index + 1} link ${linkIndex + 1}`,
        transform: { position: world(position) },
        geometry: { width: scale[0] * S, height: scale[1] * S, depth: scale[2] * S },
        material: { color: "#ffffff", roughness: 0.5, metalness: 0.18, texture: { id: "spheres", repeat: [1, 1] } },
        physics: { mode: "static", material: "wall" }, tags: ["suzanne2", "chain"],
      });
    });
  }

  for (const piston of data.pistons as any[]) {
    const id = `suzanne2-piston-${piston.symbol}`;
    const center = world(piston.position as Tuple3);
    const [dirX, dirZ] = yawDirection(piston.rotationDegrees[1]);
    const a: AgentWorldVector3 = [center[0] + dirX * piston.linearLimits[0] * S, center[1], center[2] + dirZ * piston.linearLimits[0] * S];
    const b: AgentWorldVector3 = [center[0] + dirX * piston.linearLimits[1] * S, center[1], center[2] + dirZ * piston.linearLimits[1] * S];
    entities.push(
      {
        id: `${id}-bar`, type: "box", label: `Piston ${piston.symbol} bar`,
        transform: { position: center, rotationDegrees: [0, piston.rotationDegrees[1], 0] },
        geometry: { width: piston.barScale[0] * S, height: piston.barScale[2] * S, depth: piston.barScale[1] * S },
        material: { color: "#555d65", roughness: 0.4, metalness: 0.58 }, physics: { mode: "static", material: "wall" },
        tags: ["suzanne2", "piston"],
      },
      {
        id: `${id}-path`, type: "spline", visible: false, path: { points: [a, b], closed: true, tension: 0 },
        tags: ["suzanne2", "piston-path"],
      },
      {
        id: `${id}-plate`, type: "box", label: `Piston ${piston.symbol} plate`,
        transform: { position: center, rotationDegrees: [0, piston.rotationDegrees[1], 0] },
        geometry: { width: piston.plateScale[0] * S, height: piston.plateScale[1] * S, depth: piston.plateScale[2] * S },
        material: { color: "#a6b0b9", roughness: 0.28, metalness: 0.68 }, physics: { mode: "kinematic" },
        behaviors: [{ type: "follow-spline", splineId: `${id}-path`, speed: 1.1 * S, loop: true }],
        tags: ["suzanne2", "piston", "mover"],
      },
      {
        id: `${id}-trigger`, type: "box", label: `Piston ${piston.symbol} hidden trigger`, visible: false,
        transform: { position: center, rotationDegrees: [0, piston.rotationDegrees[1], 0] },
        geometry: { width: piston.triggerScale[0] * S, height: piston.triggerScale[1] * S, depth: piston.triggerScale[2] * S },
        physics: { mode: "trigger" }, tags: ["suzanne2", "piston", "source-trigger"],
      },
    );
  }

  for (const [index, marker] of (data.lapMarkers as any[]).entries()) {
    const position = world(marker.position as Tuple3);
    entities.push({
      id: `suzanne2-post-${index + 1}`, type: "cylinder", label: `${marker.gate} ${marker.endpoint} post`,
      transform: { position: [position[0], marker.scale[1] * S / 2, position[2]] },
      geometry: { radius: marker.scale[0] * S, height: marker.scale[1] * S, radialSegments: 14 },
      material: { color: marker.color === "red" ? "#e84f59" : "#4d8ee8", roughness: 0.52, metalness: 0.12 },
      physics: { mode: "static", material: "wall" }, tags: ["suzanne2", "post", "lap-evidence"],
    });
  }
  entities.push(
    ...gateEntities("suzanne2-finish-gate", "Archived Finish Line", defaults.gates.finishStart, defaults.gates.finishEnd, "#ff5f6d"),
    ...gateEntities("suzanne2-half-gate", "Archived Halfway Line", defaults.gates.halfStart, defaults.gates.halfEnd, "#4d9cff"),
  );

  const board = defaults.finishBoard;
  entities.push({
    id: "suzanne2-finish-board", type: "box", label: "Finish Board",
    transform: { position: world(board.position as Tuple3), rotationDegrees: [0, 90, 0] },
    geometry: { width: board.scale[2] * S, height: board.scale[1] * S, depth: board.scale[0] * S },
    material: { color: "#ffffff", roughness: 0.5, texture: { id: "checker", repeat: [6, 1] } },
    physics: { mode: "static", material: "finish" }, tags: ["suzanne2", "finish-board", "lap-evidence"],
  });

  const xml = defaults.player;
  const spawn = world(xml.position as Tuple3);
  const ballRadius = xml.physicsRadius * S;
  entities.push(
    {
      id: "suzanne2-ball", type: "sphere", label: "ZombieKiller Player", transform: { position: spawn },
      geometry: { radius: ballRadius, radialSegments: 12 },
      material: { color: "#dff4ff", opacity: 0.03, roughness: 0.4 }, castShadow: false,
      physics: { mode: "dynamic", material: "ball", mass: 1.7, friction: 0.55, restitution: 0.5 },
      steering: { headingDegrees: 0, force: 30 * (S / 2.6), speedCap: S * 2.7, turnRateDegrees: 240, kickImpulse: S * 3.6, jumpImpulse: S * 5, arrowId: "suzanne2-aim-arrow" },
      tags: ["suzanne2", "ball", "player"],
    },
    {
      id: "suzanne2-super-cage", type: "model", label: "Recovered Super Cage", parentId: "suzanne2-ball",
      transform: { position: [0, 0, 0], rotationDegrees: xml.insideRotationDegrees },
      asset: { id: "archive-suzanne2-super-cage", fitSize: 0.63736 * xml.cageScale[0] * S },
      tags: ["suzanne2", "ball", "recovered-mesh"],
    },
    {
      id: "suzanne2-aim-arrow", type: "model", label: "Fire Arrow Ball", transform: { position: spawn },
      asset: { id: "archive-ballfire", fitSize: ballRadius * 2 * (6.601 / 8.5) }, castShadow: false,
      tags: ["suzanne2", "aim"],
    },
  );

  const xmlObjects = data.xmlObjects as any[];
  const airplane = xmlObjects[0];
  const gate = xmlObjects[1];
  const magician = xmlObjects[2];
  entities.push(
    {
      id: "suzanne2-airplane", type: "model", label: "Recovered XML Airplane", transform: { position: world(airplane.position) },
      geometry: { width: 5.49649 * S, height: 1.65191 * S, depth: 4.84245 * S },
      asset: { id: "archive-suzanne2-airplane", fitSize: 5.49649 * S },
      physics: { mode: "dynamic", mass: airplane.mass, collider: "auto" }, tags: ["suzanne2", "xml-object", "recovered-mesh", "source-bounds-collider"],
    },
    {
      id: "suzanne2-boned-gate", type: "model", label: "Recovered XML Boned Gate", transform: { position: world(gate.position) },
      asset: { id: "archive-suzanne2-boned-gate", fitSize: 1.31304 * S },
      physics: { mode: "dynamic", mass: gate.mass, collider: "convex-hull" }, tags: ["suzanne2", "xml-object", "recovered-mesh", "animation-recorded-not-played"],
    },
    {
      id: "suzanne2-magician-billboard", type: "plane", label: "Suzanne Magician", transform: { position: world(magician.position), rotationDegrees: [0, 180, 0] },
      geometry: { width: magician.scale[0] * S, height: magician.scale[1] * S },
      material: { color: "#ffffff", roughness: 0.8, texture: { id: "zack", repeat: [1, 1] } },
      tags: ["suzanne2", "xml-object", "billboard"],
    },
    { id: "suzanne2-key", type: "directional-light", label: "Adapted Key", transform: { position: [-62, 54, 48] }, intensity: 3.1, material: { color: "#fff0cf" }, castShadow: true, tags: ["suzanne2", "lighting", "adapted"] },
    { id: "suzanne2-fill", type: "ambient-light", label: "Adapted Fill", intensity: 0.22, material: { color: "#b9dbef" }, tags: ["suzanne2", "lighting", "adapted"] },
  );

  return entities;
}

export const SUZANNE2_PROVENANCE = {
  ascii: "StockRoom/Suzanne2.ASCII (sha256 164693e…)",
  xml: "StockRoom/Suzanne2.xml (sha256 70140a…)",
  gameplay: "Scene3D/GamePlayScreen.cpp lines 200-215, 336, 492-496",
  rule: "faithful active runtime: any 2 of 15 authored rings",
  rotators: "absent from Suzanne 2 call sites; retained under the Suzanne 1 machinery assets",
} as const;

export function composeSuzanne2(api: GraphysXAgentWorldApi) {
  const data = suzanne2 as Record<string, any>;
  const created = api.create({
    schema: GRAPHYSX_AGENT_WORLD_SCHEMA,
    id: "archive-suzanne2",
    label: "Suzanne 2 — Any Two Rings",
    rules: {
      schema: GRAPHYSX_AGENT_RULES_SCHEMA,
      subjectId: "suzanne2-ball",
      spawn: { entityId: "suzanne2-ball", position: world(data.sceneDefaults.player.position) },
      collectibles: { tag: "collectible", targetCount: data.sceneDefaults.ringRuntime.victoryThresholdActuallyImplemented },
    },
    environment: {
      background: "#8eb5ca",
      post: { bloom: { strength: 0.3, threshold: 0.76, radius: 0.2 } },
      envelope: { fogNear: 130, fogFar: 360, cameraFar: 440 },
      ground: { visible: false, size: 120, color: "#294b34", grid: false, gridColor: "#7fa465" },
      physics: { gravity: [0, -9.81, 0] },
    },
    entities: buildEntities(),
  });
  if (!created.ok) return created;
  // During bulk creation the physics census can observe dynamic wall/ring overlaps before
  // the rules block is armed. Attach pickup responses immediately after creation, when the
  // declared subject filter is live; no simulation step occurs between these operations.
  for (let index = 0; index < data.rings.length; index += 1) {
    const id = `suzanne2-ring-${index + 1}`;
    const updated = api.update(id, {
      interactions: [{ id: `${id}-collect`, label: "Collect ring", type: "toggle-visibility", targetIds: [id] }],
    });
    if (!updated.ok) return updated;
  }
  return created;
}

export function frameSuzanne2(host: PlatformHost): void {
  host.camera.position.set(-76, 66, 94);
  host.focusOn(new Vector3(0, 0.6, 0), 62, 1.05);
}
