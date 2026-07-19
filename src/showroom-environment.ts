import { DirectionalLight, Group, HemisphereLight, type Scene, type WebGLRenderer } from "three";

/**
 * Host-level *lighting* for the welcome showroom: a warm key sun and a sky/ground fill.
 *
 * Terrain used to live here too — procedural sine displacement mounted as host decoration,
 * with no collider. That was a real bug, not just an honesty problem: the flat ground plane
 * was hidden and nothing replaced its physics, so anything dropped in the showroom fell
 * through the world and kept going. Terrain is now an ordinary `terrain` entity in the v2
 * scene (see `showroom-scene.ts`), carrying a static cannon-es heightfield collider — so the
 * scene owns its ground, and it is selectable, editable, serialisable and landable-on.
 *
 * The sky is NOT set here either. It is `environment.sky` in the v2 scene, so it is
 * selectable and serialisable like any other scene property — the host must not fight it by
 * assigning `scene.background` behind the runtime's back.
 */
export function mountShowroomEnvironment(scene: Scene, _renderer: WebGLRenderer): () => void {
  const group = new Group();
  group.name = "ShowroomEnvironment";

  // Warm key light. Shadows are intentionally OFF: nothing in the composed showroom opts
  // into castShadow, so a per-frame shadow map would be pure cost for zero visual gain.
  // Real shadows return in a fidelity pass once casters opt in.
  const sun = new DirectionalLight("#fff1d6", 2.2);
  sun.position.set(26, 36, 18);
  group.add(sun);

  const hemi = new HemisphereLight("#cfe6ff", "#4a5340", 0.5);
  group.add(hemi);

  scene.add(group);

  return () => {
    scene.remove(group);
  };
}
