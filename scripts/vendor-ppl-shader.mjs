// Vendor the active BallZ2015 per-pixel/parallax shader and its recorded ring normal map.
//
// The inputs are guarded by archive SHA-256 before anything is written. The binary PNG is
// copied byte-for-byte; the HLSL text receives only the repository-wide CRLF -> LF
// normalization used by the earlier meshlight revival.
//
//   node scripts/vendor-ppl-shader.mjs

import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATALAKE = path.resolve(process.env.GRAPHYSX_DATALAKE || "E:/Media/Datalake");
const SOURCE_ROOT = path.join(DATALAKE, "Codes", "BallZ2015", "StockRoom");

const INPUTS = {
  shader: {
    source: path.join(SOURCE_ROOT, "shaders", "ppl.shade"),
    destination: path.join(ROOT, "public", "assets", "shaders", "archive-ppl.shade"),
    bytes: 2876,
    sha256: "D6CE1C90555EF1599921B0000ED3FD68CBD86D004E0F074B1693553BE0D8A4C1",
  },
  normal: {
    source: path.join(SOURCE_ROOT, "ball_Normal.png"),
    destination: path.join(ROOT, "public", "assets", "textures", "archive", "ball_Normal.png"),
    bytes: 69929,
    sha256: "F4198F4535F4FEBEB0B7DEABEF6F2F8C2BFD0A6EA94A14C0A952FEBD4354C02B",
  },
};

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex").toUpperCase();
}

async function verifiedInput(entry, label) {
  const bytes = await readFile(entry.source);
  const hash = sha256(bytes);
  if (bytes.length !== entry.bytes || hash !== entry.sha256) {
    throw new Error(`${label} archive input drifted: expected ${entry.bytes}/${entry.sha256}, received ${bytes.length}/${hash}`);
  }
  return bytes;
}

const shader = await verifiedInput(INPUTS.shader, "ppl.shade");
await verifiedInput(INPUTS.normal, "ball_Normal.png");
await mkdir(path.dirname(INPUTS.shader.destination), { recursive: true });
await mkdir(path.dirname(INPUTS.normal.destination), { recursive: true });

const normalizedShader = shader.toString("utf8").replace(/\r\n/g, "\n");
await writeFile(INPUTS.shader.destination, normalizedShader, "utf8");
await copyFile(INPUTS.normal.source, INPUTS.normal.destination);

console.log(`wrote ${path.relative(ROOT, INPUTS.shader.destination)} (${Buffer.byteLength(normalizedShader)} bytes, ${sha256(Buffer.from(normalizedShader))})`);
console.log(`wrote ${path.relative(ROOT, INPUTS.normal.destination)} (${INPUTS.normal.bytes} bytes, ${INPUTS.normal.sha256})`);
