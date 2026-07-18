import {
  GRAPHYSX_AGENT_WORLD_SCHEMA,
  type AgentWorldEntityDefinition,
  type GraphysXAgentWorldApi,
} from "./agent-world-runtime";

const CLUSTER = "showroom-cubx";
const CORNERS: ReadonlyArray<[number, number, number]> = [
  [-1, -1, -1], [1, -1, -1], [-1, 1, -1], [1, 1, -1],
  [-1, -1, 1], [1, -1, 1], [-1, 1, 1], [1, 1, 1],
];

/**
 * Compose the evolutive welcome showroom entirely from platform vocabulary — the same
 * starters, prefabs, primitives, and behaviors a user or agent builds with. A glowing
 * garden base, a slowly rotating eight-cube "CubX" assembly, and a few sculptures/trees.
 * This grows over time (terrain, water, richer CubX); it is deliberately a v2 scene, not
 * bespoke host code, so the showroom stays editable and on-model.
 */
export function composeShowroom(api: GraphysXAgentWorldApi): void {
  const cubes = CORNERS.map((corner, index): AgentWorldEntityDefinition => ({
    id: `${CLUSTER}-cube-${index}`,
    type: "box",
    parentId: CLUSTER,
    geometry: { width: 1, height: 1, depth: 1 },
    transform: { position: [corner[0] * 0.85, corner[1] * 0.85, corner[2] * 0.85] },
    material: { color: "#41d3e8", emissive: "#0b4f63", emissiveIntensity: 0.7, roughness: 0.25, metalness: 0.55 },
    tags: ["showroom", "cubx"],
  }));

  // The showroom is a v2 scene with the flat grid hidden — the host renders the sky/terrain/sun.
  api.create({
    schema: GRAPHYSX_AGENT_WORLD_SCHEMA,
    id: "showroom",
    label: "GraphysX Showroom",
    environment: {
      background: "#0a1c28",
      // A recovered TV3D skybox, selected per scene. It also lights the scene: the host
      // builds an IBL probe from the same cube map, so objects reflect the sky they sit under.
      sky: "lostvalley",
      ground: { visible: false, size: 60, color: "#123039", grid: false, gridColor: "#2a7d8f" },
    },
    entities: [
      { id: "fill-light", type: "ambient-light", intensity: 0.5, material: { color: "#cfe9ff" } },
      {
        id: CLUSTER,
        type: "group",
        label: "CubX Assembly",
        transform: { position: [0, 3.6, 0] },
        behaviors: [{ id: "cubx-spin", type: "spin", axis: "y", speedDegrees: 12 }],
        tags: ["showroom", "cubx"],
      },
      ...cubes,
    ],
  });

  api.spawnPrefab("orbital-sculpture", { position: [-9, 0, -5] });
  api.spawnPrefab("orbital-sculpture", { position: [11, 0, 4] });
  api.spawnPrefab("portal-arch", { position: [9, 0, -6] });
  api.spawnPrefab("luminous-tree", { position: [-6, 0, 6] });
  api.spawnPrefab("luminous-tree", { position: [7, 0, 5] });
  api.spawnPrefab("luminous-tree", { position: [-11, 0, 2] });
}

/**
 * A lightweight welcome overlay for the showroom front door. Mostly non-interactive so the
 * scene reads through it; the single call to action reveals the editor.
 */
export function mountWelcome(container: HTMLElement, onEnter: () => void): () => void {
  const style = document.createElement("style");
  style.textContent = `
    .gx-welcome{position:fixed;inset:0;z-index:30;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;pointer-events:none;font-family:system-ui,sans-serif;text-align:center;background:radial-gradient(120% 90% at 50% 28%,rgba(3,12,20,0) 42%,rgba(3,12,20,.6) 100%)}
    .gx-welcome h1{margin:0;font-size:clamp(36px,7vw,74px);letter-spacing:.06em;font-weight:800;color:#eafaff;text-shadow:0 4px 44px rgba(70,220,235,.4)}
    .gx-welcome p{margin:0;max-width:560px;color:#a9d6e2;font-size:15px;line-height:1.55;padding:0 18px}
    .gx-welcome .gx-actions{display:flex;gap:12px;flex-wrap:wrap;justify-content:center;pointer-events:auto}
    .gx-welcome button{background:linear-gradient(180deg,#2fb6d0,#1d7f96);color:#fff;border:1px solid #4fd0e6;border-radius:12px;padding:12px 24px;font:600 15px system-ui,sans-serif;cursor:pointer;box-shadow:0 8px 30px rgba(30,127,150,.42)}
    .gx-welcome button:hover{filter:brightness(1.08)}
    .gx-welcome .gx-hint{color:#6fb9cc;font-size:12px;pointer-events:none}
  `;
  const overlay = document.createElement("div");
  overlay.className = "gx-welcome";
  overlay.innerHTML = `
    <h1>GRAPHYSX WEB</h1>
    <p>A browser engine for 3D + physics scenes that humans and AI agents create and inhabit together. This welcome scene is composed from the same vocabulary you build with.</p>
    <div class="gx-actions"><button type="button">Enter Scene Editor</button></div>
    <div class="gx-hint">drag to look around · scroll to zoom</div>
  `;
  const dispose = () => { overlay.remove(); style.remove(); };
  overlay.querySelector("button")?.addEventListener("click", () => { onEnter(); dispose(); });
  container.append(style, overlay);
  return dispose;
}
