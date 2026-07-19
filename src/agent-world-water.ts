import {
  CanvasTexture,
  Color,
  FrontSide,
  Group,
  Mesh,
  MeshPhongMaterial,
  Object3D,
  PlaneGeometry,
  RepeatWrapping,
  Vector2,
  Vector3,
} from "three";
import { Water } from "three/examples/jsm/objects/Water.js";

/**
 * Reflective water as first-class `graphysx.agent-world/v2` scene vocabulary.
 *
 * Rendering is `three/examples/jsm/objects/Water.js` — the classic flat-mirror ocean. It is
 * the right pick over bare `Reflector.js`: both do the same planar-reflection render, but
 * Water adds the normal-map distortion and sun specular that make a reflection read as a
 * *surface* rather than a mirror tile, for the same one extra scene pass.
 *
 * ## The frame budget (pillar 5: performant by intent)
 *
 * A planar reflection re-renders the whole scene from the mirrored camera every frame the
 * water is visible. That is a genuine second scene pass — roughly a doubling of draw calls
 * — and this app already runs at a few fps under headless software GL. So:
 *
 *  - `reflection` is an **opt-out flag on the entity**. Turned off, the surface falls back to
 *    a plain lit plane carrying the same animated normal map and costs one ordinary mesh.
 *  - `reflectionResolution` defaults to **256²**, not the library's 512², and is capped at
 *    1024. Distorted water hides render-target resolution better than almost any other
 *    effect, so this is close to free visually and quarters the fill cost.
 *
 * ## The normal map
 *
 * Water needs a tiling normals texture. Rather than take on an asset dependency for one
 * texture, it is synthesised on a canvas at first use — the same choice the particle work
 * made for its sprites. Six summed sine ripple trains at non-harmonic angles are
 * differentiated into a tangent-space normal, which tiles seamlessly because every
 * wavelength divides the canvas edge a whole number of times.
 */

export type AgentWorldWater = {
  /** Surface edge length in world units. */
  size?: number;
  /** Base water colour. Deep water is a dark tint over the reflection, not a bright fill. */
  color?: string;
  /** Sun specular highlight colour. */
  sunColor?: string;
  /** Direction the specular highlight comes from. */
  sunDirection?: [number, number, number];
  /** Strength of the normal-map distortion applied to the reflection. */
  distortionScale?: number;
  /**
   * Ripple density. The shader samples the normal map at `worldPosition.xz * rippleScale /
   * 103`, so the default of 1 gives a ~100-unit wavelength — i.e. a flat mirror, which is
   * why untuned `Water` reads as grey glass. Higher values shrink the ripples.
   */
  rippleScale?: number;
  /** Ripple animation rate. 0 freezes the surface. */
  flowSpeed?: number;
  /** Surface opacity. Below 1 the terrain under the water shows through at the shoreline. */
  opacity?: number;
  /** Planar reflection. Off by default cost-wise is a lie, so this defaults ON but is opt-out. */
  reflection?: boolean;
  /** Reflection render-target edge in pixels. */
  reflectionResolution?: number;
};

export type ResolvedAgentWorldWater = {
  size: number;
  color: string;
  sunColor: string;
  sunDirection: [number, number, number];
  distortionScale: number;
  rippleScale: number;
  flowSpeed: number;
  opacity: number;
  reflection: boolean;
  reflectionResolution: number;
};

/** Above this a planar reflection stops being a considered cost and becomes a stall. */
export const AGENT_WORLD_WATER_MAX_REFLECTION_RESOLUTION = 1024;

const DEFAULT_WATER: ResolvedAgentWorldWater = {
  size: 80,
  color: "#12414f",
  sunColor: "#fff2d0",
  sunDirection: [0.6, 0.72, 0.34],
  distortionScale: 3.2,
  rippleScale: 7,
  flowSpeed: 0.6,
  opacity: 0.92,
  reflection: true,
  reflectionResolution: 256,
};

