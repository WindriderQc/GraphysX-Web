/**
 * Scene-native revival of the archived Sky.cpp / Atmosphere.cpp day/night rig.
 *
 * Faithful: the host runs the recovered sun orbit, daylight ramp and logistic brightness
 * equations on simulation time. Adapted: the archive never named image files for the cycle,
 * so this editable observatory explicitly binds the shipped BallZ18 Clear Sky + Lilienstein day
 * look and NightSky + Vignaioli night look. The architecture is a modern inspection set, not
 * represented as a recovered level.
 */
import { Vector3 } from "three";
import {
  GRAPHYSX_AGENT_WORLD_SCHEMA,
  type AgentWorldEntityDefinition,
  type GraphysXAgentWorldApi,
} from "./agent-world-runtime";
import type { PlatformHost } from "./platform-host";

const METAL = { color: "#8294a8", roughness: 0.28, metalness: 0.78 } as const;
const STONE = { color: "#333b47", roughness: 0.82, metalness: 0.08 } as const;

function buildEntities(): AgentWorldEntityDefinition[] {
  const entities: AgentWorldEntityDefinition[] = [
    {
      id: "day-night-island", label: "Observatory Island", type: "cylinder",
      transform: { position: [0, -0.7, 0] }, geometry: { radius: 14, height: 1.4, radialSegments: 64 },
      material: STONE, physics: { mode: "static", material: "ground" },
      tags: ["day-night", "observatory", "adapted-showcase"],
    },
    {
      id: "day-night-dais", label: "Celestial Dais", type: "cylinder",
      transform: { position: [0, 0.3, 0] }, geometry: { radius: 5.4, height: 0.6, radialSegments: 64 },
      material: { color: "#141a23", roughness: 0.38, metalness: 0.62 },
      physics: { mode: "static", material: "ground" }, tags: ["day-night", "observatory"],
    },
    {
      id: "day-night-globe", label: "Atmosphere Globe", type: "sphere",
      transform: { position: [0, 4.6, 0] }, geometry: { radius: 2.2, radialSegments: 48 },
      material: { color: "#79bfff", opacity: 0.32, roughness: 0.08, metalness: 0.2, emissive: "#174f75", emissiveIntensity: 0.35 },
      castShadow: false, behaviors: [{ type: "spin", axis: "y", speedDegrees: 5 }], tags: ["day-night", "celestial-instrument"],
    },
    {
      id: "day-night-equator", label: "Equatorial Ring", type: "torus",
      transform: { position: [0, 4.6, 0], rotationDegrees: [90, 0, 0] }, geometry: { radius: 3.25, tube: 0.09, radialSegments: 64 },
      material: { ...METAL, emissive: "#274660", emissiveIntensity: 0.22 },
      behaviors: [{ type: "spin", axis: "z", speedDegrees: 7 }], tags: ["day-night", "celestial-instrument"],
    },
    {
      id: "day-night-meridian", label: "Meridian Ring", type: "torus",
      transform: { position: [0, 4.6, 0] }, geometry: { radius: 3.25, tube: 0.09, radialSegments: 64 },
      material: METAL, behaviors: [{ type: "spin", axis: "y", speedDegrees: -4 }], tags: ["day-night", "celestial-instrument"],
    },
    {
      id: "day-night-ecliptic", label: "Ecliptic Ring", type: "torus",
      transform: { position: [0, 4.6, 0], rotationDegrees: [67, 0, 24] }, geometry: { radius: 3.75, tube: 0.055, radialSegments: 64 },
      material: { color: "#f3c878", roughness: 0.24, metalness: 0.7, emissive: "#8b5c16", emissiveIntensity: 0.42 },
      behaviors: [{ type: "spin", axis: "z", speedDegrees: 3 }], tags: ["day-night", "celestial-instrument"],
    },
    {
      id: "day-night-needle", label: "Solar Needle", type: "cylinder",
      transform: { position: [0, 4.6, 0], rotationDegrees: [0, 0, 23.5] }, geometry: { radius: 0.1, height: 8.8, radialSegments: 18 },
      material: { color: "#f7dfae", roughness: 0.2, metalness: 0.72, emissive: "#6f4a16", emissiveIntensity: 0.24 },
      tags: ["day-night", "celestial-instrument"],
    },
  ];

  for (let index = 0; index < 8; index += 1) {
    const angle = (index / 8) * Math.PI * 2;
    const x = Math.cos(angle) * 10.3;
    const z = Math.sin(angle) * 10.3;
    entities.push(
      {
        id: `day-night-pillar-${index + 1}`, label: `Hour Pillar ${index + 1}`, type: "cylinder",
        transform: { position: [x, 1.45, z] }, geometry: { radius: 0.42, height: 3.2, radialSegments: 24 },
        material: STONE, physics: { mode: "static", material: "wall" }, tags: ["day-night", "hour-marker"],
      },
      {
        id: `day-night-beacon-${index + 1}`, label: `Hour Beacon ${index + 1}`, type: "sphere",
        transform: { position: [x, 3.3, z] }, geometry: { radius: 0.3, radialSegments: 20 },
        material: { color: "#ffd98a", emissive: "#ff9f35", emissiveIntensity: 2.4, roughness: 0.18 },
        castShadow: false, tags: ["day-night", "hour-marker", "beacon"],
      },
    );
  }
  return entities;
}

export const DAY_NIGHT_PROVENANCE = {
  equations: "AtmelCubx/Atmosphere.cpp and GraphysX_1/Sky.cpp",
  cycle: "faithful sun orbit, daylight ramp, logistic brightness and horizon warmth",
  endpoints: "adapted scene binding: exact BallZ18 Clear Sky/Lilienstein day; NightSky/Vignaioli night",
  showcase: "modern editable observatory; not represented as an archived level",
} as const;

export function composeArchiveDayNight(api: GraphysXAgentWorldApi) {
  return api.create({
    schema: GRAPHYSX_AGENT_WORLD_SCHEMA,
    id: "archive-day-night-rig",
    label: "Archive Day / Night Observatory",
    environment: {
      background: "#07101a",
      sky: "ballz18-clear-sky",
      lighting: { source: "hdri", hdri: "lilienstein", intensity: 1, yawDegrees: 14, backgroundIntensity: 0.95, backgroundBlur: 0.04 },
      dayNight: {
        cycleSeconds: 12,
        phaseOffset: 0.5,
        day: {
          sky: "ballz18-clear-sky",
          background: "#86b9d2",
          lighting: { source: "hdri", hdri: "lilienstein", intensity: 1.08, yawDegrees: 14, backgroundIntensity: 1, backgroundBlur: 0.03 },
        },
        night: {
          sky: "nightsky",
          background: "#07101a",
          lighting: { source: "hdri", hdri: "vignaioli-night", intensity: 0.72, yawDegrees: -18, backgroundIntensity: 0.72, backgroundBlur: 0.08 },
        },
      },
      post: { bloom: { strength: 0.48, threshold: 0.72, radius: 0.32 } },
      envelope: { fogNear: 32, fogFar: 110, cameraFar: 240 },
      ground: { visible: false, size: 40, color: "#222a34", grid: false, gridColor: "#516070" },
      physics: { gravity: [0, -9.81, 0] },
    },
    entities: buildEntities(),
  });
}

export function frameArchiveDayNight(host: PlatformHost): void {
  host.camera.position.set(19, 11, 24);
  host.focusOn(new Vector3(0, 3.2, 0), 13, 1.05);
}
