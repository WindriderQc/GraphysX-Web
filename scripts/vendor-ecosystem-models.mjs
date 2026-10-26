// Graduate external GLB models (Blender exports, CC0 packs) into the `graphysx-mesh-json`
// payload the v2 `model` entity already loads — the same one-way step as the vehicle and
// Suzanne vendors, for the connected house (`?app=ecosystem`).
//
//   Drop:   assets-src/ecosystem/<node-id>.glb        (one file per machine, Y up, metres)
//   Run:    node scripts/vendor-ecosystem-models.mjs  [--only ugfrank,nas]
//   Writes: public/assets/ecosystem/models/<node-id>.json (+ embedded textures as PNG/JPG)
//           public/assets/ecosystem/models.json          (the manifest the view reads)
//
// The view (`src/ecosystem-app.ts`) fetches the manifest at mount: a node listed there is
// drawn with its model instead of the composed primitives; one not listed keeps the
// primitives. No code to touch when a model arrives or leaves.
//
// GLB is parsed here by hand (JSON chunk + BIN chunk): node hierarchy with TRS or matrix,
// every mesh primitive's POSITION / TEXCOORD_0 / indices, the material's baseColorFactor and
// baseColorTexture (embedded images are written beside the JSON). Three's GLTFLoader is not
// used because it wants a browser; the hand walk covers what low-poly packs and Blender
// exports actually use. Skins, morph targets, animations and KHR extensions are ignored.
//
// Sign conventions, same as the in-browser media import (`agent-world-media.ts`):
// the runtime applies `scale.set(s, s, -s)` to every mesh-json model because the archive
// payloads are left-handed, so Z is negated and winding reversed HERE; GLTF UVs assume
// flipY:false, so V is inverted.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "..");
const SRC_DIR = join(ROOT, "assets-src", "ecosystem");
const OUT_DIR = join(ROOT, "public", "assets", "ecosystem", "models");
const MANIFEST = join(ROOT, "public", "assets", "ecosystem", "models.json");
const PUBLIC_PREFIX = "/assets/ecosystem/models";

const only = (() => { const at = process.argv.indexOf("--only"); return at > -1 ? new Set(process.argv[at + 1].split(",")) : null; })();
const round = (value) => Math.round(value * 10000) / 10000;

