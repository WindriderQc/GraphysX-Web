import { test } from "node:test";
import assert from "node:assert/strict";
import { importBrowserModule } from "./support/import-browser-module.mjs";
const { advanceBallsyFinishes, BALLSY_SPARKLE_SECONDS, ballsyFinishTime } = await importBrowserModule(new URL("../src/ballsy-finish.ts", import.meta.url));
const standing=(subjectId,phase,time)=>({subjectId,run:{phase,elapsedSeconds:time}});
test("individual finish starts once and remains while the other player races",()=>{
  const standings=[standing("p1","complete",61.234),standing("p2","running",61.3)];
  let finishes=advanceBallsyFinishes([],standings,1/60);
  assert.deepEqual(finishes,[{subjectId:"p1",elapsedSeconds:61.234,sparkleSeconds:0}]);
  finishes=advanceBallsyFinishes(finishes,standings,1);
  assert.equal(finishes[0].sparkleSeconds,1);
  finishes=advanceBallsyFinishes(finishes,standings,10);
  assert.equal(finishes[0].sparkleSeconds,BALLSY_SPARKLE_SECONDS);
  assert.equal(finishes[0].elapsedSeconds,61.234);
});
test("close finishes use authoritative sub-frame order and independently start both sparkles",()=>{
  const standings=[standing("p2","complete",61.231),standing("p1","complete",61.234)];
  const finishes=advanceBallsyFinishes([],standings,1/60);
  assert.deepEqual(finishes.map(f=>f.subjectId),["p2","p1"]);
  assert.ok(finishes.every(f=>f.sparkleSeconds===0));
  assert.notEqual(ballsyFinishTime(finishes[0].elapsedSeconds),ballsyFinishTime(finishes[1].elapsedSeconds));
});
test("pause freezes the sparkle; resume continues and rematch removes every stale finish",()=>{
  const standings=[standing("p1","complete",60)];
  const before=advanceBallsyFinishes(advanceBallsyFinishes([],standings,0),standings,.4);
  assert.deepEqual(advanceBallsyFinishes(before,standings,2,true),before);
  assert.equal(advanceBallsyFinishes(before,standings,.5)[0].sparkleSeconds,.9);
  assert.deepEqual(advanceBallsyFinishes(before,[standing("p1","running",0)],0),[]);
});
