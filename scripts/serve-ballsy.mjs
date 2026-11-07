import { readFile } from "node:fs/promises";
import https from "node:https";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { startStaticServer } from "./static-server.mjs";
import { createBallsyRoute } from "../server/ballsy-http.mjs";

export async function startBallsyServer({ root = fileURLToPath(new URL("../dist", import.meta.url)), host = "127.0.0.1", port = 4196, cert, key } = {}) {
  const ballsy = createBallsyRoute();
  const routeRequest = (req, res) => {
    // Local preview discovery only. Production checks the actual /store API instead.
    res.setHeader("X-Ballsy-Relay", "1");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Permissions-Policy", "xr-spatial-tracking=(self)");
    return ballsy(req, res);
  };
  if (!!cert !== !!key) throw new Error("Provide both --cert and --key for HTTPS.");
  const app = await startStaticServer({ root: path.resolve(root), host: cert ? "127.0.0.1" : host, port: cert ? 0 : port, routeRequest });
  if (!cert) return app;
  // Reuse the proven static handler; only the listener/transport changes for private TLS.
  const handler = app.server.listeners("request")[0];
  await app.close();
  const server = https.createServer({ cert: await readFile(cert), key: await readFile(key) }, handler);
  server.keepAliveTimeout = 72_000;
  server.headersTimeout = 75_000;
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(port, host, resolve); });
  return { server, port: server.address().port, url: `https://${host}:${server.address().port}/`, close: () => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { values } = parseArgs({ options: { host: { type: "string", default: "127.0.0.1" }, port: { type: "string", default: "4196" }, cert: { type: "string" }, key: { type: "string" } } });
  const app = await startBallsyServer({ ...values, port: Number(values.port) });
  console.log(`Ballsy private preview: ${values.cert ? "https" : "http"}://${values.host}:${app.port}/ballsy.html`);
  const stop = async () => { await app.close(); process.exit(0); };
  process.once("SIGINT", stop); process.once("SIGTERM", stop);
}
