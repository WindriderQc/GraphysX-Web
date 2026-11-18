import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { before, after, test } from "node:test";
import { build } from "vite";
let outDir, AgentWorldRuntime;
before(async () => {
  outDir = mkdtempSync(join(tmpdir(), "graphysx-live-steering-"));
  const root=fileURLToPath(new URL("../",import.meta.url));
  await build({configFile:join(root,"vite.world-service.config.ts"),root,build:{outDir,emptyOutDir:true},logLevel:"silent"});
  ({AgentWorldRuntime}=await import(pathToFileURL(join(outDir,"world.js")).href));
});
after(() => {
  if(!outDir) return;
  const target=resolve(outDir), temporary=resolve(tmpdir()), inside=relative(temporary,target);
  assert.ok(inside && !inside.startsWith("..") && !inside.includes(":"));
  rmSync(target,{recursive:true,force:true});
});
function scene() {
  return {schema:"graphysx.agent-world/v2",id:"steer-live-test",label:"Live steering test",
    environment:{physics:{gravity:[0,0,0]}},entities:[
      {id:"ball",type:"sphere",geometry:{radius:.65},physics:{mode:"dynamic",mass:1.7},steering:{force:28,speedCap:8,headingDegrees:270}},
      {id:"plain",type:"box"}
    ]};
}
const state = runtime => ({entities:runtime.query({}), revision:runtime.getState().revision, history:runtime.history.length, redo:runtime.redoHistory.length, events:runtime.readEvents()});
test("live steering matches transactional steering receipts and actual Rapier motion", () => {
  const live=new AgentWorldRuntime(scene()), document=new AgentWorldRuntime(scene());
  const initial=state(live);
  for(let frame=0;frame<120;frame++) {
    const input={headingDegrees:frame*3-180,thrust:frame<90?.7:-.4,turn:Math.sin(frame/10)};
    const a=live.steerLive("ball",input),b=document.steer("ball",input);
    assert.equal(a.ok,true);assert.equal(b.ok,true);assert.deepEqual(a.value,b.value);
    live.step(1/60);document.step(1/60);
  }
  assert.deepEqual(live.query({ids:["ball"]}),document.query({ids:["ball"]}));
  assert.notDeepEqual(live.query({ids:["ball"]})[0].position,[0,0,0]);
  assert.equal(live.getState().revision,initial.revision);
  assert.equal(live.history.length,initial.history);
  assert.equal(live.redoHistory.length,initial.redo);
  assert.ok(document.getState().revision>initial.revision,"Existing steer remains transactional");
});
test("invalid live inputs never partially mutate heading, physics, history or events", () => {
  const runtime=new AgentWorldRuntime(scene());
  for(const input of [null,[],{headingDegrees:90,thrust:NaN},{headingDegrees:45,turn:Infinity},{headingDegrees:90,thrust:"1"},
    {headingDegrees:45,kick:1},{headingDegrees:45,jump:1},{headingDegrees:45,speedCap:20},{headingDegrees:Infinity}]) {
    const before=state(runtime);
    assert.equal(runtime.steerLive("ball",input).ok,false,JSON.stringify(input));
    assert.deepEqual(state(runtime),before);
  }
  for(const id of ["missing","plain",null,""]) {
    const before=state(runtime);assert.equal(runtime.steerLive(id,{headingDegrees:90}).ok,false);assert.deepEqual(state(runtime),before);
  }
});
test("live steering preserves namespace and scoped-transient protections", () => {
  const runtime=new AgentWorldRuntime(scene());
  const transient=id=>({id,type:"sphere",ephemeral:true,physics:{mode:"dynamic"},steering:{force:20}});
  const created=runtime.reconcileTransientEntities("live-test",[transient("live-agent:test"),transient("ordinary-transient")]);
  assert.equal(created.ok,true,created.error);
  for(const id of ["live-agent:test","live-mission:missing","live-nestor:missing","ordinary-transient"]) {
    const before=state(runtime);const result=runtime.steerLive(id,{headingDegrees:90,thrust:1});
    assert.equal(result.ok,false);assert.deepEqual(state(runtime),before);
  }
});
test("continuous-only live inputs clamp and normalize like existing steering without events", () => {
  const runtime=new AgentWorldRuntime(scene()), before=state(runtime);
  const result=runtime.steerLive("ball",{headingDegrees:-450,thrust:3,turn:-3});
  assert.equal(result.ok,true);
  assert.equal(result.value.headingDegrees,270);assert.equal(result.value.thrust,1);assert.equal(result.value.turn,-1);
  assert.equal(result.value.kicked,0);assert.equal(result.value.jumped,0);
  assert.deepEqual(runtime.readEvents(),before.events);assert.equal(runtime.getState().revision,before.revision);
  assert.equal(runtime.history.length,before.history);
});

