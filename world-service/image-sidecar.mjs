#!/usr/bin/env node
// First-person images for the GraphysX world service, in their own process.
//
// The world service stays a plain Node program (no browser in its image); when an agent asks
// GET /observe/image it posts the camera here. This process starts one headless Chromium on the
// first request, shared by every agent and world, and keeps one page per world: the island
// viewer itself in camera mode (`?app=island&embed=1&capture=1&source=<world>`), following
// the world's /spectate stream like any spectator. A render aims that page's camera at the
// agent's eye, hides the agent's own avatar (the eye sits inside it), lets the renderer draw
// and takes a PNG screenshot. Between requests the page's frame loop is suspended
// (`PlatformHost.setFramesSuspended`), so an idle camera draws nothing; its stream keeps the
// poses current. Chromium is closed again after `--idle-seconds` without requests.
//
//   POST /render  {source, position, forward, fovDeg, entityId, tick, width, height} -> image/png
//                 fovDeg is horizontal (Clawblox's 105°); the vertical one follows the aspect.
//   GET  /healthz {ok, browser, pages, renders, meanMs, lastMs, maxMs}
//
//   node world-service/image-sidecar.mjs --port 18142 [--host 127.0.0.1]
//        [--viewer http://host:port/ | --viewer-dir dist] [--idle-seconds 300]
//
// Without --viewer it serves the built site (`npm run build` -> dist/) itself on a loopback port.
// Like Clawblox, Chromium runs without a display, so WebGL is software (SwiftShader).

import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { verticalFovDegrees } from "./image.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const MAX_BODY_BYTES = 16 * 1024;
const PAGE_READY_MS = 30_000;
const RENDER_TIMEOUT_MS = 15_000;

const finiteVec = (value) => Array.isArray(value) && value.length >= 3 && value.slice(0, 3).every((n) => typeof n === "number" && Number.isFinite(n));

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error("Body too large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

const withTimeout = (promise, ms, label) => new Promise((done, fail) => {
  const timer = setTimeout(() => fail(new Error(`${label} timed out after ${ms} ms`)), ms);
  promise.then((value) => { clearTimeout(timer); done(value); }, (error) => { clearTimeout(timer); fail(error); });
});

/**
 * @param {object} options
 * @param {string} options.viewer   base URL of a GraphysX-Web page (vite dev, a static dist/, …)
 * @param {number} [options.idleSeconds]
 * @param {() => Promise<import("playwright").Browser>} [options.launch] for tests
 */
export function createImageRenderer(options) {
  const viewer = options.viewer.replace(/\/+$/, "");
  const idleMs = Math.max(10, options.idleSeconds ?? 300) * 1000;
  let browser = null;
  let launching = null;
  const pages = new Map(); // source -> { page, ready: Promise, size }
  const stats = { renders: 0, totalMs: 0, lastMs: 0, maxMs: 0, launches: 0, failures: 0 };
  let queue = Promise.resolve();
  let idleTimer = null;

  const launch = async () => {
    if (options.launch) return options.launch();
    const { chromium } = await import("playwright");
    // No display: Chromium falls back to SwiftShader, the same on every host.
    const env = { ...process.env };
    delete env.DISPLAY;
    delete env.WAYLAND_DISPLAY;
    return chromium.launch({ headless: true, args: ["--no-sandbox"], env, executablePath: process.env.GRAPHYSX_CHROMIUM || undefined });
  };

  const ensureBrowser = async () => {
    if (browser?.isConnected()) return browser;
    launching ??= launch().then((value) => {
      stats.launches += 1;
      browser = value;
      browser.on("disconnected", () => { browser = null; pages.clear(); });
      return value;
    }).finally(() => { launching = null; });
    return launching;
  };

  const pageFor = async (source, width, height) => {
    let entry = pages.get(source);
    if (entry && entry.page.isClosed()) { pages.delete(source); entry = null; }
    if (!entry) {
      const instance = await ensureBrowser();
      const page = await instance.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
      const url = `${viewer}/?app=island&embed=1&capture=1&source=${encodeURIComponent(source)}`;
      const ready = (async () => {
        await page.goto(url, { waitUntil: "domcontentloaded" });
        await page.waitForFunction(() => window.__graphysxIslandCapture?.ready() === true, null, { timeout: PAGE_READY_MS, polling: 100 });
        await page.evaluate(() => window.__graphysxIslandCapture.release());
      })();
      entry = { page, ready, width, height };
      pages.set(source, entry);
      ready.catch(() => { pages.delete(source); page.close().catch(() => {}); });
    }
    await entry.ready;
    if (entry.width !== width || entry.height !== height) {
      await entry.page.setViewportSize({ width, height });
      entry.width = width;
      entry.height = height;
    }
    return entry;
  };


  const armIdle = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => { void close(); }, idleMs);
    idleTimer.unref?.();
  };

  const renderOnce = async (request) => {
    const started = performance.now();
    const entry = await pageFor(request.source, request.width, request.height);
    const { page } = entry;
    const aim = {
      position: request.position.slice(0, 3),
      forward: request.forward.slice(0, 3),
      verticalFovDeg: verticalFovDegrees(request.fovDeg ?? 105, request.width, request.height),
      entityId: typeof request.entityId === "string" ? request.entityId : null,
      tick: Number.isFinite(request.tick) ? request.tick : 0,
    };
    const aimed = await page.evaluate((value) => window.__graphysxIslandCapture.aim(value), aim);
    const png = await page.screenshot({ type: "png", animations: "allow", caret: "initial" });
    await page.evaluate(() => window.__graphysxIslandCapture.release());
    const elapsed = performance.now() - started;
    stats.renders += 1;
    stats.totalMs += elapsed;
    stats.lastMs = elapsed;
    stats.maxMs = Math.max(stats.maxMs, elapsed);
    return { png, tick: aimed?.tick ?? null, ms: elapsed };
  };

  /** One render at a time: a shared software renderer gains nothing from overlap. */
  const render = (request) => {
    if (typeof request?.source !== "string" || !/^https?:\/\//.test(request.source)) return Promise.reject(new Error("source must be the world's http(s) base"));
    if (!finiteVec(request.position) || !finiteVec(request.forward)) return Promise.reject(new Error("position and forward must be [x, y, z]"));
    const run = queue.then(async () => {
      armIdle();
      try {
        return await withTimeout(renderOnce(request), RENDER_TIMEOUT_MS, "render");
      } catch (error) {
        stats.failures += 1;
        // A broken page is rebuilt on the next request rather than reused.
        const entry = pages.get(request.source);
        pages.delete(request.source);
        await entry?.page.close().catch(() => {});
        throw error;
      }
    });
    queue = run.catch(() => {});
    return run;
  };

  const close = async () => {
    if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
    pages.clear();
    const instance = browser;
    browser = null;
    await instance?.close().catch(() => {});
  };

  return {
    render,
    close,
    stats: () => ({
      browser: !!browser?.isConnected(),
      pages: pages.size,
      renders: stats.renders,
      failures: stats.failures,
      launches: stats.launches,
      meanMs: stats.renders ? Math.round(stats.totalMs / stats.renders) : null,
      lastMs: Math.round(stats.lastMs),
      maxMs: Math.round(stats.maxMs),
    }),
  };
}

