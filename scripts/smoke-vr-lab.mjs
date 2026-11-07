import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { launchSmokeBrowser, applySmokeTimeout } from './smoke-harness.mjs';

// A real browser and the built app; synthetic WebXR lifecycle/spaces, NOT headset acceptance.
const BASE=process.env.SMOKE_BASE || 'http://127.0.0.1:4188/';
const ART=process.env.SMOKE_ARTIFACTS || path.resolve('output/smoke');
mkdirSync(ART,{recursive:true});
const browser=await launchSmokeBrowser();
const errors=[];const receipts={scope:'Built browser UI + synthetic XR binding/input. No physical headset.'};
try{
  const page=applySmokeTimeout(await browser.newPage({viewport:{width:1280,height:800}}));
  page.on('pageerror',error=>errors.push(String(error)));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.addInitScript(()=>Object.defineProperty(navigator,'xr',{value:undefined,configurable:true}));
  await page.goto(BASE);
  await page.waitForSelector('.gx-go-vr',{state:'attached'});
  assert.match(await page.locator('.gx-go-vr').getAttribute('href'),/\?app=vr-lab$/);
  await page.goto(new URL('?app=vr-lab',BASE).href);
  await page.waitForFunction(()=>!!window.__GRAPHYSX_VR__);
  assert.equal(await page.locator('.gx-vr-enter').isDisabled(),true);
  await page.click('.gx-vr-preview');
  assert.equal(await page.evaluate(()=>window.__GRAPHYSX_VR__.presses),1);
  await page.click('.gx-vr-reset');
  await page.screenshot({path:path.join(ART,'vr-lab-desktop.png')});
  receipts.desktop=true;
  console.log('VR smoke: desktop preview passed.');
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:path.join(ART,'vr-lab-mobile.png')});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.close();

  const xrPage=applySmokeTimeout(await browser.newPage({viewport:{width:1280,height:800}}));
  xrPage.on('pageerror',error=>{errors.push(String(error));console.log('VR browser error:',String(error));});
  xrPage.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await xrPage.addInitScript(()=>{
    window.__xrRequests=[];window.__xrReject=true;
    Object.defineProperty(navigator,'xr',{configurable:true,value:{
      isSessionSupported:async()=>true,
      requestSession(mode,options){
        window.__xrRequests.push({mode,options,activation:navigator.userActivation.isActive});
        if(window.__xrReject)return Promise.reject(new DOMException('Denied fixture','NotAllowedError'));
        const session=new EventTarget();session.visibilityState='visible';
        session.requestReferenceSpace=async type=>{if(window.__localOnly && type==='local-floor')throw Error('No floor fixture');return {};};
        session.end=async()=>session.dispatchEvent(new Event('end'));
        window.__xrSession=session;return Promise.resolve(session);
      },
    }});
  });
  await xrPage.goto(new URL('?app=vr-lab',BASE).href);
  await xrPage.waitForFunction(()=>window.__GRAPHYSX_VR__?.vr.session.snapshot.phase==='ready');
  await xrPage.click('.gx-vr-enter');
  await xrPage.waitForFunction(()=>window.__GRAPHYSX_VR__.vr.session.snapshot.phase==='error');
  assert.equal(await xrPage.evaluate(()=>window.__GRAPHYSX_VR__.host.renderer.xr.isPresenting),false);
  await xrPage.evaluate(()=>{
    window.__xrReject=false;
    const {host}=window.__GRAPHYSX_VR__;
    // Only the hardware binding is substituted. Actual session ownership, host branch,
    // Three input factories, action callbacks and world API remain production code.
    host.renderer.xr.setSession=async()=>{window.__xrReference=new EventTarget();};
    host.renderer.xr.getReferenceSpace=()=>window.__xrReference;
    window.__desktopPose=host.camera.position.toArray();
    window.__insets=0;host.subscribeAfterRender(()=>window.__insets++);
    host.setPostEnabled(true);window.__postFrames=0;
    const original=host.composer.render.bind(host.composer);
    host.composer.render=(...args)=>{window.__postFrames++;return original(...args);};
  });
  await xrPage.click('.gx-vr-enter');
  await xrPage.waitForFunction(()=>window.__GRAPHYSX_VR__.vr.session.snapshot.phase==='active');
  console.log('VR smoke: synthetic session active.');
  const counts=await xrPage.evaluate(()=>{
    const {vr}=window.__GRAPHYSX_VR__;vr.camera.position.set(0,1.6,0);
    return {insets:window.__insets,post:window.__postFrames};
  });
  await xrPage.waitForTimeout(350);
  assert.deepEqual(await xrPage.evaluate(()=>({insets:window.__insets,post:window.__postFrames})),counts);
  await xrPage.evaluate(()=>{
    const {vr}=window.__GRAPHYSX_VR__;
    window.__sources=['right','left'].map(handedness=>({handedness,targetRayMode:'tracked-pointer',profiles:['unknown-xr-standard'],
      gamepad:{mapping:'xr-standard',buttons:Array.from({length:6},()=>({value:0,pressed:false,touched:false})),axes:[0,0,0,0]}}));
    vr.input.slots.forEach((slot,index)=>{
      // Native spaces receive matrices from XRFrame. Our fixture drives position directly.
      slot.ray.matrixAutoUpdate=true;slot.grip.matrixAutoUpdate=true;
      slot.ray.visible=true;slot.grip.visible=true;
      slot.ray.position.set(index ? -.48 : 0,index ? .98 : 1.12,0);
      slot.grip.position.set(index ? -.3 : 0,1.12,-.75);
      slot.ray.dispatchEvent({type:'connected',data:window.__sources[index]});
    });
  });
  await xrPage.waitForFunction(()=>window.__GRAPHYSX_VR__.vr.input.slots.every(slot=>slot.modelReady));
  console.log('VR smoke: local controller models ready.');
  const before=await xrPage.evaluate(()=>window.__GRAPHYSX_VR__.vr.input.slots[0].modelRoot.getObjectByName('xr-standard-trigger-value').position.z);
  await xrPage.evaluate(()=>{window.__sources[0].gamepad.buttons[0]={value:1,pressed:true,touched:true};});
  await xrPage.waitForFunction(previous=>window.__GRAPHYSX_VR__.vr.input.slots[0].modelRoot.getObjectByName('xr-standard-trigger-value').position.z>previous+.005,before);
  await xrPage.evaluate(()=>{
    const slot=window.__GRAPHYSX_VR__.vr.input.slots[1];slot.ray.dispatchEvent({type:'selectstart',data:slot.source});slot.ray.dispatchEvent({type:'selectend',data:slot.source});
  });
  assert.equal(await xrPage.evaluate(()=>window.__GRAPHYSX_VR__.presses),1);
  console.log('VR smoke: controller button action passed.');
  await xrPage.evaluate(()=>{
    const slot=window.__GRAPHYSX_VR__.vr.input.slots[0];slot.ray.dispatchEvent({type:'squeezestart',data:slot.source});slot.grip.position.x=.25;
  });
  await xrPage.waitForFunction(()=>window.__GRAPHYSX_VR__.holding && window.__GRAPHYSX_VR__.host.api.query({ids:['vr-cube']})[0].position[0]>.2);
  console.log('VR smoke: grab and cube movement passed.');
  // Tilt only the synthetic viewer so tracked input falls inside its screenshot frustum.
  // Native headset views are not supplied or validated by this fixture.
  await xrPage.evaluate(()=>{window.__GRAPHYSX_VR__.vr.camera.rotation.x=-.28;});
  await xrPage.screenshot({path:path.join(ART,'vr-lab-synthetic-view.png')});
  await xrPage.evaluate(()=>{const slot=window.__GRAPHYSX_VR__.vr.input.slots[0];slot.grip.visible=false;});
  await xrPage.waitForFunction(()=>!window.__GRAPHYSX_VR__.holding && window.__GRAPHYSX_VR__.cancelled);
  receipts.modelsAndButtons=true;receipts.grabAndLoss=true;receipts.postAndInsetsSuppressed=true;
  await xrPage.evaluate(()=>{
    const {vr}=window.__GRAPHYSX_VR__;
    const slot=vr.input.slots[0];slot.ray.dispatchEvent({type:'disconnected',data:slot.source});
    const names=['wrist','thumb-metacarpal','thumb-phalanx-proximal','thumb-phalanx-distal','thumb-tip'];
    for(const finger of ['index','middle','ring','pinky'])for(const joint of ['metacarpal','phalanx-proximal','phalanx-intermediate','phalanx-distal','tip'])names.push(`${finger}-finger-${joint}`);
    names.forEach((name,index)=>{
      const joint=new vr.rig.constructor();joint.visible=true;joint.jointRadius=.009;
      joint.position.set(.25+index*.004,1.12,-.75);slot.hand.joints[name]=joint;slot.hand.add(joint);
    });
    slot.hand.visible=true;slot.ray.visible=false; // Near pinch must not use a stale target ray.
    slot.hand.joints['index-finger-tip'].position.set(.25,1.12,-.75);
    slot.hand.joints['thumb-tip'].position.set(.25,1.12,-.75);
    slot.ray.dispatchEvent({type:'connected',data:{handedness:'right',hand:new Map(),targetRayMode:'tracked-pointer',profiles:[]}});
    slot.ray.dispatchEvent({type:'selectstart',data:slot.source});
  });
  assert.equal(await xrPage.evaluate(()=>window.__GRAPHYSX_VR__.holding),true);
  await xrPage.screenshot({path:path.join(ART,'vr-lab-synthetic-hand.png')});
  await xrPage.evaluate(()=>window.__xrReference.dispatchEvent(new Event('reset')));
  assert.equal(await xrPage.evaluate(()=>window.__GRAPHYSX_VR__.holding),false);
  await xrPage.waitForTimeout(100);
  await xrPage.evaluate(()=>{
    const slot=window.__GRAPHYSX_VR__.vr.input.slots[0];
    slot.ray.visible=true;slot.ray.position.set(.25,1.12,0);
    slot.hand.joints['index-finger-tip'].position.z=0;slot.hand.joints['thumb-tip'].position.z=0;
    slot.ray.dispatchEvent({type:'selectstart',data:slot.source});
  });
  assert.equal(await xrPage.evaluate(()=>window.__GRAPHYSX_VR__.holding),true);
  await xrPage.evaluate(()=>{window.__GRAPHYSX_VR__.vr.input.slots[0].ray.visible=false;});
  await xrPage.waitForFunction(()=>!window.__GRAPHYSX_VR__.holding && window.__GRAPHYSX_VR__.cancelled);
  await xrPage.evaluate(()=>{
    const slot=window.__GRAPHYSX_VR__.vr.input.slots[0];
    slot.ray.dispatchEvent({type:'selectend',data:slot.source});
    slot.hand.joints['index-finger-tip'].position.z=-.75;slot.hand.joints['thumb-tip'].position.z=-.75;
    slot.ray.dispatchEvent({type:'selectstart',data:slot.source});
  });
  assert.equal(await xrPage.evaluate(()=>window.__GRAPHYSX_VR__.holding),true);
  await xrPage.evaluate(()=>{window.__xrSession.visibilityState='hidden';window.__xrSession.dispatchEvent(new Event('visibilitychange'));});
  assert.equal(await xrPage.evaluate(()=>window.__GRAPHYSX_VR__.holding),false);
  await xrPage.evaluate(()=>{window.__xrSession.visibilityState='visible';});
  await xrPage.waitForTimeout(100);
  assert.equal(await xrPage.evaluate(()=>window.__GRAPHYSX_VR__.holding),false);
  receipts.handsAndInterruption=true;receipts.handRayLoss=true;
  console.log('VR smoke: hands, reference reset and interruption passed.');
  await xrPage.click('.gx-vr-enter');
  console.log('VR smoke: exit snapshot',await xrPage.evaluate(()=>({phase:window.__GRAPHYSX_VR__.vr.session.snapshot.phase,post:window.__postFrames,insets:window.__insets,frame:window.__GRAPHYSX_VR__.host.frameCount})));
  await xrPage.waitForFunction(previous=>window.__GRAPHYSX_VR__.vr.session.snapshot.phase==='ready' && window.__postFrames>previous.post && window.__insets>previous.insets,counts);
  assert.deepEqual(await xrPage.evaluate(()=>window.__GRAPHYSX_VR__.host.camera.position.toArray()),await xrPage.evaluate(()=>window.__desktopPose));
  await xrPage.evaluate(()=>{window.__localOnly=true;});
  await xrPage.click('.gx-vr-enter');
  await xrPage.waitForFunction(()=>window.__GRAPHYSX_VR__.vr.session.snapshot.phase==='active');
  assert.equal(await xrPage.evaluate(()=>window.__GRAPHYSX_VR__.vr.referenceSpace),'local');
  assert.equal(await xrPage.evaluate(()=>window.__GRAPHYSX_VR__.vr.rig.position.y),1.6);
  await xrPage.click('.gx-vr-enter');
  await xrPage.waitForFunction(()=>window.__GRAPHYSX_VR__.vr.session.snapshot.phase==='ready');
  let malformedRequests=0;
  await xrPage.route('**/assets/xr/profiles/generic-trigger/controller.gltf',async route=>{
    malformedRequests++;await route.fulfill({status:200,contentType:'model/gltf+json',body:'not JSON'});
  });
  await xrPage.click('.gx-vr-enter');
  await xrPage.waitForFunction(()=>window.__GRAPHYSX_VR__.vr.session.snapshot.phase==='active');
  const malformedResponse=xrPage.waitForResponse(response=>response.url().endsWith('/generic-trigger/controller.gltf'));
  await xrPage.evaluate(()=>{
    const slot=window.__GRAPHYSX_VR__.vr.input.slots[0];slot.grip.visible=true;slot.ray.visible=true;
    slot.ray.dispatchEvent({type:'connected',data:window.__sources[0]});
  });
  await malformedResponse;
  await xrPage.waitForTimeout(200);
  assert.equal(malformedRequests,1);
  assert.deepEqual(await xrPage.evaluate(()=>{
    const slot=window.__GRAPHYSX_VR__.vr.input.slots[0];return {ready:slot.modelReady,fallback:slot.fallback.visible};
  }),{ready:false,fallback:true});
  receipts.malformedModelFallback=true;
  await xrPage.click('.gx-vr-enter');
  await xrPage.waitForFunction(()=>window.__GRAPHYSX_VR__.vr.session.snapshot.phase==='ready');
  const requests=await xrPage.evaluate(()=>window.__xrRequests);
  assert.equal(requests.length,4);
  assert.ok(requests.every(r=>r.mode==='immersive-vr' && r.activation && !r.options.requiredFeatures && r.options.optionalFeatures.includes('hand-tracking')));
  receipts.lifecycle=true;receipts.localFallback=true;
  assert.deepEqual(errors,[]);
  writeFileSync(path.join(ART,'vr-lab-receipt.json'),JSON.stringify({...receipts,errors},null,2));
  console.log('PASS VR lab: desktop/mobile, denied/enter/exit/reenter, local-floor fallback, local models/buttons, hand/controller grabs, pose/source/visibility cancellation, post/inset restoration. Synthetic binding only.');
}finally{await browser.close();}