// ---- GLB ---------------------------------------------------------------------------------
function readGlb(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== 0x46546c67) throw new Error("not a GLB (magic)");
  if (view.getUint32(4, true) !== 2) throw new Error("only glTF 2.0 binaries are supported");
  let offset = 12, json = null, bin = null;
  while (offset < bytes.byteLength) {
    const length = view.getUint32(offset, true), type = view.getUint32(offset + 4, true);
    const chunk = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(chunk));
    else if (type === 0x004e4942) bin = chunk;
    offset += 8 + length;
  }
  if (!json) throw new Error("GLB without a JSON chunk");
  return { json, bin };
}
const COMPONENT = { 5120: [Int8Array, 1], 5121: [Uint8Array, 1], 5122: [Int16Array, 2], 5123: [Uint16Array, 2], 5125: [Uint32Array, 4], 5126: [Float32Array, 4] };
const SIZE = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
function readAccessor(gltf, bin, index) {
  const accessor = gltf.accessors[index];
  const view = gltf.bufferViews[accessor.bufferView];
  if (gltf.buffers[view.buffer].uri) throw new Error("external .bin buffers are not supported: export a single .glb");
  const [Type, bytes] = COMPONENT[accessor.componentType];
  const size = SIZE[accessor.type];
  const stride = view.byteStride ? view.byteStride / bytes : size;
  const start = bin.byteOffset + (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const source = new Type(bin.buffer, start, stride * (accessor.count - 1) + size);
  const out = new Array(accessor.count * size);
  for (let i = 0; i < accessor.count; i += 1) for (let c = 0; c < size; c += 1) {
    let value = source[i * stride + c];
    if (accessor.normalized) value /= Type === Uint8Array ? 255 : Type === Uint16Array ? 65535 : 1;
    out[i * size + c] = value;
  }
  return out;
}
// Column-major 4x4 helpers, enough for TRS composition.
const identity = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function multiply(a, b) {
  const out = new Array(16).fill(0);
  for (let r = 0; r < 4; r += 1) for (let c = 0; c < 4; c += 1) for (let k = 0; k < 4; k += 1) out[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return out;
}
function trs(node) {
  if (node.matrix) return node.matrix;
  const [tx, ty, tz] = node.translation ?? [0, 0, 0];
  const [qx, qy, qz, qw] = node.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = node.scale ?? [1, 1, 1];
  const xx = qx * qx, yy = qy * qy, zz = qz * qz, xy = qx * qy, xz = qx * qz, yz = qy * qz, wx = qw * qx, wy = qw * qy, wz = qw * qz;
  return [
    (1 - 2 * (yy + zz)) * sx, 2 * (xy + wz) * sx, 2 * (xz - wy) * sx, 0,
    2 * (xy - wz) * sy, (1 - 2 * (xx + zz)) * sy, 2 * (yz + wx) * sy, 0,
    2 * (xz + wy) * sz, 2 * (yz - wx) * sz, (1 - 2 * (xx + yy)) * sz, 0,
    tx, ty, tz, 1,
  ];
}
const apply = (m, x, y, z) => [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];

function convert(file, id) {
  const bytes = readFileSync(file);
  const { json: gltf, bin } = readGlb(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength));
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const warnings = [];
  // Embedded images → files beside the JSON; a material's baseColorTexture points at one.
  const imageUrls = (gltf.images ?? []).map((image, index) => {
    if (image.uri) { warnings.push(`image ${index} is external (${image.uri}); not copied`); return null; }
    const view = gltf.bufferViews[image.bufferView];
    const data = bin.subarray((view.byteOffset ?? 0), (view.byteOffset ?? 0) + view.byteLength);
    const ext = image.mimeType === "image/png" ? "png" : "jpg";
    const name = `${id}-tex${index}.${ext}`;
    writeFileSync(join(OUT_DIR, name), data);
    return `${PUBLIC_PREFIX}/${name}`;
  });
  const materials = (gltf.materials ?? []).map((material) => {
    const pbr = material.pbrMetallicRoughness ?? {};
    const color = pbr.baseColorFactor ?? [1, 1, 1, 1];
    const texture = pbr.baseColorTexture ? gltf.textures[pbr.baseColorTexture.index] : null;
    const emissive = material.emissiveFactor ?? [0, 0, 0];
    return { name: material.name, color: color.map(round), emissive: emissive.map(round), textureUrl: texture ? imageUrls[texture.source] ?? null : null, textureFlipY: false };
  });
  if (!materials.length) materials.push({ name: "default", color: [0.8, 0.8, 0.85, 1] });
  const meshes = [];
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  const walk = (nodeIndex, parent) => {
    const node = gltf.nodes[nodeIndex];
    const world = multiply(parent, trs(node));
    if (node.mesh !== undefined) {
      for (const primitive of gltf.meshes[node.mesh].primitives) {
        if (primitive.mode !== undefined && primitive.mode !== 4) { warnings.push(`non-triangle primitive skipped in ${node.name ?? nodeIndex}`); continue; }
        const raw = readAccessor(gltf, bin, primitive.attributes.POSITION);
        const positions = [];
        for (let i = 0; i < raw.length; i += 3) {
          const [x, y, z] = apply(world, raw[i], raw[i + 1], raw[i + 2]);
          positions.push(round(x), round(y), round(-z)); // left-handed for the runtime's flip
          min[0] = Math.min(min[0], x); max[0] = Math.max(max[0], x); min[1] = Math.min(min[1], y); max[1] = Math.max(max[1], y); min[2] = Math.min(min[2], -z); max[2] = Math.max(max[2], -z);
        }
        const uvRaw = primitive.attributes.TEXCOORD_0 !== undefined ? readAccessor(gltf, bin, primitive.attributes.TEXCOORD_0) : null;
        const uvs = uvRaw ? uvRaw.map((value, index) => round(index % 2 ? 1 - value : value)) : undefined;
        const count = raw.length / 3;
        const indexRaw = primitive.indices !== undefined ? readAccessor(gltf, bin, primitive.indices) : Array.from({ length: count }, (_, i) => i);
        const indices = [];
        for (let i = 0; i < indexRaw.length; i += 3) indices.push(indexRaw[i], indexRaw[i + 2], indexRaw[i + 1]); // winding reversed with Z
        const materialIndex = primitive.material ?? 0;
        meshes.push({ name: node.name ?? gltf.meshes[node.mesh].name, positions, ...(uvs ? { uvs } : {}), indices,
          groups: [{ start: 0, count: indices.length, materialIndex }], materials });
      }
    }
    for (const child of node.children ?? []) walk(child, world);
  };
  const scene = gltf.scenes?.[gltf.scene ?? 0] ?? { nodes: gltf.nodes.map((_, i) => i) };
  for (const nodeIndex of scene.nodes) walk(nodeIndex, identity());
  if (!meshes.length) throw new Error("no triangle meshes found");
  if (meshes.length > 256) { warnings.push(`${meshes.length} meshes; the runtime keeps 256`); meshes.length = 256; }
  const size = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  const payload = { bounds: { min: min.map(round), max: max.map(round), size: size.map(round) }, meshes,
    provenance: { source: `assets-src/ecosystem/${basename(file)} sha256 ${sha256}`, converter: "scripts/vendor-ecosystem-models.mjs", warnings } };
  const triangles = meshes.reduce((sum, mesh) => sum + mesh.indices.length / 3, 0);
  return { payload, size, triangles, sha256, warnings };
}

// ---- run ---------------------------------------------------------------------------------
if (!existsSync(SRC_DIR)) { console.error(`nothing to vendor: ${SRC_DIR} does not exist (drop <node-id>.glb files there)`); process.exit(1); }
mkdirSync(OUT_DIR, { recursive: true });
const manifest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, "utf8")) : { models: {} };
const files = readdirSync(SRC_DIR).filter((name) => extname(name).toLowerCase() === ".glb");
let converted = 0;
for (const name of files) {
  const id = basename(name, extname(name)).toLowerCase();
  if (only && !only.has(id)) continue;
  try {
    const { payload, size, triangles, sha256, warnings } = convert(join(SRC_DIR, name), id);
    const out = `${id}.json`;
    writeFileSync(join(OUT_DIR, out), JSON.stringify(payload));
    manifest.models[id] = { url: `${PUBLIC_PREFIX}/${out}`, size: size.map(round), triangles, sha256, source: name, vendoredAt: new Date().toISOString() };
    converted += 1;
    console.log(`${id}: ${payload.meshes.length} meshes, ${triangles} tris, native size ${size.map((v) => v.toFixed(2)).join(" × ")}${warnings.length ? `\n  ! ${warnings.join("\n  ! ")}` : ""}`);
  } catch (error) {
    console.error(`${id}: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
manifest.generatedAt = new Date().toISOString();
manifest.note = "Models for ?app=ecosystem, keyed by node id (src/ecosystem-data.ts). A node listed here is drawn with its model; one not listed keeps the composed primitives. Regenerate with scripts/vendor-ecosystem-models.mjs.";
writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`${converted} model(s) vendored; manifest ${MANIFEST}`);
