import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { applySmokeTimeout, launchSmokeBrowser } from "./smoke-harness.mjs";
import { startBallsyServer } from "./serve-ballsy.mjs";

const directory=process.env.SMOKE_ARTIFACTS||"output/ballsy-slime/video";mkdirSync(directory,{recursive:true});
const app=await startBallsyServer({port:0,...(process.env.SMOKE_DIST_ROOT?{root:path.resolve(process.env.SMOKE_DIST_ROOT)}:{})});
const browser=await launchSmokeBrowser();
const host=applySmokeTimeout(await browser.newPage({viewport:{width:1280,height:720}}));
const giant=applySmokeTimeout(await browser.newPage({viewport:{width:1280,height:720}}));
const report={label:"Demonstration souris, pas VR. Vrai glisser-relacher et rendu temps reel; aucune avance artificielle du temps ni commande de lancer injectee.",startedAt:new Date().toISOString(),errors:[]};
for(const page of[host,giant]){page.on("pageerror",error=>report.errors.push(String(error)));page.on("console",message=>{if(message.type()==="error")report.errors.push(message.text());});}
const modelPoint=position=>giant.evaluate(position=>window.__BALLSY_GIANT__.modelPoint(...position),position);
try{
  await host.goto(`${app.url}ballsy.html?course=volcano`,{waitUntil:"load"});await host.waitForFunction(()=>!!window.__BALLSY__);
  await host.locator('[data-action="invite"]').click();await host.waitForFunction(()=>!!window.__BALLSY__.state().room?.code);
  const code=await host.evaluate(()=>window.__BALLSY__.state().room.code);
  await giant.goto(`${app.url}ballsy-giant.html`,{waitUntil:"load"});await giant.locator("#room-code").fill(code);await giant.getByRole("button",{name:"Rejoindre",exact:true}).click();
  await host.waitForFunction(()=>window.__BALLSY__.state().room?.connected);
  await host.locator('[data-action="start"]').click();await giant.waitForFunction(()=>window.__BALLSY_GIANT__.state().balloon.stock.some(item=>item.visible));
  await giant.screenshot({path:path.join(directory,"mouse-demo-ready.png")});
  await giant.evaluate(()=>{
    const canvas=document.querySelector("canvas"),chunks=[];
    const recorder=new MediaRecorder(canvas.captureStream(30),{mimeType:"video/webm"});
    recorder.ondataavailable=event=>chunks.push(event.data);recorder.start();
    window.ballsyVideo={recorder,chunks,started:performance.now()};
  });
  const recordingStarted=Date.now();await giant.waitForTimeout(1000);
  const state=await host.evaluate(()=>window.__BALLSY__.state()),stock=await giant.evaluate(()=>window.__BALLSY_GIANT__.state().balloon.stock.find(item=>item.visible));
  await giant.mouse.move(...stock.screen);await giant.mouse.down();await giant.waitForFunction(()=>window.__BALLSY_GIANT__.state().balloon.held);
  const zero=await modelPoint([0,0,0]),height=(stock.world[1]-zero.world[1])/.045,target=state.players[0].position,speed=6;
  const flight=Math.sqrt(2*(height-target[1])/(9.81/.045)),release=[target[0]-speed*flight,height,target[2]],from=[release[0]-speed*.12,height,release[2]];
  await giant.mouse.move(...(await modelPoint(from)).screen,{steps:12});await giant.waitForTimeout(200);
  for(let index=1;index<=8;index++){await giant.mouse.move(...(await modelPoint([from[0]+(release[0]-from[0])*index/8,height,from[2]])).screen);await giant.waitForTimeout(15);}
  await giant.mouse.up();
  await host.waitForFunction(()=>window.__BALLSY__.state().slime.hits>0);
  report.impact=await host.evaluate(()=>window.__BALLSY__.state());report.gesture=await giant.evaluate(()=>window.__BALLSY_GIANT__.state().balloon.lastLaunch);
  await giant.waitForTimeout(120);
  await host.screenshot({path:path.join(directory,"mouse-demo-host-impact.png")});await giant.screenshot({path:path.join(directory,"mouse-demo-giant-impact.png")});
  await host.keyboard.down("ArrowLeft");await host.keyboard.down("KeyA");await giant.waitForTimeout(2200);await host.keyboard.up("ArrowLeft");await host.keyboard.up("KeyA");
  await giant.waitForTimeout(Math.max(0,8000-(Date.now()-recordingStarted)));
  const video=await giant.evaluate(async()=>{
    const {recorder,chunks,started}=window.ballsyVideo;
    const done=new Promise(resolve=>recorder.onstop=resolve);recorder.stop();await done;
    const blob=new Blob(chunks,{type:"video/webm"});
    const data=await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(",")[1]);reader.readAsDataURL(blob);});
    return {data,bytes:blob.size,seconds:(performance.now()-started)/1000,captureFpsCap:30,source:"Giant WebGL canvas only; DOM controls not recorded"};
  });
  writeFileSync(path.join(directory,"ballsy-mouse-throw.webm"),Buffer.from(video.data,"base64"));delete video.data;report.video=video;
  assert.deepEqual(report.errors,[]);assert.ok(video.bytes>10000);report.ok=true;
  console.log(JSON.stringify({ok:true,video:report.video,artifactDirectory:directory}));
}catch(error){report.ok=false;report.failure=String(error);await giant.screenshot({path:path.join(directory,"video-failure.png")}).catch(()=>{});throw error;}
finally{writeFileSync(path.join(directory,"video-report.json"),JSON.stringify(report,null,2));await browser.close();await app.close();}
