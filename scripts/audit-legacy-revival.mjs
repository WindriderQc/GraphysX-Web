// Read-only comparison of the native archive, its first web revival, and the current product.
// No archive is moved, deleted or rewritten. Hash equality proves retention, never playability.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const product = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const archive = path.resolve(process.argv[2] || path.join(product, "..", "GraphysX"));
const output = path.resolve(process.argv[3] || path.join(product, "docs", "legacy-revival-audit.json"));
const ignored = new Set([".git", "node_modules", "obj", "bin", "debug", "release", ".vs", "dist", "tmp"]);
const vendor = /(?:^|\/)(?:Newton[^/]*|dCustomJoints|dMath|dContainers|newton-dynamics|include|lib)(?:\/|$)|(?:^|\/)tiny(?:xml|str)/i;
const posix = (p) => p.split(path.sep).join("/");
const hash = (buffer) => createHash("sha256").update(buffer).digest("hex");

async function files(root, relative = "", skip = ignored) {
  const entries = await readdir(path.join(root, relative), { withFileTypes: true });
  const result = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name, "en"))) {
    if (entry.isSymbolicLink() || skip.has(entry.name.toLowerCase())) continue;
    const child = path.join(relative, entry.name);
    if (entry.isDirectory()) result.push(...await files(root, child, skip));
    else if (entry.isFile()) result.push(posix(child));
  }
  return result;
}

const archiveFiles = await files(archive);
const nativeFiles = archiveFiles.filter((file) => /\.(?:cpp|cxx|h|hpp|cs)$/i.test(file) && !vendor.test(file));
const projects = archiveFiles.filter((file) => /\.(?:sln|csproj|vcx?proj)$/i.test(file) && !vendor.test(file));
const groups = new Map();
for (const file of nativeFiles) {
  const bytes = await readFile(path.join(archive, file));
  const digest = hash(bytes);
  const group = groups.get(digest) || { sha256: digest, files: [], references: [], scenes: [] };
  group.files.push(file);
  if (!groups.has(digest)) {
    const lines = bytes.toString("utf8").split(/\r?\n/);
    for (let index = 0; index < lines.length; index++) {
      const line = lines[index];
      for (const match of line.matchAll(/["']([^"'\r\n]+\.(?:tvm|tva|x|3ds|obj|fbx|xml|blend))["']/gi)) {
        group.references.push({ line: index + 1, reference: match[1], commented: /^\s*(?:\/\/|\*)/.test(line) });
      }
      if (/\bclass\s+\w*(?:Scene|Screen)\b|\b(?:CreateScene|LoadScene|SetWorld|LoadWorld)\s*\(/i.test(line)) {
        group.scenes.push({ line: index + 1, declaration: line.trim().slice(0, 220) });
      }
    }
    groups.set(digest, group);
  }
}

// Match legacy converted data by bytes even when moved from src/legacy to src/content.
const oldWeb = path.join(archive, "web-prototype");
const oldData = (await files(path.join(oldWeb, "src", "legacy"))).filter((file) => file.endsWith(".json"));
const currentData = (await files(path.join(product, "src", "content"))).filter((file) => file.endsWith(".json"));
const currentHashes = new Map();
for (const file of currentData) currentHashes.set(hash(await readFile(path.join(product, "src", "content", file))), file);
const canonical = (value) => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])])) : value;
const convertedData = [];
for (const file of oldData) {
  const bytes = await readFile(path.join(oldWeb, "src", "legacy", file));
  const digest = hash(bytes);
  const sameNameAt = currentData.includes(file) ? `src/content/${file}` : null;
  const sameData = sameNameAt ? JSON.stringify(canonical(JSON.parse(bytes))) === JSON.stringify(canonical(JSON.parse(await readFile(path.join(product, sameNameAt))))) : false;
  convertedData.push({ archive: `web-prototype/src/legacy/${file}`, sha256: digest,
    retainedAt: currentHashes.has(digest) ? `src/content/${currentHashes.get(digest)}` : null,
    sameDataAt: sameData ? sameNameAt : null });
}

const currentPublic = await files(path.join(product, "public"));
const publicHashes = new Map();
for (const file of currentPublic) publicHashes.set(hash(await readFile(path.join(product, "public", file))), file);
const runtimeAssets = [];
const normalizeText = (text) => text.replaceAll("\r\n", "\n").replace(/[ \t]+$/gm, "").trim();
for (const file of await files(path.join(oldWeb, "public"))) {
  const bytes = await readFile(path.join(oldWeb, "public", file));
  const digest = hash(bytes);
  const sameText = /\.(?:obj|mtl|mat|txt|json|xml)$/i.test(file) && currentPublic.includes(file)
    && normalizeText(bytes.toString("utf8")) === normalizeText(await readFile(path.join(product, "public", file), "utf8"));
  runtimeAssets.push({ archive: `web-prototype/public/${file}`, sha256: digest,
    retainedAt: publicHashes.has(digest) ? `public/${publicHashes.get(digest)}` : null,
    sameTextAt: sameText ? `public/${file}` : null });
}

const catalog = await readFile(path.join(product, "src", "agent-world-asset-catalog.ts"), "utf8");
const assetSources = [...catalog.matchAll(/source: "([^"]+)"/g)].map((match) => match[1].toLowerCase());
const referencedAssets = [...new Set([...groups.values()].flatMap((group) => group.references
  .filter((reference) => !reference.commented).map((reference) => reference.reference)))].sort();
const referenceCoverage = referencedAssets.map((reference) => {
  const basename = reference.replaceAll("\\", "/").split("/").at(-1).toLowerCase();
  return { reference, sourceNameInModelCatalog: assetSources.some((source) => source.replaceAll("\\", "/").split("/").at(-1) === basename) };
});
const revision = (cwd) => execFileSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf8" }).trim();
const report = {
  schema: "graphysx.legacy-revival-audit/v1",
  scope: "Native C++/C# source and project scan, byte comparison of converted JSON, model-reference candidates. Not an end-to-end fidelity certification.",
  archiveRevision: revision(archive), productBaseRevision: revision(product),
  exclusions: { directories: [...ignored], vendorPattern: vendor.source,
    note: "SDK/vendor physics, generated builds and dependency directories excluded; authored projects and their distinct source revisions retained." },
  summary: { nativeFiles: nativeFiles.length, uniqueNativeContents: groups.size, duplicateNativeCopies: nativeFiles.length - groups.size,
    projectFiles: projects.length, convertedJson: convertedData.length, byteIdenticalJson: convertedData.filter((item) => item.retainedAt).length,
    semanticallyRetainedJson: convertedData.filter((item) => item.retainedAt || item.sameDataAt).length,
    oldPublicFiles: runtimeAssets.length, byteIdenticalPublicFiles: runtimeAssets.filter((item) => item.retainedAt).length,
    retainedPublicFiles: runtimeAssets.filter((item) => item.retainedAt || item.sameTextAt).length,
    activeAssetReferences: referencedAssets.length, modelCatalogAssets: assetSources.length },
  projects, convertedData, runtimeAssets, referenceCoverage, nativeContentGroups: [...groups.values()],
};
await writeFile(output, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ output, ...report.summary }));
