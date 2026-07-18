import {
  CubeTexture,
  CubeTextureLoader,
  SRGBColorSpace,
  Texture
} from "three";

export type ArchiveSkyboxUrls = [string, string, string, string, string, string];

/**
 * Three expects cube faces in +X, -X, +Y, -Y, +Z, -Z order.
 *
 * The archived TV3D sets use the opposite left/right axis convention. Their
 * polar faces are also authored a quarter-turn away from WebGL's cube-map
 * orientation. Keeping that conversion here prevents individual scenes and
 * selectors from drifting back to the raw, discontinuous URL order.
 */
export function archiveSkyboxUrls(basePath: string, extension = "jpg"): ArchiveSkyboxUrls {
  return [
    `${basePath}/left.${extension}`,
    `${basePath}/right.${extension}`,
    `${basePath}/up.${extension}`,
    `${basePath}/down.${extension}`,
    `${basePath}/front.${extension}`,
    `${basePath}/back.${extension}`
  ];
}

function imageDimensions(image: CanvasImageSource): { width: number; height: number } {
  const source = image as CanvasImageSource & {
    naturalWidth?: number;
    naturalHeight?: number;
    videoWidth?: number;
    videoHeight?: number;
    width?: number;
    height?: number;
  };
  const width = source.naturalWidth ?? source.videoWidth ?? source.width ?? 0;
  const height = source.naturalHeight ?? source.videoHeight ?? source.height ?? 0;
  return { width, height };
}

function rotateQuarterTurn(image: CanvasImageSource, clockwise: boolean): HTMLCanvasElement {
  const { width, height } = imageDimensions(image);
  if (width <= 0 || height <= 0) {
    throw new Error("Cannot orient an unloaded archive skybox face.");
  }

  const canvas = document.createElement("canvas");
  canvas.width = height;
  canvas.height = width;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Could not create a canvas for archive skybox orientation.");
  }

  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate(clockwise ? Math.PI / 2 : -Math.PI / 2);
  context.drawImage(image, -width / 2, -height / 2, width, height);
  return canvas;
}

/** Apply the TV3D -> Three/WebGL polar-face conversion after all faces load. */
export function orientArchiveCubeTexture(texture: CubeTexture): CubeTexture {
  if (texture.userData.archiveSkyboxOriented) {
    return texture;
  }
  if (!Array.isArray(texture.images) || texture.images.length !== 6) {
    throw new Error("Archive skybox did not load all six cube faces.");
  }

  const images = texture.images as CanvasImageSource[];
  images[2] = rotateQuarterTurn(images[2], true);
  images[3] = rotateQuarterTurn(images[3], false);
  texture.images = images;
  texture.userData.archiveSkyboxOriented = true;
  texture.needsUpdate = true;
  return texture;
}

/**
 * BoxGeometry uses the same directional face order as CubeTexture. Applying
 * the same conversion keeps the five selector icons continuous as well.
 */
export function orientArchiveFaceTextures(textures: Texture[]): Texture[] {
  if (textures.length !== 6) {
    throw new Error("Archive skybox icon did not load all six face textures.");
  }
  if (!textures[2].userData.archiveSkyboxOriented) {
    textures[2].image = rotateQuarterTurn(textures[2].image as CanvasImageSource, true);
    textures[2].userData.archiveSkyboxOriented = true;
    textures[2].needsUpdate = true;
  }
  if (!textures[3].userData.archiveSkyboxOriented) {
    textures[3].image = rotateQuarterTurn(textures[3].image as CanvasImageSource, false);
    textures[3].userData.archiveSkyboxOriented = true;
    textures[3].needsUpdate = true;
  }
  return textures;
}

export function loadArchiveCubeTexture(
  loader: CubeTextureLoader,
  basePath: string,
  onLoad?: (texture: CubeTexture) => void,
  onError?: (error: unknown) => void,
  extension = "jpg"
): CubeTexture {
  const texture = loader.load(
    archiveSkyboxUrls(basePath, extension),
    (loaded) => {
      try {
        orientArchiveCubeTexture(loaded);
        onLoad?.(loaded);
      } catch (error) {
        onError?.(error);
      }
    },
    undefined,
    onError
  );
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

export async function loadArchiveCubeTextureAsync(
  loader: CubeTextureLoader,
  basePath: string,
  extension = "jpg"
): Promise<CubeTexture> {
  const texture = await loader.loadAsync(archiveSkyboxUrls(basePath, extension));
  texture.colorSpace = SRGBColorSpace;
  return orientArchiveCubeTexture(texture);
}
