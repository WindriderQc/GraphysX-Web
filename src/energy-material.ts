import { AdditiveBlending, Color, MeshStandardMaterial, NormalBlending } from "three";
import { validateEnergyShader } from "../server/visual-effects.mjs";

/** Portable PBR extension. The Fresnel term uses each eye's view, including in WebXR. */
export type EnergyShaderSettings = {
  id: "energy";
  blend?: "normal" | "additive";
  rimColor?: string;
  rimPower?: number;
  rimIntensity?: number;
  /** Fade the face-on surface; useful for an atmosphere or holographic shell. */
  rimOpacity?: boolean;
  /** Local-space vertical flow, in cycles/second and cycles/local unit. Zero strength disables it. */
  flowSpeed?: number;
  flowScale?: number;
  flowStrength?: number;
};

type EnergyUniforms = {
  gxEnergyTime: { value: number };
  gxEnergyGain: { value: number };
  gxEnergyRimColor: { value: Color };
  gxEnergyRimPower: { value: number };
  gxEnergyRimIntensity: { value: number };
  gxEnergyRimOpacity: { value: number };
  gxEnergyFlowSpeed: { value: number };
  gxEnergyFlowScale: { value: number };
  gxEnergyFlowStrength: { value: number };
};

export function applyEnergyShader(material: MeshStandardMaterial, settings: EnergyShaderSettings | null): void {
  if (!settings) {
    if (material.userData.graphysxEnergyUniforms) {
      // Three caches programs per material. Invalidate that cache when changing shader
      // families, so returning to an old key cannot reuse another family's uniform table.
      material.dispose();
      delete material.userData.graphysxEnergyUniforms;
      delete material.userData.graphysxEnergyFlow;
      material.onBeforeCompile = () => {};
      material.customProgramCacheKey = () => "";
      material.transparent = material.opacity < 1;
      material.depthWrite = material.opacity >= 0.5;
      material.blending = NormalBlending;
      material.needsUpdate = true;
    }
    return;
  }
  validateEnergyShader(settings);
  const previous: EnergyUniforms | undefined = material.userData.graphysxEnergyUniforms;
  // Compiled programs retain these exact uniform objects, even after needsUpdate. Keep
  // their identities when reconfiguring the same material; replacing the table disconnects
  // the new authored settings from a program Three legitimately reuses.
  const uniforms: EnergyUniforms = previous ?? {
    gxEnergyTime: { value: 0 },
    gxEnergyGain: { value: material.emissiveIntensity },
    gxEnergyRimColor: { value: new Color(settings.rimColor ?? "#53dfff") },
    gxEnergyRimPower: { value: settings.rimPower ?? 2.5 },
    gxEnergyRimIntensity: { value: settings.rimIntensity ?? 1 },
    gxEnergyRimOpacity: { value: settings.rimOpacity ? 1 : 0 },
    gxEnergyFlowSpeed: { value: settings.flowSpeed ?? 0.4 },
    gxEnergyFlowScale: { value: settings.flowScale ?? 6 },
    gxEnergyFlowStrength: { value: settings.flowStrength ?? 0.35 },
  };
  uniforms.gxEnergyGain.value = material.emissiveIntensity;
  uniforms.gxEnergyRimColor.value.set(settings.rimColor ?? "#53dfff");
  uniforms.gxEnergyRimPower.value = settings.rimPower ?? 2.5;
  uniforms.gxEnergyRimIntensity.value = settings.rimIntensity ?? 1;
  uniforms.gxEnergyRimOpacity.value = settings.rimOpacity ? 1 : 0;
  uniforms.gxEnergyFlowSpeed.value = settings.flowSpeed ?? 0.4;
  uniforms.gxEnergyFlowScale.value = settings.flowScale ?? 6;
  uniforms.gxEnergyFlowStrength.value = settings.flowStrength ?? 0.35;
  material.userData.graphysxEnergyUniforms = uniforms;
  material.blending = settings.blend === "additive" ? AdditiveBlending : NormalBlending;
  material.transparent = material.opacity < 1 || settings.rimOpacity === true || settings.blend === "additive";
  material.depthWrite = material.opacity >= 0.5 && !settings.rimOpacity;
  if (material.transparent) material.depthWrite = false;
  const hasFlow = (settings.flowStrength ?? 0.35) > 0;
  if (!previous || material.userData.graphysxEnergyFlow !== hasFlow) material.dispose();
  material.userData.graphysxEnergyFlow = hasFlow;
  material.customProgramCacheKey = () => hasFlow ? "graphysx-energy/v1-flow" : "graphysx-energy/v1-rim";
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("void main() {", "varying vec3 vGxEnergyPosition;\nvoid main() {")
      .replace("#include <project_vertex>", "vGxEnergyPosition = transformed;\n#include <project_vertex>");
    shader.fragmentShader = shader.fragmentShader
      .replace("void main() {", (hasFlow ? "#define GX_ENERGY_FLOW\n" : "") + /* glsl */`
varying vec3 vGxEnergyPosition;
uniform float gxEnergyTime;
uniform float gxEnergyGain;
uniform vec3 gxEnergyRimColor;
uniform float gxEnergyRimPower;
uniform float gxEnergyRimIntensity;
uniform float gxEnergyRimOpacity;
uniform float gxEnergyFlowSpeed;
uniform float gxEnergyFlowScale;
uniform float gxEnergyFlowStrength;
void main() {`)
      .replace("#include <emissivemap_fragment>", /* glsl */`
#include <emissivemap_fragment>
vec3 gxViewDir = isOrthographic ? vec3(0.0, 0.0, 1.0) : normalize(vViewPosition);
float gxRim = pow(1.0 - clamp(abs(dot(normal, gxViewDir)), 0.0, 1.0), gxEnergyRimPower);
float gxBand = 0.0;
float gxFilament = 0.0;
#ifdef GX_ENERGY_FLOW
float gxFlowPhase = vGxEnergyPosition.y * gxEnergyFlowScale - gxEnergyTime * gxEnergyFlowSpeed;
// Smooth, narrow wave fronts avoid hard scan-line aliasing in headset lenses.
gxBand = pow(0.5 + 0.5 * sin(gxFlowPhase * 6.28318530718), 6.0);
gxFilament = 0.65 + 0.35 * sin(vGxEnergyPosition.x * 13.0 + vGxEnergyPosition.z * 9.0 + gxEnergyTime);
#endif
totalEmissiveRadiance *= 1.0 + gxBand * gxEnergyFlowStrength;
totalEmissiveRadiance += gxEnergyRimColor * gxEnergyGain * (gxRim * gxEnergyRimIntensity + gxBand * gxFilament * gxEnergyFlowStrength);
diffuseColor.a *= mix(1.0, gxRim, gxEnergyRimOpacity);`);
  };
  material.needsUpdate = true;
}

/** Called from the shared simulation loop, never from a wall-clock or a second render loop. */
export function updateEnergyShader(material: MeshStandardMaterial, seconds: number): void {
  const uniforms: EnergyUniforms | undefined = material.userData.graphysxEnergyUniforms;
  if (uniforms) {
    uniforms.gxEnergyTime.value = seconds;
    uniforms.gxEnergyGain.value = material.emissiveIntensity;
  }
}
