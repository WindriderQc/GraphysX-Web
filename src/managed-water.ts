import {
  BufferGeometry,
  Color,
  FrontSide,
  Matrix4,
  Mesh,
  PerspectiveCamera,
  Plane,
  ShaderMaterial,
  UniformsLib,
  UniformsUtils,
  Vector3,
  Vector4,
  WebGLRenderTarget,
} from "three";
import type { ColorRepresentation, Side, Texture } from "three";

// Rendering core adapted from `three/examples/jsm/objects/Water.js`.
// Three.js is Copyright © 2010-2026 three.js authors and distributed under the MIT license.

/**
 * Constructor options matching `three/examples/jsm/objects/Water.js`.
 *
 * This local implementation intentionally keeps the same rendering and shader semantics as
 * Three's Water while owning the otherwise closure-private reflection target. That ownership
 * is what lets a scene rebuild release the GPU texture deterministically.
 */
export type ManagedWaterOptions = {
  textureWidth?: number;
  textureHeight?: number;
  clipBias?: number;
  alpha?: number;
  time?: number;
  waterNormals?: Texture;
  sunDirection?: Vector3;
  sunColor?: ColorRepresentation;
  waterColor?: ColorRepresentation;
  eye?: Vector3;
  distortionScale?: number;
  side?: Side;
  fog?: boolean;
};

/**
 * A lifecycle-safe adaptation of Three's classic planar-reflection Water.
 *
 * Three's addon keeps its `WebGLRenderTarget` in a constructor closure, so disposing its
 * geometry and material cannot release the reflection texture. This class exposes one
 * idempotent `dispose()` that detaches rendering, disposes the target, and disposes the
 * shader material. Textures supplied by the caller (notably the shared normal map) remain
 * caller-owned and are never disposed here.
 */
export class ManagedWater extends Mesh<BufferGeometry, ShaderMaterial> {
  readonly isWater = true;
  readonly reflectionRenderTarget: WebGLRenderTarget;
  private reflectionRefreshEnabled = true;
  private disposed = false;

