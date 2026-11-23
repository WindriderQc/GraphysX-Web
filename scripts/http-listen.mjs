import { randomInt } from "node:crypto";

/** Bind an automatic HTTP endpoint outside Fetch's blocked-port range.
 * Some Windows installations allocate port 0 from 1024 upward, including ports
 * such as 6000/6667 that Node fetch and Chromium refuse before making a request.
 * https://fetch.spec.whatwg.org/#port-blocking
 * Explicit ports retain their existing behaviour; only automatic allocations retry.
 */
export async function listenHttp(server, { port = 0, host = "127.0.0.1", ...options } = {}) {
  const automatic = port === 0;
  let lastError;
  for (let attempt = 0; attempt < (automatic ? 32 : 1); attempt++) {
    const candidate = automatic ? randomInt(49152, 65536) : port;
    try {
      await new Promise((resolve, reject) => {
        const failed = error => { server.removeListener("listening", ready); reject(error); };
        const ready = () => { server.removeListener("error", failed); resolve(); };
        server.once("error", failed); server.once("listening", ready);
        try { server.listen({ ...options, host, port: candidate }); }
        catch (error) { server.removeListener("listening", ready); server.removeListener("error", failed); reject(error); }
      });
      return server.address();
    } catch (error) {
      if (!automatic || !["EADDRINUSE", "EACCES"].includes(error?.code)) throw error;
      lastError = error;
    }
  }
  throw new Error("Could not allocate a browser-compatible HTTP port", { cause: lastError });
}
