import { mkdirSync } from "node:fs";
import path from "node:path";
import { SMOKE_TIMEOUT, applySmokeTimeout, launchSmokeBrowser } from "./smoke-harness.mjs";

/**
 * Proves the recovered BallZ arenas in `src/archive-ballz-levels.ts` are genuinely playable
 * levels rather than valid data.
 *
 * Drives the BUILT output like every other smoke. It first ran a vite dev server, because the
 * module was seed content nothing imported and a dist smoke could only have re-typed its rows
 * and tested a copy. `main.ts` now seeds it on every platform-host route and publishes the
 * records on `window.__GRAPHYSX_ARCHIVE__`, so the real module is in the bundle and this reads
 * the shipped artifact — no second server, no dev/prod divergence.
 *
 * ## What is asserted, and why each one
 *
 * - **Census fidelity.** Each archive grid is re-counted against the symbol census independently
 *   recorded by the workshop's `verify-classic-suzanne-fidelity.mjs`. A typo in a transcription
 *   is the one failure mode that would silently corrupt the record, so it fails the build.
 * - **Translation is lossless.** The shipped platform grid must carry exactly as many walls,
 *   rings, starts and gates as the archive grid says — the conversion may not quietly drop one.
 * - **Containment, structurally and behaviourally.** Every perimeter cell of the shipped grid is
 *   a wall, *and* a ball launched hard at a corner is still on the floor afterwards. Level 2 is
 *   additionally asserted to need no frame at all, which is the fidelity claim made for it.
 * - **Rest, not existence.** The ball settles at its own radius above the floor. "Exists" and
 *   "is supported" are different claims.
 * - **Reachability, on the shipped grid.** A flood fill from the start must reach all 20 rings,
 *   the halfway gate and the finish. A level whose objectives are walled off is valid and
 *   unplayable.
 * - **Completable, by actually completing it.** The run is driven to `phase === "complete"`
 *   through the rules layer: twenty rings, then the halfway gate, then the finish — and the
 *   finish is proven *not* to count before the rings are in, which is what makes them matter.
 * - **Export -> load.** A materialised recovered level is claimed to be an ordinary scene.
 *
 * Physics is driven with `api.pause(true)` + fixed `api.step(1/60)` throughout, never wall
 * clock, so the result does not depend on the harness's software-GL frame rate.
 */

const BASE = process.env.SMOKE_BASE || "http://127.0.0.1:4188/";
const ART = process.env.SMOKE_ARTIFACTS || "output/verify";
mkdirSync(ART, { recursive: true });

/** The census the workshop's own fidelity verifier asserts against the StockRoom bytes. */
const EXPECTED_CENSUS = {
  "archive-ballz-level1": { T: 106, R: 20, "@": 1, F: 1, f: 1, H: 1, h: 1 },
  "archive-ballz-level2": { Z: 140, R: 20, "@": 1, F: 1, f: 1, H: 1, h: 1 },
};

const failures = [];
function check(name, condition, detail) {
  const pass = Boolean(condition);
  if (!pass) failures.push(`${name}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`);
  console.log(`${pass ? "  ok  " : "  FAIL"} ${name}${detail === undefined ? "" : ` ${JSON.stringify(detail)}`}`);
  return pass;
}

// --- flood fill over the shipped grid, in Node so it is independent of the page ------------
function reachability(rows, targets) {
  const H = rows.length;
  const W = rows[0].length;
  let start = null;
  rows.forEach((row, y) => [...row].forEach((tile, x) => { if (tile === "S") start = [x, y]; }));
  if (!start) return { start: null, reached: 0, unreachable: targets.slice() };
  const seen = new Set([start.join(",")]);
  const queue = [start];
  while (queue.length) {
    const [x, y] = queue.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      if (rows[ny][nx] === "#") continue;
      const key = `${nx},${ny}`;
      if (seen.has(key)) continue;
      seen.add(key);
      queue.push([nx, ny]);
    }
  }
  const found = [];
  rows.forEach((row, y) => [...row].forEach((tile, x) => { if (targets.includes(tile)) found.push([tile, x, y]); }));
  return {
    start,
    reached: seen.size,
    total: found.length,
    unreachable: found.filter(([, x, y]) => !seen.has(`${x},${y}`)),
  };
}

const browser = await launchSmokeBrowser();
let page = null;

