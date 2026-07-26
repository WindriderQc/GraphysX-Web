import { Vector3 } from "three";
import { GRAPHYSX_AGENT_WORLD_SCHEMA, type AgentWorldEntityDefinition, type GraphysXAgentWorldApi } from "./agent-world-runtime";
import type { PlatformHost } from "./platform-host";

/**
 * Generative Surfaces showcase (Wave 15) — a dark gallery whose panels are *alive*.
 *
 * Every panel here is an ordinary primitive entity carrying a `surface`: a live Canvas2D sketch
 * drawn onto its face as a CanvasTexture in the runtime's one shared frame pass. Nothing is a
 * bespoke shader or a second render loop — a scene document declares `surface`, the runtime draws
 * it, and it round-trips through export/load like any other field. Select a panel in the editor
 * and its surface travels with it; an agent can `update({ surface: { sketch: "plasma" } })` to
 * re-skin it live.
 *
 * The three sketches (waveform / grid-pulse / plasma) are new Canvas2D work, not archive ports —
 * so this scene's provenance is honest: the *capability* is the point, not a recovered artifact.
 * Restrained bloom lets the emissive surfaces glow; a low studio probe keeps the room readable.
 */

const ROOM_W = 26;
const ROOM_D = 18;
const WALL_H = 9;

function panel(
  id: string,
  label: string,
  sketch: "waveform" | "grid-pulse" | "plasma",
  position: [number, number, number],
  yawDegrees: number,
  size: [number, number],
  tint = "#ffffff",
): AgentWorldEntityDefinition {
  return {
    id,
    label,
    type: "box",
    transform: { position, rotationDegrees: [0, yawDegrees, 0] },
    geometry: { width: size[0], height: size[1], depth: 0.22 },
    // The frame reads as a bezel; the surface paints the front face.
    material: { color: "#05070b", roughness: 0.5, metalness: 0.3 },
    surface: { sketch, resolution: 384, fps: 30, emissive: true, tint },
    castShadow: false,
    tags: ["surfaces-showcase", "panel"],
  };
}

/** One `api.create`, so the result is an ordinary editable v2 scene. */
export function composeGenerativeSurfaces(api: GraphysXAgentWorldApi): void {
  const room: AgentWorldEntityDefinition[] = [
    {
      id: "surfaces-floor",
      label: "Floor",
      type: "box",
      transform: { position: [0, -0.25, 0] },
      geometry: { width: ROOM_W, height: 0.5, depth: ROOM_D },
      material: { color: "#0c0f14", roughness: 0.7, metalness: 0.15 },
      receiveShadow: true,
      tags: ["surfaces-showcase", "room"],
    },
    {
      id: "surfaces-backwall",
      label: "Back Wall",
      type: "box",
      transform: { position: [0, WALL_H / 2, -ROOM_D / 2] },
      geometry: { width: ROOM_W, height: WALL_H, depth: 0.4 },
      material: { color: "#0a0d12", roughness: 0.85, metalness: 0.05 },
      tags: ["surfaces-showcase", "room"],
    },
  ];

  const panels: AgentWorldEntityDefinition[] = [
    panel("surfaces-waveform", "Waveform Panel", "waveform", [-8, 3.4, -4.2], 24, [5.4, 3.4], "#bfffe8"),
    panel("surfaces-gridpulse", "Grid Pulse Panel", "grid-pulse", [0, 3.4, -5], 0, [6, 3.6]),
    panel("surfaces-plasma", "Plasma Panel", "plasma", [8, 3.4, -4.2], -24, [5.4, 3.4]),
    // A tall billboard facing the entry, and a slow-fps sign to show the per-surface budget lever.
    panel("surfaces-billboard", "Entry Billboard", "plasma", [-4.5, 3.2, 3.5], -18, [3.2, 4.4], "#ffd9f2"),
  ];

  // A curved screen: a cylinder wears the same surface wrapped around it, proving surfaces are
  // not plane-only. Idles at 12 fps — a deliberate, visible budget choice.
  const cylinderScreen: AgentWorldEntityDefinition = {
    id: "surfaces-cylinder",
    label: "Curved Screen",
    type: "cylinder",
    transform: { position: [4.6, 2.4, 3.2], rotationDegrees: [0, 0, 0] },
    geometry: { radius: 1.7, height: 3.6, radialSegments: 48 },
    material: { color: "#05070b", roughness: 0.4, metalness: 0.4 },
    surface: { sketch: "grid-pulse", resolution: 512, fps: 12, emissive: true, tint: "#cfe0ff" },
    behaviors: [{ type: "spin", axis: "y", speedDegrees: 12 }],
    tags: ["surfaces-showcase", "panel"],
  };

  const lights: AgentWorldEntityDefinition[] = [
    { id: "surfaces-ambient", label: "Ambient", type: "ambient-light", intensity: 0.18, material: { color: "#7f8ea3" }, tags: ["surfaces-showcase", "lighting"] },
    { id: "surfaces-key", label: "Key", type: "directional-light", transform: { position: [6, 10, 8] }, intensity: 0.6, material: { color: "#cfe3ff" }, castShadow: true, tags: ["surfaces-showcase", "lighting"] },
  ];

  api.create({
    schema: GRAPHYSX_AGENT_WORLD_SCHEMA,
    id: "surfaces-showcase",
    label: "Generative Surfaces — live sketches on in-world screens",
    environment: {
      background: "#04060a",
      sky: null,
      lighting: { source: "hdri", hdri: "studio-small-08", intensity: 0.55, yawDegrees: 0, backgroundIntensity: 0.12, backgroundBlur: 0.2 },
      // Only the emissive surfaces cross the threshold; the room stays matte.
      post: { bloom: { strength: 0.5, threshold: 0.6, radius: 0.4 } },
      overlay: null,
      envelope: { fogNear: 26, fogFar: 90, cameraFar: 200 },
      ground: { visible: false, size: 40, color: "#0c0f14", grid: false, gridColor: "#1b2430" },
    },
    entities: [...room, ...panels, cylinderScreen, ...lights],
  });
}

/** Aim the host camera at the gallery so all the panels are in frame on entry. */
export function frameGenerativeSurfaces(host: PlatformHost): void {
  host.camera.position.set(0, 4.6, 12.5);
  host.focusOn(new Vector3(0, 3, -1.5), 6.5, 1.2);
}
