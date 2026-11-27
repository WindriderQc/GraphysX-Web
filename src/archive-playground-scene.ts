import { IcosahedronGeometry, PlaneGeometry, SphereGeometry, type BufferGeometry } from "three";
import type { AgentWorldBehavior, AgentWorldDefinition, AgentWorldEntityDefinition, AgentWorldInlineMesh, AgentWorldVector3 } from "./agent-world-runtime";

export const PLAYGROUND_SOURCE_URL = "/assets/ports/archive-playground.json";
export type PlaygroundSource = { schema: string; airplaneBounds: { size: number[] }; evidence: { faithful: string[]; adapted: string[]; unestablished: string[] } };
export const PLAYGROUND_WORLD_ID = "archive-threejs-playground";
export const PLAYGROUND_CAMERA: AgentWorldVector3 = [54.563, 56, 50.108];
export const PLAYGROUND_TARGET: AgentWorldVector3 = [15, 8, 5];
const degrees = 180 / Math.PI;
const quantize = (n: number): number => Math.round(n * 1e6) / 1e6 || 0;
export const playgroundSpin = (id: string, axis: "x" | "y", divisor: number): AgentWorldBehavior => ({ id, type: "spin", axis, speedDegrees: 1000 * degrees / divisor });

/** Split only at complete triangles, retaining source positions, normals and UV seams. */
export function playgroundGeometryChunks(geometry: BufferGeometry, textured: boolean, normals = true): AgentWorldInlineMesh[] {
  const p = geometry.getAttribute("position"), uv = geometry.getAttribute("uv"), n = geometry.getAttribute("normal"), sourceIndices = geometry.index;
  const chunks: AgentWorldInlineMesh[] = [];
  let mesh: AgentWorldInlineMesh, vertices: Map<number, number>;
  const begin = (): void => { mesh = { positions: [], indices: [], ...(textured ? { uvs: [] } : {}), ...(normals ? { normals: [] } : {}) }; vertices = new Map(); };
  begin();
  const total = sourceIndices?.count ?? p.count;
  for (let offset = 0; offset < total; offset += 3) {
    const triangle = [0, 1, 2].map(k => sourceIndices ? sourceIndices.getX(offset + k) : offset + k);
    if (mesh!.indices.length >= 3000 || vertices!.size + triangle.filter(i => !vertices!.has(i)).length > 900) { chunks.push(mesh!); begin(); }
    for (const index of triangle) {
      let local = vertices!.get(index);
      if (local === undefined) {
        local = vertices!.size; vertices!.set(index, local);
        mesh!.positions.push(quantize(p.getX(index)), quantize(p.getY(index)), quantize(p.getZ(index)));
        if (textured) mesh!.uvs!.push(quantize(uv.getX(index)), quantize(uv.getY(index)));
        if (normals) mesh!.normals!.push(quantize(n.getX(index)), quantize(n.getY(index)), quantize(n.getZ(index)));
      }
      mesh!.indices.push(local);
    }
  }
  if (mesh!.indices.length) chunks.push(mesh!);
  geometry.dispose(); return chunks;
}

export function playgroundTerrain(width = 10, height = 10): AgentWorldInlineMesh[] {
  const geometry = new PlaneGeometry(width, height, Math.floor(width), Math.floor(height)), positions = geometry.getAttribute("position");
  let seed = 0x33504c59;
  for (let i = 0; i < positions.count; i++) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; positions.setZ(i, seed / 0x100000000); }
  geometry.rotateX(-Math.PI / 2); geometry.computeVertexNormals();
  return playgroundGeometryChunks(geometry, false);
}

const unlit = { shader: { id: "archive-playground" as const, effect: "unlit" as const } };
function pieces(parentId: string, chunks: AgentWorldInlineMesh[], material: AgentWorldEntityDefinition["material"]): (AgentWorldEntityDefinition & { id: string })[] {
  return chunks.map((mesh, index) => ({ id: `${parentId}-mesh-${index}`, parentId, type: "mesh", label: `${parentId} · surface ${index + 1}`, mesh, material, castShadow: false, receiveShadow: false, tags: ["archive", "playground-source-mesh"] }));
}

