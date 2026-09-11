import type { GraphysXAgentWorldApi, AgentWorldEntityState } from "./agent-world-runtime";
import type { KidxReadings } from "./kidx-code";

export const KIDX_CM_PER_UNIT = 2.8 / .91;
/** Ray against the oriented box footprints of the authored sensor obstacles. */
export function kidxRayBox(origin: readonly number[], direction: readonly number[], box: { position: readonly number[]; rotationDegrees: readonly number[]; geometry: { width: number; depth: number }; scale: readonly number[] }): number | null {
  const yaw = box.rotationDegrees[1] * Math.PI / 180;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const x = origin[0] - box.position[0], z = origin[1] - box.position[2];
  const local = [x * c - z * s, x * s + z * c];
  const ray = [direction[0] * c - direction[1] * s, direction[0] * s + direction[1] * c];
  const half = [box.geometry.width * box.scale[0] / 2, box.geometry.depth * box.scale[2] / 2];
  let near = 0, far = Infinity;
  for (let axis = 0; axis < 2; axis++) {
    if (Math.abs(ray[axis]) < 1e-9) { if (Math.abs(local[axis]) > half[axis]) return null; }
    else { const a = (-half[axis] - local[axis]) / ray[axis], b = (half[axis] - local[axis]) / ray[axis]; near = Math.max(near, Math.min(a, b)); far = Math.min(far, Math.max(a, b)); }
  }
  return far >= near ? near : null;
}
export function kidxSensorReadings(rover: AgentWorldEntityState | undefined, entities: AgentWorldEntityState[]): KidxReadings {
  if (!rover) return { distance: 255, touch: 0, color: 0, angle: 0 };
  const angle = rover.steering?.headingDegrees ?? 0, radians = angle * Math.PI / 180;
  const direction = [Math.sin(radians), -Math.cos(radians)];
  const origin = [rover.position[0] + direction[0] * 1.95, rover.position[2] + direction[1] * 1.95];
  let distance = 255 / KIDX_CM_PER_UNIT;
  for (const box of entities.filter(e => e.visible && e.tags.includes("kidx-sensed"))) {
    const pitch = box.rotationDegrees[0] * Math.PI / 180;
    const halfHeight = Math.abs(Math.cos(pitch)) * (box.geometry.height ?? Infinity) * box.scale[1] / 2 + Math.abs(Math.sin(pitch)) * box.geometry.depth * box.scale[2] / 2;
    if (Math.abs(rover.position[1] + .4 - box.position[1]) > halfHeight) continue;
    const hit = kidxRayBox(origin, direction, box); if (hit !== null) distance = Math.min(distance, hit);
  }
  let color = 0;
  for (const patch of entities.filter(e => e.tags.some(t => t.startsWith("kidx-color:")))) {
    const inside = kidxRayBox(origin, [0, 0], patch) === 0;
    if (inside) color = Number(patch.tags.find(t => t.startsWith("kidx-color:"))!.split(":")[1]);
  }
  return { distance: Number((distance * KIDX_CM_PER_UNIT).toFixed(1)), touch: distance <= .15 ? 1 : 0, color, angle: Number(angle.toFixed(1)) };
}
export function readKidxSensors(api: GraphysXAgentWorldApi, id: string) {
  return kidxSensorReadings(api.query({ ids: [id] })[0], api.query({ tag: "kidx-sensed" }).concat(api.query({ tag: "kidx-color" })));
}
