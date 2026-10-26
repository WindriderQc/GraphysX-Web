// Recipes/ranges/context through the ordinary review path; a fixture, never a model claim.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildInlineMesh } from '../server/mesh-construction.mjs';
import { editInlineMesh } from '../server/mesh-authoring.mjs';
import { startSceneStore } from '../server/scene-store.mjs';
import { createActor, requestText } from './live-session-harness.mjs';
import { applySmokeTimeout, launchSmokeBrowser, SMOKE_TIMEOUT } from './smoke-harness.mjs';
const base=process.env.SMOKE_BASE||'http://127.0.0.1:4188/';
// Undo reloads the parent graph, whose entity storage order is not document meaning.
// Keep every entity field and nested buffer order strict while comparing by stable ID.
const keyedDocument=doc=>({...doc,entities:[...doc.entities].sort((a,b)=>a.id.localeCompare(b.id))});
const output=process.env.SMOKE_ARTIFACTS||path.resolve('output/smoke');mkdirSync(output,{recursive:true});
const texture={id:'inline',pixels:{width:2,height:2,rgba:[20,180,220,255,220,110,40,255,220,110,40,255,20,180,220,255]}};
const creations=[
  {op:'spawn',entity:{id:'made-panel',type:'mesh',label:'Carved panel',transform:{position:[-4,2,7]},material:{color:'#ffffff',texture}},meshBuild:{kind:'extrude',profile:[[-1,-1],[1,-1],[1,0],[0.3,0],[0.3,1],[-1,1]],depth:0.6}},
  {op:'spawn',entity:{id:'made-vase',type:'mesh',label:'Turned vase',transform:{position:[0,1,7]},material:{color:'#ce8b52',metalness:0.4}},meshBuild:{kind:'revolve',profile:[[0,0],[0.7,0],[1,0.3],[0.6,1.5],[0.9,2],[0.75,2],[0.5,1.5],[0.85,0.3],[0,0.15]],segments:24}},
  {op:'spawn',entity:{id:'made-handle',type:'mesh',label:'Swept handle',transform:{position:[4,2,7]},material:{color:'#66d6dc',metalness:0.3}},meshBuild:{kind:'sweep',profile:[[-0.25,-0.25],[0.25,-0.25],[0.25,0.25],[-0.25,0.25]],path:[[-1,0,0],[-1,1,0],[0,2,0.5],[1,1,0],[1,0,0]]}},
];
const edits={meshEdits:{positions:[{start:0,delta:[0,-0.3,0]}]},pixelEdits:[{x:0,y:1,width:1,height:1,rgba:[245,245,245,255]}]};
async function removeFixture(dir){if(!path.resolve(dir).startsWith(path.resolve(tmpdir())+path.sep+'graphysx-authoring-'))throw new Error('Unexpected fixture directory');await rm(dir,{recursive:true,force:true});}
const staleReply={intent:'A material change based on an older observation',commands:[{op:'update',id:'made-vase',patch:{material:{color:'#ff0000'}}}]};
const replies=[{intent:'Make three original constructed objects',commands:creations},{intent:'Refine one corner and one texel',commands:[{op:'update',id:'made-panel',patch:edits}]},staleReply,staleReply,staleReply];
const deferred=()=>{let resolve;return{promise:new Promise(done=>{resolve=done;}),resolve:()=>resolve()};};
const delayed=[{arrived:deferred(),reply:deferred()},{arrived:deferred(),reply:deferred()}];
const browser=await launchSmokeBrowser(),page=applySmokeTimeout(await browser.newPage({viewport:{width:1365,height:900},reducedMotion:'reduce'}));
const errors=[],requests=[],out={};let store,dir;
try {
  page.on('pageerror',error=>errors.push(String(error)));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.route('**/mesh-authoring-propose',async route=>{const index=requests.length;requests.push(route.request().postDataJSON());assert.ok(requests.length<=5);if(index>=2&&index<=3){delayed[index-2].arrived.resolve();await delayed[index-2].reply.promise;}return route.fulfill({json:replies[index]});});
  await page.goto(`${base}?propose=${encodeURIComponent(new URL('mesh-authoring-propose',base).href)}`,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__GRAPHYSX_NESTOR__&&window.__GRAPHYSX_HOST__?.frameCount>3&&!window.__GRAPHYSX_HOST__.introPlaying);
  const snapshot=()=>page.evaluate(()=>({doc:window.__GRAPHYSX__.exportDocument(),revision:window.__GRAPHYSX__.state().revision,commits:window.__GRAPHYSX__.history().length}));
  const ask=async text=>{
    const before=await snapshot();await page.locator('[data-nestor-request]').fill(text);await page.locator('[data-nestor-request-send]').click();
    await page.waitForFunction(()=>window.__GRAPHYSX_NESTOR__.state().proposal!==null);assert.deepEqual(await snapshot(),before,'proposal stays inert');
    await page.locator('[data-proposal-accept]').click();await page.waitForFunction(rev=>window.__GRAPHYSX__.state().revision>rev,before.revision);
    const after=await snapshot();assert.equal(after.commits,before.commits+1);return after;
  };
  const made=await ask('Construct an extruded panel, a turned vase and a swept handle');
  assert.equal(requests[0].scene.focus,undefined,'geometry is never shared by default');
  for(const creation of creations) {
    const stored=made.doc.entities.find(e=>e.id===creation.entity.id);assert.deepEqual(stored.mesh,buildInlineMesh(creation.meshBuild));assert.equal(stored.meshBuild,undefined);
  }
  const actual=await page.evaluate(()=>['made-panel','made-vase','made-handle'].map(id=>{
    const o=window.__GRAPHYSX_HOST__.world.getEntityObject(id);return{id,positions:[...o.geometry.attributes.position.array],indices:[...o.geometry.index.array]};
  }));
  for(let i=0;i<actual.length;i++){assert.deepEqual(actual[i].positions,buildInlineMesh(creations[i].meshBuild).positions.map(Math.fround));assert.deepEqual(actual[i].indices,buildInlineMesh(creations[i].meshBuild).indices);}
  await page.evaluate(()=>window.__GRAPHYSX__.select(['made-panel']));
  const check=page.locator('[data-request-focus-check]');await page.locator('[data-request-focus]').waitFor();assert.equal(await check.isChecked(),false);
  await check.check();
  const edited=await ask('Lower vertex zero and paint just one texel white');
  assert.equal(await check.isChecked(),false,'sharing is consumed by one explicit typed request');
  const before=made.doc.entities.find(e=>e.id==='made-panel'),after=edited.doc.entities.find(e=>e.id==='made-panel');
  assert.equal(requests[1].scene.focus.id,'made-panel');assert.equal(requests[1].scene.focus.complete,true);assert.deepEqual(requests[1].scene.focus.mesh,before.mesh);
  assert.deepEqual(after.mesh,editInlineMesh(before.mesh,edits.meshEdits));assert.deepEqual(after.transform,before.transform);assert.deepEqual(after.mesh.indices,before.mesh.indices);
  for(const id of ['made-vase','made-handle']) assert.deepEqual(edited.doc.entities.find(e=>e.id===id),made.doc.entities.find(e=>e.id===id));
  await page.waitForFunction(()=>window.__GRAPHYSX_HOST__.world.getEntityObject('made-panel').material[0].map.image.data[8]===245);
  assert.deepEqual(after.material.texture.pixels.rgba,[...texture.pixels.rgba.slice(0,8),245,245,245,255,...texture.pixels.rgba.slice(12)]);
  const retained=await page.evaluate(()=>{
    const api=window.__GRAPHYSX__,read=()=>api.exportDocument().entities.find(e=>e.id==='made-panel'),changed=JSON.stringify(read());
    const undo=api.undo(),restored=read(),redo=api.redo(),redone=JSON.stringify(read())===changed;const doc=api.exportDocument(),loaded=api.load(doc);
    return{undo:undo.ok,restored,redo:redo.ok,redone,loaded:loaded.ok,reloaded:JSON.stringify(read())===changed};
  });
  assert.deepEqual(retained.restored,before);assert.deepEqual({...retained,restored:undefined},{undo:true,restored:undefined,redo:true,redone:true,loaded:true,reloaded:true});
  const rejected=await page.evaluate(()=>{
    const api=window.__GRAPHYSX__,before=JSON.stringify(api.exportDocument()),revision=api.state().revision,history=api.history().length;
    const result=api.commit({actor:{id:'nestor',label:'Nestor',kind:'agent'},intent:'Bad triangle must be refused',commands:[{op:'update',id:'made-panel',patch:{meshEdits:{indices:[{start:0,values:[0,0,1]}]}}}]});
    return{refused:!result.ok,same:before===JSON.stringify(api.exportDocument()),revision:api.state().revision===revision,history:api.history().length===history};
  });assert.deepEqual(rejected,{refused:true,same:true,revision:true,history:true});
  const slotConfigured=await page.evaluate(()=>{
    const api=window.__GRAPHYSX__,entity=api.exportDocument().entities.find(e=>e.id==='made-panel'),mesh=structuredClone(entity.mesh);
    mesh.materials=[{texture:structuredClone(entity.material.texture)}];
    const configured=api.update('made-panel',{mesh});
    const edited=api.update('made-panel',{pixelEdits:[{materialIndex:0,x:1,y:0,width:1,height:1,rgba:[240,20,90,255]}]});
    return{configured:configured.ok,edited:edited.ok};
  });
  assert.deepEqual(slotConfigured,{configured:true,edited:true});
  await page.waitForFunction(()=>window.__GRAPHYSX_HOST__.world.getEntityObject('made-panel').material[0].map?.image.data[4]===240);
  const slotPixels=await page.evaluate(()=>{
    const api=window.__GRAPHYSX__,bytes=[...window.__GRAPHYSX_HOST__.world.getEntityObject('made-panel').material[0].map.image.data];
    const undoEdit=api.undo(),undoLayout=api.undo();
    return{bytes,undone:undoEdit.ok&&undoLayout.ok,restored:api.exportDocument().entities.find(e=>e.id==='made-panel')};
  });
  assert.deepEqual(slotPixels.bytes.slice(4,8),[240,20,90,255]);assert.equal(slotPixels.undone,true);assert.deepEqual(slotPixels.restored,after);
  await page.waitForFunction(()=>window.__GRAPHYSX_HOST__.world.getEntityObject('made-panel').material[0].map?.image.data[4]===220);
  out.staleCases=[];
  for(const [index,kind] of ['typed','topic'].entries()) {
    if(kind==='typed') {await page.locator('[data-nestor-request]').fill('Refine the vase after a slow model reply');await page.locator('[data-nestor-request-send]').click();}
    else await page.locator('[data-nestor-topic="build"]').click();
    let timer;try{await Promise.race([delayed[index].arrived.promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Fixture request did not arrive')),SMOKE_TIMEOUT);})]);}finally{clearTimeout(timer);}
    const waiting=await snapshot();
    await page.evaluate(()=>window.__GRAPHYSX__.update('made-vase',{label:'Changed manually while composing'}));const changed=await snapshot();
    delayed[index].reply.resolve();await page.waitForFunction(()=>window.__GRAPHYSX_NESTOR__.state().proposal!==null);
    const held=await page.evaluate(()=>{const n=window.__GRAPHYSX_NESTOR__.state();return{revision:n.proposal.expectedRevision,stale:n.proposalStale};});
    assert.equal(held.revision,requests[index+2].revision,'reply retains the model observation revision');assert.equal(held.stale,true);
    assert.equal(await page.locator('[data-proposal-accept]').isDisabled(),true,'stale reply cannot be applied');assert.deepEqual(await snapshot(),changed);
    await page.locator('[data-proposal-discard]').click();assert.equal(await page.evaluate(()=>window.__GRAPHYSX__.undo().ok),true);
    assert.deepEqual(keyedDocument((await snapshot()).doc),keyedDocument(waiting.doc));
    assert.equal(requests[index+2].scene.focus,undefined,'context is never carried into an unselected request or demonstration');
    out.staleCases.push({kind,observation:held.revision,stale:true,applyBlocked:true});
  }
  await page.locator('[data-nestor-request]').fill('Keep this vase proposal waiting for my review');await page.locator('[data-nestor-request-send]').click();
  await page.waitForFunction(()=>window.__GRAPHYSX_NESTOR__.state().proposal!==null);
  assert.equal(await page.locator('[data-proposal-accept]').isDisabled(),false);
  const waitingForReview=await snapshot();
  await page.evaluate(()=>window.__GRAPHYSX__.update('made-vase',{label:'Changed during human review'}));
  await page.waitForFunction(()=>document.querySelector('[data-proposal-accept]').disabled);
  assert.equal(await page.evaluate(()=>window.__GRAPHYSX_NESTOR__.state().proposalStale),true);
  await page.locator('[data-proposal-discard]').click();assert.equal(await page.evaluate(()=>window.__GRAPHYSX__.undo().ok),true);
  assert.deepEqual(keyedDocument((await snapshot()).doc),keyedDocument(waitingForReview.doc));out.staleCases.push({kind:'after-card',stale:true,applyBlocked:true});
  await page.evaluate(()=>window.__GRAPHYSX__.select(['made-vase']));await page.waitForFunction(()=>!document.querySelector('[data-request-focus]').hidden&&document.querySelector('[data-request-focus-label]').textContent.includes('Turned vase')&&!document.querySelector('[data-request-focus-check]').checked);
  await page.evaluate(()=>{window.__GRAPHYSX_HOST__.frameView([11,13,23],[0,2,7],0.1);});await page.waitForFunction(()=>!window.__GRAPHYSX_HOST__.focusing);
  await page.screenshot({path:path.join(output,'mesh-authoring-desktop.png')});
  await page.setViewportSize({width:390,height:844});const frame=await page.evaluate(()=>window.__GRAPHYSX_HOST__.frameCount);await page.waitForFunction(n=>window.__GRAPHYSX_HOST__.frameCount>n+2,frame);
  const mobileLayout=await page.evaluate(()=>({outcomeBottom:document.querySelector('[data-proposal-outcome]').getBoundingClientRect().bottom,commitTop:document.querySelector('.gx-commit').getBoundingClientRect().top}));
  assert.ok(mobileLayout.outcomeBottom<=mobileLayout.commitTop,'Scroll-bounded mobile card keeps the outcome and commit receipt from overlapping');
  await page.screenshot({path:path.join(output,'mesh-authoring-mobile.png')});
  // The authoritative store expands the same commands and computes an ordinary inverse.
  dir=await mkdtemp(path.join(tmpdir(),'graphysx-authoring-'));store=await startSceneStore({port:0,token:'authoring-smoke-token',dir,datalakeDir:null});
  const seed={schema:'graphysx.agent-world/v2',id:'construction-live',label:'Construction live',entities:[]};
  assert.equal((await requestText(`${store.url}/scenes/construction-live`,{method:'PUT',headers:{'content-type':'application/json',authorization:'Bearer authoring-smoke-token'},body:JSON.stringify({definition:seed,actor:'fixture'})})).status,201);
  const session=await createActor(store.url,{storeToken:'authoring-smoke-token'}).call('POST','/sessions',{sceneName:'construction-live',owner:{id:'author',label:'Author'}});
  const id=session.body.session.sessionId,owner=createActor(store.url,{credential:session.body.credential});
  assert.equal((await owner.call('POST',`/sessions/${id}/ops`,{opId:'construct',commands:creations})).status,201);
  const original=(await owner.call('GET',`/sessions/${id}/snapshot`)).body;
  assert.equal((await owner.call('POST',`/sessions/${id}/ops`,{opId:'range-edit',commands:replies[1].commands})).status,201);
  assert.equal((await owner.call('POST',`/sessions/${id}/ops/range-edit/undo`,{})).status,201);
  assert.deepEqual((await owner.call('GET',`/sessions/${id}/snapshot`)).body.definition,original.definition);
  const invitation=await owner.call('POST',`/sessions/${id}/invites`,{role:'viewer',ttlSeconds:600});
  const joined=await createActor(store.url).call('POST',`/sessions/${id}/join`,{code:invitation.body.code,actor:{id:'viewer',label:'Viewer',kind:'human'}}),viewer=createActor(store.url,{credential:joined.body.credential});
  assert.equal((await viewer.call('POST',`/sessions/${id}/ops`,{opId:'forbidden-build',commands:[{op:'update',id:'made-panel',patch:{meshBuild:creations[0].meshBuild}}]})).status,403);
  assert.deepEqual(errors,[]);Object.assign(out,{ok:true,fixture:true,requests,actual,retained,rejected,sharedInverse:true,viewerRefused:true,errors});
  writeFileSync(path.join(output,'mesh-authoring.json'),JSON.stringify(out,null,2));
  writeFileSync(path.join(output,'mesh-authoring.scene.json'),JSON.stringify(edited.doc,null,2));
  console.log('PASS mesh authoring: three constructions, explicit one-object context, tuple/texel edits, actual GPU buffers/pixels, undo/redo/reload, atomic refusal and shared inverse/authority');
}catch(error){writeFileSync(path.join(output,'mesh-authoring-failure.json'),JSON.stringify({error:String(error),requests,errors},null,2));await page.screenshot({path:path.join(output,'mesh-authoring-failure.png')}).catch(()=>{});throw error;}
finally{for(const delay of delayed)delay.reply.resolve();await browser.close();await store?.close();if(dir)await removeFixture(dir);}