export async function startImageSidecar(options) {
  let staticServer = null;
  let viewer = options.viewer;
  if (!viewer) {
    const root = resolve(options.viewerDir ?? join(here, "..", "dist"));
    if (!existsSync(join(root, "index.html"))) throw new Error(`No built viewer in ${root}: run \`npm run build\` or pass --viewer <url>`);
    const { startStaticServer } = await import("../scripts/static-server.mjs");
    staticServer = await startStaticServer({ root, port: 0, host: "127.0.0.1" });
    viewer = staticServer.url;
  }
  const renderer = createImageRenderer({ viewer, idleSeconds: options.idleSeconds, launch: options.launch });
  const server = createServer(async (request, response) => {
    const reply = (status, body) => {
      response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
      response.end(JSON.stringify(body));
    };
    try {
      const route = `${request.method} ${new URL(request.url ?? "/", "http://sidecar.local").pathname}`;
      if (route === "GET /healthz") return reply(200, { ok: true, viewer, ...renderer.stats() });
      if (route !== "POST /render") return reply(404, { error: `No route ${route}` });
      let body;
      try { body = await readJson(request); } catch (error) { return reply(400, { error: String(error?.message ?? error) }); }
      const width = Math.round(Number(body.width ?? 1088));
      const height = Math.round(Number(body.height ?? 640));
      if (!(width >= 16 && width <= 4096 && height >= 16 && height <= 4096)) return reply(400, { error: "width and height must be 16..4096" });
      const { png, tick, ms } = await renderer.render({ ...body, width, height });
      response.writeHead(200, { "content-type": "image/png", "cache-control": "no-store", "content-length": png.length, "x-render-ms": String(Math.round(ms)), "x-world-tick": String(tick ?? "") });
      return response.end(png);
    } catch (error) {
      return reply(503, { error: String(error?.message ?? error) });
    }
  });
  await new Promise((done) => server.listen(options.port ?? 0, options.host ?? "127.0.0.1", done));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : options.port;
  return {
    url: `http://${options.host ?? "127.0.0.1"}:${port}`,
    viewer,
    stats: renderer.stats,
    close: async () => {
      await renderer.close();
      await new Promise((done) => server.close(() => done()));
      await staticServer?.close();
    },
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({
    options: {
      host: { type: "string" },
      port: { type: "string" },
      viewer: { type: "string" },
      "viewer-dir": { type: "string" },
      "idle-seconds": { type: "string" },
      "exit-with-parent": { type: "boolean" },
    },
  });
  const running = await startImageSidecar({
    host: values.host ?? "127.0.0.1",
    port: Number(values.port ?? 0),
    viewer: values.viewer ?? process.env.WORLD_IMAGE_VIEWER,
    viewerDir: values["viewer-dir"],
    idleSeconds: values["idle-seconds"] ? Number(values["idle-seconds"]) : undefined,
  });
  // main.mjs reads this line to learn the port it was given.
  console.log(`graphysx image sidecar on ${running.url} (viewer ${running.viewer})`);
  const stop = async () => { await running.close(); process.exit(0); };
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) process.once(signal, stop);
  // Started by main.mjs: its pipe closes when the world process ends, however it ends.
  if (values["exit-with-parent"]) {
    process.stdin.once("close", stop);
    process.stdin.resume();
  }
}
