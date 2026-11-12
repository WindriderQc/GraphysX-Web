import type { AgentWorldDefinition, AgentWorldEntityDefinition, GraphysXAgentWorldApi } from "./agent-world-runtime";

export const CUISINE_PROVENANCE = {
  source: "blenderModel/Maison/Cuisine.blend → cuisine-best.fbx",
  sourceSha256: "24846d8ec083477f87e91f46ed31da952a575b7f7cd3b234b6d11a4603b5b14e",
  faithful: ["76 complete named mesh parts, source transforms, UVs, normals and material groups", "Blender centimetres converted by 0.01"],
  adapted: ["Object hierarchy baked into one editable model", "Modern ambient/fill lighting; source camera direction with host field of view"],
  absent: ["The unpacked Desktop photograph was already missing in the source archive"],
} as const;

export function buildArchiveCuisine(): AgentWorldDefinition {
  return {
    schema: "graphysx.agent-world/v2", id: "archive-cuisine", label: "Cuisine · Blender archive",
    environment: { background: "#cbd2ce", ground: { visible: false, size: 20, color: "#cbd2ce", grid: false, gridColor: "#cbd2ce" },
      lighting: { source: "studio", intensity: 0.65, yawDegrees: 0, backgroundIntensity: 1, backgroundBlur: 0 } },
    entities: [
      { id: "cuisine-model", type: "model", label: "Cuisine · 76 recovered mesh parts",
        asset: { id: "archive-cuisine", fitSize: 9.2429292 },
        transform: { position: [2.1908659, 1.1766912, -4.3490643] },
        tags: ["archive", "cuisine", "faithful-geometry", "source:blenderModel/Maison/Cuisine.blend"] },
      { id: "cuisine-fill", type: "ambient-light", intensity: 1.15, material: { color: "#f5f3ea" }, tags: ["adapted-lighting"] },
      { id: "cuisine-point-1", type: "point-light", intensity: 12, distance: 7.62, marker: false,
        transform: { position: [2.224452, 2.09272, -7.671852] }, material: { color: "#ffffff" }, tags: ["archive", "adapted-lighting"] },
      { id: "cuisine-point-2", type: "point-light", intensity: 12, distance: 7.62, marker: false,
        transform: { position: [1.864434, 2.443339, -1.97] }, material: { color: "#ffffff" }, tags: ["archive", "adapted-lighting"] },
    ],
  };
}

export const NATIVE_INTRO_PROVENANCE = {
  source: "GraphysX/ArduinoGUI/ArduinoGUI/ScreenSys/IntroScreen.cs:33-114",
  geometrySource: "GraphysX_1/MeshPrimitive.cpp:66-67 (CreateCylinder(radius, height, 24, true))",
  faithful: ["Two ten-cylinder families, exact radii/heights, positions and 0.1 / 0.05 masses", "40-unit Alien diffuse/normal floor; two original point-light positions; original camera"],
  adapted: ["Rapier replaces Newton; copper PBR finish and modern light intensities", "SkyX replaced by retained ClearBlue sky; floor thickness and impulse interactions"],
  absent: ["VERTEXSTRIP sprite, Coke.jpg binding, original WinForms level picker and exact Newton contact behaviour"],
} as const;

export function buildNativeIntro(): AgentWorldDefinition {
  const cylinders: AgentWorldEntityDefinition[] = [];
  for (let index = 0; index < 10; index++) {
    for (const family of [0, 1]) {
      const id = `intro-cylinder-${family}-${index}`;
      cylinders.push({ id, type: "cylinder", label: `${family ? "Small cylinder" : "Copper disc"} ${index + 1}`,
        geometry: { radius: family ? 0.2 : 0.5, height: family ? 0.5 : 0.25, radialSegments: 24 },
        transform: { position: family ? [5, 0.5 + index * 0.75, 7.5] : [10, 0.5 + index, 10] },
        material: { color: family ? "#d8d8d8" : "#b87333", roughness: family ? 0.6 : 0.3, metalness: family ? 0 : 0.65 },
        physics: { mode: "dynamic", mass: family ? 0.05 : 0.1 },
        interactions: [{ id: `nudge-${id}`, type: "apply-impulse", targetIds: [id], impulse: [0.09, 0.15, 0.08] }],
        tags: ["archive", "native-intro", "source:IntroScreen.cs"],
      });
    }
  }
  return {
    schema: "graphysx.agent-world/v2", id: "archive-native-intro", label: "ArduinoGUI · Intro Physics (partial revival)",
    environment: { background: "#7695aa", sky: "clearblue", ground: { visible: false, size: 40, color: "#7695aa", grid: false, gridColor: "#7695aa" } },
    entities: [
      { id: "intro-floor", type: "box", label: "Alien floor · source size 40", geometry: { width: 40, height: 0.3, depth: 40 },
        transform: { position: [20, -0.15, 20] },
        material: { color: "#ffffff", roughness: 0.8, texture: { id: "classic-alien01", repeat: [16, 16] }, normalTexture: { id: "classic-alien01-normal", repeat: [16, 16] } },
        physics: { mode: "static" }, tags: ["archive", "native-intro"] },
      { id: "intro-fill", type: "ambient-light", intensity: 0.7, material: { color: "#b8c5d4" }, tags: ["adapted-lighting"] },
      ...[[8, 20, 8], [32, 20, 32]].map((position, index): AgentWorldEntityDefinition => ({
        id: `intro-light-${index}`, type: "point-light", intensity: 70, distance: 40, marker: false,
        transform: { position: position as [number, number, number] }, material: { color: "#ffffff" }, tags: ["archive", "adapted-lighting"],
      })),
      ...cylinders,
    ],
  };
}

export function composeArchiveRevival(api: GraphysXAgentWorldApi, scene: "cuisine" | "native-intro"): void {
  const result = api.create(scene === "cuisine" ? buildArchiveCuisine() : buildNativeIntro());
  if (!result.ok) throw new Error(result.error ?? `Could not compose ${scene}`);
}