/** Validate + clamp a water field into the fully-specified form the runtime and export use. */
export function resolveAgentWorldWater(
  source?: AgentWorldWater,
  base: ResolvedAgentWorldWater = DEFAULT_WATER,
): ResolvedAgentWorldWater {
  const input = source ?? {};
  const direction = input.sunDirection ?? base.sunDirection;
  if (!Array.isArray(direction) || direction.length !== 3 || direction.some((value) => !Number.isFinite(value))) {
    throw new Error("water.sunDirection must contain three finite numbers");
  }
  if (input.color !== undefined && !isColor(input.color)) throw new Error(`Invalid water.color: ${String(input.color)}`);
  if (input.sunColor !== undefined && !isColor(input.sunColor)) throw new Error(`Invalid water.sunColor: ${String(input.sunColor)}`);
  return {
    size: clamp(input.size ?? base.size, 1, 2000),
    color: input.color ?? base.color,
    sunColor: input.sunColor ?? base.sunColor,
    sunDirection: direction.map((value) => clamp(value, -1, 1)) as [number, number, number],
    distortionScale: clamp(input.distortionScale ?? base.distortionScale, 0, 64),
    rippleScale: clamp(input.rippleScale ?? base.rippleScale, 0.05, 200),
    flowSpeed: clamp(input.flowSpeed ?? base.flowSpeed, 0, 20),
    opacity: clamp(input.opacity ?? base.opacity, 0.05, 1),
    reflection: input.reflection ?? base.reflection,
    reflectionResolution: Math.round(
      clamp(input.reflectionResolution ?? base.reflectionResolution, 32, AGENT_WORLD_WATER_MAX_REFLECTION_RESOLUTION),
    ),
  };
}

function isColor(value: unknown): boolean {
  if (typeof value !== "string") return false;
  try {
    new Color(value);
    return true;
  } catch {
    return false;
  }
}

let sharedNormals: CanvasTexture | null = null;

/**
 * A seamless tangent-space normal map for the surface, drawn once and shared.
 *
 * Height is a sum of sine ripple trains; the normal is its analytic gradient, packed into
 * RGB the usual way. Every wavelength divides the 256px edge a whole number of times, so the
 * texture wraps without a seam.
 */
function waterNormalsTexture(): CanvasTexture {
  if (sharedNormals) return sharedNormals;
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not create a canvas context for the water normals");
  const image = context.createImageData(size, size);

  // Six trains rather than three, at deliberately non-harmonic angles. Three produced a
  // legibly *striped* surface — the eye finds a repeating direction immediately, and water
  // that stripes reads as corrugated metal. Spreading the energy over more directions with
  // no dominant one gives chop instead of corduroy. Periods stay whole numbers so the
  // texture still tiles seamlessly.
  const waves = [
    { periods: 3, angle: 0.0, amplitude: 1.0 },
    { periods: 5, angle: 0.9, amplitude: 0.7 },
    { periods: 7, angle: 2.1, amplitude: 0.55 },
    { periods: 11, angle: 1.5, amplitude: 0.35 },
    { periods: 13, angle: 2.75, amplitude: 0.28 },
    { periods: 19, angle: 0.45, amplitude: 0.18 },
  ];
  const gradient = (x: number, y: number): [number, number] => {
    let dx = 0;
    let dy = 0;
    for (const wave of waves) {
      const kx = (Math.cos(wave.angle) * wave.periods * Math.PI * 2) / size;
      const ky = (Math.sin(wave.angle) * wave.periods * Math.PI * 2) / size;
      const phase = Math.cos(x * kx + y * ky) * wave.amplitude;
      dx += phase * kx;
      dy += phase * ky;
    }
    return [dx, dy];
  };

  const strength = 18;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const [dx, dy] = gradient(x, y);
      // Normalise (-dx, -dy, 1) and pack into 0..255.
      const nx = -dx * strength;
      const ny = -dy * strength;
      const length = Math.hypot(nx, ny, 1);
      const offset = (y * size + x) * 4;
      image.data[offset] = Math.round(((nx / length) * 0.5 + 0.5) * 255);
      image.data[offset + 1] = Math.round(((ny / length) * 0.5 + 0.5) * 255);
      image.data[offset + 2] = Math.round(((1 / length) * 0.5 + 0.5) * 255);
      image.data[offset + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);

  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.name = "GraphysXWaterNormals";
  sharedNormals = texture;
  return texture;
}

/**
 * The water surface as a scene object.
 *
 * The surface mesh lives inside a {@link Group} on purpose. `Water` derives its mirror plane
 * from the mesh's own world matrix and expects the plane rotated onto its back, so it needs
 * a -90° X rotation of the *mesh* — which the entity transform owns. Nesting keeps both:
 * the group takes the entity transform, the mesh keeps the rotation the shader requires.
 */
export class AgentWorldWaterSurface {
  readonly object = new Group();
  private surface: Water | Mesh<PlaneGeometry, MeshPhongMaterial>;
  private config: ResolvedAgentWorldWater;
  private elapsed = 0;

  constructor(config: ResolvedAgentWorldWater) {
    this.config = config;
    this.object.name = "GraphysXWater";
    this.surface = this.build(config);
    this.object.add(this.surface);
  }

  /** True when this surface is paying for a planar reflection pass. */
  get reflecting(): boolean {
    return this.config.reflection;
  }

