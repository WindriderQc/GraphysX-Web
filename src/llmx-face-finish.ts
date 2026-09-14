import { Color, type MeshStandardMaterial } from "three";

/**
 * The forge finish: a warm rim on the metal.
 *
 * A flat grey cube has no depth of its own; what makes forged metal read as metal in a dark
 * room is the way its edges catch the warm light behind it. Three's standard material has no
 * rim term, so this patches one in at compile time — the same `onBeforeCompile` seam the
 * archived meshlight translation uses — adding a Fresnel-shaped copper glow on faces that turn
 * away from the camera. On cubes the term is per face, which is exactly right: the side faces
 * along a silhouette light up, the front faces do not, and the mask gains an outline that moves
 * with it. Eyes and the mouth cavity are left alone.
 *
 * Kept small on purpose: one colour, one strength, one exponent. The strength is under the
 * bloom threshold at rest so the rim reads as material, not as an emissive halo.
 */

export type ForgeFinish = Readonly<{
  /** Rim colour; patinated copper by default. */
  rimColor: string;
  /** 0 disables. The Forge's key/rim lighting is tuned for 0.35–0.6. */
  rimStrength: number;
  /** Fresnel exponent; higher keeps the rim tighter on the edge. */
  rimPower: number;
  /**
   * How far each cube shades with the normal of the surface it belongs to (the per-instance
   * `gxNormal` attribute) instead of its own six faces: 0 is the bare staircase, 1 shades like
   * the sculpt. Only meshes that carry the attribute opt in (see {@link ForgeFinishOptions}).
   */
  smoothNormals: number;
  /**
   * A fill from the viewer's side, as a fraction of the base colour on surfaces that face the
   * camera. Shaded by its own faces, a voxel mask is lit from above on every cube's top face and
   * reads brighter than the sculpt it approximates; shaded smoothly it goes dark wherever the
   * surface turns from the key light. This puts that light back where a portrait light would:
   * front, falling off to the copper rim at the silhouette. Only used with smooth normals.
   */
  fill: number;
}>;

export const FORGE_FINISH: ForgeFinish = Object.freeze({ rimColor: "#c97a3c", rimStrength: 0.45, rimPower: 2.6, smoothNormals: 0.7, fill: 0.35 });

/** The per-instance attribute a mesh must carry to opt into smooth normals. */
export const SMOOTH_NORMAL_ATTRIBUTE = "gxNormal";

export type ForgeFinishOptions = Readonly<{
  /** The mesh's geometry carries {@link SMOOTH_NORMAL_ATTRIBUTE}; shade with it. */
  smoothNormals?: boolean;
}>;

type ShaderHandle = { uniforms: Record<string, { value: unknown }>; vertexShader: string; fragmentShader: string };

/** Patch `material` in place. Idempotent: reapplying with new values just updates the uniforms. */
export function applyForgeFinish(material: MeshStandardMaterial, finish: ForgeFinish = FORGE_FINISH, options: ForgeFinishOptions = {}): void {
  const existing = material.userData.gxForgeFinishUniforms as
    | { gxRimColor: { value: Color }; gxRimStrength: { value: number }; gxRimPower: { value: number }; gxSmooth: { value: number }; gxFill: { value: number } }
    | undefined;
  if (existing) {
    existing.gxRimColor.value.set(finish.rimColor);
    existing.gxRimStrength.value = finish.rimStrength;
    existing.gxRimPower.value = finish.rimPower;
    existing.gxSmooth.value = finish.smoothNormals;
    existing.gxFill.value = finish.fill;
    return;
  }
  const smooth = options.smoothNormals === true;
  const uniforms = {
    gxRimColor: { value: new Color(finish.rimColor) },
    gxRimStrength: { value: finish.rimStrength },
    gxRimPower: { value: finish.rimPower },
    gxSmooth: { value: finish.smoothNormals },
    gxFill: { value: smooth ? finish.fill : 0 },
  };
  material.userData.gxForgeFinishUniforms = uniforms;
  material.userData.gxSmoothNormals = smooth;
  material.onBeforeCompile = (shader: ShaderHandle) => {
    Object.assign(shader.uniforms, uniforms);
    if (smooth) {
      // Before Three turns the object normal into the view normal (and, for instances, before it
      // applies the instance matrix): tilt each vertex's face normal toward the cube's surface
      // normal. All eight corners of a cube get the same tilt, so a face stays flat — it just no
      // longer faces the axis it was extruded along, and the staircase stops catching the light
      // as a contour. Neither the shadow pass nor the silhouette is touched.
      shader.vertexShader = shader.vertexShader
        .replace("void main() {", /* glsl */ `
attribute vec3 ${SMOOTH_NORMAL_ATTRIBUTE};
uniform float gxSmooth;

void main() {`)
        .replace("#include <beginnormal_vertex>", /* glsl */ `
#include <beginnormal_vertex>
objectNormal = normalize( mix( objectNormal, ${SMOOTH_NORMAL_ATTRIBUTE}, gxSmooth ) );`);
    }
    shader.fragmentShader = shader.fragmentShader
      .replace("void main() {", /* glsl */ `
uniform vec3 gxRimColor;
uniform float gxRimStrength;
uniform float gxRimPower;
uniform float gxFill;

void main() {`)
      // After the lighting equation, before tone mapping: the rim is light the surface gives
      // back, so it belongs with `outgoingLight`, and it must go through the same ACES curve as
      // everything else or it clips to a flat orange.
      .replace("#include <opaque_fragment>", /* glsl */ `
{
  vec3 gxView = normalize( vViewPosition );
  float gxFacing = clamp( dot( normalize( normal ), gxView ), 0.0, 1.0 );
  float gxRim = pow( 1.0 - gxFacing, gxRimPower );
  outgoingLight += gxRimColor * ( gxRimStrength * gxRim );
  outgoingLight += diffuseColor.rgb * ( gxFill * gxFacing );
}
#include <opaque_fragment>`);
  };
  // Distinct program per finish, so a patched material never shares a compiled program with a
  // plain standard material that has the same defines.
  material.customProgramCacheKey = () => (smooth ? "gx-forge-finish-smooth" : "gx-forge-finish");
  material.needsUpdate = true;
}
