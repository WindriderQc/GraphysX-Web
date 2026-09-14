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
}>;

export const FORGE_FINISH: ForgeFinish = Object.freeze({ rimColor: "#c97a3c", rimStrength: 0.45, rimPower: 2.6 });

type ShaderHandle = { uniforms: Record<string, { value: unknown }>; fragmentShader: string };

/** Patch `material` in place. Idempotent: reapplying with new values just updates the uniforms. */
export function applyForgeFinish(material: MeshStandardMaterial, finish: ForgeFinish = FORGE_FINISH): void {
  const existing = material.userData.gxForgeFinishUniforms as
    | { gxRimColor: { value: Color }; gxRimStrength: { value: number }; gxRimPower: { value: number } }
    | undefined;
  if (existing) {
    existing.gxRimColor.value.set(finish.rimColor);
    existing.gxRimStrength.value = finish.rimStrength;
    existing.gxRimPower.value = finish.rimPower;
    return;
  }
  const uniforms = {
    gxRimColor: { value: new Color(finish.rimColor) },
    gxRimStrength: { value: finish.rimStrength },
    gxRimPower: { value: finish.rimPower },
  };
  material.userData.gxForgeFinishUniforms = uniforms;
  material.onBeforeCompile = (shader: ShaderHandle) => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace("void main() {", /* glsl */ `
uniform vec3 gxRimColor;
uniform float gxRimStrength;
uniform float gxRimPower;

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
}
#include <opaque_fragment>`);
  };
  // Distinct program per finish, so a patched material never shares a compiled program with a
  // plain standard material that has the same defines.
  material.customProgramCacheKey = () => "gx-forge-finish";
  material.needsUpdate = true;
}
