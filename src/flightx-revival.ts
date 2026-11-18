import source from "./content/flightx-source.json";
import type { AgentWorldDefinition, AgentWorldEntityDefinition, GraphysXAgentWorldApi } from "./agent-world-runtime";

export const FLIGHTX_SOURCE = source;
export const FLIGHTX_START: [number, number, number] = [0, source.presentation.liftY, 0];
const scale = source.presentation.worldScale;

/** Preserve the source origins and relative transforms behind one disclosed world scale/lift. */
export function buildRecoveredFlightX(): AgentWorldDefinition {
  return {
    schema: "graphysx.agent-world/v2", id: "archive-flightx", label: "FlightX · original TVM airplane and native pipe composition",
    environment: { background: "#7eabc6", ground: { visible: true, size: 2000, color: "#4a655d", grid: true, gridColor: "#739588" },
      envelope: { cameraFar: 600, fogNear: 300, fogFar: 550 },
      lighting: { source: "studio", intensity: .8, yawDegrees: 0, backgroundIntensity: 1, backgroundBlur: 0 } },
    entities: [
      { id: "flight-fill", type: "ambient-light", intensity: 1 },
      { id: "flight-plane", type: "group", label: "FlightX · native forward, moderated Web rates", transform: { position: [...FLIGHTX_START] },
        behaviors: [{ id: "flight-control", type: "flight", speed: 18, forwardAxis: "-z" }], tags: ["archive", "adapted-kinematics", "archive-motion"] },
      { id: "flight-plane-model", type: "model", parentId: "flight-plane", label: "Airplane.tvm · 48 original surface groups",
        asset: { id: source.models.airplane.id, url: source.models.airplane.url }, transform: { scale: [scale, scale, scale], rotationDegrees: [0, 0, 0] },
        tags: ["native-tvm", "source-origin-preserved", "source-orientation", "source-materials-pbr-adapter"] },
      { id: "flight-source-pipe", type: "model", label: "pipe1.tvm · original scale 5 and position (0,−500,0)",
        asset: { id: source.models.pipe.id, url: source.models.pipe.url },
        transform: { position: [0, FLIGHTX_START[1] + source.sourceComposition.pipe.position[1] * scale, 0],
          scale: [5 * scale, 5 * scale, 5 * scale] }, tags: ["native-tvm", "source-origin-preserved", "source-relative-placement", "source-materials-pbr-adapter"] },
      ...Array.from({ length: 8 }, (_, index): AgentWorldEntityDefinition => ({
        id: "flight-guide-" + index, type: "torus", label: "Repère de visite moderne " + (index + 1),
        geometry: { radius: 6, tube: .15 }, transform: { position: [Math.cos(index) * 6, 16 + Math.sin(index) * 6, -25 - index * 35] },
        material: { color: "#ffcc78", emissive: "#7a471a", emissiveIntensity: .2 }, tags: ["adapted-inspection-marker", "no-source-race-layout"],
      })),
    ],
  };
}

/** An undoable pose preset, preserving material edits, labels, extra entities and model data. */
export function applyFlightxPose(api: GraphysXAgentWorldApi, native: boolean, revision: "atmel" | "ballz2011" = "atmel") {
  const modelScale = scale * (native && revision === "ballz2011" ? .1 : 1);
  return api.transaction([
    { op: "update", id: "flight-plane", patch: { transform: { position: [...FLIGHTX_START], rotationDegrees: [0, 0, 0] } } },
    { op: "update", id: "flight-plane-model", patch: { transform: { rotationDegrees: [0, 0, 0], scale: [modelScale, modelScale, modelScale] } } },
    ...Array.from({ length: 8 }, (_, index) => ({ op: "update" as const, id: "flight-guide-" + index, patch: { visible: !native } })),
  ]);
}
