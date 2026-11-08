import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { launchSmokeBrowser, applySmokeTimeout } from './smoke-harness.mjs';

// A real browser and the built app; synthetic WebXR lifecycle/spaces, NOT headset acceptance.
const BASE=process.env.SMOKE_BASE || 'http://127.0.0.1:4188/';
const ART=process.env.SMOKE_ARTIFACTS || path.resolve('output/smoke');
mkdirSync(ART,{recursive:true});
// Capture the input geometry unobstructed. This is a synthetic pose fixture, not a headset view.
async function captureInputModels(page,name){
  await page.evaluate(()=>{
    document.querySelector('.gx-vr-ui').style.visibility='hidden';
    const {host}=window.__GRAPHYSX_VR__;host.api.update('vr-cube',{visible:false});
    const groups=new Set();host.scene.traverse(object=>{
      const materials=Array.isArray(object.material)?object.material:[object.material];
      if(materials.some(material=>material?.map?.isCanvasTexture) && object.parent?.type==='Group')groups.add(object.parent);
    });
    window.__vrCaptureGroups=[...groups].map(group=>[group,group.visible]);
    groups.forEach(group=>{group.visible=false;});
  });
  await page.waitForTimeout(120);
  try{await page.screenshot({path:path.join(ART,name)});}
  finally{await page.evaluate(()=>{
    document.querySelector('.gx-vr-ui').style.visibility='';
    window.__GRAPHYSX_VR__.host.api.update('vr-cube',{visible:true});
    window.__vrCaptureGroups.forEach(([group,visible])=>{group.visible=visible;});
    delete window.__vrCaptureGroups;
  });}
}
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
  await captureInputModels(xrPage,'vr-lab-synthetic-view.png');
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
      const finger=Math.floor((index-5)/5),segment=(index-5)%5;
      if(index===0)joint.position.set(.3,1.12,-.56);
      else if(index<5)joint.position.set(.21+index*.01,1.12,-.61-index*.025);
      else joint.position.set(.26+finger*.03,1.12,-.61-segment*.035);
      slot.hand.joints[name]=joint;slot.hand.add(joint);
    });
    slot.hand.visible=true;slot.ray.visible=false; // Near pinch must not use a stale target ray.
    slot.hand.joints['index-finger-tip'].position.set(.25,1.12,-.75);
    slot.hand.joints['thumb-tip'].position.set(.25,1.12,-.75);
    slot.ray.dispatchEvent({type:'connected',data:{handedness:'right',hand:new Map(),targetRayMode:'tracked-pointer',profiles:[]}});
    slot.ray.dispatchEvent({type:'selectstart',data:slot.source});
  });
  assert.equal(await xrPage.evaluate(()=>window.__GRAPHYSX_VR__.holding),true);
  await xrPage.waitForFunction(()=>{
    const model=window.__GRAPHYSX_VR__.vr.input.slots[0].modelRoot.children[0];
    return model.motionController.handMesh.count===25;
  });
  console.log('VR hand render probe',await xrPage.evaluate(()=>{
    const {vr}=window.__GRAPHYSX_VR__;const slot=vr.input.slots[0];
    const mesh=slot.modelRoot.children[0].motionController.handMesh;
    const instance=Array.from(mesh.instanceMatrix.array.slice(0,16));
    const point=slot.hand.joints['wrist'].position.clone().project(vr.camera).toArray();
    return {count:mesh.count,instance,point,visibility:[slot.hand.visible,slot.modelRoot.visible,mesh.parent.visible,mesh.visible],matrix:Array.from(mesh.matrixWorld.elements)};
  }));
  await captureInputModels(xrPage,'vr-lab-synthetic-hand.png');
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

  // Exact Touch models, including the real left/right controls. Unknown devices above
  // still exercise the generic profile; never disguise another device as Quest 2.
  await xrPage.evaluate(()=>{
    const {vr}=window.__GRAPHYSX_VR__;
    vr.input.slots.forEach((slot,index)=>{
      const source={handedness:index?'right':'left',targetRayMode:'tracked-pointer',profiles:['oculus-touch-v3'],
        gamepad:{mapping:'xr-standard',buttons:Array.from({length:8},()=>({value:0,pressed:false,touched:false})),axes:[0,0,0,0]}};
      slot.ray.visible=true;slot.grip.visible=true;slot.grip.matrixAutoUpdate=true;
      slot.grip.position.set(index?.14:-.14,1.4,-.55);
      slot.grip.rotation.set(1.05,index?-.15:.15,0);
      slot.ray.dispatchEvent({type:'connected',data:source});
    });
  });
  await xrPage.waitForFunction(()=>window.__GRAPHYSX_VR__.vr.input.slots.every(slot=>slot.modelReady));
  await xrPage.waitForFunction(()=>window.__GRAPHYSX_VR__.vr.input.slots.every(slot=>slot.controllerHand));
  assert.deepEqual(await xrPage.evaluate(()=>window.__GRAPHYSX_VR__.vr.input.slots.map(slot=>({
    side:slot.controllerHand.object.userData.handedness,poseSource:slot.controllerHand.object.userData.poseSource,nativeHand:!!slot.source.hand,
  }))),[{side:'left',poseSource:'controller-gamepad',nativeHand:false},{side:'right',poseSource:'controller-gamepad',nativeHand:false}]);
  await xrPage.evaluate(()=>{
    const slots=window.__GRAPHYSX_VR__.vr.input.slots;
    window.__avatarRest=slots.map(slot=>({index:slot.controllerHand.joints.get('index-finger-tip').bone.position.clone(),middle:slot.controllerHand.joints.get('middle-finger-tip').bone.position.clone()}));
    slots.forEach(slot=>{slot.source.gamepad.buttons[0].touched=true;});
  });
  await xrPage.waitForFunction(()=>window.__GRAPHYSX_VR__.vr.input.slots.every((slot,i)=>
    slot.controllerHand.joints.get('index-finger-tip').bone.position.distanceTo(window.__avatarRest[i].index)>.01));
  assert.equal(await xrPage.evaluate(()=>window.__GRAPHYSX_VR__.vr.input.slots.every((slot,i)=>
    slot.controllerHand.joints.get('middle-finger-tip').bone.position.distanceTo(window.__avatarRest[i].middle)<.00001)),true);
  await xrPage.evaluate(()=>window.__GRAPHYSX_VR__.vr.input.slots.forEach(slot=>{slot.source.gamepad.buttons[6].touched=true;slot.ray.visible=false;}));
  await xrPage.waitForFunction(()=>window.__GRAPHYSX_VR__.vr.input.slots.every(slot=>
    slot.controllerHand.joints.get('thumb-tip').bone.position.distanceTo(slot.controllerHand.targets.rest)<.015));
  await captureInputModels(xrPage,'vr-lab-controller-hands-rest.png');
  await xrPage.evaluate(()=>{
    const slots=window.__GRAPHYSX_VR__.vr.input.slots;
    window.__touchBefore=slots.map(slot=>slot.modelRoot.getObjectByName('xr_standard_trigger_pressed_value').quaternion.clone());
    slots.forEach(slot=>{slot.source.gamepad.buttons[0]={value:1,pressed:true,touched:true};});
  });
  await xrPage.waitForFunction(()=>window.__GRAPHYSX_VR__.vr.input.slots.every((slot,index)=>
    slot.modelRoot.getObjectByName('xr_standard_trigger_pressed_value').quaternion.angleTo(window.__touchBefore[index])>.01));
  await xrPage.evaluate(()=>window.__GRAPHYSX_VR__.vr.input.slots.forEach(slot=>{
    slot.source.gamepad.buttons[1].value=1;slot.source.gamepad.buttons[6].touched=false;
    slot.source.gamepad.buttons[4]={value:1,pressed:true,touched:true};
  }));
  await xrPage.waitForFunction(()=>window.__GRAPHYSX_VR__.vr.input.slots.every((slot,i)=>
    slot.controllerHand.joints.get('middle-finger-tip').bone.position.distanceTo(window.__avatarRest[i].middle)>.01 &&
    slot.controllerHand.joints.get('thumb-tip').bone.position.distanceTo(slot.controllerHand.targets.primary)<.015));
  await captureInputModels(xrPage,'vr-lab-controller-hands-pressed.png');
  await xrPage.evaluate(()=>{
    const {vr}=window.__GRAPHYSX_VR__;vr.input.slots[1].grip.visible=false;
    vr.camera.position.set(.35,1.45,-.25);vr.camera.lookAt(-.14,1.4,-.55);
  });
  await captureInputModels(xrPage,'vr-lab-controller-hands-side.png');
  await xrPage.evaluate(()=>{
    const {vr}=window.__GRAPHYSX_VR__;vr.input.slots[1].grip.visible=true;
    vr.camera.position.set(0,1.6,0);vr.camera.rotation.set(-.28,0,0);
  });
  for(const [button,target] of [[3,'stick'],[5,'secondary']]){
    await xrPage.evaluate(button=>window.__GRAPHYSX_VR__.vr.input.slots.forEach(slot=>{
      slot.source.gamepad.buttons.forEach((state,index)=>{if(index>=3){state.value=0;state.pressed=false;state.touched=false;}});
      slot.source.gamepad.buttons[button].touched=true;
    }),button);
    await xrPage.waitForFunction(target=>window.__GRAPHYSX_VR__.vr.input.slots.every(slot=>
      slot.controllerHand.joints.get('thumb-tip').bone.position.distanceTo(slot.controllerHand.targets[target])<.015),target);
  }
  receipts.controllerAvatar=true;
  await xrPage.evaluate(()=>window.__GRAPHYSX_VR__.vr.input.slots.forEach(slot=>{
    slot.source.gamepad.buttons[0]={value:0,pressed:false,touched:false};slot.ray.visible=false;
  }));
  await captureInputModels(xrPage,'vr-lab-touch-controllers.png');
  receipts.touchControllers=true;

  await xrPage.evaluate(()=>{
    const {vr}=window.__GRAPHYSX_VR__;
    vr.input.slots.forEach((slot,index)=>{
      // Copy the actual asset's bind-pose joints, then transform the synthetic palm.
      // This avoids inventing a set of incompatible skeleton rotations for the picture.
      for(const name of Object.keys(vr.input.slots[0].hand.joints)){
        if(slot.hand.joints[name])continue;
        const joint=new slot.anchor.constructor();joint.visible=true;joint.jointRadius=.008;
        slot.hand.joints[name]=joint;slot.hand.add(joint);
      }
      slot.hand.visible=true;
      slot.ray.dispatchEvent({type:'connected',data:{handedness:index?'right':'left',hand:new Map(),targetRayMode:'tracked-pointer',profiles:[]}});
    });
  });
  await xrPage.waitForFunction(()=>window.__GRAPHYSX_VR__.vr.input.slots.every(slot=>
    slot.modelRoot.getObjectByName('Translucent tracked hand')));
  await xrPage.evaluate(()=>{
    const {vr}=window.__GRAPHYSX_VR__;
    vr.input.slots.forEach((slot,index)=>{
      const skin=slot.modelRoot.getObjectByProperty('type','SkinnedMesh');
      const transform=slot.hand.matrix.clone().makeRotationX(1.05);
      transform.setPosition(index?.13:-.13,1.28,-.55);
      const wrist=skin.skeleton.bones.findIndex(bone=>bone.name==='wrist');
      transform.multiply(skin.skeleton.boneInverses[wrist]);
      skin.skeleton.bones.forEach((bone,boneIndex)=>{
        const joint=slot.hand.joints[bone.name]??new slot.anchor.constructor();
        slot.hand.joints[bone.name]=joint;slot.hand.add(joint);joint.visible=true;joint.jointRadius=.008;
        skin.skeleton.boneInverses[boneIndex].clone().invert().premultiply(transform).decompose(joint.position,joint.quaternion,joint.scale);
      });
    });
  });
  await xrPage.waitForFunction(()=>window.__GRAPHYSX_VR__.vr.input.slots.every(slot=>
    slot.modelRoot.getObjectByName('Translucent tracked hand').visible && !slot.modelRoot.children[0].visible));
  await captureInputModels(xrPage,'vr-lab-translucent-hands.png');
  await xrPage.evaluate(()=>window.__GRAPHYSX_VR__.vr.input.slots[0].hand.joints['ring-finger-tip'].visible=false);
  await xrPage.waitForFunction(()=>{
    const slot=window.__GRAPHYSX_VR__.vr.input.slots[0];
    return !slot.modelRoot.getObjectByName('Translucent tracked hand').visible &&
      slot.modelRoot.children[0].visible && slot.modelRoot.children[0].motionController.handMesh.count===24;
  });
  await xrPage.evaluate(()=>window.__GRAPHYSX_VR__.vr.input.slots[0].hand.joints['ring-finger-tip'].visible=true);
  await xrPage.waitForFunction(()=>window.__GRAPHYSX_VR__.vr.input.slots[0].modelRoot.getObjectByName('Translucent tracked hand').visible);
  receipts.handSurfacesAndFallback=true;
  console.log('VR smoke: Touch pair animation and translucent hand surfaces passed.');
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