try {
  page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  applySmokeTimeout(page);
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => pageErrors.push(String(error)));

  await page.goto(`${BASE}?host=standalone`, { waitUntil: "load" });
  await page.waitForFunction(() => !!window.__GRAPHYSX__, null, { timeout: SMOKE_TIMEOUT });

  // The real records, read off the shipped bundle via the discoverable archive global.
  await page.waitForFunction(() => !!window.__GRAPHYSX_ARCHIVE__, null, { timeout: SMOKE_TIMEOUT });

  console.log("\n# module + record fidelity");
  const records = await page.evaluate(() => {
    const mod = window.__GRAPHYSX_ARCHIVE__;
    return mod.levels.map((level) => ({
      id: level.id,
      label: level.label,
      cellSize: level.cellSize,
      frame: level.frame,
      solidSymbol: level.solidSymbol,
      archiveRows: [...level.archiveRows],
      platformRows: mod.toPlatformRows(level),
      declaredCensus: level.provenance.census,
      deviationCodes: level.deviations.map((d) => d.code),
      faithful: level.fidelity.faithful.length,
      inferred: level.fidelity.inferred.length,
      absent: level.fidelity.deliberatelyAbsent.length,
    }));
  });
  check("two recovered levels are exported", records.length === 2, records.map((r) => r.id));
  const notRevived = await page.evaluate(() => window.__GRAPHYSX_ARCHIVE__.notRevived.map((r) => r.verdict));
  check("skipped records carry a verdict each", notRevived.length >= 5, notRevived);

  for (const record of records) {
    console.log(`\n# ${record.id} — ${record.label}`);
    const expected = EXPECTED_CENSUS[record.id];

    // --- the record itself ---------------------------------------------------------------
    const counts = {};
    for (const ch of record.archiveRows.join("")) counts[ch] = (counts[ch] ?? 0) + 1;
    const censusOk = Object.entries(expected).every(([sym, n]) => counts[sym] === n);
    check("archive grid matches the workshop symbol census", censusOk, { expected, got: Object.fromEntries(Object.entries(counts).filter(([k]) => k in expected)) });
    check("declared census matches the asserted one", JSON.stringify(record.declaredCensus) === JSON.stringify(expected));
    check("archive grid is 20 wide and uniform", record.archiveRows.every((r) => r.length === 20), record.archiveRows.length);

    // --- the translation -------------------------------------------------------------------
    const platform = record.platformRows;
    const pCounts = {};
    for (const ch of platform.join("")) pCounts[ch] = (pCounts[ch] ?? 0) + 1;
    const solids = expected[record.solidSymbol];
    const frameCells = record.frame ? (platform[0].length * 2 + (platform.length - 2) * 2) : 0;
    check("every ring survived translation", pCounts.o === expected.R, { rings: pCounts.o });
    check("exactly one start / half / finish", pCounts.S === 1 && pCounts.H === 1 && pCounts.F === 1, { S: pCounts.S, H: pCounts.H, F: pCounts.F });
    check("wall count = archive solids + frame", pCounts["#"] === solids + frameCells, { got: pCounts["#"], solids, frameCells });
    check("no unmapped tile leaked through", Object.keys(pCounts).every((c) => ".#SoHF".includes(c)), Object.keys(pCounts).join(""));

    // --- containment, structurally ---------------------------------------------------------
    const W = platform[0].length;
    const H = platform.length;
    let openPerimeter = 0;
    for (let x = 0; x < W; x += 1) { if (platform[0][x] !== "#") openPerimeter += 1; if (platform[H - 1][x] !== "#") openPerimeter += 1; }
    for (let y = 1; y < H - 1; y += 1) { if (platform[y][0] !== "#") openPerimeter += 1; if (platform[y][W - 1] !== "#") openPerimeter += 1; }
    check("shipped grid has a fully closed perimeter", openPerimeter === 0, { openPerimeter });
    if (record.id === "archive-ballz-level2") {
      // The fidelity claim for Level 2 is that it needs no frame. If a future edit opens its
      // boundary this must fail rather than quietly grow a frame.
      check("level 2 ships unframed at its authored 20x20", record.frame === false && W === 20 && H === 20, { W, H, frame: record.frame });
    }

    // --- reachability on the shipped grid ---------------------------------------------------
    const reach = reachability(platform, ["o", "H", "F"]);
    check("every ring, the halfway gate and the finish are reachable from the start", reach.unreachable.length === 0 && reach.total === expected.R + 2, reach.unreachable.length ? reach.unreachable : { targets: reach.total, reachedCells: reach.reached });
  }

  // --- seeding ------------------------------------------------------------------------------
  console.log("\n# seeding");
  const seed = await page.evaluate(() => {
    const api = window.__GRAPHYSX__;
    for (const level of window.__GRAPHYSX_ARCHIVE__.levels) {
      // A previous run's localStorage would make this a no-op and hide a real failure.
      if (api.levels.get(level.id)) api.levels.remove(level.id);
    }
    const first = window.__GRAPHYSX_ARCHIVE__.seed(api);
    const second = window.__GRAPHYSX_ARCHIVE__.seed(api);
    const listed = api.levels.list().filter((s) => s.id.startsWith("archive-ballz-"));
    return { first, second, listed };
  });
  check("seed installs both levels", seed.first.seeded.length === 2 && seed.first.errors.length === 0, seed.first);
  check("seed is idempotent (never overwrites a visitor's edit)", seed.second.seeded.length === 0 && seed.second.skipped.length === 2, seed.second);
  check("both appear in the level library the Games shelf reads", seed.listed.length === 2, seed.listed.map((s) => `${s.id} ${s.width}x${s.height} rings=${s.counts.ring} start=${s.counts.start} finish=${s.counts.finish}`));

  // --- per level, in the runtime -------------------------------------------------------------
  for (const record of records) {
    console.log(`\n# ${record.id} — materialised`);
    const cellSize = record.cellSize;

    const built = await page.evaluate((id) => {
      const api = window.__GRAPHYSX__;
      const played = api.levels.play(id);
      if (!played.ok) return { playError: played.error };
      const ids = api.query({ tag: "ballz" }).map((e) => e.id);
      return {
        walls: ids.filter((i) => i.startsWith("ballz-wall-")).length,
        rings: ids.filter((i) => i.startsWith("ballz-ring-")).length,
        hasBall: ids.includes("ballz-ball"),
        hasStartPad: ids.includes("ballz-start-pad"),
        hasHalf: ids.includes("ballz-half-gate"),
        hasFinish: ids.includes("ballz-finish-gate"),
        // A goal you cannot find is not a goal. The materialiser spends its scarce emitter
        // budget on the finish first, and a level with 20 rings must not have starved it.
        hasFinishBeacon: ids.includes("ballz-finish-gate-glow"),
        hasHalfBeacon: ids.includes("ballz-half-gate-glow"),
        entities: api.state()?.entities.length ?? 0,
        rulesArmed: !!api.rules.status(),
        collectibleCount: api.rules.status()?.collectibleCount ?? 0,
        checkpointCount: api.rules.status()?.checkpointCount ?? 0,
      };
    }, record.id);
    check("materialises", !built.playError, built.playError ?? built.entities);
    const platformCounts = {};
    for (const ch of record.platformRows.join("")) platformCounts[ch] = (platformCounts[ch] ?? 0) + 1;
    check("one wall entity per wall tile", built.walls === platformCounts["#"], { entities: built.walls, tiles: platformCounts["#"] });
    check("twenty rings, a halfway gate, a finish gate, a ball and a start pad", built.rings === 20 && built.hasHalf && built.hasFinish && built.hasBall && built.hasStartPad, built);
    check("the rules block armed with 20 collectibles and one ordered checkpoint", built.rulesArmed && built.collectibleCount === 20 && built.checkpointCount === 1, { collectibles: built.collectibleCount, checkpoints: built.checkpointCount });
    check("both gates got a beacon out of the emitter budget", built.hasFinishBeacon && built.hasHalfBeacon, { finish: built.hasFinishBeacon, half: built.hasHalfBeacon });

    // --- does the ball rest on the floor, or fall through it? ------------------------------
    const rest = await page.evaluate(() => {
      const api = window.__GRAPHYSX__;
      api.pause(true);
      for (let i = 0; i < 240; i += 1) api.step(1 / 60);
      const ball = api.query({ ids: ["ballz-ball"] })[0];
      return { y: Number(ball.position[1].toFixed(3)) };
    });
    const radius = cellSize * 0.18;
    check("the ball comes to rest at its own radius above the floor", Math.abs(rest.y - radius) < 0.12, { restY: rest.y, radius: Number(radius.toFixed(3)) });

    // --- does a wall stop it, or does it tunnel? -------------------------------------------
    const wall = await page.evaluate((cs) => {
      const api = window.__GRAPHYSX__;
      const w = api.query({ tag: "wall" })[0];
      const [wx, , wz] = w.position;
      const wallHeight = cs * 0.62;
      api.update("ballz-ball", { transform: { position: [wx, wallHeight + 4, wz] } });
      for (let i = 0; i < 300; i += 1) api.step(1 / 60);
      return { y: Number(api.query({ ids: ["ballz-ball"] })[0].position[1].toFixed(3)), wallTop: Number(wallHeight.toFixed(3)) };
    }, cellSize);
    check("a wall stops the ball rather than being tunnelled through", wall.y > wall.wallTop * 0.7, wall);

    // --- containment, behaviourally --------------------------------------------------------
    // Fire the ball at the far corner of the arena hard enough to leave it if the frame were
    // not solid, then check it is still on the floor slab and at rest height.
    const contained = await page.evaluate(() => {
      const api = window.__GRAPHYSX__;
      const floor = api.query({ ids: ["ballz-floor"] })[0];
      const halfX = floor.geometry.width / 2;
      const halfZ = floor.geometry.depth / 2;
      const results = [];
      for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
        api.levels.play(api.state().world.id.replace("ballz-level-", ""));
        api.pause(true);
        const ball = api.query({ ids: ["ballz-ball"] })[0];
        // Full physics block, not a bare velocity: the resolver defaults every absent field, so
        // a partial patch would quietly turn the player into a static body.
        api.update("ballz-ball", {
          transform: { position: ball.position },
          physics: { mode: ball.physics.mode, mass: ball.physics.mass, material: ball.physics.material, linearVelocity: [sx * 40, 0, sz * 40] },
        });
        for (let i = 0; i < 600; i += 1) api.step(1 / 60);
        const after = api.query({ ids: ["ballz-ball"] })[0].position;
        results.push({
          dir: [sx, sz],
          inside: Math.abs(after[0]) < halfX && Math.abs(after[2]) < halfZ && after[1] > -1,
          pos: after.map((v) => Number(v.toFixed(2))),
        });
      }
      return { halfX: Number(halfX.toFixed(2)), halfZ: Number(halfZ.toFixed(2)), results };
    });
    check("the ball fired at 40 u/s into all four corners never leaves the arena", contained.results.every((r) => r.inside), contained.results);

    // --- can a person steer it? -------------------------------------------------------------
    await page.evaluate((id) => {
      const api = window.__GRAPHYSX__;
      api.levels.play(id);
      api.pause(true);
      for (let i = 0; i < 120; i += 1) api.step(1 / 60);
      window.__BEFORE__ = api.query({ ids: ["ballz-ball"] })[0].position.slice();
    }, record.id);
    await page.keyboard.press("ArrowUp");
    const steered = await page.evaluate(() => {
      const api = window.__GRAPHYSX__;
      for (let i = 0; i < 90; i += 1) api.step(1 / 60);
      const after = api.query({ ids: ["ballz-ball"] })[0].position;
      return { movedNorth: after[2] < window.__BEFORE__[2] - 0.2, before: window.__BEFORE__[2].toFixed(2), after: after[2].toFixed(2) };
    });
    check("a real ArrowUp keypress rolls the ball north", steered.movedNorth, steered);

    // --- is it actually completable? --------------------------------------------------------
    const run = await page.evaluate((id) => {
      const api = window.__GRAPHYSX__;
      api.levels.play(id);
      api.pause(true);
      const settle = (n) => { for (let i = 0; i < n; i += 1) api.step(1 / 60); };
      const teleport = (position) => {
        const ball = api.query({ ids: ["ballz-ball"] })[0];
        api.update("ballz-ball", {
          transform: { position },
          physics: { mode: ball.physics.mode, mass: ball.physics.mass, material: ball.physics.material, linearVelocity: [0, 0, 0] },
        });
        settle(12);
      };
      settle(60);

      // 1. The finish must NOT count before the rings and the halfway gate are in. This is the
      //    rule that makes twenty rings matter instead of being scenery.
      const finish = api.query({ ids: ["ballz-finish-gate"] })[0];
      teleport(finish.position);
      const earlyPhase = api.rules.status()?.phase;

      // 2. Collect all twenty rings by rolling the ball through each in turn.
      api.levels.play(id);
      api.pause(true);
      settle(60);
      const rings = api.query({ tag: "collectible" });
      for (const ring of rings) teleport(ring.position);
      const afterRings = api.rules.status();

      // 3. The ordered checkpoint, then the finish.
      const half = api.query({ ids: ["ballz-half-gate"] })[0];
      teleport(half.position);
      const afterHalf = api.rules.status();
      const gate = api.query({ ids: ["ballz-finish-gate"] })[0];
      teleport(gate.position);
      settle(30);
      const final = api.rules.status();

      return {
        earlyPhase,
        ringsSeen: rings.length,
        collected: afterRings?.collected.length ?? 0,
        checkpointAfterHalf: afterHalf?.checkpointIndex ?? -1,
        phase: final?.phase,
        elapsed: Number((final?.elapsedSeconds ?? 0).toFixed(2)),
        hiddenRings: api.query({ tag: "collectible" }).filter((r) => r.visible === false).length,
      };
    }, record.id);
    check("the finish does not count before the rings are collected", run.earlyPhase === "running", run.earlyPhase);
    check("all twenty rings collect and hide themselves", run.collected === 20 && run.hiddenRings === 20, { collected: run.collected, hidden: run.hiddenRings, seen: run.ringsSeen });
    check("the halfway gate registers as the ordered checkpoint", run.checkpointAfterHalf >= 1, run.checkpointAfterHalf);
    check("the level completes: rings, then halfway, then finish", run.phase === "complete", run);

    // --- is a recovered level an ordinary scene? --------------------------------------------
    const roundTrip = await page.evaluate(() => {
      const api = window.__GRAPHYSX__;
      const exported = api.export();
      const before = api.query({ tag: "ballz" }).length;
      const loaded = api.load(exported);
      if (!loaded.ok) return { loadError: loaded.error };
      const after = api.query({ tag: "ballz" }).length;
      return {
        before,
        after,
        rulesSurvived: !!api.rules.status(),
        collectibles: api.rules.status()?.collectibleCount ?? 0,
        finishIsTrigger: api.query({ ids: ["ballz-finish-gate"] })[0]?.physics?.mode === "trigger",
      };
    });
    check("survives export -> load with its rules intact", roundTrip.before === roundTrip.after && roundTrip.rulesSurvived && roundTrip.collectibles === 20 && roundTrip.finishIsTrigger, roundTrip);

    // --- what it looks like ------------------------------------------------------------------
    await page.evaluate((id) => {
      const api = window.__GRAPHYSX__;
      api.levels.play(id);
      api.pause(false);
    }, record.id);
    await page.waitForTimeout(1600);
    const shot = path.join(ART, `${record.id}.png`);
    await page.screenshot({ path: shot });
    console.log(`  shot  ${shot}`);
    // A second, clipped capture of the start corner. Both courses put the finish gate within a
    // couple of cells of the spawn — that is the archive's own lap geometry, not a mistake — so
    // this is the crop where "can a player tell the start pad and the goal apart?" is decided,
    // and the overview shot is too far out to answer it.
    const detail = path.join(ART, `${record.id}-start-corner.png`);
    await page.screenshot({ path: detail, clip: { x: 180, y: 330, width: 620, height: 340 } });
    console.log(`  shot  ${detail}`);
    const hud = await page.evaluate(() => document.querySelector(".gx-bz-status")?.textContent ?? null);
    check("the play HUD opens on a fresh run of this level", !!hud && hud.includes("0 / 20"), hud);
  }

  // The app probes a scene store at localhost:8788 on boot and the browser logs the refusal.
  // That is pre-existing product behaviour on a static/dev route with no store running (see
  // `browse-r1`: the store-backed browser mounts only when a store answers), not something this
  // module causes. Named and excluded rather than silently tolerated by dropping the assertion.
  const STORE_PROBE = /8788\/scenes|ERR_CONNECTION_REFUSED/;
  const unexpected = consoleErrors.filter((text) => !STORE_PROBE.test(text));
  check("no console errors beyond the known scene-store probe", unexpected.length === 0, unexpected.slice(0, 4));
  check("no page errors", pageErrors.length === 0, pageErrors.slice(0, 4));
} finally {
  if (page) await page.close().catch(() => {});
  await browser.close().catch(() => {});
}

console.log(`\n${failures.length === 0 ? "PASS" : `FAIL (${failures.length})`} — smoke-archive-levels`);
if (failures.length > 0) {
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
