#!/usr/bin/env node
// Explicit local registration for old archives. HTTP callers can only name opaque IDs.
import { randomUUID, createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, realpath, stat, writeFile } from "node:fs/promises";
import { resolve, relative, join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { UUID } from "./archive.mjs";

export async function registerRecording(root, directory, id = randomUUID()) {
  if (!UUID.test(id)) throw new Error("Recording id needs a UUID");
  const base = await realpath(root);
  const file = await realpath(join(directory, "graphysx-recording.ndjson"));
  const path = relative(base, file);
  if (!path || path.startsWith(`..${sep}`) || path === ".." || path.startsWith(sep)) throw new Error("Archive must be inside the configured recording root");
  const info = await stat(file);
  if (!info.isFile()) throw new Error("Archive must be a regular recording file");
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  const reference = { format: "graphysx-recording-reference/v1", path, bytes: info.size, sha256: hash.digest("hex") };
  const target = join(base, "instances", id);
  await mkdir(join(base, "instances"), { recursive: true });
  await mkdir(target);
  // Exclusive creation: an existing binding is never reassigned.
  await writeFile(join(target, "reference.json"), JSON.stringify(reference), { flag: "wx", mode: 0o600 });
  return { instanceId: id, recordingId: id, identitySource: "registered-legacy", bytes: info.size, sha256: reference.sha256 };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: { root: { type: "string" }, directory: { type: "string" }, id: { type: "string" } } });
  if (!values.root || !values.directory) throw new Error("Usage: --root <configured recording root> --directory <old recording directory> [--id <UUID>]");
  console.log(JSON.stringify(await registerRecording(values.root, values.directory, values.id)));
}
