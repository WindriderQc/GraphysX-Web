// GET /observe/image contract, shared by the world server and the image sidecar. Pure.
//
// Same as Clawblox (`local_observe_image`): optional `width` and `height`, default 1088x640,
// clamped to 64..1920 and 64..1080; the camera is the agent's eye (player + 2 studs) looking
// along its forward direction with a 105° *horizontal* field of view, so the vertical one
// (three.js convention) depends on the aspect ratio.

export const IMAGE_DEFAULT = Object.freeze({ width: 1088, height: 640 });
export const IMAGE_LIMITS = Object.freeze({ width: [64, 1920], height: [64, 1080] });

/** @returns {{width: number, height: number} | {error: string}} */
export function parseImageSize(searchParams) {
  const out = {};
  for (const key of ["width", "height"]) {
    const raw = searchParams.get(key);
    if (raw === null || raw === "") { out[key] = IMAGE_DEFAULT[key]; continue; }
    if (!/^\d{1,5}$/.test(raw)) return { error: `${key} must be a whole number of pixels` };
    const [min, max] = IMAGE_LIMITS[key];
    out[key] = Math.min(max, Math.max(min, Number(raw)));
  }
  return out;
}

export function verticalFovDegrees(horizontalDegrees, width, height) {
  const horizontal = (Math.min(179, Math.max(1, horizontalDegrees)) * Math.PI) / 180;
  return (2 * Math.atan(Math.tan(horizontal / 2) / (width / height)) * 180) / Math.PI;
}

/** PNG signature + IHDR: the decoded width and height, or null when it is not a PNG. */
export function pngSize(buffer) {
  if (!buffer || buffer.length < 24) return null;
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (!signature.every((byte, i) => buffer[i] === byte)) return null;
  if (buffer.toString("ascii", 12, 16) !== "IHDR") return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}
