import { Color, MeshStandardMaterial, Texture, Vector3 } from "three";

/** Scene-document settings for the first shader-pack translation. */
export type ArchiveMeshlightSettings = {
  id: "archive-meshlight";
  parallaxStrength: number;
  specularMultiplier: number;
  specularTexture: { id: string; repeat?: [number, number]; offset?: [number, number]; rotationDegrees?: number } | null;
  lightPosition: [number, number, number];
  lightColor: string;
};

export const ARCHIVE_MESHLIGHT_PROVENANCE = {
  source: "BallZ2015/StockRoom/shaders/meshlight.shade",
  sourceSha256: "AE1ECFC0887F46712FFE43796D684BFCB6268F3B74E284B5FE5CBEC4A54BFF05",
  vendoredText: "/assets/shaders/archive-meshlight.shade",
  vendoredNormalization: "source text exact; CRLF normalized to LF",
  vendoredSha256: "0EE6F3C954BAD315B365EA66239F970E0476D7CD212E85F8EDE9307839DC5A1C",
  faithful: [
    "normal-alpha single-sample parallax offset",
    "Lyon half-vector difference specular equation",
    "0.15 diffuse floor, independent red-channel specular map and SpecMP multiplier",
    "source light-position and light-colour inputs",
  ],
  adapted: [
    "Three.js point-shadow PCF replaces TV3D's 25-offset cubic depth sampler",
    "sRGB decode and tone mapping follow the platform renderer",
  ],
} as const;

type MeshlightUniforms = {
  gxMeshlightParallax: { value: number };
  gxMeshlightSpecularMultiplier: { value: number };
  gxMeshlightSpecMap: { value: Texture };
  gxMeshlightLightPosition: { value: Vector3 };
  gxMeshlightLightColor: { value: Color };
};

type ShaderHandle = { uniforms: Record<string, { value: unknown }>; fragmentShader: string };

/**
 * Patch a standard material at compile time so it keeps Three's renderer integration while
 * replacing the final lighting equation with the archived meshlight math. The shader source
 * still receives Three's point-shadow visibility; only the archived 25-tap cube kernel is
 * adapted to Three's current PCF sampler.
 */
