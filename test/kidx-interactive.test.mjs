import { test } from "node:test";
import assert from "node:assert/strict";
import { createKidxCodeRunner, validateKidxCode, kidxMotorInput, readKidxCode, saveKidxCode, KIDX_CODE_STORAGE } from "../src/kidx-code.ts";
import { kidxWheelTravel } from "../src/kidx-rover-motion.ts";
import { kidxRayBox, kidxSensorReadings } from "../src/kidx-sensors.ts";
import { parseKidxBuildRequest } from "../src/kidx-build-actions.ts";
import { markKidxJourney, readKidxJourney } from "../src/kidx-journey.ts";
import { createEv3ProgramStore } from "../src/ev3-first-program.ts";

const move = { kind: "motors", left: 100, right: 100, seconds: .1 };
const storage = () => { const data = new Map(); return { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), data }; };
test("wheel odometry distinguishes reverse, differential turns, wraparound and lateral sliding", () => {
  assert.ok(kidxWheelTravel([0,0,0], [0,0,-1], 0, 0).left > 0);
  assert.ok(kidxWheelTravel([0,0,0], [0,0,1], 0, 0).right < 0);
  assert.equal(kidxWheelTravel([0,0,0], [1,0,0], 0, 0).left, 0);
  const turn = kidxWheelTravel([0,0,0], [0,0,0], 1, 359);
  assert.ok(turn.left > 0 && turn.right < 0 && turn.left < .1);
});
test("reverse survives the existing named library without changing legacy saves", () => {
  const store = createEv3ProgramStore(storage);
  assert.equal(store.save("Garage", ["backward", "stop"]).ok, true);
  const s = storage(), persistent = createEv3ProgramStore(() => s);
  persistent.save("Garage", ["backward", "stop"]);
  assert.deepEqual(persistent.read().value[0].blocks, ["backward", "stop"]);
});
test("code validation rejects unknown nodes, invalid values, excessive depth and size", () => {
  for (const value of [null, [{kind:"eval"}], [{...move,left:NaN}], [{...move,seconds:0}], Array(33).fill(move), [{kind:"repeat",count:2}], [{kind:"until",left:50,right:50,seconds:1,condition:{sensor:"unknown",operator:"lt",value:1}}]]) assert.equal(validateKidxCode(value), false);
  let nested = [move]; for (let i=0;i<5;i++) nested=[{kind:"repeat",count:2,body:nested}];
  assert.equal(validateKidxCode(nested), false);
  assert.equal(validateKidxCode([{kind:"repeat",count:3,body:[move]}]), true);
  assert.deepEqual(kidxMotorInput(100,-100), {thrust:0,turn:1});
});
test("repeat and conditions execute against live readings and stop motors when done", () => {
  let distance=20; const inputs=[], notes=[];
  const runner=createKidxCodeRunner(i=>inputs.push(i),()=>({distance,touch:0,color:0,angle:0}),m=>notes.push(m));
  runner.start([{kind:"repeat",count:2,body:[move]}, {kind:"if",condition:{sensor:"distance",operator:"lt",value:5},body:[{...move,left:-100,right:-100}],otherwise:[move]}]);
  runner.advance(.1); distance=3; runner.advance(.1);
  assert.deepEqual(inputs.at(-1), {thrust:-1,turn:0});
  runner.advance(.1); assert.equal(runner.state().running,false); assert.deepEqual(inputs.at(-1),{thrust:0,turn:0}); assert.equal(notes.length,1);
});
test("until uses a measured threshold, has a real timeout, and pause freezes instruction time", () => {
  let distance=10; const runner=createKidxCodeRunner(()=>{},()=>({distance,touch:0,color:0,angle:0}),()=>{});
  const until={kind:"until",left:50,right:50,seconds:.2,condition:{sensor:"distance",operator:"lt",value:5}};
  runner.start([until]); runner.advance(.1); runner.pause(); runner.advance(10); assert.equal(runner.state().elapsed,.1);
  distance=4;runner.resume();runner.advance(.05);assert.equal(runner.state().running,false);assert.equal(runner.state().error,null);
  distance=10;runner.start([until]);runner.advance(.1);runner.advance(.1);assert.match(runner.state().error,/capteur/);
});
test("single block execution pauses at the boundary and resumes at the next block", () => {
  const inputs=[]; const runner=createKidxCodeRunner(i=>inputs.push(i),()=>({distance:255,touch:0,color:0,angle:0}),()=>{});
  runner.start([move,{...move,left:-100,right:-100}],true);runner.advance(.1);assert.equal(runner.state().paused,true);
  runner.advance(.1); assert.equal(runner.state().total,.1);
  runner.resume(true);assert.deepEqual(inputs.at(-1),{thrust:-1,turn:0}); runner.advance(.1);runner.resume();assert.equal(runner.state().running,false);
});
test("saved code rejects corrupt/future data and preserves durable data on failure", () => {
  const s=storage(); assert.equal(saveKidxCode(s,[move]),null); assert.deepEqual(readKidxCode(s),[move]);
  s.setItem(KIDX_CODE_STORAGE,'{"version":2}'); const before=s.getItem(KIDX_CODE_STORAGE);
  assert.notEqual(saveKidxCode(s,[move]),null);assert.equal(s.getItem(KIDX_CODE_STORAGE),before);assert.throws(()=>readKidxCode(s));
  const blocked={getItem:()=>null,setItem:()=>{throw Error("quota");}};assert.notEqual(saveKidxCode(blocked,[move]),null);
});
test("sensor ray follows rotated obstacle geometry and color sampling", () => {
  const box={position:[0,0,-10],rotationDegrees:[0,90,0],geometry:{width:6,depth:2},scale:[1,1,1]};
  assert.equal(kidxRayBox([0,0],[0,-1],box),7);
  assert.equal(kidxRayBox([4,0],[0,-1],box),null);
  const rover={position:[0,1,0],steering:{headingDegrees:0}};
  const blue={...box,position:[0,0,-1.95],rotationDegrees:[0,0,0],tags:["kidx-color","kidx-color:2"]};
  assert.equal(kidxSensorReadings(rover,[blue]).color,2);
  const target={...box,visible:true,tags:["kidx-sensed"]};assert.ok(kidxSensorReadings(rover,[target]).distance<20);
});
test("French Nestor requests select explicit build actions", () => {
  assert.deepEqual(parseKidxBuildRequest("Montre-moi dessous"),{action:"underside"});
  assert.deepEqual(parseKidxBuildRequest("Étape 8"),{action:"step",value:7});
  assert.equal(parseKidxBuildRequest("Vue éclatée").action,"explode");
  assert.deepEqual(parseKidxBuildRequest("montre le moteur"),{action:"piece",search:"moteur"});
});
test("journey records are durable and unknown formats are not overwritten", () => {
  const s=storage();assert.equal(markKidxJourney(s,"missions","cargo-push"),true);assert.ok(readKidxJourney(s).missions["cargo-push"]>0);
  const [key]=s.data.keys();s.setItem(key,'{"version":2}');assert.equal(markKidxJourney(s,"builds","track3r"),false);assert.equal(s.getItem(key),'{"version":2}');
});
