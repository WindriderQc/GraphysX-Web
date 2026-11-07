import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { launchSmokeBrowser, applySmokeTimeout } from "./smoke-harness.mjs";
import { startBallsyServer } from "./serve-ballsy.mjs";

// Stress measurement, not gesture acceptance: real host, guest, relay and physics;
// explicitly synthetic launch commands create repeatable rendering/slowdown load.
const directory = process.env.SMOKE_ARTIFACTS || "output/ballsy-slime/performance";
mkdirSync(directory, {recursive:true});
const app = await startBallsyServer({port:0,...(process.env.SMOKE_DIST_ROOT?{root:path.resolve(process.env.SMOKE_DIST_ROOT)}:{})});
const browser = await launchSmokeBrowser();
const host = applySmokeTimeout(await browser.newPage({viewport:{width:1280,height:720}}));
const giant = applySmokeTimeout(await browser.newPage({viewport:{width:1280,height:720}}));
const report = { label:"Real-time two-view performance under identical simulated Gamepad control; synthetic relay throws are load probes, not gesture evidence", startedAt:new Date().toISOString(), errors:[] };
let credentials;
for(const page of [host,giant]) {
  page.on("pageerror",error=>report.errors.push(String(error)));
  page.on("console",message=>{if(message.type()==="error")report.errors.push(message.text());});
}
giant.on("response",async response=>{
  if(response.url().endsWith("/api/ballsy/join")&&response.ok())credentials=await response.json();
});
await host.addInitScript(()=>{
  window.ballsyPerformancePads=[0,1].map(index=>({index,connected:true,mapping:"standard",id:`Performance input ${index}`,axes:[0,0],buttons:[]}));
  Object.defineProperty(navigator,"getGamepads",{value:()=>window.ballsyPerformancePads});
});
async function startTrial() {
  const phase=await host.evaluate(()=>window.__BALLSY__.state().phase);
  if(phase==="racing"){await host.keyboard.press("KeyP");await host.locator('[data-action="restart"]').click();}
  else await host.locator('[data-action="start"]').click();
  await host.waitForFunction(()=>window.__BALLSY__.state().phase==="racing");
  await giant.waitForFunction(()=>window.__BALLSY_GIANT__.state().snapshot?.phase==="racing");
}
async function measure(withSlime) {
  await startTrial();
  await host.evaluate(()=>{
    const api=window.__GRAPHYSX__,original=api.update;
    if(!window.ballsyPerfOriginalUpdate){window.ballsyPerfOriginalUpdate=original;api.update=(...args)=>{window.ballsyPerfUpdates++;return original(...args);};}
    window.ballsyPerfUpdates=0;
    window.ballsyPerf={frames:[],slowFrames:0,maxProjectiles:0,maxSplats:0,started:performance.now(),previous:performance.now(),active:true};
    const course=window.__BALLSY__.course();
    const frame=now=>{
      const sample=window.ballsyPerf;if(!sample.active)return;
      const state=window.__BALLSY__.state();sample.frames.push(now-sample.previous);sample.previous=now;
      if(state.slime.slowUntil.some(time=>time>state.slime.time))sample.slowFrames++;
      sample.maxProjectiles=Math.max(sample.maxProjectiles,state.slime.projectiles.length);sample.maxSplats=Math.max(sample.maxSplats,state.slime.splats.length);
      state.players.forEach((player,index)=>{
        const t=((player.run.progress+.018)%1+1)%1,target=course.main.reduce((best,p)=>Math.abs(p.t-t)<Math.abs(best.t-t)?p:best);
        const dx=target.x-player.position[0],dz=target.z-player.position[2],distance=Math.max(.01,Math.hypot(dx,dz));
        window.ballsyPerformancePads[index].axes=[(dx/distance*6-player.velocity[0])*.3,(dz/distance*6-player.velocity[2])*.3];
      });
      requestAnimationFrame(frame);
    };requestAnimationFrame(frame);
  });
  const end=Date.now()+10000, launchReceipts=[];
  while(Date.now()<end){
    if(withSlime){
      const state=await host.evaluate(()=>window.__BALLSY__.state()),player=state.players[0],flight=.26;
      const origin=[player.position[0]+player.velocity[0]*flight,player.position[1]+3,player.position[2]+player.velocity[2]*flight];
      const response=await fetch(`${app.url}api/ballsy/${credentials.roomId}/command`,{method:"POST",headers:{"content-type":"application/json",authorization:`Bearer ${credentials.guestToken}`},body:JSON.stringify({id:randomUUID(),roundId:state.roundId,command:{type:"slime",throwId:randomUUID(),origin,velocity:[0,0,0]}})});
      launchReceipts.push({status:response.status,body:await response.json()});
    }
    await host.waitForTimeout(1050);
  }
  const measured=await host.evaluate(()=>{
    const sample=window.ballsyPerf;sample.active=false;window.ballsyPerformancePads.forEach(p=>p.axes=[0,0]);
    const sorted=[...sample.frames].sort((a,b)=>a-b),host=window.__GRAPHYSX_HOST__,gl=host.renderer.getContext(),ext=gl.getExtension("WEBGL_debug_renderer_info");
    return {seconds:(performance.now()-sample.started)/1000,frames:sample.frames.length,fps:1000/(sample.frames.reduce((a,b)=>a+b,0)/sample.frames.length),p95FrameMs:sorted[Math.floor(sorted.length*.95)],slowFrames:sample.slowFrames,maxProjectiles:sample.maxProjectiles,maxSplats:sample.maxSplats,documentUpdates:window.ballsyPerfUpdates,
      renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),drawCalls:host.renderer.info.render.calls,triangles:host.renderer.info.render.triangles,finalState:window.__BALLSY__.state()};
  });
  return {...measured,launchReceipts};
}
try {
  await host.goto(`${app.url}ballsy.html?course=volcano`,{waitUntil:"load"});await host.waitForFunction(()=>!!window.__BALLSY__);
  await host.locator('[data-action="invite"]').click();await host.waitForFunction(()=>!!window.__BALLSY__.state().room?.code);
  const code=await host.evaluate(()=>window.__BALLSY__.state().room.code);
  await giant.goto(`${app.url}ballsy-giant.html`,{waitUntil:"load"});await giant.locator("#room-code").fill(code);await giant.getByRole("button",{name:"Rejoindre",exact:true}).click();
  await host.waitForFunction(()=>window.__BALLSY__.state().room?.connected);await giant.waitForFunction(()=>window.__BALLSY_GIANT__.state().live);
  assert.ok(credentials?.guestToken);
  report.browserVersion=browser.version();report.control=await measure(false);report.slime=await measure(true);
  assert.ok(report.slime.finalState.slime.throws>=6,"Repeatable projectile workload admitted");
  assert.ok(report.slime.finalState.slime.hits>=2,"Workload includes genuine host collision hits");
  assert.ok(report.slime.slowFrames>report.slime.frames*.25,"At least a quarter of measured frames carry active slowdown");
  assert.deepEqual(report.errors,[]);
  await host.screenshot({path:path.join(directory,"performance-host.png")});await giant.screenshot({path:path.join(directory,"performance-giant.png")});
  report.ok=true;console.log(JSON.stringify({ok:true,controlFps:report.control.fps,slimeFps:report.slime.fps,slowFrames:report.slime.slowFrames,hits:report.slime.finalState.slime.hits}));
}catch(error){report.ok=false;report.failure=String(error);throw error;}
finally{report.finishedAt=new Date().toISOString();writeFileSync(path.join(directory,"performance-report.json"),JSON.stringify(report,null,2));await browser.close();await app.close();}