export function buildPlayground(source: PlaygroundSource): AgentWorldDefinition {
  if (source.schema !== "graphysx.archive-playground/v1") throw new Error("Unknown Playground source record");
  const entities: AgentWorldEntityDefinition[] = [
    { id: "playground-fill", type: "ambient-light", label: "Éclairage de visite", material: { color: "#ffffff" }, intensity: 1.25, tags: ["adapted-lighting"] },
    { id: "playground-light", type: "point-light", label: "Lumière animée · rythme source", material: { color: "#ffffff" }, intensity: 74, distance: 150, marker: true, transform: { position: [0, 7, 18] }, behaviors: [{ id: "source-light-rhythm", type: "modulate", property: "intensity", minimumFactor: 0, maximumFactor: 2, frequencyHz: .125, phaseDegrees: .75 }], tags: ["archive", "adapted-lighting", "source:generalLights.js"] },
    { id: "playground-cube", type: "box", label: "Cube · panneau d’origine", geometry: { width: 4, height: 4, depth: 4 }, transform: { position: [0, 20, 0] }, material: { ...unlit, color: "#ffffff", texture: { id: "playground-two-way" } }, behaviors: [playgroundSpin("source-cube-x", "x", 2000), playgroundSpin("source-cube-y", "y", 1000)], tags: ["archive", "source:testCube.js"] },
    { id: "playground-airplane", type: "model", label: "Airplane.glb · modèle d’origine", asset: { id: "archive-playground-airplane", fitSize: Math.max(...source.airplaneBounds.size) }, transform: { position: [10, 10, 5], scale: [10, 10, 10] }, behaviors: [{ id: "source-airplane-orbit", type: "orbit", center: [5, 10, 5], radius: 5, speedDegrees: 100, phaseDegrees: 0, axis: "y" }], tags: ["archive", "source:airplane.js"] },
    { id: "playground-line", type: "spline", label: "Ligne bleue · trois points sources", path: { points: [[-10, 0, 0], [0, 10, 0], [10, 0, 0]], closed: false, tension: 0 }, material: { color: "#0000ff" }, tags: ["archive", "source:testLine.js"] },
    { id: "playground-terrain", type: "group", label: "Plan rouge · relief d’origine", tags: ["archive", "source:planeZ.js", "playground-width:10", "playground-height:10", "adapted:horizontal-seeded-terrain"] },
    ...pieces("playground-terrain", playgroundTerrain(), { color: "#ff2020", roughness: .85, side: "double" }),
  ];
  for (let index = 0; index < 3; index++) {
    const morphId = `playground-morph-${index}`, geometry = new IcosahedronGeometry(2, 5); geometry.computeVertexNormals();
    entities.push({ id: morphId, type: "group", label: `Sphère déformée ${index + 1}`, transform: { position: [index * 10, 20, 20] }, tags: ["archive", "source:morphSphere.js"] },
      ...pieces(morphId, playgroundGeometryChunks(geometry, false, false), { color: "#ffffff", side: "double", shader: { id: "archive-playground", effect: "morph" } }));
    const planet = ["earth", "mars", "moon"][index], planetId = `playground-${planet}`;
    entities.push({ id: planetId, type: "group", label: ["Earth", "Mars", "Moon"][index] + " · texture source commune", transform: { position: [index * 20, 20, 0] }, tags: ["archive", "source:earth.js", "source-unused-x:2000"], behaviors: [playgroundSpin("source-planet-y", "y", 1000)] },
      ...pieces(planetId, playgroundGeometryChunks(new SphereGeometry(5, 50, 50), true), { ...unlit, color: "#ffffff", texture: { id: "playground-earth" } }));
  }
  return { schema: "graphysx.agent-world/v2", id: PLAYGROUND_WORLD_ID, label: "Three.js Playground · composition d’origine", environment: { background: "#03050e", sky: "playground-asteroids", envelope: { fogNear: 2000, fogFar: 28000, cameraFar: 30000 }, ground: { visible: false, size: 100, color: "#03050e", grid: false, gridColor: "#273549" } }, entities };
}

/** Preserve edits and foreign children while replacing this adapter's generated relief. */
export function playgroundTerrainCommands(document: AgentWorldDefinition, width: number, height: number) {
  const current = document.entities.filter(e => e.parentId === "playground-terrain" && /^playground-terrain-mesh-\d+$/.test(e.id ?? ""));
  const chunks = playgroundTerrain(width, height), material = current[0]?.material ?? { color: "#ff2020", roughness: .85, side: "double" as const };
  const next = pieces("playground-terrain", chunks, material), ids = new Set(next.map(e => e.id));
  return [
    ...current.filter(e => !ids.has(e.id ?? "")).map(e => ({ op: "update" as const, id: e.id!, patch: { visible: false } })),
    ...next.map(entity => current.some(e => e.id === entity.id) ? { op: "update" as const, id: entity.id, patch: { mesh: entity.mesh, visible: true } } : { op: "spawn" as const, entity }),
    { op: "update" as const, id: "playground-terrain", patch: { tags: [...(document.entities.find(e => e.id === "playground-terrain")?.tags ?? []).filter(t => !/^playground-(width|height):/.test(t)), `playground-width:${width}`, `playground-height:${height}`] } },
  ];
}
