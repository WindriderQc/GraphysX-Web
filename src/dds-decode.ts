// A tiny DDS reader for the media library: enough of the format to turn the archive's
// DXT-compressed textures into RGBA pixels the canvas can re-encode as PNG at import
// time. In-browser like the model converters, so the store server stays a file store
// that never parses formats.
//
// Deliberately NOT three's DDSLoader: that hands back still-compressed mipmaps for the
// GPU, which is exactly what a PNG re-encode cannot use. Reading the pixels back out of
// a compressed GPU texture would need a render pass; decoding the blocks on the CPU is
// ~100 lines and needs nothing. Only the top mip is decoded — an import wants the image,
// not the pyramid.
//
// Covered: DXT1 (with its 1-bit punch-through alpha), DXT3, DXT5, and uncompressed
// 32-bit masks. That is every .dds in the datalake; anything else throws with a name.

const DDS_MAGIC = 0x20534444; // "DDS "
const FOURCC_DXT1 = 0x31545844;
const FOURCC_DXT3 = 0x33545844;
const FOURCC_DXT5 = 0x35545844;

export type DecodedDds = { width: number; height: number; pixels: Uint8ClampedArray };

export function decodeDds(buffer: ArrayBuffer): DecodedDds {
  const view = new DataView(buffer);
  if (view.getUint32(0, true) !== DDS_MAGIC) throw new Error("Not a DDS file");
  const height = view.getUint32(12, true);
  const width = view.getUint32(16, true);
  if (!width || !height || width > 8192 || height > 8192) throw new Error(`Unreasonable DDS dimensions: ${width}×${height}`);
  const pixelFormatFlags = view.getUint32(80, true);
  const fourCC = view.getUint32(84, true);
  const dataOffset = 128; // magic + 124-byte header; DX10 extension not used by the archive
  const data = new Uint8Array(buffer, dataOffset);

  if (pixelFormatFlags & 0x4) {
    if (fourCC === FOURCC_DXT1) return { width, height, pixels: decodeDxt(data, width, height, "dxt1") };
    if (fourCC === FOURCC_DXT3) return { width, height, pixels: decodeDxt(data, width, height, "dxt3") };
    if (fourCC === FOURCC_DXT5) return { width, height, pixels: decodeDxt(data, width, height, "dxt5") };
    throw new Error(`Unsupported DDS fourCC: 0x${fourCC.toString(16)}`);
  }

  // Uncompressed path: use the format's own channel masks rather than assuming BGRA.
  const bitCount = view.getUint32(88, true);
  if (bitCount !== 32 && bitCount !== 24) throw new Error(`Unsupported uncompressed DDS bit count: ${bitCount}`);
  const masks = [view.getUint32(92, true), view.getUint32(96, true), view.getUint32(100, true), view.getUint32(104, true)];
  const bytes = bitCount / 8;
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    let value = 0;
    for (let b = 0; b < bytes; b += 1) value |= data[index * bytes + b]! << (8 * b);
    pixels[index * 4] = maskedChannel(value, masks[0]!);
    pixels[index * 4 + 1] = maskedChannel(value, masks[1]!);
    pixels[index * 4 + 2] = maskedChannel(value, masks[2]!);
    pixels[index * 4 + 3] = masks[3] ? maskedChannel(value, masks[3]) : 255;
  }
  return { width, height, pixels };
}

function maskedChannel(value: number, mask: number): number {
  if (!mask) return 0;
  let shifted = value & mask;
  let m = mask;
  while (!(m & 1)) {
    m >>>= 1;
    shifted >>>= 1;
  }
  // Scale e.g. a 5-bit channel up to 8 bits.
  return Math.round((shifted / m) * 255);
}

