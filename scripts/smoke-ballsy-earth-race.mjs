import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { applySmokeTimeout, launchSmokeBrowser } from "./smoke-harness.mjs";

const { startBallsyServer } = await import("./serve-ballsy.mjs");
const server = process.env.SMOKE_BASE ? null : await startBallsyServer({ port: 0 });
const base = process.env.SMOKE_BASE || server.url;
const artifacts = process.env.SMOKE_ARTIFACTS || "output/ballsy-earth-race";
mkdirSync(artifacts, { recursive: true });
const browser = await launchSmokeBrowser();
const errors = [], report = {};
let activePage;
const read = page => page.evaluate(() => window.__BALLSY__.state());
const step = (page, ms) => page.evaluate(t => window.advanceTime(t), ms);
const capture = (page, name) => page.screenshot({ path: path.join(artifacts, `${name}.png`) });
async function open(pads = false) {
  const page = applySmokeTimeout(await browser.newPage({ viewport: { width: 1280, height: 720 } }));
  activePage = page;
  page.on("pageerror", e => errors.push(String(e)));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  if (pads) await page.addInitScript(() => {
    window.ballsyTestPads = [0, 1].map(index => ({ index, connected: true, mapping: "standard", id: `Earth race synthetic pad ${index}`, axes: [0, 0], buttons: [] }));
    Object.defineProperty(navigator, "getGamepads", { value: () => window.ballsyTestPads });
  });
  await page.goto(new URL("ballsy.html?course=volcano", base).href, { waitUntil: "load" });
  await page.waitForFunction(() => !!window.__BALLSY__);
  await step(page, 0);
  return page;
}
async function start(page) { await page.locator('[data-action="start"]').click(); await step(page, 3100); assert.equal((await read(page)).phase, "racing"); }
async function screenPoint(page, x, z) {
  return page.evaluate(({ x, z }) => {
    const host = window.__GRAPHYSX_HOST__, earth = window.__BALLSY__.state().volcano.earth;
    const index = Math.round((z + 7) / 0.5) * 21 + Math.round((x - 4) / 0.5);
    const p = host.camera.position.clone().set(x, earth.height[index], z).project(host.camera);
    return { x: (p.x + 1) * innerWidth / 2, y: (1 - p.y) * innerHeight / 2 };
  }, { x, z });
}
async function carve(page) {
  const before = await read(page);
  const cameraBefore = await page.evaluate(() => { const c=window.__GRAPHYSX_HOST__.camera; return {position:c.position.toArray(),quaternion:c.quaternion.toArray()}; });
  const meshBefore = await page.evaluate(() => window.__GRAPHYSX__.export().entities.find(e => e.id === "volcano-earth").mesh.positions);
  // Genuine local pointer events, no direct model commands or injected height values.
  for (let pass = 0; pass < 6; pass++) {
    const first = await screenPoint(page, 6.5, 3);
    await page.mouse.move(first.x, first.y); await page.mouse.down(); await step(page, 50);
    for (let i = 1; i <= 16; i++) {
      const p = await screenPoint(page, 6.5 + i * 0.125, 3);
      await page.mouse.move(p.x, p.y); await step(page, 50);
    }
    await page.mouse.up(); await step(page, 150);
  }
  const after = await read(page);
  const cameraAfter = await page.evaluate(() => { const c=window.__GRAPHYSX_HOST__.camera; return {position:c.position.toArray(),quaternion:c.quaternion.toArray()}; });
  assert.deepEqual(cameraAfter,cameraBefore,"digging never rotates the fixed race camera");
  const meshAfter = await page.evaluate(() => window.__GRAPHYSX__.export().entities.find(e => e.id === "volcano-earth").mesh.positions);
  assert.ok(after.volcano.earth.revision > before.volcano.earth.revision, "real pointer stroke excavates earth");
  assert.ok(after.volcano.earth.excavated > before.volcano.earth.excavated + 0.05);
  assert.notDeepEqual(meshAfter, meshBefore, "rendered/collider mesh vertices follow excavation");
  return { revision: after.volcano.earth.revision, excavated: after.volcano.earth.excavated, minimumCut: Math.max(...before.volcano.earth.height.map((h, i) => h - after.volcano.earth.height[i])) };
}
try {
  const page = await open();
  report.lobby = await read(page);
  await capture(page, "earth-lobby-1280");
  await page.setViewportSize({ width: 1920, height: 1080 }); await capture(page, "earth-lobby-1920");
  await page.setViewportSize({ width: 1280, height: 720 });
  await start(page);
  await capture(page, "earth-race-1280");
  await page.setViewportSize({ width: 1920, height: 1080 }); await capture(page, "earth-race-1920");
  report.layout = await page.evaluate(() => {
    const host = window.__GRAPHYSX_HOST__;
    return { overflow: document.documentElement.scrollWidth > innerWidth,
      corners: [[-17,0,-13],[17,0,-13],[-17,0,13],[17,0,13]].map(p => { const v=host.camera.position.clone().set(...p).project(host.camera); return [v.x,v.y]; }) };
  });
  assert.equal(report.layout.overflow, false);
  assert.ok(report.layout.corners.every(p => Math.abs(p[0]) < 1 && Math.abs(p[1]) < 1));
  await page.setViewportSize({ width: 1280, height: 720 });
  // Isolated probes position the body before entry; physics crosses each pad. These
  // probes are separate from the fresh two-lap controller race below.
  report.boosts = await page.evaluate(() => {
    const api = window.__GRAPHYSX__;
    const probes = [];
    for (const [x,z,dx,dz] of [[3,8.8,1,0],[-4,-8.8,-1,0],[-13.5,-2,0,1]]) {
      api.update("ballsy-p1", { transform: { position: [-4,0.7,10] }, physics: { mode:"dynamic",linearVelocity:[0,0,0] } }); window.advanceTime(2200);
      const count=window.__BALLSY__.state().boosts[0].count;
      api.update("ballsy-p1", { transform: { position:[x-dx*2,0.7,z-dz*2] },physics:{mode:"dynamic",linearVelocity:[dx*5,0,dz*5]} });
      let state; for(let i=0;i<30;i++){state=window.advanceTime(1000/60);if(state.boosts[0].count>count)break;}
      probes.push({countBefore:count,boost:state.boosts[0],position:state.players[0].position,velocity:state.players[0].velocity});
    }
    api.update("ballsy-p1", { transform:{position:[-4,0.7,10]},physics:{mode:"dynamic",linearVelocity:[0,0,0]} });window.advanceTime(2200);
    const count=window.__BALLSY__.state().boosts[0].count;
    api.update("ballsy-p1", { transform:{position:[3,0.7,8.8]},physics:{mode:"dynamic",linearVelocity:[0,0,0]} });const stationary=window.advanceTime(300);
    api.update("ballsy-p1", { transform:{position:[5,0.7,8.8]},physics:{mode:"dynamic",linearVelocity:[-5,0,0]} });const reverse=window.advanceTime(450);
    return {probes,count,stationary:stationary.boosts[0],reverse:reverse.boosts[0]};
  });
  for(const probe of report.boosts.probes) assert.equal(probe.boost.count,probe.countBefore+1,"directional physical entry triggers each strip");
  assert.equal(report.boosts.stationary.count,report.boosts.count,"parking is not a boost");
  assert.equal(report.boosts.reverse.count,report.boosts.count,"reverse entry is not a boost");
  await page.evaluate(()=>window.__GRAPHYSX__.update("ballsy-p1",{transform:{position:[-5,.7,8]},physics:{mode:"dynamic",linearVelocity:[5,0,0]}}));
  const brakeBefore=await read(page);await page.keyboard.down("Space");await step(page,250);await page.keyboard.up("Space");
  report.brake=await read(page);assert.ok(Math.hypot(...[report.brake.players[0].velocity[0],report.brake.players[0].velocity[2]])<Math.hypot(brakeBefore.players[0].velocity[0],brakeBefore.players[0].velocity[2]));
  report.carve=await carve(page);await capture(page,"earth-pointer-trench");
  // The same physical drop on the freshly excavated region must reach the lowered surface.
  report.collider=await page.evaluate(()=>{
    const api=window.__GRAPHYSX__,earth=window.__BALLSY__.state().volcano.earth,index=20*21+7;
    const target=earth.height[index];
    api.update("ballsy-p1",{transform:{position:[7.5,target+.72,3]},physics:{mode:"dynamic",linearVelocity:[0,0,0]}});
    const state=window.advanceTime(350);
    return {target,position:state.players[0].position,body:api.query({ids:["volcano-earth"]})[0]};
  });
  assert.ok(report.collider.position[1] < report.lobby.volcano.earth.height[20*21+7] + 0.65 - 0.08, "physical ball settles below the original surface after excavation");
  await page.keyboard.press("KeyP"); const paused=await read(page);await step(page,2000);const frozen=await read(page);
  assert.deepEqual(frozen.volcano,paused.volcano,"pause freezes lava and excavation");assert.deepEqual(frozen.boosts,paused.boosts);assert.deepEqual(frozen.players,paused.players);
  await page.close();

  const race=await open(true);await start(race);report.raceCarve=await carve(race);
  report.driven=await race.evaluate(()=>{
    const api=window.__GRAPHYSX__,paths=[[13,8],[15,10]].map(([x,z])=>[[x-3,z],[x,z],[x,z-3],[x,-z+3],[x,-z],[x-3,-z],[-x+3,-z],[-x,-z],[-x,-z+3],[-x,z-3],[-x,z],[-x+3,z]]),next=[0,0];
    let snapshot=window.__BALLSY__.state(),frames=0,firstFinish=null;
    const trace=[];
    for(;frames<7000;frames++){
      ["ballsy-p1","ballsy-p2"].forEach((id,i)=>{
        const p=api.query({ids:[id]})[0];let target=paths[i][next[i]],dx=target[0]-p.position[0],dz=target[1]-p.position[2];
        if(Math.hypot(dx,dz)<1){next[i]=(next[i]+1)%paths[i].length;target=paths[i][next[i]];dx=target[0]-p.position[0];dz=target[1]-p.position[2];}
        const distance=Math.hypot(dx,dz), corner=next[i]%3===1;
        const desired=Math.min(corner ? 2.8 : 4.7,Math.max(1.5,distance*2));
        const speed=Math.hypot(p.physics.linearVelocity[0],p.physics.linearVelocity[2]);
        // Actual controller brake, not a body velocity write, prepares each turn.
        window.ballsyTestPads[i].buttons=[{pressed:distance<3&&speed>desired+0.8,value:distance<3&&speed>desired+0.8?1:0}];
        window.ballsyTestPads[i].axes=[(dx/distance*desired-p.physics.linearVelocity[0])*.22,(dz/distance*desired-p.physics.linearVelocity[2])*.22];
      });
      const previous=snapshot;
      snapshot=window.advanceTime(1000/60);
      snapshot.players.forEach((p,i)=>{const old=previous.players[i].position;const jump=Math.hypot(...p.position.map((v,k)=>v-old[k]));if(jump>0.8)throw new Error(`Unexpected physical teleport at frame ${frames}, player ${i+1}: ${JSON.stringify(old)} -> ${JSON.stringify(p.position)} (${jump}m)`);});
      if(frames%120===0)trace.push({frames,next:[...next],players:snapshot.players.map(p=>({position:p.position,lap:p.run.lap,checkpoint:p.run.checkpointIndex}))});
      if(!firstFinish&&snapshot.players.filter(p=>p.run.phase==="complete").length===1)firstFinish=snapshot.phase;
      if(snapshot.phase==="results")break;
    }
    return {frames,firstFinish,next,trace,state:snapshot};
  });
  assert.equal(report.driven.state.phase,"results",JSON.stringify({frames:report.driven.frames,next:report.driven.next,players:report.driven.state.players,trace:report.driven.trace.slice(-5)}));
  assert.equal(report.driven.firstFinish,"racing");
  assert.ok(report.driven.state.players.every(p=>p.run.lap===2&&!p.run.desynced));
  assert.deepEqual(report.driven.state.rescues,[0,0]);
  assert.ok(report.driven.state.boosts.some(b=>b.count>0),"controller race actually uses boost strips");
  const earth=report.driven.state.volcano.earth;
  assert.ok(Math.abs(earth.inputVolume-earth.drainedVolume-earth.lava.reduce((a,b)=>a+b,0))<1e-7,"lava volume conserved during full race");
  await capture(race,"earth-results");
  await race.locator('[data-action="start"]').click();report.rematch=await read(race);
  assert.equal(report.rematch.phase,"countdown");assert.equal(report.rematch.volcano.earth.revision,0);assert.equal(report.rematch.volcano.earth.excavated,0);
  assert.ok(report.rematch.volcano.earth.lava.every(v=>v===0));assert.ok(report.rematch.boosts.every(b=>b.count===0&&b.remaining===0&&b.cooldown===0));
  assert.ok(report.rematch.players.every(p=>p.run.lap===0&&p.run.elapsedSeconds===0));
  await step(race,3100);await capture(race,"earth-rematch");await race.close();
  assert.deepEqual(errors,[]);report.ok=true;
  console.log(JSON.stringify({ok:true,frames:report.driven.frames,carve:report.carve,artifacts}));
} catch(error) {
  report.ok=false;report.failure=String(error);if(activePage&&!activePage.isClosed())await capture(activePage,"earth-failure").catch(()=>{});
  throw error;
} finally { writeFileSync(path.join(artifacts,"earth-race-report.json"),JSON.stringify({...report,errors},null,2));await browser.close(); await server?.close(); }
