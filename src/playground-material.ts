import { MeshStandardMaterial } from "three";
import { validatePlaygroundShader } from "../server/visual-effects.mjs";

/** Fixed archived programs, not a document-supplied GLSL execution surface. */
export type PlaygroundShaderSettings = { id: "archive-playground"; effect: "morph" | "unlit" };

export function applyPlaygroundShader(material: MeshStandardMaterial, settings: PlaygroundShaderSettings | null): void {
  if (!settings) {
    if (material.userData.graphysxPlaygroundUniforms) {
      material.dispose();
      delete material.userData.graphysxPlaygroundUniforms;
      delete material.userData.graphysxPlaygroundEffect;
      material.onBeforeCompile = () => {};
      material.customProgramCacheKey = () => "";
      material.needsUpdate = true;
    }
    return;
  }
  validatePlaygroundShader(settings);
  const previous = material.userData.graphysxPlaygroundEffect;
  const uniforms = material.userData.graphysxPlaygroundUniforms ?? { gxPlaygroundFrame: { value: 1 } };
  material.userData.graphysxPlaygroundUniforms = uniforms;
  material.userData.graphysxPlaygroundEffect = settings.effect;
  if (previous === settings.effect) return;
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    if (settings.effect === "morph") {
      shader.vertexShader = `uniform float gxPlaygroundFrame; varying vec3 gxPlaygroundNormal;\n${shader.vertexShader}`
        .replace("#include <begin_vertex>", /* glsl */`
          gxPlaygroundNormal = normal;
          float gxSinu = sin(gxPlaygroundFrame * .05 + position.x) * .2;
          vec3 transformed = position + gxSinu * normal;
        `)
        .replace("#include <project_vertex>", /* glsl */`
          vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.);
          vec4 gxClip = projectionMatrix * mvPosition;
          float gxS = sin(gxSinu), gxC = cos(gxSinu);
          // The source multiplies a row clip vector by its Z rotation matrix.
          gl_Position = vec4(gxC * gxClip.x - gxS * gxClip.y, gxS * gxClip.x + gxC * gxClip.y, gxClip.z, gxClip.w);
        `);
      shader.fragmentShader = `uniform float gxPlaygroundFrame; varying vec3 gxPlaygroundNormal;\n${shader.fragmentShader}`
        .replace("#include <opaque_fragment>", /* glsl */`
          float gxDProd = max(0., dot(gxPlaygroundNormal, vec3(0., 0., .8)));
          float gxT = gxPlaygroundFrame * .01;
          gl_FragColor = vec4(gxDProd * (sin(vec3(gxT / 20., gxT, gxT / 10.)) + 1.) * .5, diffuseColor.a);
        `);
    } else {
      shader.fragmentShader = shader.fragmentShader.replace("#include <opaque_fragment>", "gl_FragColor = diffuseColor;");
    }
  };
  material.customProgramCacheKey = () => `archive-playground-v1:${settings.effect}`;
  material.needsUpdate = true;
}

/** Evaluated by the existing world clock; pause, step and reload need no app loop. */
export function updatePlaygroundShader(material: MeshStandardMaterial, seconds: number): void {
  const uniforms = material.userData.graphysxPlaygroundUniforms;
  if (uniforms) uniforms.gxPlaygroundFrame.value = 1 + seconds * 60;
}