test("public API exposes live steering without changing transactional steer routing", () => {
  const api=readFileSync(new URL("../src/agent-world-api.ts",import.meta.url),"utf8");
  assert.match(api,/steerLive: \(id, input\) => runtime\.steerLive\(id, input\)/);
  assert.match(api,/steer: \(id, input\) => runtime\.steer\(id, input\)/);
  const main=readFileSync(new URL("../src/ballsy-main.ts",import.meta.url),"utf8");
  assert.match(main,/api\.steerLive\(player\.id, drive\)/);
});

const vehicle = () => ({ radius:.372, suspensionRestLength:.25, suspensionStiffness:30, suspensionCompression:4.4, suspensionRelaxation:2.3, maxSuspensionTravel:.3, maxSuspensionForce:9000, frictionSlip:1.2, engineForce:3000, brakeForce:2000, maxSteerDegrees:45, steerRateDegrees:600, maxSpeed:24,
  wheels:[-1,1].flatMap(x=>[-1.25,1.425].map(z=>({entityId:`tire-${x+1}-${z<0?"f":"r"}`,connection:[x*.8,-.25,z],steer:z<0,driven:z>0,brake:z>0}))) });
function vehicleScene() {
  return {schema:"graphysx.agent-world/v2",id:"vehicle-test",label:"Vehicle test",environment:{physics:{gravity:[0,-9.81,0],ground:false}},entities:[
    {id:"ground",type:"box",geometry:{width:500,height:.4,depth:500},transform:{position:[0,-.2,0]},physics:{mode:"static"}},
    {id:"chassis",type:"box",geometry:{width:1.8,height:.7,depth:4.4},transform:{position:[0,1,0]},physics:{mode:"dynamic",mass:1500},steering:{vehicle:vehicle()}},
    ...vehicle().wheels.map(w=>({id:w.entityId,type:"cylinder",geometry:{radius:.372,height:.345},transform:{position:w.connection}}))]};
}
test("vehicle controls, four wheel projections, export/reload and paused teleport use the canonical runtime", () => {
  const runtime=new AgentWorldRuntime(vehicleScene());
  try {
    runtime.step(3);
    assert.equal(runtime.steerLive("chassis",{thrust:1,turn:0,brake:0}).ok,true);
    runtime.step(2);
    const car=runtime.query({ids:["chassis"]})[0];
    assert.ok(car.position[2]<-3); assert.equal(car.steering.vehicle.wheels.filter(w=>w.contact).length,4);
    assert.equal(runtime.steerLive("chassis",{headingDegrees:90,thrust:0}).ok,false);
    assert.equal(runtime.query({ids:["chassis"]})[0].steering.thrust,1,"Invalid heading never partially writes throttle");
    assert.equal(runtime.steerLive("chassis",{thrust:0,turn:0,brake:1}).ok,true); runtime.step(1);
    const document=runtime.exportDocument();
    const authored=document.entities.find(e=>e.id==="chassis").steering;
    assert.equal(authored.vehicle.wheels.length,4);
    for(const key of ["thrust","turn","brake"]) assert.equal(Object.hasOwn(authored,key),false,"Never reload a held key");
    const copy=new AgentWorldRuntime(document);
    assert.equal(copy.query({ids:["chassis"]})[0].steering.brake,0); copy.dispose();
    runtime.setPaused(true);
    assert.equal(runtime.updateEntity("chassis",{transform:{position:[20,5,10],rotationDegrees:[0,90,0]}}).ok,true);
    const pausedTime=runtime.getClock().elapsedSeconds;
    for(const wheel of runtime.query({ids:vehicle().wheels.map(w=>w.entityId)})) assert.ok(Math.hypot(wheel.position[0]-20,wheel.position[2]-10)<2,"Paused teleport projects wheels from the current chassis, not cached ray origins");
    assert.equal(runtime.getClock().elapsedSeconds,pausedTime,"Visual edit spends no simulation time");
    assert.equal(runtime.updateEntity("chassis",{steering:{vehicle:null}}).ok,true);
    assert.equal(runtime.query({ids:["chassis"]})[0].steering.vehicle,undefined);
  } finally {runtime.dispose();}
});

test("vehicle wheel references cannot cross the host transient boundary", () => {
  const runtime=new AgentWorldRuntime(scene()), config=vehicle();
  config.wheels[0].entityId="live-agent:protected";
  const before=state(runtime);
  assert.equal(runtime.updateEntity("ball",{steering:{vehicle:config}}).ok,false);
  assert.deepEqual(state(runtime),before); runtime.dispose();
});
