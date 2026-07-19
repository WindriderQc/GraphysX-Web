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
  //
  // The sun is deliberately placed roughly *opposite the camera in azimuth* and fairly low.
  // It used to sit behind the viewer at (26, 36, 18), which lit everything flatly in the face
  // and — the part that mattered — put the lake's specular path off-screen behind the camera,
  // leaving the water with no glint at all. Ahead-and-left instead gives warm rim light down
  // the edges of the props and lays the sun's glitter path across the lake toward the viewer.
  // `showroom-scene.ts` keeps `water.sunDirection` matched to this vector.
  const sun = new DirectionalLight("#ffe9c2", 2.6);
  sun.position.set(-30, 28, -35);
  group.add(sun);

  // Backlighting needs a fill or the camera-facing side of everything goes to mud. Warmer
  // ground bounce than before, to sit under the low sun rather than fight it.
  const hemi = new HemisphereLight("#d6e9ff", "#5c5b40", 0.75);
  group.add(hemi);

  scene.add(group);

  return () => {
    scene.remove(group);
  };
}
