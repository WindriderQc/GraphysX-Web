import { MeshStandardMaterial, Vector3 } from "three";

/** Scene-document settings for BallZ2015's active per-pixel/parallax shader. */
export type ArchivePplSettings = {
  id: "archive-ppl";
  bumpAmount: number;
  lightPosition: [number, number, number];
};

export const ARCHIVE_PPL_PROVENANCE = {
  source: "BallZ2015/StockRoom/shaders/ppl.shade",
  sourceBytes: 2876,
  sourceSha256: "D6CE1C90555EF1599921B0000ED3FD68CBD86D004E0F074B1693553BE0D8A4C1",
  vendoredText: "/assets/shaders/archive-ppl.shade",
  vendoredNormalization: "source text exact; CRLF normalized to LF",
  vendoredBytes: 2784,
  vendoredSha256: "56946EACC92DCC9288863317423BF81C21205128EEE0FB0BDD2CC315B3ECF3CF",
  normalMap: "/assets/textures/archive/ball_Normal.png",
  normalMapBytes: 69929,
  normalMapSha256: "F4198F4535F4FEBEB0B7DEABEF6F2F8C2BFD0A6EA94A14C0A952FEBD4354C02B",
  bindings: [
    "Scene3D/Anneaux.cpp: ZRing.png sphere + ball_Normal.png + BumpAmount 0.025",
    "Scene3D/EditorScreen.cpp: twoway.jpg test mesh + ball_Normal.png + BumpAmount 0.025",
  ],
  faithful: [
    "normal-alpha single-sample parallax offset",
    "tangent-space normal decode and Lambert dot-product output",
    "source 0.03 default and active 0.025 tuning remain distinct scene values",
  ],
  adapted: [
    "light position is authored per scene because the archive resolves it from the active scene",
    "sRGB decode and tone mapping follow the platform renderer",
  ],
} as const;

type PplUniforms = {
  gxPplBumpAmount: { value: number };
  gxPplLightPosition: { value: Vector3 };
};

type ShaderHandle = { uniforms: Record<string, { value: unknown }>; fragmentShader: string };

/** Translate the recovered ppl.shade equations inside Three's renderer-integrated material. */
export function applyArchivePplShader(material: MeshStandardMaterial, settings: ArchivePplSettings | null): void {
  if (!settings) {
    if (material.userData.graphysxArchivePpl) {
      delete material.userData.graphysxArchivePpl;
      delete material.userData.graphysxArchivePplShader;
      material.onBeforeCompile = () => {};
      material.customProgramCacheKey = () => "";
      material.needsUpdate = true;
    }
    return;
  }

  const uniforms: PplUniforms = material.userData.graphysxArchivePplUniforms ?? {
    gxPplBumpAmount: { value: settings.bumpAmount },
    gxPplLightPosition: { value: new Vector3(...settings.lightPosition) },
  };
  uniforms.gxPplBumpAmount.value = settings.bumpAmount;
  uniforms.gxPplLightPosition.value.set(...settings.lightPosition);
  material.userData.graphysxArchivePplUniforms = uniforms;
  material.userData.graphysxArchivePpl = {
    ...settings,
    sourceSha256: ARCHIVE_PPL_PROVENANCE.sourceSha256,
    lightingEquation: "source-tangent-lambert",
  };

  material.onBeforeCompile = (shader: ShaderHandle) => {
    Object.assign(shader.uniforms, uniforms);
    material.userData.graphysxArchivePplShader = shader;
    shader.fragmentShader = shader.fragmentShader
      .replace("void main() {", /* glsl */`
uniform float gxPplBumpAmount;
uniform vec3 gxPplLightPosition;

void main() {`)
      .replace("#include <map_fragment>", /* glsl */`
vec2 gxPplUv = vec2( 0.0 );
vec2 gxPplNormalUv = vec2( 0.0 );
#ifdef USE_MAP
  gxPplUv = vMapUv;
#endif
#ifdef USE_NORMALMAP
  gxPplNormalUv = vNormalMapUv;
#endif
#if defined( USE_MAP ) && defined( USE_NORMALMAP_TANGENTSPACE )
  vec3 gxPplSurfaceNormal = normalize( vNormal );
  #ifdef USE_TANGENT
    mat3 gxPplTangentFrame = mat3( normalize( vTangent ), normalize( vBitangent ), gxPplSurfaceNormal );
  #else
    mat3 gxPplTangentFrame = getTangentFrame( -vViewPosition, gxPplSurfaceNormal, vNormalMapUv );
  #endif
  vec3 gxPplView = normalize( vViewPosition );
  vec3 gxPplTangentView = normalize( vec3(
    dot( gxPplView, gxPplTangentFrame[ 0 ] ),
    dot( gxPplView, gxPplTangentFrame[ 1 ] ),
    dot( gxPplView, gxPplTangentFrame[ 2 ] )
  ) );
  float gxPplHeight = texture2D( normalMap, vNormalMapUv ).a;
  vec2 gxPplParallaxOffset = ( gxPplHeight * gxPplBumpAmount - gxPplBumpAmount * 0.5 ) * gxPplTangentView.xy;
  gxPplUv += gxPplParallaxOffset;
  gxPplNormalUv += gxPplParallaxOffset;
#endif
#ifdef USE_MAP
  vec4 sampledDiffuseColor = texture2D( map, gxPplUv );
  #ifdef DECODE_VIDEO_TEXTURE
    sampledDiffuseColor = sRGBTransferEOTF( sampledDiffuseColor );
  #endif
  diffuseColor *= sampledDiffuseColor;
#endif`)
      .replace("#include <normal_fragment_maps>", /* glsl */`
#ifdef USE_NORMALMAP_OBJECTSPACE
  normal = texture2D( normalMap, gxPplNormalUv ).xyz * 2.0 - 1.0;
  #ifdef FLIP_SIDED
    normal = -normal;
  #endif
  #ifdef DOUBLE_SIDED
    normal = normal * faceDirection;
  #endif
  normal = normalize( normalMatrix * normal );
#elif defined( USE_NORMALMAP_TANGENTSPACE )
  vec3 mapN = texture2D( normalMap, gxPplNormalUv ).xyz * 2.0 - 1.0;
  mapN.xy *= normalScale;
  normal = normalize( tbn * mapN );
#elif defined( USE_BUMPMAP )
  normal = perturbNormalArb( -vViewPosition, normal, dHdxy_fwd(), faceDirection );
#endif`)
      .replace(
        "vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;",
        /* glsl */`
vec3 gxPplLightViewPosition = ( viewMatrix * vec4( gxPplLightPosition, 1.0 ) ).xyz;
vec3 gxPplLightDirection = normalize( gxPplLightViewPosition - geometryPosition );
float gxPplDiffuse = saturate( dot( gxPplLightDirection, normal ) );
vec3 outgoingLight = gxPplDiffuse * diffuseColor.rgb;`,
      );
  };
  material.customProgramCacheKey = () => "archive-ppl-r1";
  material.needsUpdate = true;
}
