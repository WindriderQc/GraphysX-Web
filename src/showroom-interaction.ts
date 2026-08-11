import { Box3, Raycaster, Sphere, Vector2, Vector3, type Camera, type Scene, type WebGLRenderer } from "three";
import type { AgentWorldRuntime, GraphysXAgentWorldApi } from "./agent-world-runtime";
import type { NestorTopic } from "./showroom-nestor";

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
  focusOn?: (point: Vector3, subjectRadius: number, viewDirection?: Vector3) => void;
  /** Route scene-native AgentX Center consoles to Nestor's attributed presenter. */
  onNestorTopic?: (topic: NestorTopic) => void;
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
  focusEntity: (id: string, authoredView?: boolean) => boolean;
  dispose: () => void;
} {
  const { renderer, camera, scene, world, api, focusOn, onNestorTopic } = deps;

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

  const focusEntity = (id: string, authoredView = false): boolean => {
    if (!focusOn) return false;
    const rootId = rootEntityId(id);
    const object = world.getEntityObject(rootId) ?? world.getEntityObject(id);
    if (!object) return false;
    const bounds = new Box3().setFromObject(object).getBoundingSphere(new Sphere());
    const radius = Number.isFinite(bounds.radius) && bounds.radius > 0.05 ? bounds.radius : 1.5;
    // Nestor demonstrations need a repeatable, authored reveal. Ordinary scene clicks retain
    // the visitor's current direction so manual exploration never snaps unexpectedly.
    const direction = authoredView ? new Vector3(0.45, 0.32, 1).normalize() : undefined;
    focusOn(bounds.center.clone(), radius, direction);
    return true;
  };

  const nestorTopicFor = (id: string): NestorTopic | null => {
    const root = api.query({ ids: [rootEntityId(id)] })[0];
    const topicTag = root?.tags.find((tag) => tag.startsWith("nestor-topic:"));
    const topic = topicTag?.slice("nestor-topic:".length);
    if (topic === "build" || topic === "play" || topic === "explore") return topic;
    if (root?.tags.includes("nestor-home")) return "build";
    return null;
  };

  /**
   * A portal is an entity that says where it goes, in its own tags.
   *
   * `portal-to:<entityId>`, read exactly the way `nestor-topic:<topic>` above already is. That
   * precedent is the whole argument for the design: the destination lives in the scene, so it
   * survives export and reload, an author can retarget a portal in the inspector without
   * touching code, and an agent can build one with an ordinary `api.spawn`. The host only
   * interprets the tag — it holds no destination of its own, which is the invariant that would
   * be broken by a table of portals living in TypeScript.
   *
   * Travel is a camera move rather than a scene load, and that is what the slice asks for: the
   * Center's places "share one performance budget", which they can only do by coexisting in one
   * scene. A portal that loaded a different world would be the Games shelf, which already
   * exists.
   *
   * A portal naming a destination that is not in the scene is not a portal. It falls through to
   * the ordinary focus-on-what-you-clicked below rather than doing nothing, because a dead click
   * on scenery is the exact failure this module was built to remove.
   */
  const portalDestination = (id: string): string | null => {
    const root = api.query({ ids: [rootEntityId(id)] })[0];
    const tag = root?.tags.find((entry) => entry.startsWith("portal-to:"));
    const destination = tag?.slice("portal-to:".length).trim();
    if (!destination || destination === root?.id) return null;
    return api.query({ ids: [destination] }).length === 1 ? destination : null;
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

    const terrain = terrainIds();
    const passThrough = passThroughIds();
    for (const hit of raycaster.intersectObjects(scene.children, true)) {
      const entityId = world.findEntityId(hit.object);
      if (entityId && passThrough.has(entityId)) continue;
      const nestorTopic = entityId ? nestorTopicFor(entityId) : null;
      if (nestorTopic && onNestorTopic) {
        onNestorTopic(nestorTopic);
        return;
      }
      // Before the ordinary focus, because a portal's whole point is that it frames somewhere
      // else. Checked after the Nestor consoles so a console that was also tagged a portal
      // still presents rather than travelling.
      const destination = entityId ? portalDestination(entityId) : null;
      if (destination && focusEntity(destination, true)) return;
      if (entityId && world.findInteractiveEntityId(hit.object)) {
        // Interactive bodies carry their own impulse.
        api.interact(entityId);
        return;
      }
      // Scenery: focus the camera on it. A prefab is many entities under one root, so climb
      // to the root first — clicking a tree's canopy should frame the tree, not the canopy.
      if (entityId && !terrain.has(entityId)) {
        const rootId = rootEntityId(entityId);
        if (focusEntity(rootId)) return;
        continue;
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
    focusEntity,
    dispose: () => {
      dom.removeEventListener("pointerdown", onPointerDown);
      dom.removeEventListener("pointerup", onPointerUp);
    },
  };
}

const DROP_COLORS = ["#ffb457", "#6fe3ff", "#ff8f7a", "#a6f08a", "#d7a6ff", "#ffe066"];
const pickColor = (n: number): string => DROP_COLORS[n % DROP_COLORS.length];
const round = (n: number): number => Math.round(n * 1000) / 1000;