  private build(config: ResolvedAgentWorldWater): Water | Mesh<PlaneGeometry, MeshPhongMaterial> {
    const geometry = new PlaneGeometry(config.size, config.size);
    if (config.reflection) {
      const water = new Water(geometry, {
        textureWidth: config.reflectionResolution,
        textureHeight: config.reflectionResolution,
        waterNormals: waterNormalsTexture(),
        sunDirection: new Vector3(...config.sunDirection).normalize(),
        sunColor: new Color(config.sunColor),
        waterColor: new Color(config.color),
        distortionScale: config.distortionScale,
        // Fog on: the host tints distance fog to the sky's horizon, and water that ignores
        // it ends in a hard bright band exactly where the terrain has already faded out.
        fog: true,
        alpha: config.opacity,
      });
      water.rotation.x = -Math.PI / 2;
      water.material.transparent = config.opacity < 1;
      water.material.uniforms.size.value = config.rippleScale;
      return water;
    }
    // No-reflection fallback: one ordinary lit plane with the same ripple normals.
    //
    // Deliberately Phong, front-side, and coarsely tiled. The obvious build — a
    // MeshStandardMaterial with high metalness and DoubleSide — was measurably *more*
    // expensive than the planar reflection it exists to replace, and looked worse: PBR
    // samples the scene's PMREM environment probe per fragment, a mirror-metal surface
    // aliases the normal map into speckle, and DoubleSide doubles the fill on a plane that
    // is only ever seen from above. Phong has no IBL lookup, so the "cheap" path is
    // actually cheap.
    const normals = waterNormalsTexture().clone();
    normals.wrapS = RepeatWrapping;
    normals.wrapT = RepeatWrapping;
    normals.repeat.set(Math.max(1, config.size / 26), Math.max(1, config.size / 26));
    normals.needsUpdate = true;
    const material = new MeshPhongMaterial({
      color: new Color(config.color),
      normalMap: normals,
      normalScale: new Vector2(0.35, 0.35),
      specular: new Color(config.sunColor),
      shininess: 90,
      transparent: config.opacity < 1,
      opacity: config.opacity,
      side: FrontSide,
    });
    const mesh = new Mesh(geometry, material);
    mesh.rotation.x = -Math.PI / 2;
    // The entity material pass must not stomp the surface it just configured.
    mesh.userData.graphysxWaterMaterialLocked = true;
    return mesh;
  }

  /** Re-apply a patched configuration, rebuilding only when the render path itself changes. */
  configure(config: ResolvedAgentWorldWater): void {
    const rebuild =
      config.reflection !== this.config.reflection ||
      config.reflectionResolution !== this.config.reflectionResolution ||
      config.size !== this.config.size ||
      config.opacity !== this.config.opacity;
    this.config = config;
    if (rebuild) {
      this.disposeSurface();
      this.surface = this.build(config);
      this.object.add(this.surface);
      return;
    }
    if (this.surface instanceof Water) {
      const uniforms = this.surface.material.uniforms;
      uniforms.waterColor.value.set(config.color);
      uniforms.sunColor.value.set(config.sunColor);
      uniforms.sunDirection.value.copy(new Vector3(...config.sunDirection).normalize());
      uniforms.distortionScale.value = config.distortionScale;
      uniforms.size.value = config.rippleScale;
    } else {
      this.surface.material.color.set(config.color);
    }
  }

  update(deltaSeconds: number): void {
    this.elapsed += deltaSeconds * this.config.flowSpeed;
    if (this.surface instanceof Water) {
      this.surface.material.uniforms.time.value = this.elapsed;
    } else {
      // Scroll the ripples by moving the sampler, NOT by flagging the texture dirty:
      // `offset` is a shader uniform, so it needs no re-upload. Setting `needsUpdate` here
      // re-uploaded a 256² texture to the GPU every frame and made the "cheap" fallback
      // measurably *more* expensive than the reflection it exists to avoid.
      this.surface.material.normalMap?.offset.set(this.elapsed * 0.02, this.elapsed * 0.013);
    }
  }

  private disposeSurface(): void {
    this.surface.removeFromParent();
    this.surface.geometry.dispose();
    if (this.surface instanceof Water) {
      this.surface.material.dispose();
    } else {
      this.surface.material.normalMap?.dispose();
      this.surface.material.dispose();
    }
  }

  dispose(): void {
    this.disposeSurface();
  }
}

/** Find the water surface hanging off an entity object, if it is a water entity. */
export function findWaterSurface(object: Object3D): AgentWorldWaterSurface | null {
  const surface = object.userData.graphysxWaterSurface;
  return surface instanceof AgentWorldWaterSurface ? surface : null;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, Number.isFinite(value) ? value : minimum));
}
