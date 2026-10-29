#!/usr/bin/env node
// GraphysX world service: a headless island behind the Clawblox world protocol.
//
// Honours the Clawblox launch contract (docs/world-interface.md in Clawblox): WORLD_* values
// are defaults and explicit flags win, so `clawblox run world-service` starts it as an
// external world. Build first: npm run build:world-service

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { createInterface } from "node:readline";
import { startWorldServer } from "./server.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const bundle = join(here, "dist", "world.js");
if (!existsSync(bundle)) {
  console.error("world-service/dist/world.js is missing: run `npm run build:world-service` first.");
  process.exit(1);
}
const module = await import(bundle);

const { values } = parseArgs({
  options: {
    host: { type: "string" },
    port: { type: "string" },
    record: { type: "boolean" },
    "record-dir": { type: "string" },
    resume: { type: "string" },
    "stats-every": { type: "string" },
    "no-images": { type: "boolean" },
    "image-sidecar": { type: "string" },
    "image-viewer": { type: "string" },
    world: { type: "string" },
  },
});
const env = process.env;
// Which island: `mesa-island` (the Clawblox copy, default) or `living-island` (Mesa plus trees,
// birds and wind: docs/LIVING_ISLAND.md). A resumed snapshot names its own world.
const worldId = values.world ?? env.WORLD_ID ?? undefined;
if (worldId && !module.WORLD_IDS.includes(worldId)) {
  console.error(`Unknown world ${worldId}: use one of ${module.WORLD_IDS.join(", ")}`);
  process.exit(1);
}

// Model payloads come from the same catalog the site serves, read from disk.
const publicRoot = join(here, "..", "public");
module.setAgentWorldAssetFetch(async (url) => {
  const path = normalize(join(publicRoot, new URL(url, "http://assets.local").pathname));
  if (!path.startsWith(publicRoot + sep)) return new Response(null, { status: 404 });
  try {
    return new Response(await readFile(path));
  } catch {
    return new Response(null, { status: 404 });
  }
});

/**
 * GET /observe/image goes to the image sidecar (image-sidecar.mjs): an existing one
 * (`--image-sidecar <url>` / WORLD_IMAGE_SIDECAR), or a child process started on the first
 * request, so a world nobody photographs never pays for a browser. `--no-images` or
 * WORLD_IMAGES=0 turns the endpoint off (503).
 */
function imageRenderer(worldUrl) {
  const children = [];
  let base = values["image-sidecar"] ?? env.WORLD_IMAGE_SIDECAR ?? null;
  let starting = null;
  const startChild = () => new Promise((done, fail) => {
    const viewer = values["image-viewer"] ?? env.WORLD_IMAGE_VIEWER;
    const child = spawn(process.execPath, [join(here, "image-sidecar.mjs"), "--port", "0", "--exit-with-parent", ...(viewer ? ["--viewer", viewer] : [])], { stdio: ["pipe", "pipe", "inherit"] });
    children.push(child);
    const lines = createInterface({ input: child.stdout });
    lines.on("line", (line) => {
      const match = /image sidecar on (http:\/\/\S+)/.exec(line);
      if (match) done(match[1]);
      console.log(`[image] ${line}`);
    });
    child.once("exit", (code) => { base = null; fail(new Error(`image sidecar exited (${code})`)); });
  });
  const render = async (request) => {
    if (!base) {
      starting ??= startChild().finally(() => { starting = null; });
      base = await starting;
    }
    const response = await fetch(`${base}/render`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ source: env.WORLD_IMAGE_SOURCE ?? worldUrl(), ...request }) });
    if (!response.ok) throw new Error((await response.json().catch(() => null))?.error ?? `sidecar answered ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  };
  render.stop = () => { for (const child of children) child.kill("SIGTERM"); };
  return render;
}

const resumePath = values.resume ?? env.WORLD_RESUME_PATH;
const record = values.record ?? env.WORLD_RECORD === "1";
const host = values.host ?? env.WORLD_HOST ?? "127.0.0.1";
const port = Number(values.port ?? env.WORLD_PORT ?? 18120);
const images = !(values["no-images"] || env.WORLD_IMAGES === "0");
// The sidecar reaches this world on loopback when it listens on every interface.
let running = null;
const loopback = () => {
  const bound = running.server.address().port;
  return `http://${host === "0.0.0.0" || host === "::" ? "127.0.0.1" : host}:${bound}`;
};
const renderImage = images ? imageRenderer(loopback) : null;
const snapshot = resumePath ? JSON.parse(readFileSync(resumePath, "utf8")) : undefined;
const mesaApi = readFileSync(join(here, "API.md"), "utf8");
const living = (snapshot?.world?.id ?? worldId) === module.LIVING_WORLD_ID;
running = await startWorldServer({
  module,
  apiMarkdown: living ? module.livingApiMarkdown(mesaApi) : mesaApi,
  snapshot,
  world: worldId,
  host,
  port,
  renderImage: renderImage ?? undefined,
  operatorToken: env.WORLD_OPERATOR_TOKEN ?? null,
  recordDir: record ? (values["record-dir"] ?? env.WORLD_RECORD_DIR ?? "recordings") : null,
});
console.log(`graphysx world service (${running.world.worldId}) on ${running.url}${resumePath ? ` (resumed at tick ${running.world.tick})` : ""}${images ? "" : " (images off)"}`);

const statsEvery = Number(values["stats-every"] ?? 0);
if (statsEvery > 0) {
  setInterval(() => {
    const usage = process.memoryUsage();
    console.log(JSON.stringify({ ...running.stats(), rssMb: Math.round(usage.rss / 2 ** 20), heapMb: Math.round(usage.heapUsed / 2 ** 20) }));
  }, statsEvery * 1000).unref();
}

process.once("exit", () => renderImage?.stop());
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.once(signal, async () => {
    renderImage?.stop();
    await running.close();
    process.exit(0);
  });
}
