import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {applySmokeTimeout,launchSmokeBrowser} from './smoke-harness.mjs';
import {startBallsyServer} from './serve-ballsy.mjs';
const baseline=process.argv.includes('--baseline');
const greybox=process.argv.includes('--greybox');
const dir=process.env.SMOKE_ARTIFACTS||(greybox?'output/ballsy-loop/greybox':'output/ballsy-loop');mkdirSync(dir,{recursive:true});
const server=process.env.SMOKE_BASE?null:await startBallsyServer({port:0,...(process.env.SMOKE_DIST_ROOT?{root:path.resolve(process.env.SMOKE_DIST_ROOT)}:{})}),browser=await launchSmokeBrowser();
const url=new URL(`ballsy.html?course=volcano${greybox?'&greybox=1':''}`,process.env.SMOKE_BASE||server.url).href;
const report={label:'pilotage automatisé via vraies entrées; aucun playtest humain',baseline,errors:[],captures:[]};
report.browserVersion=browser.version();
report.pilot={samePolicyForBothPlayers:true,targetSpeedCap:3.5,brakeAboveDesiredBy:1,note:'Actual game speed cap is unchanged; controller slows near its geometric look-ahead target'};
const performanceSample=page=>page.evaluate(async()=>{
 const canvas=document.querySelector('canvas'),gl=canvas.getContext('webgl2')||canvas.getContext('webgl');
 const ext=gl?.getExtension('WEBGL_debug_renderer_info');
 const times=[];let last=performance.now();
 await new Promise(resolve=>{const tick=now=>{times.push(now-last);last=now;if(times.length<120)requestAnimationFrame(tick);else resolve();};requestAnimationFrame(tick);});
 const sorted=[...times].sort((a,b)=>a-b);
 return {method:'120 real requestAnimationFrame intervals; unpaused, idle racers, headless Edge',viewport:[innerWidth,innerHeight],drawingBuffer:[canvas.width,canvas.height],devicePixelRatio,renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl?.getParameter(gl.RENDERER),fps:1000/(times.reduce((a,b)=>a+b,0)/times.length),p95FrameMs:sorted[Math.floor(sorted.length*.95)]};
});
// Input-only controller. No body transforms, velocity writes or rule commands.
async function driveRace(page, paths, maxFrames=18000,stopAtProgress=null) {
 return page.evaluate(async({paths,maxFrames,stopAtProgress})=>{
  const next=[0,0],trace=[],jumps=[];let state=window.__BALLSY__.state(),firstFinish=null;
  let minimumSeparation=Infinity,maximumSeparation=0,frames=0,lastLeader=0;
  const closeApproaches=[],passes=[];
  const visibility=[];let separationCapture=null,capturedSeparation=0;
  const captures=new Set();
  for(;frames<maxFrames;frames++){
   state.players.forEach((p,i)=>{
    // Geometric look-ahead, not chasing a missed waypoint backwards after a boost.
    let nearest=0,nearestDistance=Infinity;
    paths[i].forEach((q,index)=>{const d=Math.hypot(q[0]-p.position[0],q[1]-p.position[2]);if(d<nearestDistance){nearestDistance=d;nearest=index;}});
    next[i]=(nearest+1)%paths[i].length;
    let target=paths[i][next[i]],dx=target[0]-p.position[0],dz=target[1]-p.position[2];
    const previous=paths[i][(next[i]+paths[i].length-1)%paths[i].length];
    const passed=(p.position[0]-target[0])*(target[0]-previous[0])+(p.position[2]-target[1])*(target[1]-previous[1])>0;
    if(Math.hypot(dx,dz)<1.1||(passed&&Math.hypot(dx,dz)<4)){next[i]=(next[i]+1)%paths[i].length;target=paths[i][next[i]];dx=target[0]-p.position[0];dz=target[1]-p.position[2];}
    const distance=Math.max(.01,Math.hypot(dx,dz));
    const desired=Math.min(3.5,Math.max(1.7,distance*1.5));
    const speed=Math.hypot(p.velocity[0],p.velocity[2]);
    const brake=speed>desired+1;
    window.ballsyTestPads[i].buttons=[{pressed:brake,value:brake?1:0}];
    window.ballsyTestPads[i].axes=[(dx/distance*desired-p.velocity[0])*.24,(dz/distance*desired-p.velocity[2])*.24];
   });
   const previous=state;state=window.advanceTime(1000/60);
   state.players.forEach((p,i)=>{const distance=Math.hypot(...p.position.map((v,k)=>v-previous.players[i].position[k]));if(distance>.8)jumps.push({frames,player:i,distance,before:previous.players[i].position,after:p.position});});
   const separation=Math.hypot(...state.players[0].position.map((v,k)=>v-state.players[1].position[k]));
   minimumSeparation=Math.min(minimumSeparation,separation);maximumSeparation=Math.max(maximumSeparation,separation);
   if(frames%120===0){
    const host=window.__GRAPHYSX_HOST__,camera=host.camera;host.scene.updateMatrixWorld(true);
    visibility.push({frames,separation,players:state.players.map(p=>{
     const center=camera.position.clone().fromArray(p.position),screen=center.clone().project(camera);
     let blocker=null;const ray=host.chaseScratch?.raycaster;
     if(ray){
      ray.set(camera.position,center.clone().sub(camera.position).normalize());
      const body=host.world.getEntityObject(p.id),distance=center.distanceTo(camera.position);
      const hit=ray.intersectObjects(host.scene.children,true).find(hit=>{
       let o=hit.object;while(o){if(!o.visible||o===body)return false;o=o.parent;}
       const materials=Array.isArray(hit.object.material)?hit.object.material:[hit.object.material];
       if(materials.every(material=>material?.transparent&&material.opacity<.9))return false;
       return hit.distance<distance-.7;
      });
      if(hit)blocker={name:hit.object.name,distance:hit.distance};
     }
     return {id:p.id,screen:[screen.x,screen.y],inFrame:Math.abs(screen.x)<1&&Math.abs(screen.y)<1,blocker};
    })});
   }
   if(separation>capturedSeparation+3){
    const host=window.__GRAPHYSX_HOST__;host.renderer.render(host.scene,host.camera);
    separationCapture={frames,separation,data:host.renderer.domElement.toDataURL('image/png').split(',')[1]};capturedSeparation=separation;
   }
   const captureLabel=stopAtProgress===null?'cleanline':'error-approach';
   for(const [name,ready]of [['banked-turn',state.players[0].run.progress>.55&&state.players[0].run.progress<.65],['bridge-crossing',state.players[1].run.branch==='shortcut'&&state.players[1].run.progress>.76&&state.players[1].run.progress<.83],['separated-racers',separation>20]]){
    if(ready&&!captures.has(name)&&window.ballsyCapture){captures.add(name);await window.ballsyCapture(`${captureLabel}-${name}`);}
   }
   if(separation<1.34&&closeApproaches.length<20)closeApproaches.push({frames,separation,players:state.players.map(p=>({position:p.position,velocity:p.velocity}))});
   const difference=state.players[0].run.progress-state.players[1].run.progress;
   const leader=Math.abs(difference)>.005?Math.sign(difference):0;
   if(leader&&lastLeader&&leader!==lastLeader)passes.push({frames,leader:leader>0?1:2,difference});
   if(leader)lastLeader=leader;
   if(frames%1200===0)console.info('[ballsy-loop] frame '+frames+' progress '+state.players.map(p=>p.run.progress.toFixed(3)+'/'+p.run.rescues).join(', '));
   if(frames%60===0)trace.push({frames,next:[...next],players:state.players.map(p=>({position:p.position,velocity:p.velocity,run:p.run}))});
   if(firstFinish===null&&state.players.filter(p=>p.run.phase==='complete').length===1)firstFinish=state.phase;
   if(state.phase==='results')break;
   if(stopAtProgress!==null&&state.players[1].run.progress>=stopAtProgress)break;
  }
  return {frames,next,trace,jumps,minimumSeparation,maximumSeparation,closeApproaches,passes,visibility,separationCapture,firstFinish,state};
 },{paths,maxFrames,stopAtProgress});
}
let page;
try{
 page=applySmokeTimeout(await browser.newPage({viewport:{width:1280,height:720}}));
 if(process.argv.includes('--video'))await page.addInitScript(()=>{
  window.visualPads=[0,1].map(index=>({index,connected:true,mapping:'standard',id:`Recorded automated input ${index}`,axes:[0,0],buttons:[]}));
  Object.defineProperty(navigator,'getGamepads',{value:()=>window.visualPads});
 });
 page.on('pageerror',e=>report.errors.push(String(e))); page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());else if(m.text().startsWith('[ballsy-loop]'))console.log(m.text());});
 await page.goto(url,{waitUntil:'load'});
 if(process.argv.includes('--diagnose')){
  await page.waitForTimeout(1500);report.startupText=await page.locator('body').textContent();
  await page.screenshot({path:path.join(dir,'loop-startup.png')});
  throw new Error(`Startup diagnostic: ${report.startupText}`);
 }
 await page.waitForFunction(()=>!!window.__BALLSY__);
 await page.locator('[data-action="start"]').click();
 await page.waitForFunction(()=>window.__BALLSY__.state().phase==='racing');
 for(const [width,height] of [[1280,720],[1920,1080]]){
  await page.setViewportSize({width,height});await page.waitForTimeout(500);
  const state=await page.evaluate(()=>window.__BALLSY__.state());assert.equal(state.phase,'racing');
  const name=`${baseline?'baseline':'loop'}-unpaused-${width}.png`;
  await page.screenshot({path:path.join(dir,name)});report.captures.push({name,phase:state.phase});
  (report.performanceByResolution??=[]).push(await performanceSample(page));
 }
 report.performance=await page.evaluate(async()=>{
  const canvas=document.querySelector('canvas'),gl=canvas.getContext('webgl2')||canvas.getContext('webgl');
  const ext=gl?.getExtension('WEBGL_debug_renderer_info');
  const times=[];let last=performance.now();await new Promise(resolve=>{const tick=now=>{times.push(now-last);last=now;if(times.length<120)requestAnimationFrame(tick);else resolve();};requestAnimationFrame(tick);});
  const sorted=[...times].sort((a,b)=>a-b);
  return {method:'120 real requestAnimationFrame intervals; unpaused, idle racers, headless Edge',viewport:[innerWidth,innerHeight],drawingBuffer:[canvas.width,canvas.height],devicePixelRatio,renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl?.getParameter(gl.RENDERER),fps:1000/(times.reduce((a,b)=>a+b,0)/times.length),p95FrameMs:sorted[Math.floor(sorted.length*.95)]};
 });
 report.state=await page.evaluate(()=>window.__BALLSY__.state());
 await page.keyboard.down('ArrowRight');await page.waitForTimeout(1000);await page.keyboard.up('ArrowRight');
 report.keyboardAfter=await page.evaluate(()=>window.__BALLSY__.state());
 await page.screenshot({path:path.join(dir,`${baseline?'baseline':'loop'}-keyboard-racing.png`)});
 if(!baseline){
  report.projectedPlayers=await page.evaluate(()=>{
   const camera=window.__GRAPHYSX_HOST__.camera,right=camera.position.clone().setFromMatrixColumn(camera.matrixWorld,0);
   return window.__BALLSY__.state().players.map(p=>{
    const center=camera.position.clone().fromArray(p.position),a=center.clone().addScaledVector(right,.65).project(camera),b=center.clone().addScaledVector(right,-.65).project(camera);
    return {id:p.id,diameterPixels:Math.hypot((a.x-b.x)*innerWidth/2,(a.y-b.y)*innerHeight/2),viewport:[innerWidth,innerHeight]};
   });
  });
  await page.locator('[data-action="fullscreen"]').click();
  report.fullscreen=await page.evaluate(()=>!!document.fullscreenElement);
  if(report.fullscreen)await page.locator('[data-action="fullscreen"]').click();
  if(process.argv.includes('--video')){
   const video=await page.evaluate(async()=>{
    const canvas=document.querySelector('canvas');
    if(!canvas.captureStream||!window.MediaRecorder)return {supported:false};
    const pads=window.visualPads;
    const course=window.__BALLSY__.course(),chunks=[];
    const frameTimes=[];let recording=true,lastFrame=performance.now();
    const measureFrame=now=>{if(!recording)return;frameTimes.push(now-lastFrame);lastFrame=now;requestAnimationFrame(measureFrame);};requestAnimationFrame(measureFrame);
    const recorder=new MediaRecorder(canvas.captureStream(30),{mimeType:'video/webm'});
    recorder.ondataavailable=e=>chunks.push(e.data);recorder.start();
    const timer=setInterval(()=>{
     window.__BALLSY__.state().players.forEach((p,i)=>{
      const t=((p.run.progress+.018)%1+1)%1;
      const target=course.main.reduce((a,b)=>Math.abs(b.t-t)<Math.abs(a.t-t)?b:a);
      const dx=target.x-p.position[0],dz=target.z-p.position[2],d=Math.max(.01,Math.hypot(dx,dz));
      pads[i].axes=[(dx/d*4.5-p.velocity[0])*.24,(dz/d*4.5-p.velocity[2])*.24];
     });
    },16);
    await new Promise(resolve=>setTimeout(resolve,16000));clearInterval(timer);recording=false;
    const done=new Promise(resolve=>recorder.onstop=resolve);recorder.stop();await done;
    const blob=new Blob(chunks,{type:'video/webm'});
    const data=await new Promise(resolve=>{const r=new FileReader();r.onload=()=>resolve(r.result.split(',')[1]);r.readAsDataURL(blob);});
    return {supported:true,data,bytes:blob.size,seconds:16,racingFps:1000/(frameTimes.reduce((a,b)=>a+b,0)/frameTimes.length),racingP95FrameMs:frameTimes.toSorted((a,b)=>a-b)[Math.floor(frameTimes.length*.95)],note:'Actual canvas frames at up to 30fps; real-time synthetic Gamepad API inputs; canvas only, no HUD; measured game rAF rate is separate from recorder cap',state:window.__BALLSY__.state()};
   });
   if(video.supported){writeFileSync(path.join(dir,'loop-actual-racing.webm'),Buffer.from(video.data,'base64'));delete video.data;}
   report.video=video;
  }
  report.geometry=await page.evaluate(()=>window.__GRAPHYSX__.export().entities.map(e=>({id:e.id,type:e.type,tags:e.tags,physics:e.physics,steering:e.steering,transform:e.transform})));
  await page.evaluate(()=>{const camera=window.__GRAPHYSX_HOST__.camera;camera.position.set(0,85,0.01);camera.up.set(0,0,-1);camera.lookAt(0,0,0);camera.updateProjectionMatrix();});
  await page.evaluate(()=>{
   const course=window.__BALLSY__.course(),camera=window.__GRAPHYSX_HOST__.camera;
   for(const [i,section]of course.sections.entries()){
    const p=course.main.reduce((a,b)=>Math.abs(b.t-section.t)<Math.abs(a.t-section.t)?b:a);
    const point=camera.position.clone().set(p.x,p.y+.5,p.z).project(camera);
    const label=document.createElement('div');label.textContent=`${i+1}. ${section.name}`;
    Object.assign(label.style,{position:'fixed',left:`${(point.x+1)*innerWidth/2}px`,top:`${(1-point.y)*innerHeight/2+22}px`,transform:'translate(-50%,-50%)',background:'#102f3eee',color:'white',padding:'5px 8px',borderRadius:'5px',font:'bold 13px sans-serif',zIndex:9999,pointerEvents:'none'});document.body.append(label);
    const ahead=camera.position.clone().set(p.x+p.tx*2,p.y+.5,p.z+p.tz*2).project(camera);
    const angle=Math.atan2(-(ahead.y-point.y)*innerHeight,(ahead.x-point.x)*innerWidth)*180/Math.PI;
    const arrow=document.createElement('div');arrow.textContent='➜';Object.assign(arrow.style,{position:'fixed',left:`${(ahead.x+1)*innerWidth/2}px`,top:`${(1-ahead.y)*innerHeight/2}px`,transform:`translate(-50%,-50%) rotate(${angle}deg)`,color:'#ff511a',font:'bold 30px sans-serif',zIndex:10000});document.body.append(arrow);
   }
  });
  await page.screenshot({path:path.join(dir,'loop-top-down-1920.png')});
  await page.close();
  if(!process.argv.includes('--visual-only')){
  page=applySmokeTimeout(await browser.newPage({viewport:{width:1280,height:720}}));
  await page.exposeFunction('ballsyCapture',async name=>{await page.screenshot({path:path.join(dir,`loop-${name}.png`)});});
  page.on('pageerror',e=>report.errors.push(String(e))); page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());else if(m.text().startsWith('[ballsy-loop]'))console.log(m.text());});
  await page.addInitScript(()=>{
   window.ballsyTestPads=[0,1].map(index=>({index,connected:true,mapping:'standard',id:`Automated input ${index}`,axes:[0,0],buttons:[]}));
   Object.defineProperty(navigator,'getGamepads',{value:()=>window.ballsyTestPads});
  });
  await page.goto(url,{waitUntil:'load'});
  await page.waitForFunction(()=>!!window.__BALLSY__);
  await page.evaluate(()=>window.advanceTime(0));
  await page.locator('[data-action="start"]').click();
  await page.evaluate(()=>window.advanceTime(3100));
  const paths=await page.evaluate(()=>{
   const course=window.__BALLSY__.course();
   return ['main','shortcut'].map(branch=>Array.from({length:64},(_,i)=>{
    const t=((i+1)/64)%1;
    const samples=branch==='shortcut'&&t>=course.fork.start&&t<=course.fork.end?course.shortcut:course.main;
    const p=samples.reduce((best,p)=>Math.abs(p.t-t)<Math.abs(best.t-t)?p:best,samples[0]);
    return[p.x,p.z];
   }));
  });
  if(!process.argv.includes('--scenario-only')){
  report.driven=await driveRace(page,paths);
  if(report.driven.separationCapture){writeFileSync(path.join(dir,'loop-full-separation.png'),Buffer.from(report.driven.separationCapture.data,'base64'));delete report.driven.separationCapture.data;}
  await page.screenshot({path:path.join(dir,'loop-driven-result.png')});
  assert.equal(report.driven.state.phase,'results','Both racers must finish through real controls');
  assert.ok(report.driven.state.players.every(p=>p.run.lap===2),'Each racer completes two laps');
  assert.deepEqual(report.driven.jumps,[],'Continuous race must not teleport');
  assert.deepEqual(report.driven.state.rescues,[0,0],'Successful run must not rely on recovery');
  assert.equal(report.driven.firstFinish,'racing','Race continues for the second player');
  assert.ok(report.driven.minimumSeparation<1.31&&report.driven.minimumSeparation>1.15,'Racers make physical contact without gross interpenetration');
  assert.ok(report.driven.passes.length>0,'A real progress-based overtake occurs');
  assert.ok(report.driven.maximumSeparation>20,'The race tests widely separated racers');
  assert.ok(report.driven.trace.some(t=>t.players[1].run.branch==='shortcut'),'Second racer uses the shortcut');
  assert.ok(report.driven.visibility.every(sample=>sample.players.every(p=>p.inFrame&&!p.blocker)),'Sampled racers stay in frame without opaque foreground occlusion');
  await page.locator('[data-action="start"]').click();
  report.rematch=await page.evaluate(()=>window.__BALLSY__.state());
  assert.equal(report.rematch.phase,'countdown');
  assert.ok(report.rematch.players.every(p=>p.run.lap===0&&p.run.elapsedSeconds===0));
  await page.evaluate(()=>window.advanceTime(3100));
  await page.evaluate(()=>window.ballsyTestPads.forEach(p=>{p.axes=[0,0];p.buttons=[];}));
  const beforeReverse=await page.evaluate(()=>window.__BALLSY__.state());
  await page.keyboard.down('ArrowRight');await page.evaluate(()=>window.advanceTime(1000));await page.keyboard.up('ArrowRight');
  report.reverse=await page.evaluate(()=>window.__BALLSY__.state());
  assert.ok(report.reverse.players[0].run.progress<beforeReverse.players[0].run.progress,'Wrong-way driving cannot advance progress');
  assert.equal(report.reverse.players[0].run.nextGate,beforeReverse.players[0].run.nextGate,'Reverse driving awards no gate');
  await page.keyboard.press('KeyP');
  const paused=await page.evaluate(()=>window.__BALLSY__.state());
  await page.evaluate(()=>window.advanceTime(2000));
  const frozen=await page.evaluate(()=>window.__BALLSY__.state());
  assert.equal(frozen.phase,'paused');assert.deepEqual(frozen.players,paused.players);
  await page.keyboard.press('KeyP');
  assert.equal(await page.evaluate(()=>window.__BALLSY__.state().phase),'racing');
  report.pauseResume=true;
  }
  await page.keyboard.press('KeyP');await page.locator('[data-action="restart"]').click();
  report.restart=await page.evaluate(()=>window.__BALLSY__.state());
  assert.equal(report.restart.phase,'countdown');
  assert.ok(report.restart.players.every(p=>p.run.lap===0&&p.run.elapsedSeconds===0));
  await page.evaluate(()=>window.advanceTime(3100));
  if(!greybox){
   report.intentionalErrorApproach=await driveRace(page,paths,9000,.77);
   assert.deepEqual(report.intentionalErrorApproach.state.rescues,[0,0],'Error approach itself is a clean drive');
   const before=await page.evaluate(()=>{window.ballsyTestPads.forEach(p=>{p.axes=[0,0];p.buttons=[];});return window.__BALLSY__.state();});
   assert.equal(before.players[1].run.branch,'shortcut','Intentional error starts on real shortcut traversal');
   await page.keyboard.down('KeyA');const trace=[];
   for(let i=0;i<10;i++){const state=await page.evaluate(()=>window.advanceTime(100));trace.push(state.players[1]);}
   await page.keyboard.up('KeyA');
   await page.keyboard.down('ShiftLeft');await page.evaluate(()=>window.advanceTime(1500));await page.keyboard.up('ShiftLeft');
   const slowed=await page.evaluate(()=>window.__BALLSY__.state());
   const exitProgress=await page.evaluate(()=>window.__BALLSY__.course().fork.end+.01);
   const resumed=await driveRace(page,paths,3000,exitProgress);
   if(resumed.separationCapture)delete resumed.separationCapture.data;
   if(report.intentionalErrorApproach.separationCapture)delete report.intentionalErrorApproach.separationCapture.data;
   report.intentionalError={label:'Separate real-input error: left against shortcut rail, then 1.5s real brake and controlled resumption; no body mutation',before:before.players[1],trace,slowed:slowed.players[1],after:resumed.state.players[1],resumed};
   assert.ok(report.intentionalError.after.run.progress>=exitProgress,'Controlled resumption exits shortcut');
   assert.ok(report.intentionalError.after.run.elapsedSeconds>before.players[1].run.elapsedSeconds,'Clock includes driving error');
   assert.deepEqual(resumed.state.rescues,[0,0],'Contained driving error resumes without artificial recovery');
   await page.screenshot({path:path.join(dir,'loop-intentional-shortcut-recovery.png')});
   report.isolatedFall=await page.evaluate(()=>{
    const before=window.__BALLSY__.state().players[1],position=[...before.position];position[1]-=8;
    window.__GRAPHYSX__.update(before.id,{transform:{position},physics:{mode:'dynamic',linearVelocity:[0,0,0]}});
    window.advanceTime(1000);
    return {label:'Isolated artificial fall probe; excluded from input-only course evidence',before,after:window.__BALLSY__.state().players[1]};
   });
   assert.ok(report.isolatedFall.after.run.rescues>report.isolatedFall.before.run.rescues,'Fall recovers');
   assert.equal(report.isolatedFall.after.run.nextGate,report.isolatedFall.before.run.nextGate,'Fall cannot award gate');
  }
  // Isolated edge probe. This deliberately changes a body and is NOT race evidence.
  report.isolatedSkip=await page.evaluate(()=>{
   const before=window.__BALLSY__.state(),course=window.__BALLSY__.course();
   const p=course.main[Math.floor(course.main.length*.5)];
   window.__GRAPHYSX__.update('ballsy-p1',{transform:{position:[p.x,p.y+.7,p.z]},physics:{mode:'dynamic',linearVelocity:[0,0,0]}});
   window.advanceTime(1000);
   return {label:'isolated artificial skip probe, excluded from controller race',before:before.players[0].run,after:window.__BALLSY__.state().players[0].run};
  });
  assert.equal(report.isolatedSkip.after.nextGate,report.isolatedSkip.before.nextGate,'Skipping half the circuit cannot award gates');
  assert.ok(report.isolatedSkip.after.rescues>report.isolatedSkip.before.rescues,'Invalid jump recovers');
  }
 }
 assert.deepEqual(report.errors,[]);report.ok=true;
}catch(e){report.ok=false;report.failure=String(e);if(page&&!page.isClosed()){report.failureText=await page.locator('body').innerText().catch(()=>null);await page.screenshot({path:path.join(dir,'loop-failure.png')}).catch(()=>{});}throw e;}
finally{writeFileSync(path.join(dir,`${baseline?'baseline':'loop'}-report.json`),JSON.stringify(report,null,2));await browser.close();await server?.close();}