function decodeDxt(data: Uint8Array, width: number, height: number, variant: "dxt1" | "dxt3" | "dxt5"): Uint8ClampedArray {
  const blockBytes = variant === "dxt1" ? 8 : 16;
  const pixels = new Uint8ClampedArray(width * height * 4);
  const blocksWide = Math.ceil(width / 4);
  const blocksHigh = Math.ceil(height / 4);

  for (let by = 0; by < blocksHigh; by += 1) {
    for (let bx = 0; bx < blocksWide; bx += 1) {
      const offset = (by * blocksWide + bx) * blockBytes;
      const colorOffset = variant === "dxt1" ? offset : offset + 8;
      const { colors, opaque } = dxtPalette(data, colorOffset, variant === "dxt1");
      const lookup = data[colorOffset + 4]! | (data[colorOffset + 5]! << 8) | (data[colorOffset + 6]! << 16) | (data[colorOffset + 7]! << 24);

      for (let py = 0; py < 4; py += 1) {
        for (let px = 0; px < 4; px += 1) {
          const x = bx * 4 + px;
          const y = by * 4 + py;
          if (x >= width || y >= height) continue;
          const codeIndex = (py * 4 + px) * 2;
          const code = (lookup >>> codeIndex) & 0x3;
          const target = (y * width + x) * 4;
          const color = colors[code]!;
          pixels[target] = color[0];
          pixels[target + 1] = color[1];
          pixels[target + 2] = color[2];
          if (variant === "dxt1") {
            pixels[target + 3] = code === 3 && !opaque ? 0 : 255;
          } else if (variant === "dxt3") {
            const alphaIndex = py * 4 + px;
            const alphaByte = data[offset + (alphaIndex >> 1)]!;
            const nibble = alphaIndex & 1 ? alphaByte >> 4 : alphaByte & 0xf;
            pixels[target + 3] = nibble * 17;
          } else {
            pixels[target + 3] = dxt5Alpha(data, offset, py * 4 + px);
          }
        }
      }
    }
  }
  return pixels;
}

function dxtPalette(data: Uint8Array, offset: number, isDxt1: boolean): { colors: Array<[number, number, number]>; opaque: boolean } {
  const c0 = data[offset]! | (data[offset + 1]! << 8);
  const c1 = data[offset + 2]! | (data[offset + 3]! << 8);
  const rgb = (c: number): [number, number, number] => [
    Math.round(((c >> 11) & 0x1f) * (255 / 31)),
    Math.round(((c >> 5) & 0x3f) * (255 / 63)),
    Math.round((c & 0x1f) * (255 / 31)),
  ];
  const a = rgb(c0);
  const b = rgb(c1);
  // DXT1's c0<=c1 ordering selects the 3-colour + transparent mode.
  const opaque = !isDxt1 || c0 > c1;
  const colors: Array<[number, number, number]> = opaque
    ? [a, b,
        [Math.round((2 * a[0] + b[0]) / 3), Math.round((2 * a[1] + b[1]) / 3), Math.round((2 * a[2] + b[2]) / 3)],
        [Math.round((a[0] + 2 * b[0]) / 3), Math.round((a[1] + 2 * b[1]) / 3), Math.round((a[2] + 2 * b[2]) / 3)]]
    : [a, b,
        [Math.round((a[0] + b[0]) / 2), Math.round((a[1] + b[1]) / 2), Math.round((a[2] + b[2]) / 2)],
        [0, 0, 0]];
  return { colors, opaque };
}

function dxt5Alpha(data: Uint8Array, blockOffset: number, texelIndex: number): number {
  const a0 = data[blockOffset]!;
  const a1 = data[blockOffset + 1]!;
  // 16 3-bit codes packed little-endian across 6 bytes.
  const bitOffset = texelIndex * 3;
  const byteIndex = 2 + (bitOffset >> 3);
  const shift = bitOffset & 7;
  let code = data[blockOffset + byteIndex]! >> shift;
  if (shift > 5) code |= data[blockOffset + byteIndex + 1]! << (8 - shift);
  code &= 0x7;
  if (code === 0) return a0;
  if (code === 1) return a1;
  if (a0 > a1) return Math.round(((8 - code) * a0 + (code - 1) * a1) / 7);
  if (code === 6) return 0;
  if (code === 7) return 255;
  return Math.round(((6 - code) * a0 + (code - 1) * a1) / 5);
}
