#!/usr/bin/env node
// GraphysX world service: a headless island behind the Clawblox world protocol.
//
// Honours the Clawblox launch contract (docs/world-interface.md in Clawblox): WORLD_* values
// are defaults and explicit flags win, so `clawblox run world-service` starts it as an
// external world. Build first: npm run build:world-service

import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
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
  },
});
const env = process.env;

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

const resumePath = values.resume ?? env.WORLD_RESUME_PATH;
const record = values.record ?? env.WORLD_RECORD === "1";
const running = await startWorldServer({
  module,
  apiMarkdown: readFileSync(join(here, "API.md"), "utf8"),
  snapshot: resumePath ? JSON.parse(readFileSync(resumePath, "utf8")) : undefined,
  host: values.host ?? env.WORLD_HOST ?? "127.0.0.1",
  port: Number(values.port ?? env.WORLD_PORT ?? 18120),
  operatorToken: env.WORLD_OPERATOR_TOKEN ?? null,
  recordDir: record ? (values["record-dir"] ?? env.WORLD_RECORD_DIR ?? "recordings") : null,
});
console.log(`graphysx world service on ${running.url}${resumePath ? ` (resumed at tick ${running.world.tick})` : ""}`);

const statsEvery = Number(values["stats-every"] ?? 0);
if (statsEvery > 0) {
  setInterval(() => {
    const usage = process.memoryUsage();
    console.log(JSON.stringify({ ...running.stats(), rssMb: Math.round(usage.rss / 2 ** 20), heapMb: Math.round(usage.heapUsed / 2 ** 20) }));
  }, statsEvery * 1000).unref();
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, async () => {
    await running.close();
    process.exit(0);
  });
}
