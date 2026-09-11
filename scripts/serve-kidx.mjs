import path from "node:path";
import { startStaticServer } from "./static-server.mjs";
import { createKidxDocumentRoute } from "./kidx-document-server.mjs";
import { createKidxTeamRoute } from "./kidx-team-server.mjs";
import { isIP } from "node:net";

const documents = await createKidxDocumentRoute();
const teams = createKidxTeamRoute();
const routeRequest = (req, res) => teams(req, res) || documents(req, res);
const host = process.env.KIDX_HOST ?? "127.0.0.1";
if (isIP(host) !== 4 || !/^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)) throw new Error("KIDX_HOST must be a loopback or private LAN IPv4 address");
const { port } = await startStaticServer({ root: path.resolve(process.argv[2] ?? "dist"),
  port: Number(process.env.PORT ?? 4177), host, routeRequest });
console.log(`KidX: http://${host}:${port}/?app=ev3-lab (local instructions and shared build rooms enabled)`);
