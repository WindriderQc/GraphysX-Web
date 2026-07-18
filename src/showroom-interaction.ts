import { Raycaster, Vector2, type Camera, type Object3D, type Scene, type WebGLRenderer } from "three";
import type { AgentWorldRuntime, GraphysXAgentWorldApi } from "./agent-world-runtime";

export interface ShowroomInteractionDeps {
  renderer: WebGLRenderer;
  camera: Camera;
  scene: Scene;
  world: AgentWorldRuntime;
  api: GraphysXAgentWorldApi;
}

/** Dropped spheres are recycled past this many, so a visitor cannot grind the sim down. */
const MAX_DROPPED = 24;

/**
 * Makes the showroom a place you can act in rather than watch.
 *
 * Clicking a physics body fires its `apply-impulse` interaction; clicking the ground drops
 * a new dynamic sphere. Both go through the ordinary agent API — the impulse is scene
 * vocabulary carried on the entity, not a special case in the host — so anything a visitor
 * does here is something an agent could do, and vice versa.
 *
 * Disabled while the editor is open, so the editor's own picking and gizmo own the pointer.
 */
export function mountShowroomInteraction(deps: ShowroomInteractionDeps): {
  setEnabled: (enabled: boolean) => void;
  dispose: () => void;
} {
  const { renderer, camera, scene, world, api } = deps;
  const raycaster = new Raycaster();
  const ndc = new Vector2();
  const dropped: string[] = [];
  let enabled = true;
  let dropCount = 0;
  let down: { x: number; y: number } | null = null;

  const isTerrain = (object: Object3D): boolean => {
    for (let node: Object3D | null = object; node; node = node.parent) {
      if (node.name === "ShowroomTerrain") return true;
    }
    return false;
  };

  const onPointerDown = (event: PointerEvent): void => {
    down = { x: event.clientX, y: event.clientY };
  };

  const onPointerUp = (event: PointerEvent): void => {
    const start = down;
    down = null;
    if (!enabled || !start) return;
    // A drag is an orbit, not a click.
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5) return;

    const rect = renderer.domElement.getBoundingClientRect();
    ndc.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);

    for (const hit of raycaster.intersectObjects(scene.children, true)) {
      const entityId = world.findEntityId(hit.object);
      if (entityId && world.findInteractiveEntityId(hit.object)) {
        // Interactive bodies carry their own impulse.
        api.interact(entityId);
        return;
      }
      // Anything else is scenery: keep walking the ray to the ground behind it rather than
      // swallowing the click. Stopping at the first non-interactive entity made clicking a
      // tree do nothing at all, which reads as an unresponsive scene.
      if (entityId) continue;
      if (isTerrain(hit.object)) {
        dropCount += 1;
        const id = `showroom-drop-${dropCount}`;
        const result = api.spawn({
          id,
          type: "sphere",
          label: `Dropped Ball ${dropCount}`,
          geometry: { radius: 0.42 },
          // Spawned above the click so it visibly falls and settles.
          transform: { position: [round(hit.point.x), round(hit.point.y) + 9, round(hit.point.z)] },
          material: { color: pickColor(dropCount), roughness: 0.28, metalness: 0.35, emissive: "#08222b", emissiveIntensity: 0.4 },
          physics: { mode: "dynamic", mass: 1.1, material: "ball", restitution: 0.52 },
          // Playing in a scene is not authoring it: these balls exist for the visit and are
          // dropped by `exportDocument()`, so the showroom never accumulates them.
          ephemeral: true,
          tags: ["showroom", "dropped"],
        });
        if (result.ok) {
          dropped.push(id);
          while (dropped.length > MAX_DROPPED) {
            const oldest = dropped.shift();
            if (oldest) api.remove(oldest);
          }
        }
        return;
      }
    }
  };

  const dom = renderer.domElement;
  dom.addEventListener("pointerdown", onPointerDown);
  dom.addEventListener("pointerup", onPointerUp);

  return {
    setEnabled: (value: boolean) => {
      enabled = value;
      down = null;
    },
    dispose: () => {
      dom.removeEventListener("pointerdown", onPointerDown);
      dom.removeEventListener("pointerup", onPointerUp);
    },
  };
}

const DROP_COLORS = ["#ffb457", "#6fe3ff", "#ff8f7a", "#a6f08a", "#d7a6ff", "#ffe066"];
const pickColor = (n: number): string => DROP_COLORS[n % DROP_COLORS.length];
const round = (n: number): number => Math.round(n * 1000) / 1000;
