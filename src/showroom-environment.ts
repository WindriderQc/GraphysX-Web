import {
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  type Scene,
  type WebGLRenderer,
} from "three";

/**
 * Host-level environment dressing for the welcome showroom: a warm sun and gentle rolling
 * terrain (flattened near the center so composed objects stay grounded). This is deliberately
 * *host* decoration around the v2 scene — the editable world stays clean.
 *
 * The sky is NOT set here. It is `environment.sky` in the v2 scene, so it is selectable,
 * serialisable, and editable like any other scene property — the host must not fight it by
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

  const terrain = makeTerrain();
  group.add(terrain);

  scene.add(group);

  return () => {
    scene.remove(group);
    terrain.geometry.dispose();
    terrain.material.dispose();
  };
}

function makeTerrain(): Mesh<PlaneGeometry, MeshStandardMaterial> {
  const size = 130;
  const segments = 96;
  const geometry = new PlaneGeometry(size, size, segments, segments);
  const position = geometry.attributes.position;
  const flatRadius = 14;
  const outerRadius = 34;
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const y = position.getY(i); // world Z after the rotation below
    const distance = Math.hypot(x, y);
    const rolling = Math.sin(x * 0.12) * Math.cos(y * 0.1) + 0.5 * Math.sin(x * 0.05 + y * 0.07);
    const t = smoothstep(flatRadius, outerRadius, distance);
    position.setZ(i, rolling * 1.7 * t);
  }
  geometry.rotateX(-Math.PI / 2);
  geometry.computeVertexNormals();

  // Mossy ground that sits under the Lost Valley sky rather than reading as a dark void.
  const material = new MeshStandardMaterial({ color: "#5c6b4a", roughness: 0.94, metalness: 0.02 });
  const mesh = new Mesh(geometry, material);
  mesh.position.y = -0.08;
  mesh.name = "ShowroomTerrain";
  return mesh;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
