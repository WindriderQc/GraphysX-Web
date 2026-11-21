// Read-only archive audit. No native executable is loaded and no file is extracted there.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, realpath, writeFile } from "node:fs/promises";
import path from "node:path";

const arg = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
async function canonicalLocation(file) {
  try { return await realpath(file); }
  catch (error) {
    if (error.code !== "ENOENT") throw error;
    const parent = path.dirname(file);
    if (parent === file) throw error;
    return path.join(await canonicalLocation(parent), path.basename(file));
  }
}
const archive = await realpath(path.resolve(arg("archive") ?? "../GraphysX"));
const output = await canonicalLocation(path.resolve(arg("output") ?? "output/cubz-buttons/source-audit.json"));
function protectArchive(file) {
  const relative = path.relative(archive, file);
  if (!relative || (relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative))) throw new Error("The audit output must be outside the original archive");
}
protectArchive(output);
const sevenZip = arg("sevenzip") ?? (process.platform === "win32" ? "C:/Program Files/7-Zip/7z.exe" : "7z");
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const files = [];
async function visit(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === ".git" || entry.isSymbolicLink()) continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) await visit(file);
    else if (entry.isFile()) files.push(path.relative(archive, file).replaceAll("\\", "/"));
  }
}
await visit(archive); files.sort();
const model = /(?:^|[/\\])(?:Btn\d+|BtnExit)\.(?:tvm|tva|3ds|max|obj|x)$/i;
const containers = [];
const nestedDirectory = path.join(path.dirname(output), "nested-audit");
protectArchive(await canonicalLocation(nestedDirectory));
await mkdir(nestedDirectory, { recursive: true });
const nestedQueue = [], seenNested = new Set();
for (const file of files.filter(file => /\.(?:rar|zip|7z|cab|tgz)$/i.test(file))) {
  const absolute = path.join(archive, file), bytes = await readFile(absolute);
  const item = { source: file, sha256: hash(bytes), size: bytes.length };
  let listing = "";
  try {
    listing = execFileSync(sevenZip, ["l", "-slt", "-sccUTF-8", "-p-", absolute], { encoding: "utf8", timeout: 15000, maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] });
  } catch (error) { item.error = `7-Zip exit ${error.status ?? error.code}; listing may be partial`; listing = String(error.stdout ?? ""); }
  if (listing) {
    const body = listing.split(/^-{5,}\r?$/m).slice(1).join("\n");
    const entries = [...body.matchAll(/^Path = (.+)$/gm)].map(match => match[1].trim());
    item.entries = entries.length;
    item.matches = entries.filter(entry => model.test(entry));
    item.nested = entries.filter(entry => /\.(?:rar|zip|7z|cab|tgz)$/i.test(entry));
    for (const entry of item.nested) nestedQueue.push({ absolute, entry, source: file, depth: 1 });
    if (/CubXScene\.rar$/i.test(file)) item.cubxModels = entries.filter(entry => /\.(?:tvm|tva|max)$/i.test(entry));
  }
  containers.push(item);
}
// Extract only nested containers into the audit's own output, using content hashes
// as names. Never trust an archived path as a filesystem destination.
const nestedContainers = [];
for (let index = 0; index < nestedQueue.length; index++) {
  const queued = nestedQueue[index], item = { source: `${queued.source} :: ${queued.entry}` };
  try {
    if (queued.depth > 8) throw new Error("Nested depth limit reached");
    let bytes;
    try { bytes = execFileSync(sevenZip, ["e", "-so", "-p-", queued.absolute, queued.entry], { timeout: 15000, maxBuffer: 64 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }); }
    catch (error) {
      if (!error.stdout?.length || error.code === "ENOBUFS") throw error;
      bytes = error.stdout; item.extractionWarning = String(error.stderr ?? error.message).trim().slice(0,500);
    }
    item.sha256 = hash(bytes); item.size = bytes.length;
    if (seenNested.has(item.sha256)) { item.duplicateContent = true; nestedContainers.push(item); continue; }
    seenNested.add(item.sha256);
    const nested = path.join(nestedDirectory, item.sha256 + path.extname(queued.entry));
    await writeFile(nested, bytes);
    let listing;
    try { listing = execFileSync(sevenZip, ["l", "-slt", "-sccUTF-8", "-p-", nested], { encoding: "utf8", timeout: 15000, maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }); }
    catch (error) { if (!error.stdout) throw error; listing = String(error.stdout); item.listingWarning = `7-Zip exit ${error.status ?? error.code}`; }
    const entries = [...listing.split(/^-{5,}\r?$/m).slice(1).join("\n").matchAll(/^Path = (.+)$/gm)].map(match => match[1].trim());
    item.entries = entries.length; item.matches = entries.filter(entry => model.test(entry));
    for (const entry of entries.filter(entry => /\.(?:rar|zip|7z|cab|tgz)$/i.test(entry))) nestedQueue.push({ absolute: nested, entry, source: item.source, depth: queued.depth + 1 });
  } catch (error) { item.error = `Nested scan failed: ${error.status ?? error.code ?? error.message}`; }
  nestedContainers.push(item);
}
const controller = "Yanik C++ BCKUP/CubZ (2).cpp";
const controllerBytes = await readFile(path.join(archive, controller));
const trackedHistoryModels = execFileSync("git", ["-C", archive, "rev-list", "--objects", "--all"], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 })
  .trim().split(/\r?\n/).filter(line => model.test(line.slice(41)));
const sources = files.filter(file => /\.(?:cpp|h|cs)$/i.test(file));
const internalReferences = [], actionAssignments = [], managers = [];
for (const file of sources) {
  const bytes = await readFile(path.join(archive, file)), text = bytes.toString("utf8");
  if (/clInsideCubXBtn|clInsideCubXExitBtn/.test(text)) internalReferences.push({ source: file, sha256: hash(bytes) });
  if (/stBtn3D\s*\[[^\]]*\]\s*(?:\.|->)\s*Action\s*=/.test(text)) actionAssignments.push(file);
  if (/(?:^|\/)MenuManager(?: \(\d+\))?\.(?:cpp|h)$/i.test(file)) managers.push({ source: file, sha256: hash(bytes) });
}
const report = { schema: "graphysx.cubz-button-audit/v1", archiveHead: execFileSync("git", ["-C", archive, "rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  scope: "Unpacked files and compressed-container listings, including nested containers. Listing/extraction errors remain explicit coverage gaps; a negative result is not proof of permanent loss.",
  fileCount: files.length, sourceFileCount: sources.length, controller: { source: controller, sha256: hash(controllerBytes) },
  unpackedModels: files.filter(file => model.test(file)), trackedHistoryModels, containers, nestedContainers, internalReferences, managers, actionAssignments,
  conclusion: "The retained enhanced controller establishes Btn1..32, four buttons per menu 1..8 and BtnExit outside menu 0. Native geometry, labels and per-button destinations are not established by this audit. Web meshes and destinations are reconstructed adapters." };
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ report: output, files: files.length, sources: sources.length, containers: containers.length,
  readable: containers.filter(item => !item.error).length, unreadable: containers.filter(item => item.error).map(item => item.source),
  nested: nestedContainers.length, nestedErrors: nestedContainers.filter(item => item.error), unpackedModels: report.unpackedModels,
  compressedModels: [...containers, ...nestedContainers].flatMap(item => item.matches ?? []), actionAssignments }));