  constructor(geometry: BufferGeometry, options: ManagedWaterOptions = {}) {
    super(geometry);

    const textureWidth = options.textureWidth ?? 512;
    const textureHeight = options.textureHeight ?? 512;
    const clipBias = options.clipBias ?? 0;
    const alpha = options.alpha ?? 1;
    const time = options.time ?? 0;
    const normalSampler = options.waterNormals ?? null;
    const sunDirection = options.sunDirection ?? new Vector3(0.70707, 0.70707, 0);
    const sunColor = new Color(options.sunColor ?? 0xffffff);
    const waterColor = new Color(options.waterColor ?? 0x7f7f7f);
    const eye = options.eye ?? new Vector3();
    const distortionScale = options.distortionScale ?? 20;
    const side = options.side ?? FrontSide;
    const fog = options.fog ?? false;

    const mirrorPlane = new Plane();
    const normal = new Vector3();
    const mirrorWorldPosition = new Vector3();
    const cameraWorldPosition = new Vector3();
    const rotationMatrix = new Matrix4();
    const lookAtPosition = new Vector3(0, 0, -1);
    const clipPlane = new Vector4();
    const view = new Vector3();
    const target = new Vector3();
    const q = new Vector4();
    const textureMatrix = new Matrix4();
    const mirrorCamera = new PerspectiveCamera();

    this.reflectionRenderTarget = new WebGLRenderTarget(textureWidth, textureHeight);

    const uniforms = UniformsUtils.merge([
      UniformsLib.fog,
      UniformsLib.lights,
      {
        normalSampler: { value: null },
        mirrorSampler: { value: null },
        alpha: { value: 1 },
        time: { value: 0 },
        size: { value: 1 },
        distortionScale: { value: 20 },
        textureMatrix: { value: new Matrix4() },
        sunColor: { value: new Color(0x7f7f7f) },
        sunDirection: { value: new Vector3(0.70707, 0.70707, 0) },
        eye: { value: new Vector3() },
        waterColor: { value: new Color(0x555555) },
      },
    ]);

    this.material = new ShaderMaterial({
      name: "MirrorShader",
      uniforms,
      vertexShader: /* glsl */ `
        uniform mat4 textureMatrix;
        uniform float time;

        varying vec4 mirrorCoord;
        varying vec4 worldPosition;

        #include <common>
        #include <fog_pars_vertex>
        #include <shadowmap_pars_vertex>
        #include <logdepthbuf_pars_vertex>

        void main() {
          mirrorCoord = modelMatrix * vec4( position, 1.0 );
          worldPosition = mirrorCoord.xyzw;
          mirrorCoord = textureMatrix * mirrorCoord;
          vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
          gl_Position = projectionMatrix * mvPosition;

          #include <beginnormal_vertex>
          #include <defaultnormal_vertex>
          #include <logdepthbuf_vertex>
          #include <fog_vertex>
          #include <shadowmap_vertex>
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D mirrorSampler;
        uniform float alpha;
        uniform float time;
        uniform float size;
        uniform float distortionScale;
        uniform sampler2D normalSampler;
        uniform vec3 sunColor;
        uniform vec3 sunDirection;
        uniform vec3 eye;
        uniform vec3 waterColor;

        varying vec4 mirrorCoord;
        varying vec4 worldPosition;

        vec4 getNoise( vec2 uv ) {
          vec2 uv0 = ( uv / 103.0 ) + vec2(time / 17.0, time / 29.0);
          vec2 uv1 = uv / 107.0-vec2( time / -19.0, time / 31.0 );
          vec2 uv2 = uv / vec2( 8907.0, 9803.0 ) + vec2( time / 101.0, time / 97.0 );
          vec2 uv3 = uv / vec2( 1091.0, 1027.0 ) - vec2( time / 109.0, time / -113.0 );
          vec4 noise = texture2D( normalSampler, uv0 ) +
            texture2D( normalSampler, uv1 ) +
            texture2D( normalSampler, uv2 ) +
            texture2D( normalSampler, uv3 );
          return noise * 0.5 - 1.0;
        }

        void sunLight( const vec3 surfaceNormal, const vec3 eyeDirection, float shiny, float spec, float diffuse, inout vec3 diffuseColor, inout vec3 specularColor ) {
          vec3 reflection = normalize( reflect( -sunDirection, surfaceNormal ) );
          float direction = max( 0.0, dot( eyeDirection, reflection ) );
          specularColor += pow( direction, shiny ) * sunColor * spec;
          diffuseColor += max( dot( sunDirection, surfaceNormal ), 0.0 ) * sunColor * diffuse;
        }

        #include <common>
        #include <packing>
        #include <bsdfs>
        #include <fog_pars_fragment>
        #include <logdepthbuf_pars_fragment>
        #include <lights_pars_begin>
        #include <shadowmap_pars_fragment>
        #include <shadowmask_pars_fragment>

        void main() {
          #include <logdepthbuf_fragment>
          vec4 noise = getNoise( worldPosition.xz * size );
          vec3 surfaceNormal = normalize( noise.xzy * vec3( 1.5, 1.0, 1.5 ) );

          vec3 diffuseLight = vec3(0.0);
          vec3 specularLight = vec3(0.0);

          vec3 worldToEye = eye-worldPosition.xyz;
          vec3 eyeDirection = normalize( worldToEye );
          sunLight( surfaceNormal, eyeDirection, 100.0, 2.0, 0.5, diffuseLight, specularLight );

          float distance = length(worldToEye);
          vec2 distortion = surfaceNormal.xz * ( 0.001 + 1.0 / distance ) * distortionScale;
          vec3 reflectionSample = vec3( texture2D( mirrorSampler, mirrorCoord.xy / mirrorCoord.w + distortion ) );

          float theta = max( dot( eyeDirection, surfaceNormal ), 0.0 );
          float rf0 = 0.3;
          float reflectance = rf0 + ( 1.0 - rf0 ) * pow( ( 1.0 - theta ), 5.0 );
          vec3 scatter = max( 0.0, dot( surfaceNormal, eyeDirection ) ) * waterColor;
          vec3 albedo = mix( ( sunColor * diffuseLight * 0.3 + scatter ) * getShadowMask(), ( vec3( 0.1 ) + reflectionSample * 0.9 + reflectionSample * specularLight ), reflectance);
          vec3 outgoingLight = albedo;
          gl_FragColor = vec4( outgoingLight, alpha );

          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
      lights: true,
      side,
      fog,
    });

    this.material.uniforms.mirrorSampler.value = this.reflectionRenderTarget.texture;
    this.material.uniforms.textureMatrix.value = textureMatrix;
    this.material.uniforms.alpha.value = alpha;
    this.material.uniforms.time.value = time;
    this.material.uniforms.normalSampler.value = normalSampler;
    this.material.uniforms.sunColor.value = sunColor;
    this.material.uniforms.waterColor.value = waterColor;
    this.material.uniforms.sunDirection.value = sunDirection;
    this.material.uniforms.distortionScale.value = distortionScale;
    this.material.uniforms.eye.value = eye;

    this.onBeforeRender = (renderer, scene, camera) => {
      if (this.disposed || !(camera instanceof PerspectiveCamera)) return;

      // Fresnel/specular direction can follow the camera even on a frame where the more
      // expensive planar reflection is deliberately re-used.
      eye.setFromMatrixPosition(camera.matrixWorld);
      if (!this.reflectionRefreshEnabled) return;

      mirrorWorldPosition.setFromMatrixPosition(this.matrixWorld);
      cameraWorldPosition.setFromMatrixPosition(camera.matrixWorld);
      rotationMatrix.extractRotation(this.matrixWorld);
      normal.set(0, 0, 1).applyMatrix4(rotationMatrix);
      view.subVectors(mirrorWorldPosition, cameraWorldPosition);

      // Avoid rendering when the mirror is facing away.
      if (view.dot(normal) > 0) return;

      view.reflect(normal).negate().add(mirrorWorldPosition);
      rotationMatrix.extractRotation(camera.matrixWorld);
      lookAtPosition.set(0, 0, -1).applyMatrix4(rotationMatrix).add(cameraWorldPosition);
      target.subVectors(mirrorWorldPosition, lookAtPosition).reflect(normal).negate().add(mirrorWorldPosition);

      mirrorCamera.position.copy(view);
      mirrorCamera.up.set(0, 1, 0).applyMatrix4(rotationMatrix).reflect(normal);
      mirrorCamera.lookAt(target);
      mirrorCamera.far = camera.far;
      mirrorCamera.updateMatrixWorld();
      mirrorCamera.projectionMatrix.copy(camera.projectionMatrix);

      textureMatrix.set(
        0.5, 0, 0, 0.5,
        0, 0.5, 0, 0.5,
        0, 0, 0.5, 0.5,
        0, 0, 0, 1,
      );
      textureMatrix.multiply(mirrorCamera.projectionMatrix);
      textureMatrix.multiply(mirrorCamera.matrixWorldInverse);

      mirrorPlane.setFromNormalAndCoplanarPoint(normal, mirrorWorldPosition);
      mirrorPlane.applyMatrix4(mirrorCamera.matrixWorldInverse);
      clipPlane.set(mirrorPlane.normal.x, mirrorPlane.normal.y, mirrorPlane.normal.z, mirrorPlane.constant);

      const projectionMatrix = mirrorCamera.projectionMatrix;
      q.x = (Math.sign(clipPlane.x) + projectionMatrix.elements[8]) / projectionMatrix.elements[0];
      q.y = (Math.sign(clipPlane.y) + projectionMatrix.elements[9]) / projectionMatrix.elements[5];
      q.z = -1;
      q.w = (1 + projectionMatrix.elements[10]) / projectionMatrix.elements[14];
      clipPlane.multiplyScalar(2 / clipPlane.dot(q));
      projectionMatrix.elements[2] = clipPlane.x;
      projectionMatrix.elements[6] = clipPlane.y;
      projectionMatrix.elements[10] = clipPlane.z + 1 - clipBias;
      projectionMatrix.elements[14] = clipPlane.w;

      const currentRenderTarget = renderer.getRenderTarget();
      const currentXrEnabled = renderer.xr.enabled;
      const currentShadowAutoUpdate = renderer.shadowMap.autoUpdate;
      this.visible = false;
      renderer.xr.enabled = false;
      renderer.shadowMap.autoUpdate = false;

      try {
        renderer.setRenderTarget(this.reflectionRenderTarget);
        renderer.state.buffers.depth.setMask(true);
        if (!renderer.autoClear) renderer.clear();
        renderer.render(scene, mirrorCamera);
      } finally {
        this.visible = true;
        renderer.xr.enabled = currentXrEnabled;
        renderer.shadowMap.autoUpdate = currentShadowAutoUpdate;
        renderer.setRenderTarget(currentRenderTarget);
        if (camera.viewport !== undefined) renderer.state.viewport(camera.viewport);
      }
    };
  }

  /** Allow or skip the reflection pass for the next host render without changing scene data. */
  setReflectionRefreshEnabled(enabled: boolean): void {
    this.reflectionRefreshEnabled = enabled && !this.disposed;
  }

  /** Release all resources owned by this water mesh. Safe to call more than once. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.reflectionRefreshEnabled = false;
    this.onBeforeRender = () => undefined;
    this.reflectionRenderTarget.dispose();
    // Detach the owned render-target texture without touching caller-owned normalSampler.
    this.material.uniforms.mirrorSampler.value = null;
    this.material.dispose();
  }
}
