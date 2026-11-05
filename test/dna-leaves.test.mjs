import { test } from "node:test";
import assert from "node:assert/strict";
import { Color, Matrix4, Vector3 } from "three";
import { importBrowserModule } from "./support/import-browser-module.mjs";

const { AgentWorldDnaSystem, resolveAgentWorldDna, AGENT_WORLD_DNA_LEAF_HZ } =
  await importBrowserModule(new URL("../src/agent-world-dna.ts", import.meta.url));
const period = 48;
const { WORLD_LEAF_SEASON_SECONDS } = await importBrowserModule(new URL("../src/island-world-feed.ts", import.meta.url));
const config = (seed = 11) => resolveAgentWorldDna({ preset: "single-specimen", seed, growSeconds: 0, seasonSeconds: 0 });
const mesh = (system, name = "GraphysXDnaLeaves") => system.object.getObjectByName(name);
const scaleAt = (array, i) => Math.hypot(array[i], array[i + 1], array[i + 2]);

for (const cycle of [period, WORLD_LEAF_SEASON_SECONDS]) test(`leaves renew gradually through two ${cycle}s seasons, including the old broadcast reset`, () => {
  const systems = [11, 23, 37, 41, 53].map((seed) => new AgentWorldDnaSystem(config(seed)));
  try {
    const tops = systems.map((system) => Array.from(mesh(system).instanceMatrix.array));
    const seen = systems.map((system) => new Uint8Array(system.leafCount));
    let previous = null;
    let minimumCanopy = Infinity;
    let peakVisibleMove = 0;
    const total = systems.reduce((sum, system) => sum + system.leafCount, 0);
    for (let frame = 0; frame <= cycle * 2 * AGENT_WORLD_DNA_LEAF_HZ; frame++) {
      let canopy = 0;
      const current = systems.map((system, tree) => {
        system.showSeason(frame / AGENT_WORLD_DNA_LEAF_HZ, cycle);
        const array = mesh(system).instanceMatrix.array;
        for (let leaf = 0; leaf < system.leafCount; leaf++) {
          const i = leaf * 16;
          const scale = scaleAt(array, i);
          const atBranch = Math.abs(array[i + 13] - tops[tree][i + 13]) < 1e-5;
          if (atBranch && scale > 0.05) canopy++;
          if (atBranch && scale > 0.05 && scale < 0.5) seen[tree][leaf] |= 1; // bud
          if (atBranch && scale > 0.8) seen[tree][leaf] |= 2; // mature
          if (array[i + 13] < 0.061 && scale > 0.05) seen[tree][leaf] |= 4; // litter
          if (array[i + 13] < 0.061) assert.ok(scale < 0.3, "fallen leaves are smaller than the canopy clusters");
          if (scale === 0) seen[tree][leaf] |= 8; // invisible before renewal
          if (previous && (scale > 0.01 || scaleAt(previous[tree], i) > 0.01)) {
            const move = Math.hypot(...[12, 13, 14].map((axis) => array[i + axis] - previous[tree][i + axis]));
            peakVisibleMove = Math.max(peakVisibleMove, move);
            assert.ok(move < 0.15, `visible leaf ${tree}/${leaf} teleported at ${frame / AGENT_WORLD_DNA_LEAF_HZ}s: ${move}`);
            assert.ok(Math.abs(scale - scaleAt(previous[tree], i)) < 0.04, "a leaf must grow and fade progressively");
          }
        }
        return Float32Array.from(array);
      });
      minimumCanopy = Math.min(minimumCanopy, canopy);
      previous = current;
    }
    assert.ok(minimumCanopy > total * 0.2, `the whole forest cannot go bare together (${minimumCanopy}/${total})`);
    assert.ok(peakVisibleMove > 0, "the leaves actually fall");
    for (const tree of seen) assert.ok(tree.every((stages) => stages === 15), "every leaf buds, matures, lands and disappears");
  } finally {
    systems.forEach((system) => system.dispose());
  }
});

