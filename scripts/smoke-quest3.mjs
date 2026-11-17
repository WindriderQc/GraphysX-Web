import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { launchSmokeBrowser, applySmokeTimeout } from './smoke-harness.mjs';
import { validateStoredSceneDefinition } from '../server/scene-commands.mjs';

const base=process.env.SMOKE_BASE||'http://127.0.0.1:4188/';
const out=process.env.SMOKE_ARTIFACTS||path.resolve('output/playwright/quest3');mkdirSync(out,{recursive:true});
const browser=await launchSmokeBrowser(),errors=[];
const receipt={scope:'Built WebGL rendering, real KTX2/audio decoding, desktop mission and synthetic tracked-controller mission. No physical Quest performance, audibility or stereo acceptance.'};
const phase=async(page,expected)=>page.waitForFunction(expected=>window.__GRAPHYSX_QUEST3__.mission.phase===expected,expected);
const ready=async page=>page.waitForFunction(()=>window.__GRAPHYSX_QUEST3__?.visualReady);
const advance=async(page,ms)=>page.evaluate(ms=>window.advanceTime(ms),ms);
const audioState=page=>page.evaluate(()=>{
  const {host,vr}=window.__GRAPHYSX_QUEST3__,audio=host.audio;
  host.scene.updateMatrixWorld(true);
  return {context:audio.listener.context.state,listener:audio.listener.parent===(vr.session.session?vr.camera:host.camera),
    oneShots:audio.oneShotCount,playing:audio.playingCount,sources:[...audio.tracked].map(([id,{node}])=>({
      id,playing:node.isPlaying,spatial:node.panner instanceof PannerNode,panning:node.panner?.panningModel,
      position:node.getWorldPosition(node.position.clone()).toArray(),reference:node.panner?.refDistance,
    }))};
});
try {
  const page=applySmokeTimeout(await browser.newPage({viewport:{width:1440,height:960},hasTouch:true}));
  const legacyPlanetRequests=[];
  page.on('request',request=>{if(/\/assets\/quest3\/planet\.(?:glb|ktx2)(?:\?|$)/.test(request.url()))legacyPlanetRequests.push(request.url());});
  page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(new URL('?app=quest3',base).href);
  await page.waitForFunction(()=>{
    const app=window.__GRAPHYSX_QUEST3__;if(!app)return false;
    const models=app.host.api.state().entities.filter(e=>e.asset);
    if(models.some(e=>e.asset.status==='error'))throw Error(JSON.stringify(models.filter(e=>e.asset.status==='error')));
    return models.length===10&&models.every(e=>e.asset.status==='ready')&&app.visualReady;
  });
  await page.waitForFunction(()=>window.__GRAPHYSX_QUEST3__.host.diagnostics.snapshot().samples>3);
  const document=await page.evaluate(()=>window.__GRAPHYSX__.export());validateStoredSceneDefinition(document);
  assert.deepEqual(legacyPlanetRequests,[],'a fresh mission cannot reuse year-cached planet URLs');
  assert.equal(document.entities.find(e=>e.id==='nacre-planet').asset.url,'/assets/quest3/planet-mission-v1.glb');
  assert.equal(document.entities.find(e=>e.id==='nacre-stars').asset.instances.length,420);
  const render=await page.evaluate(()=>{
    const {host}=window.__GRAPHYSX_QUEST3__;const batches=[],maps=[];
    host.world.group.traverse(o=>{if(o.isInstancedMesh)batches.push(o.count);if(o.isMesh)for(const m of Array.isArray(o.material)?o.material:[o.material]){
      if(m.lightMap)maps.push({compressed:m.lightMap.isCompressedTexture,channel:m.lightMap.channel});
    }});
    return {batches,maps,stationColors:host.api.query({ids:['nacre-station']})[0].materialSlots.map(s=>s.color),diagnostics:host.api.observe().diagnostics,
      contextLost:host.renderer.getContext().isContextLost(),frame:host.frameCount,hostDiagnostics:host.diagnostics.snapshot(),
      camera:host.camera.position.toArray(),worldVisible:host.world.group.visible};
  });
  assert.ok(render.batches.includes(420));assert.ok(render.batches.includes(18));assert.ok(render.maps.length>0);assert.ok(render.maps.every(m=>m.compressed&&m.channel===1));
  assert.equal(render.diagnostics.gpuMs,null);receipt.render=render;
  assert.ok(render.stationColors.includes('#243647'),'native PBR source colors must survive host reconciliation');
  assert.equal(render.contextLost,false);assert.ok(render.diagnostics.calls>0,'prepared scenes have submitted real geometry');
  // Actual composer work must not collapse to the last fullscreen pass's count.
  const postFrame=await page.evaluate(()=>{const {host}=window.__GRAPHYSX_QUEST3__;host.setPostEnabled(true);return host.frameCount;});
  await page.waitForFunction(frame=>window.__GRAPHYSX_QUEST3__.host.frameCount>frame+2,postFrame);
  const postCalls=await page.evaluate(()=>window.__GRAPHYSX__.observe().diagnostics.calls);
  if(!render.diagnostics.calls||!postCalls)console.log('NACRE render diagnostics:',JSON.stringify({render,postCalls,errors}));
  assert.ok(postCalls>render.diagnostics.calls,'composer diagnostics include the scene and all passes: plain='+render.diagnostics.calls+', post='+postCalls);
  receipt.composerCalls={plain:render.diagnostics.calls,post:postCalls};
  await page.evaluate(()=>window.__GRAPHYSX_QUEST3__.host.setPostEnabled(false));
  // Exercise rendered cadence, not just the still-running animation-loop clock.
  const demandFrame=await page.evaluate(()=>{const {host}=window.__GRAPHYSX_QUEST3__;host.api.pause(true);host.setRenderOnDemand(true);return host.frameCount;});
  await page.waitForFunction(frame=>window.__GRAPHYSX_QUEST3__.host.frameCount>frame,demandFrame);
  const idleFrame=await page.evaluate(()=>window.__GRAPHYSX_QUEST3__.host.frameCount);
  await page.waitForTimeout(250);
  assert.equal(await page.evaluate(()=>window.__GRAPHYSX_QUEST3__.host.frameCount),idleFrame);
  await page.evaluate(()=>window.__GRAPHYSX_QUEST3__.host.requestRender());
  await page.waitForFunction(frame=>window.__GRAPHYSX_QUEST3__.host.frameCount>frame,idleFrame);
  assert.ok(await page.evaluate(()=>window.__GRAPHYSX__.observe().diagnostics.intervalMs.latest)>=200,'idle rendering time must not be reported as a fast continuous frame');
  await page.evaluate(()=>{const {host}=window.__GRAPHYSX_QUEST3__;host.setRenderOnDemand(false);host.api.pause(false);});
  receipt.composerAndDemandDiagnostics=true;
  await page.screenshot({path:path.join(out,'nacre-arrival.png')});
  assert.equal(await page.locator('[data-view="2"]').isDisabled(),true,'the belvedere requires reactor power');
  await page.click('.nacre-primary');await phase(page,'cell');await advance(page,0);
  await page.screenshot({path:path.join(out,'nacre-cell.png')});
  const cellScreen=await page.evaluate(()=>JSON.parse(window.render_game_to_text()).cell.screen);
  await page.mouse.click(cellScreen.x,cellScreen.y);await phase(page,'carrying');
  await page.click('.nacre-primary');await advance(page,0);
  const socketScreen=await page.evaluate(()=>JSON.parse(window.render_game_to_text()).socket.screen);
  await page.mouse.click(socketScreen.x,socketScreen.y);await phase(page,'docked');
  assert.deepEqual(await page.evaluate(()=>window.__GRAPHYSX_QUEST3__.host.world.getEntityObject('nacre-cell').position.toArray()),[1,1.18,-8.15]);
  await page.click('.nacre-primary');await phase(page,'charging');await advance(page,2400);
  await page.waitForFunction(()=>window.__GRAPHYSX_QUEST3__.host.audio.playingCount>0);
  await page.screenshot({path:path.join(out,'nacre-reactor.png')});
  console.log('NACRE charge probe:',JSON.stringify(await page.evaluate(()=>{
    const {host,mission}=window.__GRAPHYSX_QUEST3__;return {phase:mission.phase,progress:mission.progress,seconds:host.world.getElapsedSeconds(),
      light:host.api.query({ids:['nacre-reactor-light']})[0].intensity,tags:host.api.query({ids:['nacre-mission']})[0].tags,
      camera:host.camera.position.toArray(),target:host.controls.target.toArray(),fov:host.camera.fov,
      coreScale:host.world.getEntityObject('nacre-reactor-core').scale.toArray()};
  })));
  assert.ok(await page.evaluate(()=>window.__GRAPHYSX__.query({ids:['nacre-reactor-light']})[0].intensity)>2);
  await advance(page,2500);await phase(page,'opening');await advance(page,1500);
  const doorX=await page.evaluate(()=>window.__GRAPHYSX_QUEST3__.host.world.getEntityObject('nacre-door-left').position.x);
  assert.ok(doorX< -3.25&&doorX> -9.5,'native keyframe tracks move the actual blast doors');
  const particles=await page.evaluate(()=>{
    const {host}=window.__GRAPHYSX_QUEST3__;let points;
    host.world.getEntityObject('nacre-reactor-particles').traverse(o=>{if(o.isPoints)points=o;});
    const position=points.geometry.getAttribute('position');let outside=0;
    for(let i=0;i<points.geometry.drawRange.count;i++)if(Math.hypot(position.getX(i),position.getZ(i))>.65||Math.abs(position.getY(i))>2)outside++;
    return {live:host.api.query({ids:['nacre-reactor-particles']})[0].emitter.liveParticles,outside};
  });
  assert.ok(particles.live>0&&particles.live<=64);assert.ok(particles.outside>0,'powered particles escape the opaque reactor core');
  receipt.particles=particles;
  await page.screenshot({path:path.join(out,'nacre-opening.png')});
  await advance(page,1900);await phase(page,'ready');
  // Sample actual native transforms at non-symmetric phases, not behavior metadata.
  const animation=await page.evaluate(async()=>{
    const {host}=window.__GRAPHYSX_QUEST3__,read=()=>['nacre-planet','nacre-clouds','nacre-reactor-core','nacre-gyro-0'].map(id=>{
      const o=host.world.getEntityObject(id);return {rotation:o.rotation.toArray().slice(0,3),scale:o.scale.toArray()};
    }),samples=[read()];
    for(let i=0;i<5;i++){await window.advanceTime(125);samples.push(read());}return samples;
  });
  const rotationDelta=i=>animation.at(-1)[i].rotation[1]-animation[0][i].rotation[1];
  assert.ok(rotationDelta(0)>0&&rotationDelta(1)>rotationDelta(0)*3,'clouds drift independently above the rotating Earth');
  assert.ok(Math.max(...animation.map(s=>s[2].scale[0]))-Math.min(...animation.map(s=>s[2].scale[0]))>.025,'the reactor visibly breathes');
  assert.ok(Math.abs(rotationDelta(3))>.1,'the powered gyroscope moves');
  const audio=await audioState(page);
  assert.equal(audio.context,'running');assert.equal(audio.listener,true);assert.ok(audio.oneShots>=2);
  assert.equal(audio.sources.length,3);assert.ok(audio.sources.every(s=>s.spatial&&s.panning==='HRTF'));
  assert.deepEqual(audio.sources.find(s=>s.id==='nacre-reactor-sound').position,[0,2.4,-11]);
  assert.equal(audio.sources.find(s=>s.id==='nacre-reactor-sound').playing,true);
  await page.click('.nacre-audio');await advance(page,0);assert.equal((await audioState(page)).playing,0);
  await page.click('.nacre-audio');await advance(page,0);assert.equal((await audioState(page)).playing,1);
  await page.click('.nacre-primary');await advance(page,0);await phase(page,'complete');
  await page.waitForFunction(()=>window.__GRAPHYSX_QUEST3__.host.audio.oneShotCount>=3);
  await page.screenshot({path:path.join(out,'nacre-observation.png')});
  await page.click('.nacre-save');
  assert.ok(await page.evaluate(()=>window.__GRAPHYSX__.state().savedWorlds.includes('NACRE · Ma station')));
  await page.click('.nacre-reset');await phase(page,'cell');await page.click('.nacre-load');await ready(page);await phase(page,'complete');
  assert.deepEqual(await page.evaluate(()=>['nacre-door-left','nacre-door-right'].map(id=>window.__GRAPHYSX_QUEST3__.host.world.getEntityObject(id).position.x)),[-9.5,9.5]);
  assert.equal(await page.evaluate(()=>window.__GRAPHYSX_QUEST3__.holding),false);
  receipt.desktopMission={completed:true,doorMidpoint:doorX,animation,audio,saveCheckpoint:true};
  await page.evaluate(()=>{
    const api=window.__GRAPHYSX__,saved=api.export(),planet=saved.entities.find(e=>e.id==='nacre-planet');
    planet.asset.url='/assets/quest3/planet.glb';planet.tags.push('owner:cached-mission');
    const loaded=api.create(saved);if(!loaded.ok)throw Error(loaded.error);
  });
  await page.waitForFunction(()=>window.__GRAPHYSX__.query({ids:['nacre-planet']})[0].asset.url==='/assets/quest3/planet-mission-v1.glb');
  await ready(page);
  const upgraded=await page.evaluate(()=>window.__GRAPHYSX__.export().entities.find(e=>e.id==='nacre-planet'));
  assert.equal(upgraded.asset.fitSize,36);assert.ok(upgraded.tags.includes('owner:cached-mission'));
  assert.equal(await page.evaluate(()=>window.__GRAPHYSX_QUEST3__.mission.phase),'complete');
  const originalStation={...document,label:'Original NACRE station',entities:document.entities.filter(e=>['nacre-planet','nacre-ambient','nacre-sun'].includes(e.id)).map(e=>e.id==='nacre-planet'?{...e,asset:{...e.asset,url:'/assets/quest3/planet.glb'}}:e)};
  await page.evaluate(saved=>window.__GRAPHYSX__.create(saved),originalStation);await ready(page);
  assert.equal(await page.evaluate(()=>window.__GRAPHYSX_QUEST3__.mission.phase),null);
  assert.equal(await page.evaluate(()=>window.__GRAPHYSX__.query({ids:['nacre-planet']})[0].asset.url),'/assets/quest3/planet.glb');
  assert.equal(await page.evaluate(()=>window.__GRAPHYSX__.export().label),'Original NACRE station');
  receipt.immutablePlanetUrls={freshMission:true,cachedMissionUpgraded:true,originalStationPreserved:true};
  // Restore the unchanged source document before the original all-fields round trip.
  await page.evaluate(document=>window.__GRAPHYSX__.create(document),document);await ready(page);
  // Three's actual LOD evaluation, rather than a metadata-only assertion.
  await page.evaluate(()=>{const {host}=window.__GRAPHYSX_QUEST3__;host.camera.position.set(0,2,38);host.controls.target.set(0,1,-10);});
  await page.waitForFunction(()=>window.__GRAPHYSX_QUEST3__.host.world.getEntityObject('nacre-equipment').children[0].levels[1].object.visible);
  await page.evaluate(()=>window.__GRAPHYSX_QUEST3__.view(1));
  await page.waitForFunction(()=>window.__GRAPHYSX_QUEST3__.host.world.getEntityObject('nacre-equipment').children[0].levels[0].object.visible);
  receipt.lod=true;
  const restored=await page.evaluate(async()=>{
    const api=window.__GRAPHYSX__,saved=api.export();
    const slot=api.query({ids:['nacre-equipment']})[0].materialSlots[0];
    const edited=api.update('nacre-equipment',{modelMaterialOverrides:{[slot.id]:{color:'#bb5511'}}});
    if(!edited.ok)throw Error(edited.error);
    if(api.query({ids:['nacre-equipment']})[0].materialSlots.find(s=>s.id===slot.id).color!=='#bb5511')throw Error('Native PBR override was overwritten');
    const undone=api.undo();if(!undone.ok)throw Error(undone.error);
    const loaded=api.create(saved);if(!loaded.ok)throw Error(loaded.error);
    return api.export();
  });
  // The runtime resolves parent dependencies in its own insertion order; entity IDs
  // define identity. Compare all authored fields after canonicalizing that order.
  const canonical=world=>({...world,entities:[...world.entities].sort((a,b)=>a.id.localeCompare(b.id))});
  assert.deepEqual(canonical(restored),canonical(document));
  await page.waitForFunction(()=>window.__GRAPHYSX__.state().entities.filter(e=>e.asset).every(e=>e.asset.status==='ready'));
  receipt.roundTrip=true;
  // Hold a real native model request across a complete world replacement. A late
  // completion must release its own resources rather than attach to an orphan group.
  let releaseNative, nativeRequested;
  const nativeGate=new Promise(resolve=>{releaseNative=resolve;});
  const nativeSeen=new Promise(resolve=>{nativeRequested=resolve;});
  const nativePattern='**/assets/quest3/star.glb?cancel-native=1';
  const holdNative=async route=>{nativeRequested();await nativeGate;await route.continue();};
  await page.route(nativePattern,holdNative);
  try {
    await page.evaluate(()=>{
      const {host}=window.__GRAPHYSX_QUEST3__;
      const result=host.api.spawn({id:'cancelled-native',type:'model',asset:{format:'gltf',url:'/assets/quest3/star.glb?cancel-native=1'}});
      if(!result.ok)throw Error(result.error);
      const object=host.world.getEntityObject('cancelled-native');window.__cancelledNative=object;
      let disposed=object.userData.graphysxDisposed===true;
      Object.defineProperty(object.userData,'graphysxDisposed',{configurable:true,enumerable:true,get(){window.__cancelledNativeChecked=true;return disposed;},set(value){disposed=value;}});
    });
    await nativeSeen;
    await page.evaluate(()=>{
      const api=window.__GRAPHYSX__,saved=api.export();saved.entities=saved.entities.filter(e=>e.id!=='cancelled-native');
      const result=api.create(saved);if(!result.ok)throw Error(result.error);
      window.__cancelledNativeChecked=false;
    });
    releaseNative();
    await page.waitForFunction(()=>window.__cancelledNativeChecked);
    assert.equal(await page.evaluate(()=>window.__cancelledNative.children.length),0,'a cancelled model must not attach decoded geometry to its detached owner');
    await page.waitForFunction(()=>window.__GRAPHYSX__.state().entities.filter(e=>e.asset).every(e=>e.asset.status==='ready'));
    receipt.pendingModelCancellation=true;
    console.log('NACRE: pending native model cancellation passed.');
  } finally { releaseNative();await page.unroute(nativePattern,holdNative); }
  for(const [id,url,extra,reason] of [
    ['missing-baked-uv','/assets/quest3/equipment-low.glb',{lightmap:{url:'/assets/quest3/station-light.ktx2'}},'TEXCOORD_1'],
    ['skinned-batch','/assets/xr/profiles/generic-hand/left.glb',{instances:[{}]},'static meshes'],
  ]){
    const created=await page.evaluate(({id,url,extra})=>window.__GRAPHYSX__.spawn({id,type:'model',asset:{format:'gltf',url,...extra}}),{id,url,extra});assert.equal(created.ok,true);
    await page.waitForFunction(id=>window.__GRAPHYSX__.query({ids:[id]})[0]?.asset?.status==='error',id);
    assert.match(await page.evaluate(id=>window.__GRAPHYSX__.query({ids:[id]})[0].asset.error,id),new RegExp(reason));
    await page.evaluate(id=>window.__GRAPHYSX__.remove(id),id);
  }
  receipt.assetRefusals=true;
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.ok(await page.locator('.nacre-enter').isVisible());await page.screenshot({path:path.join(out,'nacre-mobile.png')});
  for(const expected of ['cell','carrying','carrying','docked','charging']){
    await page.tap('.nacre-primary');await advance(page,0);await phase(page,expected);
  }
  await advance(page,8200);await phase(page,'ready');
  await page.tap('.nacre-primary');await advance(page,0);await phase(page,'complete');
  await page.waitForFunction(()=>document.querySelector('.nacre-ui').dataset.phase==='complete');
  assert.equal(await page.locator('.nacre-caption h1').isVisible(),true,'the mobile victory message remains visible');
  assert.equal(await page.locator('.nacre-steps li[data-done="true"]').count(),3);
  await page.screenshot({path:path.join(out,'nacre-mobile-observation.png')});
  await page.tap('.nacre-menu summary');await page.tap('.nacre-reset');await advance(page,0);await phase(page,'cell');
  assert.deepEqual(await page.evaluate(()=>['nacre-door-left','nacre-door-right'].map(id=>window.__GRAPHYSX_QUEST3__.host.world.getEntityObject(id).position.x)),[-3.25,3.25]);
  receipt.mobileMission=true;
  await page.close();

  const xr=applySmokeTimeout(await browser.newPage({viewport:{width:1280,height:800}}));
  xr.on('pageerror',e=>errors.push(String(e)));
  await xr.addInitScript(()=>{
    Object.defineProperty(navigator,'xr',{configurable:true,value:{isSessionSupported:async()=>true,requestSession:()=>{
      const session=new EventTarget();session.visibilityState='visible';session.supportedFrameRates=new Float32Array([72,90,120]);session.frameRate=72;
      session.updateTargetFrameRate=async rate=>{session.frameRate=rate;};session.requestReferenceSpace=async()=>new EventTarget();
      session.end=async()=>session.dispatchEvent(new Event('end'));window.__questSession=session;return Promise.resolve(session);
    }}});
  });
  await xr.goto(new URL('?app=quest3',base).href);
  await xr.waitForFunction(()=>window.__GRAPHYSX_QUEST3__?.vr.session.snapshot.phase==='ready');
  await xr.waitForFunction(()=>{
    const models=window.__GRAPHYSX__.state().entities.filter(entity=>entity.asset);
    if(models.some(entity=>entity.asset.status==='error'))throw Error('XR fixture assets failed to load');
    return models.length===10&&models.every(entity=>entity.asset.status==='ready')&&window.__GRAPHYSX_QUEST3__.visualReady;
  });
  await xr.evaluate(()=>{
    const {host}=window.__GRAPHYSX_QUEST3__;window.__questCamera=host.camera.position.toArray();
    host.renderer.xr.setSession=async()=>{};host.renderer.xr.getReferenceSpace=()=>new EventTarget();
  });
  await xr.click('.nacre-enter');
  await xr.waitForFunction(()=>window.__GRAPHYSX_QUEST3__.vr.session.snapshot.phase==='active');
  assert.equal(await xr.evaluate(()=>window.__questSession.frameRate),90);
  await xr.waitForFunction(()=>window.__GRAPHYSX__.observe().diagnostics.scope==='immersive-vr');
  await phase(xr,'cell');await advance(xr,0);
  // Feed real VrInputRig event handlers and grip-space transforms. No mission.take,
  // mission.move, phase-tag edits or fake success API is used in this controller path.
  await xr.evaluate(()=>{
    const {host,vr}=window.__GRAPHYSX_QUEST3__;
    vr.camera.position.y=1.6; // synthetic head; the physical runtime supplies this pose.
    for(let i=0;i<2;i++){
      const slot=vr.input.slots[i],source={handedness:i?'left':'right',targetRayMode:'tracked-pointer',profiles:['meta-quest-touch-plus'],
        targetRaySpace:{},gripSpace:{},gamepad:{mapping:'xr-standard',buttons:Array.from({length:6},()=>({pressed:false,touched:false,value:0})),axes:[0,0,0,0],hapticActuators:[]}};
      slot.ray.dispatchEvent({type:'connected',data:source});slot.ray.visible=slot.grip.visible=true;
    }
    window.__questGrip=(index,world)=>{
      const slot=vr.input.slots[index];slot.grip.position.fromArray(world);vr.rig.worldToLocal(slot.grip.position);
      slot.grip.quaternion.identity();slot.grip.updateMatrix();vr.input.update(1/60);host.scene.updateMatrixWorld(true);
    };
    window.__questSelect=name=>{
      const slot=vr.input.slots[0],target=host.scene.getObjectByName(name)||host.world.getEntityObject(name);
      if(!target)throw Error('Missing in-world target: '+name);
      host.scene.updateMatrixWorld(true);
      if(window.__GRAPHYSX_QUEST3__.holding)slot.ray.position.copy(slot.grip.position);
      else slot.ray.position.set(0,1.4,-.1);
      slot.ray.updateMatrix();slot.ray.updateMatrixWorld(true);
      const origin=slot.ray.getWorldPosition(slot.ray.position.clone()),direction=target.getWorldPosition(origin.clone()).sub(origin).normalize();
      slot.ray.quaternion.setFromUnitVectors(direction.clone().set(0,0,-1),direction);
      slot.ray.updateMatrix();slot.ray.updateMatrixWorld(true);slot.ray.dispatchEvent({type:'selectstart'});slot.ray.dispatchEvent({type:'selectend'});
    };
    window.__questGrip(0,[.65,1.12,.15]);vr.input.slots[0].ray.dispatchEvent({type:'squeezestart'});
  });
  await phase(xr,'carrying');
  await xr.evaluate(()=>window.__questSelect('nacre-ui:RÉACTEUR'));
  assert.equal(await xr.evaluate(()=>JSON.parse(window.render_game_to_text()).view),1);
  await xr.waitForFunction(()=>window.__GRAPHYSX_QUEST3__.host.world.getEntityObject('nacre-equipment').children[0].levels[0].object.visible);
  await xr.evaluate(async()=>{window.__questGrip(0,[1,1.18,-8.15]);await window.advanceTime(17);window.__GRAPHYSX_QUEST3__.vr.input.slots[0].ray.dispatchEvent({type:'squeezeend'});});
  await phase(xr,'docked');await xr.evaluate(()=>window.__questSelect('nacre-control'));await phase(xr,'charging');
  await advance(xr,8200);await phase(xr,'ready');
  await xr.evaluate(()=>{const api=window.__GRAPHYSX__,saved=api.export();const result=api.create(saved);if(!result.ok)throw Error(result.error);});
  await ready(xr);await phase(xr,'ready');
  receipt.xrWorldReloadReady=true;
  const xrAudio=await audioState(xr);assert.equal(xrAudio.listener,true);assert.equal(xrAudio.playing,1);
  const hiddenAudio=await xr.evaluate(()=>{
    window.__questSession.visibilityState='hidden';window.__questSession.dispatchEvent(new Event('visibilitychange'));
    return {playing:window.__GRAPHYSX_QUEST3__.host.audio.playingCount,phase:window.__GRAPHYSX_QUEST3__.mission.phase};
  });
  assert.deepEqual(hiddenAudio,{playing:0,phase:'ready'},'hidden XR stops native audio immediately without requiring another rendered frame');
  await xr.evaluate(()=>{window.__questSession.visibilityState='visible';window.__questSession.dispatchEvent(new Event('visibilitychange'));});
  await advance(xr,0);
  assert.equal((await audioState(xr)).playing,1);
  await xr.evaluate(()=>window.__questSelect('nacre-ui:BELVÉDÈRE'));await phase(xr,'complete');
  await xr.waitForFunction(()=>window.__GRAPHYSX_QUEST3__.host.world.getEntityObject('nacre-equipment').children[0].levels[1].object.visible);
  receipt.syntheticXrLod=true;
  // Replay, reject another controller stealing/releasing the cell, then cancel
  // at the real socket when visibility is lost. Cancellation must never dock.
  await xr.evaluate(()=>{window.__questSelect('nacre-ui:CELLULE');window.__questGrip(0,[.65,1.12,.15]);window.__GRAPHYSX_QUEST3__.vr.input.slots[0].ray.dispatchEvent({type:'squeezestart'});});
  await phase(xr,'carrying');
  await xr.evaluate(()=>{
    const {vr}=window.__GRAPHYSX_QUEST3__;window.__questGrip(1,[.65,1.12,.15]);
    vr.input.slots[1].ray.dispatchEvent({type:'squeezestart'});vr.input.slots[1].ray.dispatchEvent({type:'squeezeend'});
  });
  assert.equal(await xr.evaluate(()=>window.__GRAPHYSX_QUEST3__.holding),true);
  await xr.evaluate(async()=>{
    window.__questSelect('nacre-ui:RÉACTEUR');
    window.__questGrip(0,[1,1.18,-8.15]);await window.advanceTime(17);
    window.__questSession.visibilityState='hidden';window.__questSession.dispatchEvent(new Event('visibilitychange'));await window.advanceTime(17);
  });
  await phase(xr,'cell');assert.equal(await xr.evaluate(()=>window.__GRAPHYSX_QUEST3__.cancelled),true);
  assert.deepEqual(await xr.evaluate(()=>window.__GRAPHYSX_QUEST3__.host.world.getEntityObject('nacre-cell').position.toArray()),[.65,1.12,.15]);
  assert.equal((await audioState(xr)).playing,0);
  await xr.evaluate(()=>{window.__questSession.visibilityState='visible';window.__questSession.dispatchEvent(new Event('visibilitychange'));});
  receipt.syntheticControllerMission={completed:true,ownership:true,cancelAtSocket:true,hiddenAudioImmediate:true,audio:xrAudio};
  await xr.evaluate(()=>window.__GRAPHYSX_QUEST3__.vr.session.exit());
  assert.equal((await audioState(xr)).listener,true);
  assert.deepEqual(await xr.evaluate(()=>window.__GRAPHYSX_QUEST3__.host.camera.position.toArray()),await xr.evaluate(()=>window.__questCamera));
  assert.equal(await xr.locator('.nacre-ui').getAttribute('data-immersive'),'false');
  // Leaving XR at the reactor restores the original desktop camera. Its next
  // contextual carry action must still approach the real socket before docking.
  await xr.click('.nacre-primary');await phase(xr,'carrying');
  await xr.click('.nacre-primary');await advance(xr,0);await phase(xr,'carrying');
  await xr.click('.nacre-primary');await phase(xr,'docked');
  await xr.click('.nacre-primary');await advance(xr,8200);await phase(xr,'ready');
  await xr.click('.nacre-primary');await advance(xr,0);await phase(xr,'complete');
  receipt.desktopAfterXr=true;
  receipt.syntheticXr=true;
  assert.deepEqual(errors,[]);
  writeFileSync(path.join(out,'quest3-receipt.json'),JSON.stringify(receipt,null,2));
  console.log('NACRE: desktop and tracked-controller missions, animated Earth/clouds/reactor/doors, native spatial audio, save/replay, PBR/KTX2, lightmaps, LOD, API round-trip and mobile passed.');
} finally { await browser.close(); }
