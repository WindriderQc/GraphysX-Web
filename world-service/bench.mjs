#!/usr/bin/env node
// CPU cost of the headless island: ms per 1/60 s tick with N wandering agents, and the size of
// one spectator pose frame and one observation. Build first: npm run build:world-service
//   node world-service/bench.mjs 1 4 8 16
const { IslandWorld } = await import(new URL("./dist/world.js", import.meta.url).href);

const counts = process.argv.slice(2).map(Number).filter((n) => n > 0);
for (const agents of counts.length ? counts : [1, 4, 8, 16]) {
  const world = new IslandWorld();
  const sessions = Array.from({ length: agents }, (_, index) => world.join(`agent-${index}`).session);
  world.advance(2);
  let seed = 7;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const ticks = 60 * 60; // one simulated minute
  const started = performance.now();
  for (let tick = 0; tick < ticks; tick += 1) {
    if (tick % 120 === 0) {
      for (const session of sessions) world.apply(session, { type: "MoveTo", data: { position: [random() * 80 - 40, 3, random() * 80 - 40] } });
    }
    world.step();
  }
  const msPerTick = (performance.now() - started) / ticks;
  const frameBytes = Buffer.byteLength(JSON.stringify(world.poseFrame()));
  const observeBytes = Buffer.byteLength(JSON.stringify(world.observe(sessions[0])));
  const snapshotBytes = Buffer.byteLength(JSON.stringify(world.snapshot()));
  console.log(JSON.stringify({ agents, msPerTick: +msPerTick.toFixed(3), coreShareAt60Hz: `${(msPerTick * 6).toFixed(1)}%`, frameBytes, spectatorKBpsAt10Hz: +(frameBytes * 10 / 1024).toFixed(1), observeBytes, snapshotBytes }));
}