export function applyArchiveMeshlightShader(
  material: MeshStandardMaterial,
  settings: ArchiveMeshlightSettings | null,
  specularMap: Texture,
): void {
  if (!settings) {
    if (material.userData.graphysxArchiveMeshlight) {
      delete material.userData.graphysxArchiveMeshlight;
      delete material.userData.graphysxArchiveMeshlightShader;
      material.onBeforeCompile = () => {};
      material.customProgramCacheKey = () => "";
      material.needsUpdate = true;
    }
    return;
  }

  const uniforms: MeshlightUniforms = material.userData.graphysxArchiveMeshlightUniforms ?? {
    gxMeshlightParallax: { value: settings.parallaxStrength },
    gxMeshlightSpecularMultiplier: { value: settings.specularMultiplier },
    gxMeshlightSpecMap: { value: specularMap },
    gxMeshlightLightPosition: { value: new Vector3(...settings.lightPosition) },
    gxMeshlightLightColor: { value: new Color(settings.lightColor) },
  };
  uniforms.gxMeshlightParallax.value = settings.parallaxStrength;
  uniforms.gxMeshlightSpecularMultiplier.value = settings.specularMultiplier;
  uniforms.gxMeshlightSpecMap.value = specularMap;
  uniforms.gxMeshlightLightPosition.value.set(...settings.lightPosition);
  uniforms.gxMeshlightLightColor.value.set(settings.lightColor);
  material.userData.graphysxArchiveMeshlightUniforms = uniforms;
  material.userData.graphysxArchiveMeshlight = {
    ...settings,
    sourceSha256: ARCHIVE_MESHLIGHT_PROVENANCE.sourceSha256,
    shadowKernel: "three-point-pcf-adapted",
  };

  material.onBeforeCompile = (shader: ShaderHandle) => {
    Object.assign(shader.uniforms, uniforms);
    material.userData.graphysxArchiveMeshlightShader = shader;
    shader.fragmentShader = shader.fragmentShader
      .replace("void main() {", /* glsl */`
uniform float gxMeshlightParallax;
uniform float gxMeshlightSpecularMultiplier;
uniform sampler2D gxMeshlightSpecMap;
uniform vec3 gxMeshlightLightPosition;
uniform vec3 gxMeshlightLightColor;

void main() {`)
      .replace("#include <map_fragment>", /* glsl */`
vec2 gxMeshlightUv = vec2( 0.0 );
vec2 gxMeshlightNormalUv = vec2( 0.0 );
#ifdef USE_MAP
  gxMeshlightUv = vMapUv;
#endif
#ifdef USE_NORMALMAP
  gxMeshlightNormalUv = vNormalMapUv;
#endif
#if defined( USE_MAP ) && defined( USE_NORMALMAP_TANGENTSPACE )
  vec3 gxSurfaceNormal = normalize( vNormal );
  #ifdef USE_TANGENT
    mat3 gxTangentFrame = mat3( normalize( vTangent ), normalize( vBitangent ), gxSurfaceNormal );
  #else
    mat3 gxTangentFrame = getTangentFrame( -vViewPosition, gxSurfaceNormal, vNormalMapUv );
  #endif
  vec3 gxView = normalize( vViewPosition );
  vec3 gxTangentView = normalize( vec3(
    dot( gxView, gxTangentFrame[ 0 ] ),
    dot( gxView, gxTangentFrame[ 1 ] ),
    dot( gxView, gxTangentFrame[ 2 ] )
  ) );
  float gxHeight = texture2D( normalMap, vNormalMapUv ).a;
  vec2 gxParallaxOffset = ( gxHeight * gxMeshlightParallax - gxMeshlightParallax * 0.5 ) * gxTangentView.xy;
  gxMeshlightUv += gxParallaxOffset;
  gxMeshlightNormalUv += gxParallaxOffset;
#endif
#ifdef USE_MAP
  vec4 sampledDiffuseColor = texture2D( map, gxMeshlightUv );
  #ifdef DECODE_VIDEO_TEXTURE
    sampledDiffuseColor = sRGBTransferEOTF( sampledDiffuseColor );
  #endif
  diffuseColor *= sampledDiffuseColor;
#endif`)
      .replace("#include <normal_fragment_maps>", /* glsl */`
#ifdef USE_NORMALMAP_OBJECTSPACE
  normal = texture2D( normalMap, gxMeshlightNormalUv ).xyz * 2.0 - 1.0;
  #ifdef FLIP_SIDED
    normal = -normal;
  #endif
  #ifdef DOUBLE_SIDED
    normal = normal * faceDirection;
  #endif
  normal = normalize( normalMatrix * normal );
#elif defined( USE_NORMALMAP_TANGENTSPACE )
  vec3 mapN = texture2D( normalMap, gxMeshlightNormalUv ).xyz * 2.0 - 1.0;
  mapN.xy *= normalScale;
  normal = normalize( tbn * mapN );
#elif defined( USE_BUMPMAP )
  normal = perturbNormalArb( -vViewPosition, normal, dHdxy_fwd(), faceDirection );
#endif`)
      .replace(
        "vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;",
        /* glsl */`
vec3 gxViewDirection = normalize( vViewPosition );
vec3 gxLightViewPosition = ( viewMatrix * vec4( gxMeshlightLightPosition, 1.0 ) ).xyz;
vec3 gxLightDirection = normalize( gxLightViewPosition - geometryPosition );
float gxDiffuse = saturate( dot( gxLightDirection, normal ) ) + 0.15;
vec3 gxHalfWay = normalize( gxViewDirection + gxLightDirection );
vec3 gxDifference = gxHalfWay - normal;
float gxSS = saturate( dot( gxDifference, gxDifference ) * 60.0 );
float gxLyonSpecular = pow( 1.0 - gxSS, 3.0 );
float gxSpecularMask = texture2D( gxMeshlightSpecMap, gxMeshlightUv ).r;
float gxShadow = 1.0;
#if defined( USE_SHADOWMAP ) && NUM_POINT_LIGHT_SHADOWS > 0
  PointLightShadow gxPointShadow = pointLightShadows[ 0 ];
  gxShadow = getPointShadow(
    pointShadowMap[ 0 ], gxPointShadow.shadowMapSize, gxPointShadow.shadowIntensity,
    gxPointShadow.shadowBias, gxPointShadow.shadowRadius, vPointShadowCoord[ 0 ],
    gxPointShadow.shadowCameraNear, gxPointShadow.shadowCameraFar
  );
#endif
vec3 outgoingLight = (
  gxDiffuse * diffuseColor.rgb +
  gxLyonSpecular * gxSpecularMask * gxMeshlightSpecularMultiplier
) * gxMeshlightLightColor * gxShadow;`,
      );
  };
  material.customProgramCacheKey = () => "archive-meshlight-r1";
  material.needsUpdate = true;
}

/** Replace the async specular texture without recompiling the material. */
export function setArchiveMeshlightSpecularMap(material: MeshStandardMaterial, texture: Texture): void {
  const uniforms = material.userData.graphysxArchiveMeshlightUniforms as MeshlightUniforms | undefined;
  if (uniforms) uniforms.gxMeshlightSpecMap.value = texture;
}
