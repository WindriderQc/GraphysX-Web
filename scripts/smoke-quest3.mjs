import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { launchSmokeBrowser, applySmokeTimeout } from './smoke-harness.mjs';
import { validateStoredSceneDefinition } from '../server/scene-commands.mjs';

const base=process.env.SMOKE_BASE||'http://127.0.0.1:4188/';
const out=process.env.SMOKE_ARTIFACTS||path.resolve('output/playwright/quest3');mkdirSync(out,{recursive:true});
const browser=await launchSmokeBrowser(),errors=[];
const receipt={scope:'Built WebGL rendering, real KTX2 transcoding and synthetic XR lifecycle. No physical Quest performance or stereo acceptance.'};
try {
  const page=applySmokeTimeout(await browser.newPage({viewport:{width:1440,height:960}}));
  page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(new URL('?app=quest3',base).href);
  await page.waitForFunction(()=>{
    const app=window.__GRAPHYSX_QUEST3__;if(!app)return false;
    const models=app.host.api.state().entities.filter(e=>e.asset);
    if(models.some(e=>e.asset.status==='error'))throw Error(JSON.stringify(models.filter(e=>e.asset.status==='error')));
    return models.length===6&&models.every(e=>e.asset.status==='ready');
  });
  await page.waitForFunction(()=>window.__GRAPHYSX_QUEST3__.host.diagnostics.snapshot().samples>3);
  const document=await page.evaluate(()=>window.__GRAPHYSX__.export());validateStoredSceneDefinition(document);
  assert.equal(document.entities.find(e=>e.id==='nacre-stars').asset.instances.length,420);
  const render=await page.evaluate(()=>{
    const {host}=window.__GRAPHYSX_QUEST3__;const batches=[],maps=[];
    host.world.group.traverse(o=>{if(o.isInstancedMesh)batches.push(o.count);if(o.isMesh)for(const m of Array.isArray(o.material)?o.material:[o.material]){
      if(m.lightMap)maps.push({compressed:m.lightMap.isCompressedTexture,channel:m.lightMap.channel});
    }});
    return {batches,maps,stationColors:host.api.query({ids:['nacre-station']})[0].materialSlots.map(s=>s.color),diagnostics:host.api.observe().diagnostics};
  });
  assert.ok(render.batches.includes(420));assert.ok(render.batches.includes(18));assert.ok(render.maps.length>0);assert.ok(render.maps.every(m=>m.compressed&&m.channel===1));
  assert.equal(render.diagnostics.gpuMs,null);receipt.render=render;
  assert.ok(render.stationColors.includes('#243647'),'native PBR source colors must survive host reconciliation');
  // Actual composer work must not collapse to the last fullscreen pass's count.
  const postFrame=await page.evaluate(()=>{const {host}=window.__GRAPHYSX_QUEST3__;host.setPostEnabled(true);return host.frameCount;});
  await page.waitForFunction(frame=>window.__GRAPHYSX_QUEST3__.host.frameCount>frame+2,postFrame);
  assert.ok(await page.evaluate(()=>window.__GRAPHYSX__.observe().diagnostics.calls)>render.diagnostics.calls,'composer diagnostics include the scene and all passes');
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
  await page.click('[data-view="1"]');await page.waitForTimeout(200);await page.screenshot({path:path.join(out,'nacre-reactor.png')});
  await page.click('.nacre-power');
  assert.equal(await page.evaluate(()=>window.__GRAPHYSX__.query({ids:['nacre-reactor-core']})[0].material.emissiveIntensity),.08);
  await page.click('.nacre-power');await page.click('.nacre-save');
  assert.ok(await page.evaluate(()=>window.__GRAPHYSX__.state().savedWorlds.includes('NACRE · Ma station')));
  await page.click('.nacre-power');await page.click('.nacre-load');
  assert.equal(await page.locator('.nacre-power').getAttribute('aria-pressed'),'true','resuming the saved state restores the reactor controls');
  await page.click('[data-view="2"]');await page.waitForTimeout(200);await page.screenshot({path:path.join(out,'nacre-observation.png')});
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
    return models.length===6&&models.every(entity=>entity.asset.status==='ready');
  });
  await xr.evaluate(()=>{
    const {host}=window.__GRAPHYSX_QUEST3__;window.__questCamera=host.camera.position.toArray();
    host.renderer.xr.setSession=async()=>{};host.renderer.xr.getReferenceSpace=()=>new EventTarget();
  });
  await xr.click('.nacre-enter');
  await xr.waitForFunction(()=>window.__GRAPHYSX_QUEST3__.vr.session.snapshot.phase==='active');
  assert.equal(await xr.evaluate(()=>window.__questSession.frameRate),90);
  await xr.waitForFunction(()=>window.__GRAPHYSX__.observe().diagnostics.scope==='immersive-vr');
  await xr.evaluate(()=>window.__GRAPHYSX_QUEST3__.view(1));
  await xr.waitForFunction(()=>window.__GRAPHYSX_QUEST3__.host.world.getEntityObject('nacre-equipment').children[0].levels[0].object.visible);
  await xr.evaluate(()=>window.__GRAPHYSX_QUEST3__.view(2));
  await xr.waitForFunction(()=>window.__GRAPHYSX_QUEST3__.host.world.getEntityObject('nacre-equipment').children[0].levels[1].object.visible);
  receipt.syntheticXrLod=true;
  await xr.evaluate(()=>window.__GRAPHYSX_QUEST3__.vr.session.exit());
  assert.deepEqual(await xr.evaluate(()=>window.__GRAPHYSX_QUEST3__.host.camera.position.toArray()),await xr.evaluate(()=>window.__questCamera));
  assert.equal(await xr.locator('.nacre-ui').getAttribute('data-immersive'),'false');
  receipt.syntheticXr=true;
  assert.deepEqual(errors,[]);
  writeFileSync(path.join(out,'quest3-receipt.json'),JSON.stringify(receipt,null,2));
  console.log('NACRE: native PBR/KTX2, baked UV1 lightmaps, real instance batches/LOD, API round-trip/material undo, save, mobile and synthetic XR passed.');
} finally { await browser.close(); }
