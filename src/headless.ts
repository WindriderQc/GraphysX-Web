import { DataTexture, type Texture } from "three";

/**
 * The scene runtime also runs without a browser: the world service steps it in Node with a
 * fixed tick and streams poses to viewers. Code that can only exist in a page (canvas
 * drawing, images, audio, window messaging) asks here first and degrades to an inert stand-in
 * so geometry, physics and behaviors stay identical.
 */
export function isHeadless(): boolean {
  return typeof document === "undefined";
}

/** A 1x1 white texture: what a canvas-drawn texture becomes when there is no canvas. */
export function headlessTexture(): Texture {
  const texture = new DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  texture.needsUpdate = true;
  return texture;
}