test("island leaves fall in seconds, settle flat on soil and darken before decomposing", () => {
  const system = new AgentWorldDnaSystem(config());
  try {
    const leaves = mesh(system), top = leaves.instanceMatrix.array[13];
    const matrix = new Matrix4(), point = new Vector3(), color = new Color(), hsl = {};
    let canopy = false, flight = null, ground = null, gone = null, darkened = false;
    for (let step = 0; step < WORLD_LEAF_SEASON_SECONDS * 20; step++) {
      const seconds = step / 10;
      system.showSeason(seconds, WORLD_LEAF_SEASON_SECONDS);
      const a = leaves.instanceMatrix.array, size = scaleAt(a, 0), thickness = Math.hypot(a[4], a[5], a[6]);
      if (Math.abs(a[13] - top) < 1e-5 && size > 0.8) canopy = true;
      if (canopy && flight === null && a[13] < top - 0.001) flight = seconds;
      if (flight !== null && size > 0.02 && Math.abs(thickness / size - 0.35) < 1e-5) {
        leaves.getColorAt(0, color); color.getHSL(hsl);
        if (!ground) ground = { seconds, x: a[12], z: a[14], lightness: hsl.l, size };
        assert.ok(Math.abs(a[1]) < 1e-7 && Math.abs(a[9]) < 1e-7, "settled litter lies in the soil plane");
        assert.ok(Math.abs(a[12] - ground.x) < 1e-7 && Math.abs(a[14] - ground.z) < 1e-7, "grounded leaves stop drifting");
        leaves.getMatrixAt(0, matrix);
        let bottom = Infinity;
        const vertices = leaves.geometry.attributes.position;
        for (let vertex = 0; vertex < vertices.count; vertex++) bottom = Math.min(bottom, point.fromBufferAttribute(vertices, vertex).applyMatrix4(matrix).y);
        assert.ok(bottom >= 0 && bottom < 0.02, `litter rests on the soil instead of floating: ${bottom}`);
        if (hsl.l < ground.lightness - 0.1 && hsl.s < 0.65 && size < ground.size * 0.75) darkened = true;
      }
      if (ground && size === 0) { gone = seconds; break; }
    }
    assert.ok(ground && gone !== null, "a complete visible leaf life was observed");
    assert.ok(ground.seconds - flight > 1 && ground.seconds - flight < 15, "flight duration stays short despite the three-minute renewal cycle");
    assert.ok(gone - ground.seconds > 30, "litter remains long enough to decompose gradually");
    assert.ok(darkened, "litter turns brown/darker while shrinking before it disappears");
  } finally { system.dispose(); }
});

test("changing cycle length at the same phase resamples flight and growth timing", () => {
  const system = new AgentWorldDnaSystem(config());
  try {
    system.showSeason(36, 48);
    const before = Float32Array.from(mesh(system).instanceMatrix.array);
    system.showSeason(135, 180);
    assert.notDeepEqual(mesh(system).instanceMatrix.array, before, "equal normalized phases may have different flight and budding durations");
  } finally { system.dispose(); }
});

test("world time, seeds and grove siblings determine foliage without replay history", () => {
  const one = new AgentWorldDnaSystem(config());
  const two = new AgentWorldDnaSystem(config());
  const other = new AgentWorldDnaSystem(config(23));
  const grove = new AgentWorldDnaSystem(resolveAgentWorldDna({ trees: 3, growSeconds: 0, seasonSeconds: 0 }));
  try {
    for (const t of [47.99, 48, 12, 0, 960012, -12]) {
      one.showSeason(t, period);
      two.showSeason(27, period);
      two.showSeason(t, period);
      assert.deepEqual(mesh(one).instanceMatrix.array, mesh(two).instanceMatrix.array, "seeking, reconnecting and another viewer give identical buffers");
      assert.deepEqual(mesh(one).instanceColor.array, mesh(two).instanceColor.array);
    }
    one.showSeason(12, period);
    other.showSeason(12, period);
    assert.notDeepEqual(mesh(one).instanceMatrix.array, mesh(other).instanceMatrix.array, "different trees have their own season");
    grove.showSeason(12, period);
    const array = mesh(grove).instanceMatrix.array;
    assert.ok(Array.from(array).every(Number.isFinite));
    assert.equal(grove.object.children.length, 2, "a grove still uses one branch mesh and one leaf mesh");
    one.configure(config());
    one.showSeason(12, period);
    two.showSeason(12, period);
    assert.deepEqual(mesh(one).instanceMatrix.array, mesh(two).instanceMatrix.array, "a rebuilt tree rejoins the same world time");
  } finally {
    [one, two, other, grove].forEach((system) => system.dispose());
  }
});

