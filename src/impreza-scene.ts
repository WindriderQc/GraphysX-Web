import type { AgentWorldDefinition, AgentWorldEntityDefinition } from "./agent-world-runtime";
import type { PhysicsVehicleDefinition } from "./physics/physics-engine";
import { imprezaWebPosition, type ImprezaSource, type ImprezaWorldId, type ImprezaVector } from "./impreza-source";

export const IMPREZA_PLAYER = "impreza-player";
export const IMPREZA_PRESENTATION_LIFT = 400;

/** These are Rapier tuning adapters, not a claim about closed TV3D/Newton solver units. */
export function imprezaVehicle(source: ImprezaSource, id: string): PhysicsVehicleDefinition {
  return {
    wheels: source.vehicle.wheels.map(wheel => {
      const connection = imprezaWebPosition(wheel.sourcePosition);
      // Native positions describe wheel centres. Rapier connections are the top of the spring.
      connection[1] += .25;
      return { entityId: `${id}-${wheel.id}`, connection, steer: wheel.steering, driven: wheel.driven, brake: wheel.driven };
    }),
    radius: .372, suspensionRestLength: .25, suspensionStiffness: 30,
    suspensionCompression: 4.4, suspensionRelaxation: 2.3, maxSuspensionTravel: .3,
    maxSuspensionForce: 9000, frictionSlip: 1.2, engineForce: source.vehicle.enginePower,
    brakeForce: source.vehicle.rearHandbrakeForce, maxSteerDegrees: source.vehicle.maximumSteerDegrees,
    steerRateDegrees: source.vehicle.steeringDegreesPerSourceFrame * 60, maxSpeed: 24, steeringSpeedFactor: .035,
  };
}

export function imprezaGroundHeight(source: ImprezaSource, world: ImprezaWorldId, x: number, z: number): number {
  const terrain = source.worlds[world].terrain, size = Math.sqrt(terrain.heights.length);
  const gx = Math.max(0, Math.min(size - 1, (x / terrain.size + .5) * (size - 1)));
  const gz = Math.max(0, Math.min(size - 1, (z / terrain.size + .5) * (size - 1)));
  const x0 = Math.floor(gx), z0 = Math.floor(gz), x1 = Math.min(size - 1, x0 + 1), z1 = Math.min(size - 1, z0 + 1);
  const a = terrain.heights[z0 * size + x0] * (1 - (gx - x0)) + terrain.heights[z0 * size + x1] * (gx - x0);
  const b = terrain.heights[z1 * size + x0] * (1 - (gx - x0)) + terrain.heights[z1 * size + x1] * (gx - x0);
  return (a * (1 - (gz - z0)) + b * (gz - z0)) * terrain.heightScale + terrain.sourceOrigin[1] + IMPREZA_PRESENTATION_LIFT;
}

export function buildImprezaWorld(source: ImprezaSource, world: ImprezaWorldId, sourceDrop = false): AgentWorldDefinition {
  const native = source.worlds[world];
  const model = (key: keyof ImprezaSource["models"]) => ({ id: source.models[key].id, url: source.models[key].url, format: "graphysx-mesh-json" as const });
  const car = (id: string, nativePosition: ImprezaVector, player: boolean, separation = 0): AgentWorldEntityDefinition[] => {
    const position = imprezaWebPosition(nativePosition); position[0] += separation;
    position[1] = sourceDrop ? position[1] + source.vehicle.setPositionYOffset + IMPREZA_PRESENTATION_LIFT : imprezaGroundHeight(source, world, position[0], position[2]) + .9;
    return [
      { id, label: player ? "Impreza STi · chassis.TVM" : `Impreza témoin · ${id}`, type: "model", asset: model("chassis"), transform: { position },
        physics: { mode: "dynamic", mass: source.vehicle.mass, collider: "convex-hull" },
        steering: { vehicle: imprezaVehicle(source, id) }, tags: ["impreza-car", "native-tvm", ...(player ? ["impreza-driver"] : ["source-opponent-no-ai"]), ...(separation ? ["spawn-separation-adapter"] : [])] },
      ...source.vehicle.wheels.map(wheel => {
        const offset = imprezaWebPosition(wheel.sourcePosition);
        return { id: `${id}-${wheel.id}`, label: `Roue ${wheel.id.toUpperCase()} · ${wheel.model === "leftWheel" ? "wheel_l" : "wheel_r"}.TVM`, type: "model" as const, asset: model(wheel.model),
          transform: { position: position.map((value, index) => value + offset[index]) as ImprezaVector }, tags: ["impreza-wheel", "native-tvm"] };
      }),
    ];
  };
  return {
    schema: "graphysx.agent-world/v2", id: `archive-impreza-${world}`, label: world === "atmel" ? "Impreza · Atmel / terrain plat" : "Impreza · RacinX / RecTrack5",
    environment: {
      background: "#a6b5c2", sky: world === "racinx" ? "winter" : null,
      ground: { visible: false, grid: false, size: 512, color: "#788775", gridColor: "#a2b5a1" }, physics: { gravity: [0, -9.81, 0] },
      envelope: { cameraFar: 2500, fogNear: 500, fogFar: 2200 },
      lighting: { source: "hdri", hdri: "studio-small-08", intensity: .8, yawDegrees: -25, backgroundIntensity: 1, backgroundBlur: 0 },
    },
    entities: [
      { id: "impreza-ambient", type: "ambient-light", intensity: .9, material: { color: "#d3e5ff" } },
      { id: "impreza-sun", type: "directional-light", intensity: 2.6, transform: { position: [30, 60, 25] }, material: { color: "#fff0d9" } },
      { id: "impreza-terrain", label: world === "atmel" ? "CarHeightmap.bmp · champ noir exact" : "RecTrack5.dds · relief DXT1 retrouvé", type: "terrain",
        terrain: { heights: [...native.terrain.heights], size: native.terrain.size, segments: world === "atmel" ? 16 : 128, heightScale: native.terrain.heightScale, heightOffset: 0, flattenRadius: 0, flattenFalloff: 0 },
        material: { color: world === "atmel" ? "#788775" : "#8c9b80", roughness: 1, metalness: 0 }, tags: ["impreza-source-terrain", "presentation-lift-400", "terrain-material-adapter"] },
      ...car(IMPREZA_PLAYER, native.player.sourcePosition, true),
      // Source opponent 0 overlaps the player. Move only that parked witness six metres left.
      ...native.opponents.flatMap(opponent => car(`impreza-opponent-${opponent.id}`, opponent.sourcePosition, false, opponent.id === 0 ? -6 : 0)),
      ...(native.rings ?? []).map(ring => {
        const position = imprezaWebPosition(ring.sourcePosition); position[1] += IMPREZA_PRESENTATION_LIFT;
        return { id: `impreza-ring-${ring.id}`, label: `Anneau source ${ring.id + 1} / 100`, type: "model" as const, asset: model("ring"), transform: { position, scale: [native.ringScale!, native.ringScale!, native.ringScale!] as ImprezaVector }, material: { color: "#ffcf35", roughness: .42, metalness: .25 }, tags: ["impreza-source-ring", "native-tvm", "layout-only-no-race"] };
      }),
      ...(native.experimentalWater ? [{ id: "impreza-source-water", label: "Eau C++ · y=85 natif / 485 affiché · masquée", type: "water" as const, visible: false,
        transform: { position: [0, native.experimentalWater.height + IMPREZA_PRESENTATION_LIFT, 0] as ImprezaVector }, water: { size: native.experimentalWater.size, reflection: false }, tags: ["source-water-out-of-place", "presentation-lift-400"] }] : []),
    ],
  };
}
