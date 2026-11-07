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