test("animation has bounded uploads, static branches, reusable bounds and no growing object pool", () => {
  const system = new AgentWorldDnaSystem(config());
  try {
    const leaves = mesh(system);
    const branches = mesh(system, "GraphysXDnaBranches");
    const branchVersion = branches.instanceMatrix.version;
    const bounds = leaves.boundingSphere;
    const children = [...system.object.children];
    system.showSeason(3.1, period);
    const version = leaves.instanceMatrix.version;
    const colorVersion = leaves.instanceColor.version;
    system.showSeason(3.1, period);
    system.showSeason(3.11, period);
    assert.equal(leaves.instanceMatrix.version, version, "paused time and a repeated 30 Hz sample upload nothing");
    assert.equal(leaves.instanceColor.version, colorVersion);
    system.showSeason(3.14, period);
    assert.equal(leaves.instanceMatrix.version, version + 1, "the next sample advances the leaves");
    const matrix = new Matrix4();
    const point = new Vector3();
    for (let t = 0; t < period; t += 0.5) {
      system.showSeason(t, period);
      for (let leaf = 0; leaf < system.leafCount; leaf++) {
        leaves.getMatrixAt(leaf, matrix);
        const vertices = leaves.geometry.attributes.position;
        for (let vertex = 0; vertex < vertices.count; vertex++) {
          point.fromBufferAttribute(vertices, vertex).applyMatrix4(matrix);
          assert.ok(bounds.containsPoint(point), "the picking bound covers the moving geometry");
        }
      }
    }
    assert.equal(leaves.boundingSphere, bounds, "bounds are not recomputed each frame");
    assert.equal(branches.instanceMatrix.version, branchVersion, "falling leaves never rewrite branches");
    assert.deepEqual(system.object.children, children, "renewal reuses the existing instances");
    assert.equal(leaves.geometry.attributes.position.count / 3, 20, "leaves retain their 20-triangle budget");
  } finally {
    system.dispose();
  }
});

test("disabling the host season restores static leaves and keeps the archive update path", () => {
  const system = new AgentWorldDnaSystem(config());
  try {
    const leaves = mesh(system);
    const initial = Float32Array.from(leaves.instanceMatrix.array);
    system.showSeason(12, period);
    assert.notDeepEqual(leaves.instanceMatrix.array, initial);
    system.showSeason(12, 0);
    assert.deepEqual(leaves.instanceMatrix.array, initial);
    const version = leaves.instanceMatrix.version;
    for (let frame = 0; frame < 120; frame++) system.update(1 / 60);
    assert.equal(leaves.instanceMatrix.version, version, "headless seasonless trees perform no buffer writes");
    for (const [time, duration] of [[NaN, period], [12, Infinity], [12, -1]]) {
      system.showSeason(time, duration);
      assert.deepEqual(leaves.instanceMatrix.array, initial, "invalid host clocks stay finite and static");
    }
    system.configure(resolveAgentWorldDna({ ...config(), seasonSeconds: 17 }));
    system.update(8);
    assert.notDeepEqual(leaves.instanceMatrix.array, mesh(system).instanceMatrix.array, "the recovered season still runs through update");
  } finally {
    system.dispose();
  }
});
