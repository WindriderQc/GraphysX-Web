// CLI entry. Honours the Clawblox launch contract (docs/world-interface.md): WORLD_* values
// are defaults and explicit flags win, so `clawblox run` can start this as an external world.
import { parseArgs } from "node:util";
import { startWorldServer } from "./world-server";

const { values } = parseArgs({
  options: {
    host: { type: "string" },
    port: { type: "string" },
    record: { type: "boolean" },
    "record-dir": { type: "string" },
    "stats-every": { type: "string" },
  },
});

const env = process.env;
const record = values.record ?? env.WORLD_RECORD === "1";
const running = await startWorldServer({
  host: values.host ?? env.WORLD_HOST ?? "127.0.0.1",
  port: Number(values.port ?? env.WORLD_PORT ?? 18120),
  operatorToken: env.WORLD_OPERATOR_TOKEN ?? null,
  recordDir: record ? (values["record-dir"] ?? env.WORLD_RECORD_DIR ?? "recordings") : null,
});
console.log(`graphysx world service (spike) on ${running.url}`);

const statsEvery = Number(values["stats-every"] ?? 0);
if (statsEvery > 0) {
  setInterval(() => {
    const usage = process.memoryUsage();
    console.log(JSON.stringify({ ...running.stats(), rssMb: Math.round(usage.rss / 2 ** 20), heapMb: Math.round(usage.heapUsed / 2 ** 20) }));
  }, statsEvery * 1000).unref();
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, async () => { await running.close(); process.exit(0); });
}
