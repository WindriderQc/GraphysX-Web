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
 *
 * The key sun casts shadows. Which objects *take part* is not decided here: `castShadow` and
 * `receiveShadow` are per-entity v2 fields the runtime applies to every mesh, so an agent or
 * the inspector can pull any object out of the shadow pass with an ordinary `api.update`.
 * This rig only owns the light and the quality of its map.
 */
export function mountShowroomEnvironment(scene: Scene, _renderer: WebGLRenderer): () => void {
  const group = new Group();
  group.name = "ShowroomEnvironment";

  // The sun is deliberately placed roughly *opposite the camera in azimuth* and fairly low.
  // It used to sit behind the viewer at (26, 36, 18), which lit everything flatly in the face
  // and — the part that mattered — put the lake's specular path off-screen behind the camera,
  // leaving the water with no glint at all. Ahead-and-left instead gives warm rim light down
  // the edges of the props and lays the sun's glitter path across the lake toward the viewer.
  // `showroom-scene.ts` keeps `water.sunDirection` matched to this vector.
  const sun = new DirectionalLight("#ffe9c2", 2.6);
  sun.position.set(-30, 28, -35);

  // Shadows were off while the showroom had no casters — a per-frame shadow map would have
  // been pure cost. It has casters now (the kinetic stack, the trees, the CubX assembly, the
  // murmuration), and the same low sun that lays the glitter path also throws long raking
  // shadows, which is what finally seats the props on the ground instead of floating them.
  sun.castShadow = true;

  // The frustum is sized to the *composition*, not to the terrain. Props live within about
  // ±22 in x/z and the murmuration within ±13, so ±26 covers every caster with margin; at
  // 2048² that is ~2.5 cm per texel. Stretching it over the full 150-unit terrain instead
  // would cost 3x the texel footprint to shadow distant ground that is fogged out anyway.
  sun.shadow.mapSize.set(2048, 2048);
  const extent = 26;
  sun.shadow.camera.left = -extent;
  sun.shadow.camera.right = extent;
  sun.shadow.camera.top = extent;
  sun.shadow.camera.bottom = -extent;
  // The light sits ~55 units out; near/far bracket the casters rather than spanning the
  // whole world, so the depth buffer spends its precision where the shadows actually are.
  sun.shadow.camera.near = 5;
  sun.shadow.camera.far = 120;
  // A low sun grazes the terrain, which is exactly the geometry that acnes worst. normalBias
  // offsets along the surface normal, so it fixes sloped ground without the peter-panning a
  // large constant bias would give the stack's small boxes.
  sun.shadow.normalBias = 0.03;
  sun.shadow.bias = -0.0004;

  // three reads the light's direction from `target.matrixWorld`. The default target sits at
  // the origin and works only while it is never moved; adding it to the group makes the
  // aim explicit and survives anyone repositioning the rig later.
  group.add(sun.target);
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
