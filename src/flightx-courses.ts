import { Euler, Quaternion, Vector3 } from "three";
import type { AgentWorldDefinition, AgentWorldEntityDefinition, AgentWorldVector3 } from "./agent-world-runtime";
import { buildRecoveredFlightX, FLIGHTX_START } from "./flightx-revival";

export const FLIGHTX_PLAYER = "flight-plane";
export const FLIGHTX_COURSE_VERSION = 1;
export const FLIGHTX_MODES = [
  { id: "free", title: "Vol libre", description: "L’avion retrouvé, sans chronomètre.", goal: "Explore le ciel à ton rythme." },
  { id: "gates", title: "Trois portes", description: "Traverse les trois portes dans l’ordre.", goal: "Avance vers les trois anneaux dorés." },
  { id: "time", title: "Défi chrono", description: "Un looping vertical en moins de 35 secondes.", goal: "Maintiens Avancer + Monter pour dessiner un looping." },
  { id: "laps", title: "Course · 3 tours", description: "Trois loopings, puis ton meilleur temps.", goal: "Reviens trois fois à la ligne de départ, sans sauter de porte." },
] as const;
export type FlightxMode = typeof FLIGHTX_MODES[number]["id"];
export const isFlightxMode = (value: unknown): value is FlightxMode => FLIGHTX_MODES.some(mode => mode.id === value);

/** The standalone view needs its own neutral lights; editor-only lighting is not present. */
export function buildFlightxPreview(): AgentWorldDefinition {
  const source = buildRecoveredFlightX();
  if (source.environment?.ground) source.environment.ground.size = 6000;
  source.entities = source.entities.map(entity => entity.id === "flight-fill"
    ? { ...entity, intensity: .9, material: { color: "#e5efff" }, tags: ["adapted-flight-lighting"] } : entity);
  source.entities.push({ id: "flightx-visit-sun", type: "directional-light", label: "Lumière de vol · adaptée",
    transform: { position: [30, 60, -25] }, intensity: 2.6, material: { color: "#fff0d9" }, tags: ["adapted-flight-lighting"] });
  return source;
}

/** New training layouts fulfil recorded mode intent; no historical course layout is claimed. */
export function buildFlightxCourse(mode: FlightxMode, document?: AgentWorldDefinition): AgentWorldDefinition {
  const source = structuredClone(document ?? buildFlightxPreview());
  delete source.rules;
  const player = source.entities.find(entity => entity.id === FLIGHTX_PLAYER);
  if (!player) throw new Error("The current document has no FlightX airplane");
  const start = [...(player.transform?.position ?? FLIGHTX_START)] as AgentWorldVector3;
  const degrees = Math.PI / 180;
  const initial = new Quaternion().setFromEuler(new Euler(...(player.transform?.rotationDegrees ?? [0, 0, 0]).map(value => value * degrees) as AgentWorldVector3));
  const entities: AgentWorldEntityDefinition[] = source.entities.filter(entity => !entity.id?.startsWith("flight-guide-") && !entity.id?.startsWith("flightx-gate-")).map(entity => entity.id === FLIGHTX_PLAYER ? {
    ...entity, type: "sphere", label: entity.label ?? "Avion · repère de passage adapté", geometry: { radius: .45 },
    material: { color: "#ffffff", opacity: 0 }, castShadow: false, receiveShadow: false,
    physics: { mode: "kinematic" },
    behaviors: [{ id: "flight-control", type: "flight", forwardAxis: "-z", speed: 18, pitchUpDegrees: 36, pitchDownDegrees: 36 }],
    tags: ["flightx-player", "adapted-passage-probe", "adapted-kinematics"],
  } : entity);
  const loop = mode === "time" || mode === "laps";
  const radius = 18 / (36 * Math.PI / 180);
  const points: AgentWorldVector3[] = mode === "free" ? [] : loop
    ? [1, 2, 3, 4].map(index => {
      const angle = index * Math.PI / 2;
      return [0, radius * (1 - Math.cos(angle)), -radius * Math.sin(angle)] as AgentWorldVector3;
    })
    : [35, 70, 105].map(distance => [0, 0, -distance]);
  const gates = points.map((point, index): AgentWorldEntityDefinition & { id: string } => {
    const position = new Vector3(...point).applyQuaternion(initial).add(new Vector3(...start)).toArray() as AgentWorldVector3;
    const rotation = new Euler().setFromQuaternion(initial.clone().multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), loop ? (index + 1) * Math.PI / 2 : 0)));
    return {
    id: "flightx-gate-" + index, type: "box", label: index === points.length - 1 ? "Arrivée / départ" : "Porte " + (index + 1),
    geometry: { width: 10, height: 10, depth: 6 }, transform: { position, rotationDegrees: [rotation.x / degrees, rotation.y / degrees, rotation.z / degrees] }, visible: false,
    physics: { mode: "trigger" }, tags: ["flightx-course-gate", "modern-training-layout", "adapted-passage-volume"],
    };
  });
  const rings: AgentWorldEntityDefinition[] = gates.map((gate, index) => ({
    id: "flightx-gate-ring-" + index, type: "torus", label: gate.label,
    transform: gate.transform, geometry: { radius: 7, tube: .22 },
    material: { color: index === gates.length - 1 ? "#a7edd6" : "#ffd28b", emissive: "#61411c", emissiveIntensity: .6, roughness: .45 },
    tags: ["modern-training-layout", "flightx-gate-visual"],
  }));
  return {
    ...source, id: "flightx-course-" + mode, label: "FlightX · " + FLIGHTX_MODES.find(item => item.id === mode)!.title,
    entities: [...entities, ...gates, ...rings],
    ...(points.length ? { rules: {
      schema: "graphysx.agent-rules/v1" as const, subjectId: FLIGHTX_PLAYER,
      spawn: { entityId: FLIGHTX_PLAYER, position: start },
      checkpoints: gates.slice(0, -1).map(gate => ({ triggerId: gate.id, label: gate.label })),
      finish: { triggerId: gates.at(-1)!.id }, laps: mode === "laps" ? 3 : 1,
      timer: mode === "time" ? { limitSeconds: 35 } : {},
    } } : {}),
  };
}
