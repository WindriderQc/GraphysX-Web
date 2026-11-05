// Isolate foliage CPU uploads and WebGL cost using the island's actual five founder genomes.
// Run under with-verify-lock and the instance heavy-work queue. No live world or model is used.
// node scripts/with-verify-lock.mjs -- node scripts/probe-living-leaves.mjs <baseline-git-ref>
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "vite";
import { transpileModule, ModuleKind, ScriptTarget } from "typescript";
import { launchSmokeBrowser } from "./smoke-harness.mjs";

const baseline = process.argv[2];
if (!baseline) throw new Error("Pass an explicit baseline Git ref (before the foliage change)");
const source = execFileSync("git", ["show", `${baseline}:src/agent-world-dna.ts`], { encoding: "utf8" });
const baselineCode = transpileModule(source, { compilerOptions: { module: ModuleKind.ESNext, target: ScriptTarget.ES2022 } }).outputText;
const artifacts = path.resolve(process.env.SMOKE_ARTIFACTS || "output/living-leaves");
mkdirSync(artifacts, { recursive: true });
const scratch = mkdtempSync(path.join(tmpdir(), "graphysx-leaf-probe-"));
const server = await createServer({
  configFile: false, cacheDir: scratch, server: { host: "127.0.0.1", port: 0 },
  plugins: [{
    name: "leaf-baseline",
    resolveId: (id) => id === "virtual:leaf-baseline.ts" ? "\0leaf-baseline.ts" : null,
    load: (id) => id === "\0leaf-baseline.ts" ? baselineCode : null,
    configureServer(vite) {
      vite.middlewares.use("/__leaf_probe", async (_request, response, next) => {
        try {
          response.setHeader("content-type", "text/html");
          response.end(await vite.transformIndexHtml("/__leaf_probe", `<html><body style="margin:0"><script type="module">
            import * as before from "virtual:leaf-baseline.ts";
            import * as after from "/src/agent-world-dna.ts";
            import * as THREE from "three";
            import { buildLivingIsland } from "/world-service/living-island.ts";
            window.leafProbe = { before, after, THREE, definitions: buildLivingIsland().document.entities.filter(e => e.type === "dna-tree") };
          </script></body></html>`));
        } catch (error) { next(error); }
      });
    },
  }],
});
let browser;
try {
  await server.listen();
  browser = await launchSmokeBrowser();
  const page = await browser.newPage({ viewport: { width: 1024, height: 640 } });
  page.on("pageerror", (error) => console.error(error.stack));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__leaf_probe`);
  await page.waitForFunction(() => Boolean(window.leafProbe));
  const report = await page.evaluate(() => {
    const { before, after, THREE, definitions } = window.leafProbe;
    const make = (module) => definitions.map((definition) => {
      const system = new module.AgentWorldDnaSystem(module.resolveAgentWorldDna(definition.dna));
      system.object.position.fromArray(definition.transform.position);
      system.object.scale.fromArray(definition.transform.scale);
      return system;
    });
    const groups = { before: make(before), after: make(after) };
    const leaves = (system) => system.object.getObjectByName("GraphysXDnaLeaves");
    const cpu = {};
    for (const [label, systems] of Object.entries(groups)) {
      for (let frame = 0; frame < 120; frame++) systems.forEach((s) => s.showSeason(frame / 60, 48));
      const versions = systems.map((s) => leaves(s).instanceMatrix.version);
      let boundsScans = 0;
      for (const system of systems) {
        const leaf = leaves(system);
        const scan = leaf.computeBoundingSphere.bind(leaf);
        leaf.computeBoundingSphere = () => { boundsScans++; return scan(); };
      }
      const samples = [];
      for (let round = 0; round < 3; round++) {
        const start = performance.now();
        for (let frame = 0; frame < 720; frame++) systems.forEach((s) => s.showSeason((frame + round * 720) / 60, 48));
        samples.push((performance.now() - start) / 720);
      }
      cpu[label] = { msPer60HzFrame: samples, matrixUploads: systems.reduce((n, s, i) => n + leaves(s).instanceMatrix.version - versions[i], 0), boundsScans };
    }
    const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
    renderer.setSize(1024, 640);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.autoUpdate = false;
    document.body.append(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#9fd3ec");
    scene.add(new THREE.HemisphereLight(0xc6e9ff, 0x675d32, 2));
    const sun = new THREE.DirectionalLight(0xffe6bd, 3);
    sun.position.set(-8, 40, 10);
    sun.target.position.set(-14, 0, 15);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, far: 100 });
    scene.add(sun, sun.target);
    const ground = new THREE.Mesh(new THREE.BoxGeometry(60, 0.1, 60), new THREE.MeshStandardMaterial({ color: "#8b9c53" }));
    ground.position.set(-14, -0.1, 15);
    ground.receiveShadow = true;
    scene.add(ground);
    const camera = new THREE.PerspectiveCamera(42, 1024 / 640, 0.1, 150);
    camera.position.set(11, 25, 47);
    camera.lookAt(-14, 7, 15);
    const gl = renderer.getContext();
    const pixel = new Uint8Array(4);
    // A readback also crosses Chromium's GPU-process boundary; finish() alone can return
    // after command submission there and under-report software rasterisation time.
    const complete = () => gl.readPixels(512, 320, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    const debug = gl.getExtension("WEBGL_debug_renderer_info");
    const graphics = debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    const cases = ["before-moving", "after-moving", "after-static", "after-hidden"];
    const rendering = Object.fromEntries(cases.map((label) => [label, { msPerFrame: [] }]));
    let attached = [];
    const attach = (systems, visible) => {
      attached.forEach((s) => scene.remove(s.object));
      attached = systems;
      systems.forEach((s) => { leaves(s).visible = visible; scene.add(s.object); });
      renderer.shadowMap.needsUpdate = true;
    };
    for (let round = 0; round < 3; round++) {
      for (const label of round % 2 ? [...cases].reverse() : cases) {
        const systems = groups[label.startsWith("before") ? "before" : "after"];
        attach(systems, !label.endsWith("hidden"));
        systems.forEach((s) => s.showSeason(12, 48));
        for (let warm = 0; warm < 3; warm++) { renderer.render(scene, camera); complete(); }
        const start = performance.now();
        for (let frame = 0; frame < 24; frame++) {
          if (label.endsWith("moving")) systems.forEach((s) => s.showSeason(12 + frame / 60, 48));
          renderer.render(scene, camera);
          complete();
        }
        rendering[label].msPerFrame.push((performance.now() - start) / 24);
        rendering[label].drawCalls = renderer.info.render.calls;
        rendering[label].triangles = renderer.info.render.triangles;
      }
    }
    attach(groups.after, true);
    window.captureLeafTime = (seconds) => {
      groups.after.forEach((s) => s.showSeason(seconds, 48));
      renderer.shadowMap.needsUpdate = true;
      renderer.render(scene, camera);
      complete();
    };
    return { graphics, synchronization: "1-pixel readback per frame", pixel: [...pixel], viewport: [1024, 640], trees: definitions.length, leaves: groups.after.reduce((n, s) => n + s.leafCount, 0), cpu, rendering };
  });
  for (const seconds of [0, 12, 24, 48]) {
    await page.evaluate((t) => window.captureLeafTime(t), seconds);
    await page.screenshot({ path: path.join(artifacts, `foliage-${seconds}s.png`) });
  }
  const identity = { baseline, revision: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), workingTree: execFileSync("git", ["diff", "--stat"], { encoding: "utf8" }).trim() };
  writeFileSync(path.join(artifacts, "performance.json"), `${JSON.stringify({ ...identity, ...report }, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser?.close();
  await server.close();
  rmSync(scratch, { recursive: true, force: true });
}
