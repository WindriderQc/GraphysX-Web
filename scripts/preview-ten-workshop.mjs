import { startStaticServer } from "./static-server.mjs";
import { fileURLToPath } from "node:url";
// Development preview only. No asset-store, relay, public bind or deployment.
const preview = await startStaticServer({root:fileURLToPath(new URL("../dist/",import.meta.url)),port:4198,host:"127.0.0.1"});
console.log(`${preview.url}math-lab.html?level=numbers`);
for(const signal of ["SIGINT","SIGTERM"])process.on(signal,()=>void preview.close().then(()=>process.exit(0)));
