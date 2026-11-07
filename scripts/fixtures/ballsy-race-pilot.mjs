// Browser QA only: synthetic standard Gamepad API devices feed the same input reader
// as physical pads. The pilot never moves bodies, awards gates or writes race state.
export async function installBallsyRacePads(page) {
  await page.addInitScript(() => {
    window.ballsyQaPads = [0, 1].map(index => ({ index, connected: true,
      mapping: "standard", id: `QA standard controller ${index}`, axes: [0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) }));
    Object.defineProperty(navigator, "getGamepads", { value: () => window.ballsyQaPads });
  });
}

export async function prepareBallsyRacePilot(page, branches = ["main", "shortcut"]) {
  return page.evaluate(branches => {
    const course = window.__BALLSY__.course();
    const paths = branches.map(branch => Array.from({ length: 64 }, (_, i) => {
      const t = ((i + 1) / 64) % 1;
      const samples = branch === "shortcut" && t >= course.fork.start && t <= course.fork.end
        ? course.shortcut : course.main;
      const p = samples.reduce((best, p) => Math.abs(p.t - t) < Math.abs(best.t - t) ? p : best, samples[0]);
      return [p.x, p.z];
    }));
    window.ballsyQaPilot = { paths, frames: 0, trace: [], jumps: [], visibility: [], minimumSeparation: Infinity, maximumSeparation: 0 };
    return { branches, paths, speedCap: 3.5,
      method: "Geometric look-ahead controller from smoke-ballsy-loop; actual Gamepad axes/brake and native advanceTime physics only" };
  }, branches);
}

export async function driveBallsyRace(page, { maxFrames = 18000, stopOnFirstFinish = false, closeFinish = false } = {}) {
  return page.evaluate(({ maxFrames, stopOnFirstFinish, closeFinish }) => {
    const pilot = window.ballsyQaPilot;
    let state = window.__BALLSY__.state();
    const completedAtStart = state.players.filter(p => p.run.phase === "complete").length;
    for (let frame = 0; frame < maxFrames; frame++) {
      state.players.forEach((p, i) => {
        const pad = window.ballsyQaPads[i];
        if (p.run.phase === "complete") { pad.axes = [0, 0]; pad.buttons[0] = { pressed: false, value: 0 }; return; }
        const path = pilot.paths[i];
        let nearest = 0, nearestDistance = Infinity;
        path.forEach((q, index) => { const d = Math.hypot(q[0] - p.position[0], q[1] - p.position[2]); if (d < nearestDistance) { nearestDistance = d; nearest = index; } });
        let next = (nearest + 1) % path.length, target = path[next];
        let dx = target[0] - p.position[0], dz = target[1] - p.position[2];
        const previous = path[(next + path.length - 1) % path.length];
        const passed = (p.position[0] - target[0]) * (target[0] - previous[0]) + (p.position[2] - target[1]) * (target[1] - previous[1]) > 0;
        if (Math.hypot(dx, dz) < 1.1 || (passed && Math.hypot(dx, dz) < 4)) {
          next = (next + 1) % path.length; target = path[next];
          dx = target[0] - p.position[0]; dz = target[1] - p.position[2];
        }
        const distance = Math.max(.01, Math.hypot(dx, dz));
        let desired = Math.min(3.5, Math.max(1.7, distance * 1.5));
        // Explicit close-finish fixture: the leading controller eases off proportionally
        // on the final approach, using stick counter-steering to wait for the other racer.
        // This changes only its input, never the game's speed cap, bodies or standings.
        const other = state.players[1 - i];
        const coordinating = closeFinish && p.run.progress > 1.75 && other.run.phase !== "complete";
        if (coordinating) desired = Math.min(desired, Math.max(0, 3.5 - Math.max(0, p.run.progress - other.run.progress) * 180));
        const brake = !coordinating && Math.hypot(p.velocity[0], p.velocity[2]) > desired + 1;
        pad.buttons[0] = { pressed: brake, value: Number(brake) };
        pad.axes = [(dx / distance * desired - p.velocity[0]) * .24, (dz / distance * desired - p.velocity[2]) * .24];
      });
      const previous = state; state = window.advanceTime(1000 / 60); pilot.frames++;
      state.players.forEach((p, i) => {
        const distance = Math.hypot(...p.position.map((value, axis) => value - previous.players[i].position[axis]));
        if (distance > .8) pilot.jumps.push({ frame: pilot.frames, slot: i, distance });
      });
      const separation = Math.hypot(...state.players[0].position.map((v, i) => v - state.players[1].position[i]));
      pilot.minimumSeparation = Math.min(pilot.minimumSeparation, separation);
      pilot.maximumSeparation = Math.max(pilot.maximumSeparation, separation);
      if (pilot.frames % 60 === 0) {
        pilot.trace.push({ frame: pilot.frames, players: state.players.map(p => ({ position: p.position, run: p.run })) });
        const camera = window.__GRAPHYSX_HOST__.camera;
        camera.updateMatrixWorld();
        pilot.visibility.push({ frame: pilot.frames, players: state.players.map(p => {
          const position = camera.position.clone().fromArray(p.position).project(camera);
          return { id: p.id, ndc: position.toArray(), inFrame: Math.abs(position.x) < 1 && Math.abs(position.y) < 1 && position.z > -1 && position.z < 1 };
        }) });
      }
      if (state.phase === "results") return { ...pilot, reason: "results", state };
      if (stopOnFirstFinish && state.players.filter(p => p.run.phase === "complete").length > completedAtStart)
        return { ...pilot, reason: "first-finish", state };
    }
    return { ...pilot, reason: "frame-budget", state };
  }, { maxFrames, stopOnFirstFinish, closeFinish });
}
