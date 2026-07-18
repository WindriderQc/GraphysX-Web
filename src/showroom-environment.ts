import {
  CanvasTexture,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  type Scene,
  type Texture,
  type WebGLRenderer,
} from "three";

/**
 * Host-level environment dressing for the welcome showroom: a gradient sky, a warm sun with
 * soft shadows, and gentle heightmap terrain (flattened near the center so composed objects
 * stay grounded). This is deliberately *host* decoration around the v2 scene — the editable
 * world stays clean; the sky/terrain/sun are the "stage". Evolutive: water/reflection next.
 */
export function mountShowroomEnvironment(scene: Scene, _renderer: WebGLRenderer): () => void {
  const group = new Group();
  group.name = "ShowroomEnvironment";

  const sky = makeGradientSky();
  const previousBackground = scene.background;
  scene.background = sky;

  // Warm key light. Shadows are intentionally OFF: nothing in the composed showroom opts
  // into castShadow, so a per-frame shadow map would be pure cost for zero visual gain.
  // Real shadows return in a fidelity pass once casters opt in.
  const sun = new DirectionalLight("#fff1d6", 2.2);
  sun.position.set(26, 36, 18);
  group.add(sun);

  const hemi = new HemisphereLight("#bfe4ff", "#233524", 0.45);
  group.add(hemi);

  const terrain = makeTerrain();
  group.add(terrain);

  scene.add(group);

  return () => {
    scene.remove(group);
    scene.background = previousBackground;
    terrain.geometry.dispose();
    terrain.material.dispose();
    sky.dispose();
  };
}

function makeGradientSky(): Texture {
  const canvas = document.createElement("canvas");
  canvas.width = 4;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const gradient = ctx.createLinearGradient(0, 0, 0, 256);
    gradient.addColorStop(0, "#08131f");
    gradient.addColorStop(0.55, "#123246");
    gradient.addColorStop(0.82, "#2f6274");
    gradient.addColorStop(1, "#8fb9b7");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 4, 256);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
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

  const material = new MeshStandardMaterial({ color: "#1c3a3a", roughness: 0.98, metalness: 0.02 });
  const mesh = new Mesh(geometry, material);
  mesh.position.y = -0.08;
  mesh.name = "ShowroomTerrain";
  return mesh;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
