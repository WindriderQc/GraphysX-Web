import { Box3, Raycaster, Sphere, Vector2, Vector3, type Camera, type Scene, type WebGLRenderer } from "three";
import type { AgentWorldRuntime, GraphysXAgentWorldApi } from "./agent-world-runtime";

export interface ShowroomInteractionDeps {
  renderer: WebGLRenderer;
  camera: Camera;
  scene: Scene;
  world: AgentWorldRuntime;
  api: GraphysXAgentWorldApi;
  /**
   * Ease the camera onto a point. Supplied by the host, which owns the camera and the orbit
   * controls — this module decides *what* to look at, never how the camera is driven.
   */
  focusOn?: (point: Vector3, subjectRadius: number) => void;
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
 * Clicking anything else — a tree, an arch, a sculpture, the CubX assembly — focuses the
 * camera on it, the behaviour PRODUCT_SPEC §5 has promised since day one. Scenery clicks used
 * to fall *through* to the ground and drop a ball behind the thing you clicked, which was a
 * stopgap for the scenery having no response of its own. Now it has one.
 *
 * Disabled while the editor is open, so the editor's own picking and gizmo own the pointer.
 */
export function mountShowroomInteraction(deps: ShowroomInteractionDeps): {
  setEnabled: (enabled: boolean) => void;
  dispose: () => void;
} {
  const { renderer, camera, scene, world, api, focusOn } = deps;

  /** Climb `parentId` to the outermost entity, so a prefab frames as one object. */
  const rootEntityId = (id: string): string => {
    let current = id;
    // Bounded so a malformed parent cycle can never hang a click.
    for (let hop = 0; hop < 16; hop += 1) {
      const parent = api.query({ ids: [current] })[0]?.parentId;
      if (!parent) return current;
      current = parent;
    }
    return current;
  };

  const raycaster = new Raycaster();
  const ndc = new Vector2();
  const dropped: string[] = [];
  let enabled = true;
  let dropCount = 0;
  let down: { x: number; y: number } | null = null;

  /**
   * Ground is now a `terrain` entity rather than a host mesh, so this asks the scene which
   * entities are terrain instead of matching an object name the host used to own. Resolved
   * per click — a terrain entity can be added, removed or reshaped at any time by a human
   * or an agent, and a cached id set would go stale the moment it was.
   */
  const terrainIds = (): Set<string> => new Set(api.query({ type: "terrain" }).map((entity) => entity.id));

  /**
   * Entities the pointer passes straight through.
   *
   * **Water**: a 150-unit surface with no collider. Focusing on it would frame a plane the
   * size of the world, and dropping a ball on it would drop a ball *through* it, so the click
   * belongs to whatever is under the water.
   *
   * **Emitters**: you cannot grab smoke. Three's `Raycaster` gives `Points` a one-unit hit
   * threshold, so a brazier's plume is a metre-thick invisible wall of click targets standing
   * in front of the ground behind it — which is exactly how a click aimed at bare ground
   * ended up focusing the camera on a campfire.
   */
  const passThroughIds = (): Set<string> =>
    new Set([...api.query({ type: "water" }), ...api.query({ type: "emitter" })].map((entity) => entity.id));

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

    const terrain = terrainIds();
    const passThrough = passThroughIds();
    for (const hit of raycaster.intersectObjects(scene.children, true)) {
      const entityId = world.findEntityId(hit.object);
      if (entityId && passThrough.has(entityId)) continue;
      if (entityId && world.findInteractiveEntityId(hit.object)) {
        // Interactive bodies carry their own impulse.
        api.interact(entityId);
        return;
      }
      // Scenery: focus the camera on it. A prefab is many entities under one root, so climb
      // to the root first — clicking a tree's canopy should frame the tree, not the canopy.
      if (entityId && !terrain.has(entityId)) {
        if (!focusOn) continue;
        const rootId = rootEntityId(entityId);
        const object = world.getEntityObject(rootId) ?? hit.object;
        const bounds = new Box3().setFromObject(object).getBoundingSphere(new Sphere());
        // A degenerate bound (a light marker, an empty group) still deserves a sane framing.
        const radius = Number.isFinite(bounds.radius) && bounds.radius > 0.05 ? bounds.radius : 1.5;
        focusOn(bounds.center.clone(), radius);
        return;
      }
      if (entityId && terrain.has(entityId)) {
        dropCount += 1;
        const id = `showroom-drop-${dropCount}`;
        const result = api.spawn({
          id,
          type: "sphere",
          label: `Dropped Ball ${dropCount}`,
          geometry: { radius: 0.42 },
          // Spawned above the click so it visibly falls and settles. Six metres, not nine,
          // and a calmer restitution: from nine at 0.52 a ball bounced clear off the terrain's
          // level stage and rolled into the lake basin every time, which is a poor answer to
          // "click the ground to drop a ball" — you want it to land where you pointed.
          transform: { position: [round(hit.point.x), round(hit.point.y) + 6, round(hit.point.z)] },
          material: { color: pickColor(dropCount), roughness: 0.28, metalness: 0.35, emissive: "#08222b", emissiveIntensity: 0.4 },
          physics: { mode: "dynamic", mass: 1.1, material: "ball", restitution: 0.34 },
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
