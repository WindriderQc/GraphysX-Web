import { BufferGeometry, Float32BufferAttribute, Points, PointsMaterial } from "three";

/**
 * A night sky drawn in code: points on a sphere, no image files. For pages that relay one module
 * and serve none of GraphysX's assets (the `<diskx-city>` embed on an AgentX Core page), where
 * a skybox would ask for six `/assets/sky/...` images that are not there.
 *
 * Deterministic (seeded), outside the scene document, unaffected by fog, inside the camera's
 * far plane. Presentation only.
 */
export function createStarfield(radius: number, count = 3200, seed = 20261025): Points {
  if (!Number.isFinite(radius) || radius <= 0 || !Number.isSafeInteger(count) || count <= 0 || count > 20000) throw new Error("Invalid starfield");
  let state = seed >>> 0;
  const random = (): number => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  const positions: number[] = [];
  const colours: number[] = [];
  for (let index = 0; index < count; index += 1) {
    // The whole sphere, like the skybox it replaces: the camera looks down at the city and sees
    // the sky beyond the ground's edge, below the horizon too. The ground hides what is behind it.
    const y = random() * 2 - 1;
    const ring = Math.sqrt(1 - y * y);
    const angle = random() * Math.PI * 2;
    positions.push(Math.cos(angle) * ring * radius, y * radius, Math.sin(angle) * ring * radius);
    const brightness = 0.35 + random() ** 3 * 0.65;
    const tint = random();
    colours.push(brightness * (tint < 0.15 ? 0.8 : 1), brightness * (tint > 0.85 ? 0.85 : 1), brightness);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new Float32BufferAttribute(colours, 3));
  const material = new PointsMaterial({ size: 2.2, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.9, fog: false, depthWrite: false });
  const stars = new Points(geometry, material);
  stars.name = "presentation-starfield";
  stars.renderOrder = -1;
  stars.frustumCulled = false;
  return stars;
}
