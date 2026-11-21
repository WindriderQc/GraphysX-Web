import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { link, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const RETAINED = ".retained-assets.json";
const assetFile = (root, name) => path.join(root, "assets", ...name.split("/"));
const assetUrl = name => "/assets/" + name.split("/").map(encodeURIComponent).join("/");

async function inventory(root) {
  const names = new Set();
  async function walk(dir, prefix) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const name = prefix + entry.name;
      if (entry.isDirectory()) await walk(path.join(dir, entry.name), name + "/");
      else if (entry.isFile()) names.add(name);
      else throw new Error(`Expected a regular release asset at ${assetUrl(name)}`);
    }
  }
  await walk(path.join(root, "assets"), "");
  return names;
}

async function retainedAssets(root) {
  let text;
  try { text = await readFile(path.join(root, RETAINED), "utf8"); }
  catch (error) {
    if (error.code === "ENOENT") return new Set();
    throw error;
  }
  const names = JSON.parse(text);
  if (!Array.isArray(names) || names.some(name => typeof name !== "string" ||
      name.includes("\\") || name.includes(":") || name.includes("\0") ||
      name.split("/").some(part => !part || part === "." || part === ".."))) {
    throw new Error(`Invalid retained asset list in ${root}`);
  }
  return new Set(names);
}

async function digest(file) {
  const hash = createHash("sha256");
  for await (const bytes of createReadStream(file)) hash.update(bytes);
  return hash.digest("hex");
}

/**
 * Validate immutable URLs before touching the inactive candidate. Keep one generation of
 * missing assets as ordinary files under its existing nginx root, with no duplicate payload.
 */
export async function prepareReleaseAssets(candidate, live) {
  if (path.resolve(candidate) === path.resolve(live)) throw new Error("The live release cannot be prepared in place");
  const [candidateFiles, liveFiles, oldRetained, liveRetained] = await Promise.all([
    inventory(candidate), inventory(live), retainedAssets(candidate), retainedAssets(live),
  ]);
  const owned = new Set([...candidateFiles].filter(name => !oldRetained.has(name)));
  const changed = [];
  let compared = 0;
  for (const name of [...owned].sort()) {
    if (!liveFiles.has(name)) continue;
    compared += 1;
    const [before, after] = await Promise.all([digest(assetFile(live, name)), digest(assetFile(candidate, name))]);
    if (before !== after) changed.push(`  ${assetUrl(name)}  ${before} → ${after}`);
  }
  if (changed.length) {
    throw new Error(`Immutable asset URLs changed (live → candidate SHA-256):\n${changed.join("\n")}\nPublish the new bytes under versioned URLs and update their references.`);
  }

  const retain = [...liveFiles].filter(name => !liveRetained.has(name) && !owned.has(name)).sort();
  // A previously verified SHA can be reactivated. Refresh only its recorded hardlinks.
  // Remove old links before recording the new list so a failed preparation can be retried.
  for (const name of oldRetained) await rm(assetFile(candidate, name), { force: true });
  const index = path.join(candidate, RETAINED);
  await writeFile(index + ".next", JSON.stringify(retain) + "\n");
  await rename(index + ".next", index);
  for (const name of retain) {
    const target = assetFile(candidate, name);
    await mkdir(path.dirname(target), { recursive: true });
    await link(assetFile(live, name), target);
  }
  return { compared, retained: retain.map(assetUrl) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [candidate, live] = process.argv.slice(2);
  if (!candidate || !live) throw new Error("Usage: node prepare-release-assets.mjs <candidate> <live>");
  try {
    const { compared, retained } = await prepareReleaseAssets(candidate, live);
    console.log(`Verified ${compared} immutable asset URLs; retained ${retained.length} from the previous release.`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
