import { test } from "node:test";
import assert from "node:assert/strict";
import { importBrowserModule } from "./support/import-browser-module.mjs";
const { ballsyVelocityBrake } = await importBrowserModule(new URL("../src/ballsy-brake.ts", import.meta.url));
const { readBallsyDrive } = await importBrowserModule(new URL("../src/ballsy-input.ts", import.meta.url));

test("brake always opposes live velocity, regardless of the racer's former heading",()=>{
  for(const velocity of [[8,0,0],[-8,0,0],[0,0,8],[0,0,-8],[4,2,-5]]) {
    const input=ballsyVelocityBrake(velocity,28,1.7),angle=input.headingDegrees*Math.PI/180;
    const force=[Math.sin(angle)*input.thrust,-Math.cos(angle)*input.thrust];
    assert.ok(force[0]*velocity[0]+force[1]*velocity[2]<0);
    assert.equal(input.turn,0);
    assert.ok(input.thrust>=-1&&input.thrust<0);
  }
});
test("brake effort tapers to zero instead of reversing and can brake a later physical nudge",()=>{
  const gentle=ballsyVelocityBrake([.1,0,0],28,1.7);
  assert.ok(gentle.thrust<0&&gentle.thrust>-.05);
  assert.deepEqual(ballsyVelocityBrake([0,0,0],28,1.7),{thrust:0,turn:0});
  assert.deepEqual(ballsyVelocityBrake([.01,0,.01],28,1.7),{thrust:0,turn:0});
  assert.notEqual(ballsyVelocityBrake([0,0,.3],28,1.7).thrust,0);
  assert.deepEqual(ballsyVelocityBrake([4,0,0],0,1.7),{thrust:0,turn:0});
});
test("held keyboard and controller brake requests never apply reverse force at rest",()=>{
  const pad={index:0,connected:true,mapping:"standard",id:"test",axes:[1,0],buttons:[{pressed:true,value:1}]};
  for(let frame=0;frame<180;frame++)for(const [slot,keys,controller] of [[0,new Set(["Space"]),null],[1,new Set(["ShiftLeft"]),null],[1,new Set(["ShiftRight"]),null],[0,new Set(),pad]]) {
    const requested=readBallsyDrive(slot,keys,controller);
    assert.equal(requested.thrust,-1,"raw input contract remains unchanged");
    assert.deepEqual(ballsyVelocityBrake([0,0,0],28,1.7),{thrust:0,turn:0});
  }
});
