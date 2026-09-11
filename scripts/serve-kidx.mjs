import path from "node:path";
import { startStaticServer } from "./static-server.mjs";
import { createKidxDocumentRoute } from "./kidx-document-server.mjs";

const routeRequest = await createKidxDocumentRoute();
const { port } = await startStaticServer({ root: path.resolve(process.argv[2] ?? "dist"),
  port: Number(process.env.PORT ?? 4177), host: "127.0.0.1", routeRequest });
console.log(`KidX: http://127.0.0.1:${port}/?app=ev3-lab (local instruction library enabled)`);
