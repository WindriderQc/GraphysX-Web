import { test } from "node:test";
import assert from "node:assert/strict";
import { importBrowserModule } from "./support/import-browser-module.mjs";
const { createVolcanoRun, advanceVolcanoRun, volcanoStandings, VOLCANO_RACE_STEP: dt } = await importBrowserModule(new URL("../src/ballsy-race.ts", import.meta.url));
const { coursePoint, COURSE_FORK, nearestCourse } = await importBrowserModule(new URL("../src/ballsy-course.ts", import.meta.url));
const pose = (t, branch = "main") => { const p = coursePoint(t, branch); return [p.x, p.y + .65, p.z]; };
const begin = () => createVolcanoRun(pose(-.01));
function drive(run, from, to, branch = "main") {
  const n = Math.ceil(Math.abs(to - from) / .0005);
  for (let i = 1; i <= n; i++) {
    const t = from + (to - from) * i / n;
    assert.equal(advanceVolcanoRun(run, pose(t, branch), dt), null, `Unexpected recovery at ${t} (${branch})`);
  }
}
test("two complete forward laps on the main route; first start crossing is not a lap", () => {
  const run = begin();
  drive(run, -.01, .01);
  assert.equal(run.lap, 0);
  drive(run, .01, 1.01);
  assert.equal(run.lap, 1);
  assert.equal(run.phase, "running");
  drive(run, 1.01, 2.01);
  assert.equal(run.lap, 2);
  assert.equal(run.phase, "complete");
  assert.equal(run.progress, 2);
  const finish = run.elapsedSeconds;
  advanceVolcanoRun(run, pose(.1), dt);
  assert.equal(run.elapsedSeconds, finish);
});
test("the shortcut rejoins with identical progress and completes both laps", () => {
  const run = begin();
  drive(run, -.01, COURSE_FORK.start, "main");
  drive(run, COURSE_FORK.start, COURSE_FORK.end - .03, "shortcut");
  assert.equal(run.branch, "shortcut");
  drive(run, COURSE_FORK.end - .03, 2.01, "shortcut");
  assert.equal(run.phase, "complete");
  assert.equal(run.rescues, 0);
});
test("reverse start crossings, parking and a skipped lap never award a lap", () => {
  const run = begin();
  drive(run, -.01, .01);
  drive(run, .01, -.01);
  assert.equal(run.wrongWay, true);
  for (let i = 0; i < 20; i++) advanceVolcanoRun(run, pose(-.01), dt);
  assert.equal(run.lap, 0);
  assert.equal(run.nextGate, 1);
  advanceVolcanoRun(run, pose(.8), dt);
  assert.equal(run.lap, 0);
  assert.equal(run.nextGate, 1);
});
test("teleport rejected until recovery, no progress gift and no rewound time", () => {
  const run = begin();
  drive(run, -.01, .1);
  const before = run.progress, time = run.elapsedSeconds;
  let recovery;
  for (let i = 0; i < 48; i++) recovery = advanceVolcanoRun(run, pose(.7), dt);
  assert.ok(recovery);
  assert.equal(run.rescues, 1);
  assert.ok(run.progress <= before + 1e-10);
  assert.ok(Math.abs(run.elapsedSeconds - time - .8) < 1e-8);
  assert.equal(advanceVolcanoRun(run, recovery.position, dt), null);
});
test("fall recovery and restart clear only the appropriate race state", () => {
  const run = begin();
  drive(run, -.01, .2);
  let recovery;
  const p = pose(.2); p[1] = -10;
  for (let i = 0; i < 48; i++) recovery = advanceVolcanoRun(run, p, dt);
  assert.ok(recovery);
  assert.equal(run.rescues, 1);
  assert.equal(begin().rescues, 0);
  assert.equal(begin().elapsedSeconds, 0);
});
test("close finishes sort by sub-frame line crossing, not player enumeration", () => {
  const first = begin(), second = begin();
  drive(first, -.01, 1.9998); drive(second, -.01, 1.9999);
  first.elapsedSeconds = second.elapsedSeconds = 60;
  advanceVolcanoRun(first, pose(2.0001), dt);
  advanceVolcanoRun(second, pose(2.0002), dt);
  assert.equal(first.phase, "complete"); assert.equal(second.phase, "complete");
  assert.ok(second.elapsedSeconds < first.elapsedSeconds);
  assert.equal(volcanoStandings([{id:"first",name:"First"},{id:"second",name:"Second"}], [first,second])[0].subjectId, "second");
});
test("reverse finish at the end of lap one cannot finish early or duplicate checkpoints", () => {
  const run = begin();
  drive(run, -.01, 1.01);
  const next = run.nextGate;
  drive(run, 1.01, .98);
  assert.equal(run.lap, 1);
  assert.equal(run.phase, "running");
  assert.equal(run.nextGate, next);
  drive(run, .98, 1.01);
  assert.equal(run.lap, 1);
  assert.equal(run.nextGate, next);
});
test("crossing between separated branches does not transfer progress or branch", () => {
  for (const branch of ["main", "shortcut"]) {
    const run = begin();
    const middle = (COURSE_FORK.start + COURSE_FORK.end) / 2;
    drive(run, -.01, middle, branch);
    assert.equal(run.branch, branch);
    const before = run.progress, next = run.nextGate;
    const other = pose(middle, branch === "main" ? "shortcut" : "main");
    let recovery;
    for (let i = 0; i < 48; i++) recovery = advanceVolcanoRun(run, other, dt);
    assert.ok(recovery);
    assert.equal(run.branch, branch);
    assert.ok(run.progress <= before + 1e-10);
    assert.equal(run.nextGate, next);
  }
});
test("repeated recoveries preserve ordered gates and do not improve position or clock", () => {
  const run = begin();
  drive(run, -.01, .33);
  const progress = run.progress, next = run.nextGate, time = run.elapsedSeconds;
  for (let recoveryCount = 1; recoveryCount <= 4; recoveryCount++) {
    let recovery;
    for (let i = 0; i < 48; i++) recovery = advanceVolcanoRun(run, [100, -10, 100], dt);
    assert.ok(recovery);
    assert.equal(run.rescues, recoveryCount);
    assert.equal(run.nextGate, next);
    assert.ok(run.progress <= progress + 1e-10);
    advanceVolcanoRun(run, recovery.position, dt);
  }
  assert.ok(Math.abs(run.elapsedSeconds - time - 4 * (0.8 + dt)) < 1e-8);
});
test("shortcut endpoint hands back to main without a stranded endpoint projection", () => {
  const run = begin();
  drive(run, -.01, COURSE_FORK.end - .001, "shortcut");
  const stop = pose(COURSE_FORK.end, "shortcut");
  drive(run, COURSE_FORK.end - .001, COURSE_FORK.end, "shortcut");
  for (let i = 0; i < 120; i++) assert.equal(advanceVolcanoRun(run, stop, dt), null);
  drive(run, COURSE_FORK.end, COURSE_FORK.end + .04);
  assert.equal(run.branch, "main");
  assert.ok(run.progress > COURSE_FORK.end + .039);
});
test("off-centre continuous driving through the wide fork does not look like a teleport", () => {
  const run = begin();
  const from = COURSE_FORK.start - .04, to = COURSE_FORK.end + .04;
  const steps = Math.ceil((to - from) / .0005);
  drive(run, -.01, from);
  let last = from;
  for (let i = 1; i <= steps; i++) {
    const t = from + (to - from) * i / steps, p = coursePoint(t);
    const lateral = -2.3 * Math.min(1, i / 60);
    const position = [p.x + p.tz * lateral, p.y + p.bank * lateral + .65, p.z - p.tx * lateral];
    assert.equal(advanceVolcanoRun(run, position, dt), null, `Spurious fork recovery at ${t}`);
    last = t;
  }
  assert.equal(run.branch, "main");
  assert.ok(Math.abs(run.progress - last) < .003);
  assert.equal(run.rescues, 0);
});
test("recovery after reversing along an edge never respawns ahead of current progress", () => {
  const run = begin();
  drive(run, -.01, .2);
  const edgePose = (t, fraction=1) => {
    const p=coursePoint(t), lateral=(p.width/2-.15)*fraction;
    return [p.x+p.tz*lateral,p.y+p.bank*lateral+.65,p.z-p.tx*lateral];
  };
  for(let i=1;i<=60;i++) advanceVolcanoRun(run,edgePose(.2,i/60),dt);
  for(let i=1;i<=40;i++) advanceVolcanoRun(run,edgePose(.2-i*.0005),dt);
  const progress=run.progress;
  let recovery;
  const fall=edgePose(.18);fall[1]=-10;
  for(let i=0;i<48;i++) recovery=advanceVolcanoRun(run,fall,dt);
  assert.ok(recovery);
  assert.ok(recovery.progress <= progress+1e-10);
  assert.equal(advanceVolcanoRun(run,recovery.position,dt),null);
  assert.ok(run.progress <= progress+1e-10);
});
test("pinning requires sustained directional input; parking and braking never auto-rescue", () => {
  const run=begin();
  drive(run,-.01,.1);
  const stop=pose(.1);
  for(let i=0;i<180;i++) assert.equal(advanceVolcanoRun(run,stop,dt,{tryingToMove:false}),null);
  let recovery;
  for(let i=0;i<60;i++) recovery=advanceVolcanoRun(run,stop,dt,{tryingToMove:true});
  assert.ok(recovery);
  assert.equal(run.rescues,1);
  assert.ok(run.progress<=.10001);
});
test("driving continuously across the gap between branches recovers without a branch transfer", () => {
  const run=begin(), middle=(COURSE_FORK.start+COURSE_FORK.end)/2;
  drive(run,-.01,middle);
  const from=pose(middle), to=pose(middle,"shortcut");
  let expectedNextGate=run.nextGate, leftRoad=false;
  const steps=Math.ceil(Math.hypot(to[0]-from[0],to[2]-from[2])/.08);
  let recovery;
  for(let i=1;i<=steps;i++) {
    const position=from.map((v,k)=>v+(to[k]-v)*i/steps);
    const mainProjection=nearestCourse(position,"main");
    // This attack is oblique, not perpendicular to the curved road. Its on-road
    // approach may legally cross a gate before reaching the edge. Only those
    // physical crossings count; the following gap must award no progress/gates.
    if(mainProjection.distance > mainProjection.width/2+.55) leftRoad=true;
    if(!leftRoad && mainProjection.distance <= mainProjection.width/2) {
      expectedNextGate=Math.max(expectedNextGate,Math.floor(mainProjection.t*32)+1);
    }
    const beforeProgress=run.progress;
    recovery=advanceVolcanoRun(run,position,dt);
    assert.equal(run.branch,"main");
    assert.equal(run.nextGate,expectedNextGate);
    if(leftRoad) assert.ok(run.progress <= beforeProgress+1e-10,"Gap cannot award longitudinal progress");
    if(recovery) break;
  }
  assert.equal(leftRoad,true);
  assert.ok(recovery,"Gap crossing must trigger a recovery, not accept the other branch");
});
test("teleporting to successive checkpoint positions cannot substitute for traversing the road", () => {
  const run=begin();
  for(let gate=1;gate<=64;gate++) {
    advanceVolcanoRun(run,pose(gate/32),dt);
    assert.equal(run.nextGate,1);
    assert.equal(run.lap,0);
    assert.equal(run.phase,"running");
  }
});
