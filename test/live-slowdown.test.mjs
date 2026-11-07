import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { before, after, test } from "node:test";
import { build } from "vite";
let outDir, AgentWorldRuntime;
before(async()=>{
  outDir=mkdtempSync(join(tmpdir(),"graphysx-live-slowdown-"));
  const root=fileURLToPath(new URL("../",import.meta.url));
  await build({configFile:join(root,"vite.world-service.config.ts"),root,build:{outDir,emptyOutDir:true},logLevel:"silent"});
  ({AgentWorldRuntime}=await import(pathToFileURL(join(outDir,"world.js")).href));
});
after(()=>{
  if(!outDir)return;
  const target=resolve(outDir),inside=relative(resolve(tmpdir()),target);
  assert.ok(inside&&!inside.startsWith("..")&&!inside.includes(":"));rmSync(target,{recursive:true,force:true});
});
const scene=()=>({schema:"graphysx.agent-world/v2",id:"live-slowdown-test",label:"Live slowdown test",
  environment:{physics:{gravity:[0,0,0]}},entities:[
    {id:"ball",type:"sphere",geometry:{radius:.65},transform:{position:[0,20,0]},physics:{mode:"dynamic",mass:1.7,linearVelocity:[8,3,0],angularVelocity:[1,2,3]},steering:{force:28,speedCap:8,headingDegrees:90}},
    {id:"plain",type:"box"},{id:"static",type:"box",physics:{mode:"static"}}
  ]});
const state=r=>({entities:r.query({}),revision:r.getState().revision,history:r.history.length,redo:r.redoHistory.length,events:r.readEvents()});
const ball=r=>r.query({ids:["ball"]})[0];

test("live slowdown performs smooth actual Rapier damping, preserves body/y/spin and never writes history",()=>{
  const slow=new AgentWorldRuntime(scene()),control=new AgentWorldRuntime(scene());
  const initial=state(slow),body=slow.hostBody("ball"),document=slow.exportDocument();
  assert.deepEqual(slow.setSlowdownLive("ball",.75).value,{subjectId:"ball",speedFactor:.75});
  assert.deepEqual(slow.exportDocument(),document);
  slow.step(1/60);control.step(1/60);
  assert.ok(ball(slow).physics.linearVelocity[0]<8&&ball(slow).physics.linearVelocity[0]>6);
  for(let i=1;i<120;i++){slow.setSlowdownLive("ball",.75);slow.step(1/60);control.step(1/60);}
  // Both bodies coast under the same ordinary Rapier damping. The slime case
  // must brake more, while the separate thrust test below checks the 6 m/s cap.
  assert.ok(ball(slow).physics.linearVelocity[0]<ball(control).physics.linearVelocity[0],"Slime adds braking beyond ordinary damping");
  assert.equal(ball(slow).physics.linearVelocity[1],ball(control).physics.linearVelocity[1]);
  assert.deepEqual(ball(slow).physics.angularVelocity,ball(control).physics.angularVelocity);
  assert.equal(slow.hostBody("ball"),body);assert.equal(slow.getState().revision,initial.revision);
  assert.equal(slow.history.length,initial.history);assert.equal(slow.redoHistory.length,initial.redo);assert.deepEqual(slow.readEvents(),initial.events);
  const before=ball(slow).physics.linearVelocity[0];slow.setSlowdownLive("ball",1);
  assert.equal(ball(slow).physics.linearVelocity[0],before,"Ending the effect cannot add momentum");
  slow.step(1/60);assert.ok(ball(slow).physics.linearVelocity[0]<=before,"Normal damping still applies while coasting");
  slow.steerLive("ball",{thrust:1});for(let i=0;i<60;i++)slow.step(1/60);
  assert.ok(ball(slow).physics.linearVelocity[0]>7.8,"Normal player acceleration resumes");
});

test("invalid live factors and targets fail atomically; namespace and scoped transients stay protected",()=>{
  const runtime=new AgentWorldRuntime(scene());
  runtime.setSlowdownLive("ball",.75);
  for(const factor of [0,.74,1.001,NaN,Infinity,".75",null,{},undefined]){
    const before=state(runtime);assert.equal(runtime.setSlowdownLive("ball",factor).ok,false);assert.deepEqual(state(runtime),before);
  }
  for(const id of [null,"","missing","plain","static","live-agent:missing","live-mission:missing"]){
    const before=state(runtime);assert.equal(runtime.setSlowdownLive(id,.75).ok,false);assert.deepEqual(state(runtime),before);
  }
  const created=runtime.reconcileTransientEntities("slowdown-test",[{id:"ordinary-transient",type:"sphere",ephemeral:true,physics:{mode:"dynamic"},steering:{force:28}}]);
  assert.equal(created.ok,true,created.error);const before=state(runtime);
  assert.equal(runtime.setSlowdownLive("ordinary-transient",.75).ok,false);assert.deepEqual(state(runtime),before);
});

test("live limit constrains thrust without blocking braking and loading clears the transient factor",()=>{
  const runtime=new AgentWorldRuntime(scene());runtime.setSlowdownLive("ball",.75);
  runtime.steerLive("ball",{thrust:1});for(let i=0;i<60;i++)runtime.step(1/60);
  // Fixed-step thrust can overshoot by at most one impulse. Ordinary damping
  // can reduce the 6 m/s threshold by one step; these bounds follow the fixture.
  const capped=ball(runtime).physics.linearVelocity[0];
  assert.ok(capped>=6/(1+.08/60)-.001&&capped<=6+28/1.7/60+.001);
  const before=ball(runtime).physics.linearVelocity[0];runtime.steerLive("ball",{thrust:-1});runtime.step(1/60);
  assert.ok(ball(runtime).physics.linearVelocity[0]<before);
  const fresh=new AgentWorldRuntime(scene());
  runtime.create(scene());runtime.step(1/60);fresh.step(1/60);
  assert.deepEqual(ball(runtime).physics.linearVelocity,ball(fresh).physics.linearVelocity,"Reload has exactly the ordinary damping, without a retained effect");
  const api=readFileSync(new URL("../src/agent-world-api.ts",import.meta.url),"utf8");
  assert.match(api,/setSlowdownLive: \(id, factor\) => runtime\.setSlowdownLive\(id, factor\)/);
});

test("paused update does not damp, explicit steps do; race reset clears the transient slowdown",()=>{
  const definition=scene();
  definition.entities.push({id:"finish",type:"box",geometry:{width:1,height:2,depth:2},transform:{position:[100,20,0]},physics:{mode:"trigger"}});
  definition.rules={schema:"graphysx.agent-rules/v1",subjectId:"ball",spawn:{entityId:"ball",position:[0,20,0]},finish:{triggerId:"finish"},timer:{}};
  const runtime=new AgentWorldRuntime(definition);
  runtime.setSlowdownLive("ball",.75);runtime.setPaused(true);runtime.update(1/60);
  assert.equal(ball(runtime).physics.linearVelocity[0],8);
  runtime.step(1/60);assert.ok(ball(runtime).physics.linearVelocity[0]<8);
  assert.equal(runtime.resetRun().ok,true);runtime.steerLive("ball",{headingDegrees:90,thrust:1});
  for(let i=0;i<120;i++)runtime.step(1/60);
  assert.ok(ball(runtime).physics.linearVelocity[0]>7.8,"Reset returns the ordinary speed limit");
});
